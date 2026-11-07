import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** H3.1: assets GLB educativos externos. Se cargan solo al entrar en ENERGY.
 * No modifica el GLB del vehículo, física, jerarquía de ruedas ni materiales originales.
 * Todos los anchors están en espacio mundo, como el overlay educativo de H3 v3.0.
 */
export const ENERGY_PARTS={
  battery:{label:'BATERÍA HV',position:[0,.35,-.22],size:[1.48,.24,2.14],file:'bev_battery_optimized.glb',desc:'Paquete de tracción bajo el piso; modelo visual MG4 adaptado, no OEM Bolt.'},
  pdu:{label:'DISTRIBUCIÓN HV',position:[-.22,1.12,.44],size:[.39,.24,.37],file:'bev_pdu_optimized.glb',desc:'Unidad de distribución de alta tensión; distribución y protección conceptual.'},
  inverter:{label:'INVERSOR',position:[-.55,.99,1.02],size:[.62,.35,.55],file:'bev_inverter_optimized.glb',desc:'Convertidor de potencia; modelo visual MG4, no reproducción Bolt.'},
  motor:{label:'UNIDAD MOTRIZ',position:[.47,.67,1.25],size:[.82,.58,.77],file:'bev_drive_unit_optimized.glb',desc:'Conjunto motor eléctrico/reducción; maqueta educativa adaptable.'}
};
export class PowertrainVisuals {
  constructor(scene,car){
    this.scene=scene;this.car=car;this.root=new THREE.Group();this.root.name='H31_POWERTRAIN_ASSETS';
    scene.add(this.root);this.root.visible=false;
    this.originalMaterials=new Map();this.particles=[];this.flowDirection=0;this.parts={};this.labels=[];this.labelsVisible=true;
    this.assetsRequested=false;this.assetsLoaded=0;this.assetsFailed=0;this.loadPromise=null;this.activePart=null;
    const colors={battery:0x2fd2c5,pdu:0xf0a45e,inverter:0x7daaff,motor:0x60c6e4};
    for(const [id,spec] of Object.entries(ENERGY_PARTS)){
      const anchor=new THREE.Group();anchor.name=`H31_${id.toUpperCase()}`;
      anchor.position.set(...spec.position);this.root.add(anchor);
      const box=new THREE.Mesh(new THREE.BoxGeometry(...spec.size),new THREE.MeshPhysicalMaterial({color:colors[id],metalness:.35,roughness:.32,transparent:true,opacity:.8,emissive:colors[id],emissiveIntensity:.08}));
      anchor.add(box);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),new THREE.LineBasicMaterial({color:0xc3ffff,transparent:true,opacity:.6}));box.add(edges);
      this.addLabel(spec.label,anchor.position.clone().add(new THREE.Vector3(0,spec.size[1]/2+.23,0)));
      this.parts[id]={anchor,placeholder:box,model:null,state:'conceptual',...spec};
    }
    // H4 — maqueta de doce módulos didácticos, NO disposición OEM ni celdas individuales.
    this.modulesOpen=false;
    this.modulesGroup=new THREE.Group();this.modulesGroup.name='H4_BATTERY_EDUCATIONAL_MODULES';
    this.parts.battery.anchor.add(this.modulesGroup);this.modulesGroup.visible=false;
    const tray=new THREE.Mesh(new THREE.BoxGeometry(1.47,.055,2.12),
      new THREE.MeshStandardMaterial({color:0x536a79,roughness:.62,metalness:.45}));
    tray.position.y=-.075;this.modulesGroup.add(tray);
    for(let row=0;row<4;row++)for(let col=0;col<3;col++){
      const module=new THREE.Mesh(new THREE.BoxGeometry(.43,.14,.46),
        new THREE.MeshStandardMaterial({color:(row+col)%2?0x357b86:0x32758a,metalness:.48,roughness:.38}));
      module.name=`H4_MODULO_CONCEPTUAL_${row*3+col+1}`;
      module.position.set((col-1)*.48,.095,(row-1.5)*.52);
      this.modulesGroup.add(module);
    }
    const v=(id,offset)=>this.parts[id].anchor.position.clone().add(new THREE.Vector3(...offset));
    this.drivePath=[v('battery',[0,.13,.72]),v('pdu',[0,-.04,0]),v('inverter',[0,.08,0]),v('motor',[.04,.05,0]),new THREE.Vector3(1.08,.47,1.58)];
    this.curve=new THREE.CatmullRomCurve3(this.drivePath,false,'centripetal');
    const points=this.curve.getPoints(90);
    this.line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x4df4e3,transparent:true,opacity:.9}));this.root.add(this.line);
    this.cable=new THREE.Mesh(new THREE.TubeGeometry(this.curve,90,.017,6,false),new THREE.MeshStandardMaterial({color:0xef8e40,roughness:.52,metalness:.08,transparent:true,opacity:.62}));this.root.add(this.cable);
    for(let i=0;i<17;i++){
      const particle=new THREE.Mesh(new THREE.SphereGeometry(.046,8,6),new THREE.MeshBasicMaterial({color:0x74fff0}));
      this.root.add(particle);this.particles.push(particle);
    }
    this.frame=new THREE.BoxHelper(this.parts.battery.anchor,0xffd47e);this.frame.visible=false;this.frame.material.depthTest=false;this.root.add(this.frame);
  }
  addLabel(text,position){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=120;
    const context=canvas.getContext('2d');context.fillStyle='rgba(5,22,35,.88)';context.fillRect(0,9,512,102);
    context.strokeStyle='#62d3d0';context.lineWidth=4;context.strokeRect(2,11,508,98);
    context.textAlign='center';context.textBaseline='middle';context.fillStyle='#f0ffff';context.font='bold 33px system-ui';context.fillText(text,256,64);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
    sprite.scale.set(1.02,.235,1);sprite.position.copy(position);this.root.add(sprite);this.labels.push(sprite);sprite.visible=this.labelsVisible;
  }
  setLabelsVisible(visible){
    this.labelsVisible=!!visible;
    for(const sprite of this.labels)sprite.visible=this.labelsVisible;
  }
  status(msg){const el=document.getElementById('energy-assets-status');if(el)el.textContent=msg;}
  async loadModels(){
    if(this.loadPromise)return this.loadPromise;
    this.assetsRequested=true;
    const loader=new GLTFLoader();
    this.status('Cargando componentes optimizados 0/4');
    this.loadPromise=(async()=>{
      for(const [id,spec] of Object.entries(ENERGY_PARTS)){
        try{
          const gltf=await loader.loadAsync(`./assets/powertrain/${spec.file}`);
          const model=gltf.scene;
          const bounds=new THREE.Box3().setFromObject(model);
          if(bounds.isEmpty())throw new Error('GLB sin geometría');
          const size=bounds.getSize(new THREE.Vector3());
          if(Math.min(size.x,size.y,size.z)<1e-5)throw new Error('GLB con dimensiones inválidas');
          // Ajustar el modelo al volumen didáctico sin reordenar sus nodos.
          model.scale.set(spec.size[0]/size.x,spec.size[1]/size.y,spec.size[2]/size.z);
          const center=bounds.getCenter(new THREE.Vector3());
          model.position.set(-center.x*model.scale.x,-center.y*model.scale.y,-center.z*model.scale.z);
          model.name=`H31_ASSET_${id.toUpperCase()}`;
          model.traverse(o=>{
            if(!o.isMesh)return;
            o.castShadow=false;o.receiveShadow=false;
            // Conservar el mapa/textura PDU; convertir solo su shader unlit para iluminación suave.
            const adjust=(mat)=>{
              if(!mat)return mat;
              if(mat.isMeshBasicMaterial && mat.map){
                const standard=new THREE.MeshStandardMaterial({map:mat.map,color:mat.color,roughness:.68,metalness:.16,side:THREE.DoubleSide});
                return standard;
              }
              mat.side=THREE.DoubleSide;return mat;
            };
            o.material=Array.isArray(o.material)?o.material.map(adjust):adjust(o.material);
          });
          this.parts[id].anchor.add(model);
          this.parts[id].model=model;
          this.parts[id].state='glb';
          this.parts[id].placeholder.visible=false;
          if(id==='battery'&&this.modulesOpen)model.visible=false;
          this.assetsLoaded++;
        }catch(err){
          this.parts[id].state='fallback';this.assetsFailed++;
          console.warn(`[H3.1] ${id}: se conserva bloque de respaldo.`,err);
        }
        this.status(`Modelos 3D: ${this.assetsLoaded}/4${this.assetsFailed?` · ${this.assetsFailed} en respaldo`:''}`);
      }
      if(this.activePart)this.focusPart(this.activePart);
      return {loaded:this.assetsLoaded,failed:this.assetsFailed};
    })();
    return this.loadPromise;
  }
  setBatteryModules(open){
    this.modulesOpen=!!open;
    this.modulesGroup.visible=this.modulesOpen;
    const battery=this.parts.battery;
    if(battery.model)battery.model.visible=!this.modulesOpen;
    battery.placeholder.visible=!this.modulesOpen&&!battery.model;
    if(this.activePart==='battery')this.focusPart('battery');
  }
  /** Resalta una sola envolvente sin clonar ni tintar los materiales importados. */
  focusPart(id){
    const part=this.parts[id];if(!part)return null;
    this.activePart=id;
    this.frame.setFromObject(id==='battery'&&this.modulesOpen?this.modulesGroup:(part.model||part.placeholder));
    this.frame.visible=this.root.visible;
    const target=new THREE.Vector3();part.anchor.getWorldPosition(target);
    return target;
  }
  /** Raycast contra mallas realmente visibles; no interfiere con el Vehicle Explorer. */
  pickPart(raycaster){
    if(!this.root.visible)return null;
    const targets=[];
    for(const [id,part] of Object.entries(this.parts)){
      const target=id==='battery'&&this.modulesOpen ? this.modulesGroup : (part.model?.visible?part.model:part.placeholder);
      if(target?.visible)targets.push({id,target});
    }
    this.root.updateWorldMatrix(true,true);
    const hits=raycaster.intersectObjects(targets.map(item=>item.target),true);
    for(const hit of hits){
      const owner=targets.find(({target})=>{let node=hit.object;while(node){if(node===target)return true;node=node.parent;}return false;});
      if(!owner)continue;
      let node=hit.object,visible=true,moduleIndex=null;
      while(node){if(!node.visible){visible=false;break;}
        const match=/^H4_MODULO_CONCEPTUAL_(\d+)$/.exec(node.name||'');
        if(match)moduleIndex=Number(match[1]);
        if(node===owner.target)break;
        node=node.parent;
      }
      if(visible)return {id:owner.id,object:hit.object,moduleIndex};
    }
    return null;
  }
  /** Enmarca el objeto seleccionado sin alterar la geometría ni sus materiales. */
  highlightObject(object){
    if(!object)return;
    this.frame.setFromObject(object);
    this.frame.visible=this.root.visible;
  }
  setEnabled(enabled){
    this.root.visible=!!enabled;
    this.frame.visible=!!enabled&&!!this.activePart;
    if(enabled){
      if(!this.assetsRequested)this.loadModels();
      if(this.originalMaterials.size)return;
      this.car.traverse(object=>{
        if(!object.isMesh)return;
        const original=object.material;
        const from=Array.isArray(original)?original:[original];
        const clones=from.map(material=>{
          if(!material)return material;
          const clone=material.clone();clone.transparent=true;
          clone.opacity=Math.min(material.opacity??1,.16);
          clone.depthWrite=false;clone.needsUpdate=true;return clone;
        });
        this.originalMaterials.set(object,{original,clones});
        object.material=Array.isArray(original)?clones:clones[0];
      });
    }else{
      for(const [mesh,{original,clones}] of this.originalMaterials){mesh.material=original;clones.forEach(material=>material?.dispose());}
      this.originalMaterials.clear();this.particles.forEach(p=>p.visible=false);
    }
  }
  update(o,timeS){
    if(!this.root.visible)return;
    const energy=o.dcRegeneratedPowerW>1?-1:o.dcTractionPowerW>1?1:0;
    this.flowDirection=energy;const regen=energy<0;
    this.line.material.color.set(regen?0xffc77e:0x4df4e3);this.line.material.opacity=energy?.91:.18;
    const scale=Math.min(1,(regen?o.dcRegeneratedPowerW:o.dcTractionPowerW)/100000);
    for(let i=0;i<this.particles.length;i++){
      const particle=this.particles[i];particle.visible=!!energy;
      if(!energy)continue;
      const phase=(i/this.particles.length+timeS*(.12+.5*scale))%1;
      particle.position.copy(this.curve.getPointAt(regen?1-phase:phase));
      particle.material.color.set(regen?0xffca78:0x8afdf4);
      particle.scale.setScalar(.75+.9*scale);
    }
  }
}
