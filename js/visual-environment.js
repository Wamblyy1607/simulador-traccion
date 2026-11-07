import * as THREE from 'three';
import {FinalEnvironmentAssets} from './final-environment-assets.js';

/** Visual-only layer: no physics, vehicle materials, input handlers or picking targets. */
export class VisualEnvironment {
  constructor(manager,options={}){
    this.manager=manager;this.scene=manager.scene;this.mode=null;this.textures=new Map();
    this.pending=new Map();this.disposed=false;
    this.root=new THREE.Group();this.root.name='H5_3_VISUAL_ENVIRONMENT';this.scene.add(this.root);
    this.indoor=this.ground(0x69727a,60);this.outdoor=this.ground(0x807b6c,450);
    this.campus=this.ground(0x596268,180);
    this.vegetation=new THREE.Group();this.root.add(this.vegetation);
    this.makeVegetation();this.root.userData.vegetation=this.vegetation;
    this.lights=this.scene.children.filter(o=>o.isLight);
    this.paths={driving:'01_conduccion_montanas.webp',charging:'02_recarga_campus.webp',technical:'03_sala_tecnica.webp'};
    this.assets=new FinalEnvironmentAssets(manager,options.assets);
    const choice=document.getElementById('visual-landscape');
    choice?.addEventListener('change',()=>this.assets.setDrivingProfile(choice.value));
    this.sync();
  }
  ground(color,size){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({color,roughness:1,metalness:0}));
    mesh.rotation.x=-Math.PI/2;mesh.position.y=-.065;mesh.receiveShadow=true;
    mesh.raycast=()=>{};this.root.add(mesh);return mesh;
  }
  makeVegetation(){
    // Instancing adds parallax with only three draw calls and no external models.
    const count=64;
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.23,2.0,5),new THREE.MeshStandardMaterial({color:0x65533e,roughness:1}),count);
    const lower=new THREE.InstancedMesh(new THREE.ConeGeometry(1.6,3.7,7),new THREE.MeshStandardMaterial({color:0x3c583d,roughness:1}),count);
    const upper=new THREE.InstancedMesh(new THREE.ConeGeometry(1.15,3.0,7),new THREE.MeshStandardMaterial({color:0x496549,roughness:1}),count);
    const dummy=new THREE.Object3D();this.trees=[];
    for(let i=0;i<count;i++){
      const side=i%2?-1:1;const x=side*(24+(i*17%25));const z=-120+Math.floor(i/2)*8;
      const scale=(.8+(i*13%9)*.07)*2.7;this.trees.push({x,z,scale});
      for(const [mesh,y] of [[trunks,1],[lower,3],[upper,4.7]]){
        dummy.position.set(x,y*scale,z);dummy.scale.setScalar(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
    }
    for(const mesh of [trunks,lower,upper]){mesh.raycast=()=>{};mesh.frustumCulled=false;this.vegetation.add(mesh);}
    this.treeMeshes=[trunks,lower,upper];this.lastDistance=null;
  }
  load(mode){
    if(this.pending.has(mode))return this.pending.get(mode);
    const promise=new Promise(resolve=>{
      new THREE.TextureLoader().load(new URL('../assets/environments/'+this.paths[mode],import.meta.url).href,texture=>{
        if(this.disposed){texture.dispose();resolve(null);return;}
        texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;
        texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
        texture.generateMipmaps=true;this.textures.set(mode,texture);
        if(this.mode===mode&&!this.assets.activeTexture)this.scene.background=texture;resolve(texture);
      },undefined,error=>{console.warn('No se pudo cargar el paisaje; se conserva fondo neutro.',mode,error);resolve(null);});
    });this.pending.set(mode,promise);return promise;
  }
  sync(){
    const shell=document.querySelector('.shell');
    const mode=shell?.classList.contains('route-inline-charging')?'driving':shell?.classList.contains('charging-active')?'charging':
      shell?.classList.contains('battery-active')?'technical':
      shell?.classList.contains('drive-mode')?'driving':'technical';
    if(mode!==this.mode){
      this.mode=mode;this.root.userData.mode=mode;
      this.indoor.visible=mode==='technical';this.campus.visible=mode==='charging';this.outdoor.visible=mode==='driving';
      this.vegetation.visible=mode==='driving'&&!this.assets?.world?.pineReady;
      const fogColor=mode==='driving'?0xa9bcc5:mode==='charging'?0xb1bec8:0xa6afb7;
      this.scene.background=this.textures.get(mode)||new THREE.Color(fogColor);
      this.scene.fog=new THREE.FogExp2(fogColor,mode==='technical'?.008:.009);
      this.scene.backgroundIntensity=.9;this.scene.backgroundBlurriness=0;
      this.manager.renderer.toneMappingExposure=1.05;
      for(const light of this.lights){
        if(light.isHemisphereLight){light.color.set(0xe8eff4);light.groundColor.set(mode==='driving'?0x65705a:0x70777f);light.intensity=2.1;}
        else if(light.isDirectionalLight){light.intensity=light.castShadow?(mode==='technical'?2.0:2.6):.35;
          light.color.set(light.castShadow?0xfff5e8:0xd6e5ef);}
      }
      this.load(mode);
      // Prefetch the other small textures after the first mode; no duplicate requests.
      if(mode==='technical')for(const other of ['driving','charging'])this.load(other);
    }
    // Legacy H2 restores these on navigation. Keep the new physical floor active.
    for(const name of ['H1_EXPLORER_GROUND','H1_EXPLORER_GRID']){
      const obj=this.scene.getObjectByName(name);if(obj)obj.visible=false;
    }
    // Battery inspection should use the hall, not a roadway underneath its modules.
    const road=this.scene.getObjectByName('H2_DRIVING_SCENERY');
    if(road)road.visible=mode==='driving';
    this.assets.sync(mode);
    if(!this.assets.world.pineReady)this.animateTrees();
    if(this.assets.world.garageReady){this.indoor.visible=false;this.campus.visible=false;}
  }
  animateTrees(){
    if(this.mode!=='driving')return;
    // Read the existing animated lane marker: this preserves H2's source and physics.
    if(!this.distanceMarker)this.distanceMarker=this.scene.getObjectByName('H2_DRIVING_SCENERY')?.children.find(o=>o.geometry?.parameters.width===.12&&o.geometry?.parameters.height===4.1);
    const distance=this.distanceMarker?-118-this.distanceMarker.position.z:0;
    if(distance===this.lastDistance)return;this.lastDistance=distance;
    const dummy=new THREE.Object3D();
    for(let i=0;i<this.trees.length;i++){
      const t=this.trees[i],z=((t.z-distance+120)%240+240)%240-120;
      this.treeMeshes.forEach((mesh,j)=>{dummy.position.set(t.x,[1,3,4.7][j]*t.scale,z);dummy.scale.setScalar(t.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    }
    for(const mesh of this.treeMeshes)mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){
    this.disposed=true;this.assets.dispose();this.scene.background=null;
    for(const texture of this.textures.values())texture.dispose();
    this.root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});this.root.removeFromParent();
  }
}
