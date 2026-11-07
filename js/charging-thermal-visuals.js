import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
/**
 * H5 visual 5.2. Imported assets are educational, not Bolt OEM geometry.
 * This class reads actuator states; it never modifies BMS/charge/thermal models.
 * H51_CHARGING_BAY and H51_THERMAL_INSIDE retain the H5.1 integration contract.
 */
export class ChargingThermalVisuals {
  constructor(scene) {
    this.scene=scene;
    this.chargeRoot=new THREE.Group();this.chargeRoot.name='H51_CHARGING_BAY';
    this.thermalRoot=new THREE.Group();this.thermalRoot.name='H51_THERMAL_INSIDE';
    scene.add(this.chargeRoot,this.thermalRoot);
    this.chargeRoot.visible=false;this.thermalRoot.visible=false;
    this.labelMarkers=[];this.labelSprites=[];this.thermalLabelsVisible=true;
    this.thermalMeshes=[];this.particles=[];this.assetTasks={charging:[],thermal:[]};
    this.loadPromises={};this.assetReport=[];this.connected=false;this.isDC=false;
    this.makeCharging();this.makeThermal();this.setStation('ac240');
  }
  mat(color,metalness=.15,roughness=.47,other={}) {
    return new THREE.MeshStandardMaterial({color,metalness,roughness,...other});
  }
  box(parent,w,h,d,color,x,y,z,metalness=.18,roughness=.47){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.mat(color,metalness,roughness));
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData.representation='Geometría educativa';parent.add(mesh);return mesh;
  }
  cylinder(parent,rt,rb,height,color,x,y,z,segments=24){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,height,segments),this.mat(color,.4,.38));
    mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  tube(parent,points,color,radius=.020,opacity=1){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,72,radius,10,false),this.mat(color,.12,.48,{transparent:opacity<1,opacity}));
    mesh.userData.curve=curve;mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  plane(parent,w,d,color,x,y,z){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),this.mat(color,.02,.89,{side:THREE.DoubleSide}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  axial(parent,radius,length,color,position,direction){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,24),this.mat(color,.65,.28));
    mesh.position.set(...position);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...direction).normalize());
    mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  plaque(parent,text,position,width=.7,height=.12,rotation=0){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#102532';ctx.fillRect(0,0,1024,160);
    ctx.fillStyle='#61dccc';ctx.fillRect(0,0,13,160);ctx.font='bold 63px sans-serif';ctx.fillStyle='#eff8ff';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,522,80);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    mesh.position.set(...position);mesh.rotation.y=rotation;parent.add(mesh);return {mesh,canvas,ctx,texture};
  }
  screen(parent,title,subtitle){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=576;
    const c=canvas.getContext('2d');c.fillStyle='#0c2233';c.fillRect(0,0,512,576);
    c.fillStyle='#6ae6d6';c.font='bold 42px sans-serif';c.fillText('EV CHARGE',34,77);
    c.fillStyle='#e6f5f7';c.font='bold 38px sans-serif';c.fillText(title,34,172);c.fillText(subtitle,34,247);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(.39,.43),new THREE.MeshBasicMaterial({map:texture}));
    parent.add(panel);return panel;
  }
  registerAsset(mode,key,file,mount,fallback,configure){
    this.assetTasks[mode].push({key,file,mount,fallback,configure});
  }
  async loadAssets(mode){
    if(this.loadPromises[mode])return this.loadPromises[mode];
    const tasks=this.assetTasks[mode];const status=document.getElementById('h5-'+mode+'-visual-status');
    if(status)status.textContent='Preparando escena 3D…';
    this.loadPromises[mode]=Promise.all(tasks.map(async task=>{
      try{
        const gltf=await new GLTFLoader().loadAsync(new URL('../assets/h5/'+task.file,import.meta.url).href);
        const model=gltf.scene;model.name='H5_IMPORTED_'+task.key;
        const seen=new Map();model.traverse(o=>{if(!o.isMesh)return;
          o.castShadow=true;o.receiveShadow=true;
          const clone=mat=>{if(!seen.has(mat)){const m=mat.clone();m.roughness=Math.max(.28,m.roughness??.45);seen.set(mat,m);}return seen.get(mat);};
          o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
          o.userData.representation='Modelo externo adaptado';
        });
        task.configure?.(model);task.mount.add(model);task.fallback.visible=false;
        this.assetReport.push({key:task.key,state:'loaded',file:task.file});
        this.applyThermalHighlight();return true;
      }catch(error){
        console.warn('H5: representación sencilla conservada para '+task.key,error);
        this.assetReport.push({key:task.key,state:'fallback',file:task.file});return false;
      }
    })).then(results=>{
      if(status)status.textContent=results.every(Boolean)?'Escena 3D lista':'Vista simplificada en '+results.filter(x=>!x).length+' componente(s)';
      return results;
    });
    return this.loadPromises[mode];
  }
  makeCharging(){
    const root=this.chargeRoot;
    this.plane(root,13.8,15.5,0x293c47,-.5,-.043,.25);
    this.plane(root,4.5,6.2,0x3d535e,.12,-.036,.30);
    for(const x of [-2.0,2.35])this.box(root,.045,.009,6,0xb8d2d7,x,-.020,.25,0,.9);
    this.box(root,4.35,.009,.045,0xb8d2d7,.17,-.020,-2.72,0,.9);
    // Wheel stop, plinth and independent bollards; all in meters.
    for(const x of [-.7,.7])this.box(root,.65,.09,.18,0x192632,x,.045,2.50,.06,.8);
    this.chargerMount=new THREE.Group();root.add(this.chargerMount);
    this.chargerPosition=new THREE.Vector3(-3.15,0,.58);
    this.box(this.chargerMount,1.12,.12,1.13,0x596c74,-3.15,.06,.58,.05,.84);
    for(const z of [-.35,1.52]){
      this.cylinder(root,.055,.055,.83,0xc7cdd1,-3.72,.415,z);
      this.cylinder(root,.058,.058,.13,0xedd671,-3.72,.73,z);
    }
    this.ac=new THREE.Group();this.dc=new THREE.Group();this.chargerMount.add(this.ac,this.dc);
    // AC: original Trydan enclosure mounted on an educational aluminum stand.
    this.box(this.ac,.075,1.45,.075,0x788893,-3.15,.845,.55,.75,.30);
    this.box(this.ac,.35,.055,.35,0x53626c,-3.15,.15,.55,.7,.36);
    this.box(this.ac,.32,.57,.025,0x788893,-3.15,1.25,.55,.65,.35);
    const acMount=new THREE.Group();acMount.position.set(-3.15,1.01,.58);this.ac.add(acMount);
    const acFallback=new THREE.Group();acMount.add(acFallback);
    this.box(acFallback,.244,.46,.155,0x252e37,0,.23,0,.20,.45);
    this.registerAsset('charging','TRYDAN','charging/trydan_wallbox.glb',acMount,acFallback,model=>{
      model.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const m of materials)if(m.color&&m.color.r+m.color.g+m.color.b<.025)m.color.set(0x242b30);}});
    });
    const dcMount=new THREE.Group();dcMount.position.set(-3.15,.12,.58);dcMount.rotation.y=-Math.PI/2;this.dc.add(dcMount);
    // The source facade contains open/missing rear surfaces after isolation.
    // Complete the cabinet behind the imported screen/docks, without altering them.
    this.box(dcMount,.43,1.83,.76,0xb7c3c9,-.17,.99,0,.42,.38);
    this.box(dcMount,.46,.13,.79,0x303e48,-.16,.10,0,.4,.47);
    this.box(dcMount,.45,.044,.78,0x72838d,-.17,1.923,0,.6,.33);
    for(const z of [-.37,.37])for(let i=0;i<7;i++)
      this.box(dcMount,.29,.019,.013,0x374651,-.17,.38+i*.042,z,.3,.46);
    const dcFallback=new THREE.Group();dcMount.add(dcFallback);
    const display=this.screen(dcFallback,'DC · CCS1','50 / 100 kW');display.rotation.y=Math.PI/2;display.position.set(.253,1.45,0);
    this.registerAsset('charging','SHELL_DC','charging/shell_dc_charger.glb',dcMount,dcFallback);
    this.acPlaque=this.plaque(this.ac,'AC · J1772',[-3.15,1.66,.67],.50,.10);
    this.axial(this.dc,.027,.10,0x202a33,[-2.947,.90,.80],[0,0,1]);
    this.dcPlaque=this.plaque(this.dc,'DC · CCS1',[-3.15,2.18,.78],.78,.13);
    // H5.14: calibrated on the normalized, unmodified Bolt GLB.
    // +X is driver/left, +Z is front. Fender contact behind the front wheel:
    // body surface (0.8300, 0.8300, 1.0000), outward normal (0.9767, 0.2138, -0.0176).
    // All socket/plug offsets use this one local frame; no per-frame raycasting.
    this.port=new THREE.Group();root.add(this.port);
    this.port.position.set(.8300,.8300,1.0000);
    const outward=new THREE.Vector3(.9767,.2138,-.0176).normalize();
    const inward=outward.clone().negate();
    const up=new THREE.Vector3(0,1,0).addScaledVector(outward,-outward.y).normalize();
    const along=new THREE.Vector3().crossVectors(inward,up).normalize();
    this.port.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(inward,up,along));
    this.port.position.addScaledVector(outward,.006);
    this.port.userData.representation='Puerto educativo J1772 / CCS1';
    this.axial(this.port,.088,.023,0x17212a,[0,0,0],[1,0,0]);
    this.portInset=this.axial(this.port,.071,.026,0x34424b,[-.019,0,0],[1,0,0]);
    for(const [y,z] of [[.026,-.031],[.026,.031],[-.026,-.034],[-.026,.034],[0,0]])
      this.axial(this.port,.010,.031,0x131a20,[-.039,y,z],[1,0,0]);
    this.dcInlet=new THREE.Group();this.port.add(this.dcInlet);
    for(const z of [-.030,.030])this.axial(this.dcInlet,.019,.026,0x151d23,[-.023,-.105,z],[1,0,0]);
    // Hinged lid: its hinge touches the bezel; opening is outward, not into the body.
    const lid=new THREE.Group();lid.position.set(0,0,-.092);lid.rotation.y=1.15;this.port.add(lid);
    this.box(lid,.014,.176,.176,0x22323b,0,0,-.088,.25,.43);
    // Cable curves start on the selected station and stop at the connector.
    this.cable=new THREE.Group();root.add(this.cable);
    this.connector=new THREE.Group();this.cable.add(this.connector);
    this.connector.quaternion.copy(this.port.quaternion);
    this.connector.position.copy(new THREE.Vector3(-.121,0,0).applyQuaternion(this.port.quaternion).add(this.port.position));
    // Keep the station on its existing roadside anchor. The hose goes AROUND
    // the bumper (front extremity z=2.165), then along the driver-side shoulder.
    // The final two points follow the handle axis and terminate inside its grip.
    const grip=new THREE.Vector3(-.153,-.096,0);
    const tail=grip.clone().add(new THREE.Vector3(-.055,-.083,0));
    const toBay=p=>p.applyQuaternion(this.connector.quaternion).add(this.connector.position).toArray();
    const end=toBay(grip),lead=toBay(tail);
    const around=[[-2.8,.36,1.55],[-1.65,.13,2.65],[0,.12,2.75],[1.45,.15,2.55],[1.70,.26,1.7],[1.52,.52,1.05],lead,end];
    this.acCable=this.tube(this.cable,[[-3.15,1.01,.65],[-3.08,.72,1.05],...around],0x151b22,.023);
    this.dcCable=this.tube(this.cable,[[-2.947,.90,.85],[-2.90,.60,1.12],...around],0x171d24,.034);
    this.axial(this.connector,.058,.20,0x28343d,[-.055,0,0],[1,0,0]);
    this.axial(this.connector,.070,.045,0x71818b,[.047,0,0],[1,0,0]);
    this.axial(this.connector,.046,.13,0x171d24,[-.117,-.042,0],[.55,.83,0]);
    this.box(this.connector,.14,.013,.022,0x8f9ca5,-.008,.057,0,.7,.33);
    this.dcConnector=this.box(this.connector,.105,.063,.102,0x303b44,.023,-.082,0,.18,.39);
    // When disconnected only a neatly parked hose/handle is shown.
    this.parkedCable=new THREE.Group();root.add(this.parkedCable);
    this.parkedAC=this.tube(this.parkedCable,[[-3.15,1.01,.65],[-3.22,.78,.73],[-3.38,.54,.74],[-3.12,.42,.73],[-2.93,.57,.75],[-3.08,.92,.73]],0x171d24,.023);
    this.parkedDC=this.tube(this.parkedCable,[[-2.947,.90,.85],[-2.77,.57,.95],[-3.09,.33,1.0],[-3.42,.47,.92],[-3.40,.78,.89]],0x171d24,.034);
    this.statusLED=this.cylinder(root,.022,.022,.012,0x4da598,-2.78,1.17,.97);
    this.setCableConnected(false);
  }
  setCableConnected(connected){
    this.connected=!!connected;this.cable.visible=this.connected;this.parkedCable.visible=!this.connected;
    this.portInset.material.color.set(this.connected?0x398f8a:0x34424b);
    this.statusLED.material.color.set(this.connected?0x4fe3bb:0x719791);
    this.statusLED.material.emissive.set(this.connected?0x166f5a:0x000000);
  }
  setStation(key){
    this.stationKey=key;this.isDC=String(key).startsWith('dc');
    this.dc.visible=this.isDC;this.ac.visible=!this.isDC;
    this.acCable.visible=!this.isDC;this.dcCable.visible=this.isDC;
    this.parkedAC.visible=!this.isDC;this.parkedDC.visible=this.isDC;
    this.dcConnector.visible=this.isDC;this.dcInlet.visible=this.isDC;
    const label=this.isDC?this.dcPlaque:this.acPlaque;
    const text={ac120:'AC · 120 V / J1772',ac240:'AC · 240 V / J1772',dc50:'DC · 50 kW / CCS1',dc100:'DC · 100 kW / CCS1'}[key]||'RECARGA';
    label.ctx.fillStyle='#102532';label.ctx.fillRect(13,0,1011,160);
    label.ctx.fillStyle='#eff8ff';label.ctx.font='bold 56px sans-serif';label.ctx.fillText(text,522,80);label.texture.needsUpdate=true;
  }
  label(text,position,color){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=100;
    const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(10,28,43,.92)';ctx.beginPath();ctx.roundRect(3,3,506,94,17);ctx.fill();
    ctx.fillStyle='#'+new THREE.Color(color).getHexString();ctx.fillRect(23,23,9,55);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 32px sans-serif';ctx.fillStyle='#e5f5f7';ctx.fillText(text,271,52);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
    sprite.position.set(...position);sprite.scale.set(.83,.162,1);this.thermalRoot.add(sprite);this.labelSprites.push(sprite);
  }
  trackGroup(group,id){
    group.userData.thermalId=id;
    group.traverse(o=>{if(o.isMesh){o.userData.thermalId=id;this.thermalMeshes.push(o);}});
  }
  addFlow(mesh,id){
    mesh.userData.thermalId=id;mesh.userData.flowId=id;
    for(let i=0;i<6;i++){
      const particle=new THREE.Mesh(new THREE.SphereGeometry(.014,8,6),new THREE.MeshBasicMaterial({color:mesh.material.color}));
      particle.visible=false;particle.userData={flowMesh:mesh,index:i};this.thermalRoot.add(particle);this.particles.push(particle);
    }
  }
  makePump(root,position,id){
    const mount=new THREE.Group();mount.position.set(...position);root.add(mount);
    const fallback=new THREE.Group();mount.add(fallback);
    this.axial(fallback,.064,.17,0x596770,[0,0,0],[1,0,0]);
    this.axial(fallback,.02,.09,0x2a3540,[-.115,-.0113,.0074],[1,0,0]);
    this.axial(fallback,.02,.10,0x2a3540,[-.048,.04,.0392],[0,1,0]);
    this.trackGroup(fallback,id);
    return {mount,fallback};
  }
  makeThermal(){
    const root=this.thermalRoot;
    this.plane(root,8,10.6,0x162e3b,0,-.035,.25);
    this.plane(root,4.2,5.5,0x244652,0,-.032,.25);
    const bp=[-.64,.67,.82],pp=[.57,.97,1.12];
    const batteryPump=this.makePump(root,bp,'coolant'),powerPump=this.makePump(root,pp,'inverter');
    this.batteryPumpMount=batteryPump.mount;this.powerPumpMount=powerPump.mount;
    this.registerAsset('thermal','COOLANT_PUMPS','thermal/electric-coolant-pump.glb',batteryPump.mount,batteryPump.fallback,model=>{
      this.trackGroup(model,'coolant');const second=model.clone(true);
      const copies=new Map();second.traverse(o=>{if(o.isMesh){const own=m=>{if(!copies.has(m))copies.set(m,m.clone());return copies.get(m);};o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);}});powerPump.mount.add(second);powerPump.fallback.visible=false;
      this.trackGroup(second,'inverter');
    });
    // The supplied plate is a generic CAD panel. Repeat it to illustrate a pack,
    // raised above the existing H4 visual casing for inspectability, not an OEM layout.
    this.plateMount=new THREE.Group();this.plateMount.position.set(0,.49,-.22);root.add(this.plateMount);
    const plateFallback=new THREE.Group();this.plateMount.add(plateFallback);
    this.box(plateFallback,1.43,.015,1.89,0x6c8993,0,0,0,.78,.34);this.trackGroup(plateFallback,'battery');
    this.registerAsset('thermal','COOLING_PLATES','thermal/battery-cooling-plate.glb',this.plateMount,plateFallback,model=>{
      model.scale.setScalar(.84);model.position.set(-.36,0,-.69);this.trackGroup(model,'battery');
      for(let col=0;col<2;col++)for(let row=0;row<4;row++){
        if(!col&&!row)continue;const panel=model.clone(true);panel.position.set(col?.36:-.36,0,-.69+row*.46);
        this.plateMount.add(panel);this.trackGroup(panel,'battery');
      }
    });
    // Visible educational manifolds/adapters keep the flow connection unambiguous.
    for(const x of [-.735,.735]){
      this.axial(root,.022,1.90,0x587780,[x,.49,-.22],[0,0,1]);
      for(const z of [-.91,-.45,.01,.47])this.axial(root,.014,.055,0xa2b7be,[x<0?-.707:.707,.49,z],[1,0,0]);
    }
    this.radiatorMount=new THREE.Group();this.radiatorMount.position.set(0,.87,1.96);root.add(this.radiatorMount);
    const radiatorFallback=new THREE.Group();this.radiatorMount.add(radiatorFallback);
    this.box(radiatorFallback,.72,.69,.071,0x667680,0,0,0,.65,.43);this.trackGroup(radiatorFallback,'inverter');
    this.registerAsset('thermal','RADIATOR','thermal/car-radiator.glb',this.radiatorMount,radiatorFallback,model=>this.trackGroup(model,'inverter'));
    this.axial(root,.023,.065,0x8eabb6,[-.365,1.115,1.96],[1,0,0]);
    this.axial(root,.023,.065,0x8eabb6,[.365,.615,1.96],[1,0,0]);
    // Fan is deliberately code-created: ring, motor hub and seven separate blades.
    this.fanHousing=new THREE.Group();this.fanHousing.position.set(.025,.88,2.027);root.add(this.fanHousing);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.248,.021,10,48),this.mat(0x202a32,.2,.44));this.fanHousing.add(ring);
    this.fanRotor=new THREE.Group();this.fanHousing.add(this.fanRotor);
    this.axial(this.fanRotor,.058,.054,0x3d4d59,[0,0,.012],[0,0,1]);
    for(let i=0;i<7;i++){
      const holder=new THREE.Group();holder.rotation.z=i*Math.PI*2/7;this.fanRotor.add(holder);
      const blade=this.box(holder,.092,.167,.014,0x29343d,.048,.146,0,.22,.41);blade.rotation.z=-.48;blade.rotation.y=.30;
    }
    this.trackGroup(this.fanHousing,'inverter');
    // Generic stacked-plate chiller and cabin heater, with distinct ports.
    this.chiller=new THREE.Group();this.chiller.position.set(-.52,.76,.19);root.add(this.chiller);
    for(let i=0;i<7;i++)this.box(this.chiller,.25,.013,.22,0x8d9fa7,0,i*.018,0,.75,.32);
    this.box(this.chiller,.27,.014,.235,0x526873,0,-.01,0,.65,.38);
    this.axial(this.chiller,.022,.060,0x9bafb7,[-.096,.043,.128],[0,0,1]);
    this.axial(this.chiller,.022,.060,0x9bafb7,[.096,.084,.128],[0,0,1]);this.trackGroup(this.chiller,'coolant');
    this.cabinHeater=new THREE.Group();this.cabinHeater.position.set(-.28,1.08,.12);root.add(this.cabinHeater);
    this.box(this.cabinHeater,.24,.12,.24,0x777a68,0,0,0,.42,.41);
    for(let i=0;i<5;i++)this.box(this.cabinHeater,.215,.009,.012,0xa2a78a,0,.066,-.085+i*.043,.5,.35);this.trackGroup(this.cabinHeater,'cabin');
    // Tubes attach to measured pump outlets; short straight lead-ins prevent kinks.
    this.batteryFlow=this.tube(root,[[-.755,.6587,.8274],[-.83,.6587,.8274],[-.85,.55,.58],[-.82,.49,.22],[-.735,.49,-.10],[-.735,.49,-1.17]],0x32c9bb,.018,.92);
    this.batteryReturn=this.tube(root,[[.735,.49,-1.17],[.735,.49,.56],[.70,.57,.83],[.36,.64,.83],[-.06,.67,.61],[-.32,.71,.40],[-.424,.844,.318]],0x269c95,.018,.9);
    this.chillerToPump=this.tube(root,[[-.616,.803,.318],[-.72,.81,.37],[-.70,.83,.57],[-.68785,.8194,.8592],[-.68785,.7594,.8592]],0x32c9bb,.018,.92);
    this.frontBatteryJoin=this.tube(root,[[-.735,.49,-1.17],[-.735,.49,-1.22],[.735,.49,-1.22],[.735,.49,-1.17]],0x269c95,.018,.9);
    this.powerFlow=this.tube(root,[[.455,.9587,1.1274],[.395,.9587,1.1274],[.23,1.09,1.19],[-.40,1.20,1.16],[-.73,1.16,1.38],[-.49,1.14,1.84],[-.43,1.115,1.96],[-.365,1.115,1.96]],0x649beb,.020,.93);
    this.powerReturn=this.tube(root,[[.365,.615,1.96],[.43,.615,1.96],[.64,.62,1.79],[.80,.68,1.52],[.83,.99,1.31],[.52215,1.1194,1.1592],[.52215,1.0594,1.1592]],0x4286c5,.020,.9);
    this.cabinFlow=this.tube(root,[[-.40,1.08,.12],[-.52,1.05,-.09],[-.45,1.05,-.24],[.27,1.05,-.24],[.38,1.08,-.05],[.27,1.08,.17],[-.16,1.08,.12]],0xd8af69,.014,.85);
    for(const mesh of [this.batteryFlow,this.batteryReturn,this.chillerToPump,this.frontBatteryJoin])this.addFlow(mesh,'coolant');
    for(const mesh of [this.powerFlow,this.powerReturn])this.addFlow(mesh,'inverter');this.addFlow(this.cabinFlow,'cabin');
    for(const [pos,color,id] of [[[-.735,.49,-1.17],0x5bcdbb,'battery'],[bp,0x5bcdbb,'coolant'],[[0,.87,1.96],0x83b7f2,'inverter'],[[-.28,1.08,.12],0xe1bb7b,'cabin']]){
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),new THREE.MeshBasicMaterial({color}));
      marker.position.set(...pos);marker.userData.thermalId=id;root.add(marker);this.labelMarkers.push(marker);
    }
    this.label('BATERÍA HV',[-1.08,.92,-.68],0x36dbc9);
    this.label('REFRIGERACIÓN',[.94,1.35,1.60],0x91b6fa);
    this.label('HABITÁCULO',[-.66,1.59,-.10],0xf3bf81);
    this.setLabelsVisible(true);
  }
  setLabelsVisible(visible){this.thermalLabelsVisible=!!visible;this.applyThermalHighlight();}
  setThermalHighlight(id=null){this.highlightedCircuit=id;this.applyThermalHighlight();}
  category(id){return ['battery','coolant'].includes(id)?'battery':['motor','inverter'].includes(id)?'power':id==='cabin'?'cabin':null;}
  applyThermalHighlight(){
    const active=this.category(this.highlightedCircuit);
    for(const mesh of [this.batteryFlow,this.batteryReturn,this.chillerToPump,this.frontBatteryJoin,this.powerFlow,this.powerReturn,this.cabinFlow].filter(Boolean)){
      const selected=!active||this.category(mesh.userData.thermalId)===active;
      mesh.material.opacity=selected?.90:.12;mesh.material.transparent=true;mesh.material.depthWrite=false;
    }
    for(const mesh of this.thermalMeshes){
      const selected=!active||this.category(mesh.userData.thermalId)===active;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        // Keep solid component materials solid; highlighting dims emissive only.
        if(material.emissive){material.emissive.set(selected&&active?0x163f43:0x000000);material.emissiveIntensity=selected&&active?.18:0;}
      }
    }
    this.labelSprites.forEach((sprite,i)=>sprite.visible=this.thermalLabelsVisible&&(!active||active===['battery','power','cabin'][i]));
  }
  pickThermal(raycaster){
    const targets=[...this.thermalMeshes,...this.labelMarkers,this.batteryFlow,this.batteryReturn,this.chillerToPump,this.frontBatteryJoin,this.powerFlow,this.powerReturn,this.cabinFlow];
    this.thermalRoot.updateWorldMatrix(true,true);
    const visible=targets.filter(mesh=>{let node=mesh;while(node){if(!node.visible)return false;node=node.parent;}return true;});
    const hit=raycaster.intersectObjects(visible,false)[0];return hit?.object.userData.thermalId??null;
  }
  detailView(key){
    const object={pump:this.batteryPumpMount,radiator:this.radiatorMount,plates:this.plateMount}[key];
    if(!object)return null;
    const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    const offsets={pump:[-.55,.38,.68],radiator:[-.75,.60,1.24],plates:[-1.35,1.64,.70]};
    return {position:center.clone().add(new THREE.Vector3(...offsets[key])),target:center,id:key==='pump'?'coolant':key==='radiator'?'inverter':'battery'};
  }
  setMode(mode){
    this.chargeRoot.visible=mode==='charging';this.thermalRoot.visible=mode==='thermal';
    if(mode==='charging'||mode==='thermal')this.loadAssets(mode);
    if(mode==='thermal')this.setThermalHighlight(null);
  }
  update(thermal,timeS=0){
    if(!thermal)return;this.lastThermal=thermal;
    const a=thermal.actuators||{},active=this.category(this.highlightedCircuit);
    for(const mesh of [this.batteryFlow,this.batteryReturn,this.chillerToPump,this.frontBatteryJoin,this.powerFlow,this.powerReturn,this.cabinFlow]){
      const cat=this.category(mesh.userData.thermalId),selected=!active||active===cat;
      const on=cat==='battery'?a.batteryPump:cat==='power'?a.powerPump:a.cabinHeater;
      mesh.material.opacity=selected?(on?.82+.08*Math.sin(timeS*2):.40):.09;
      mesh.material.emissive.copy(mesh.material.color);mesh.material.emissiveIntensity=on?.12:0;
    }
    for(const p of this.particles){
      const cat=this.category(p.userData.flowMesh.userData.thermalId);
      const on=cat==='battery'?a.batteryPump:cat==='power'?a.powerPump:a.cabinHeater;
      p.visible=!!on&&(!active||active===cat);
      p.position.copy(p.userData.flowMesh.userData.curve.getPointAt((timeS*.13+p.userData.index/6)%1));
    }
    this.fanRotor.rotation.z=a.fan?timeS*13:this.fanRotor.rotation.z;
  }
}
