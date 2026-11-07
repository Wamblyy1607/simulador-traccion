import {clearServiceFootprint} from './service-area-layout.js';
import {ROUTE_STATIONS} from './route-journey.js';
import * as THREE from 'three';
const asset=file=>new URL('../assets/h512/'+file,import.meta.url).href;
const noop=()=>{};
function release(root){const used=new Set();root.traverse(o=>{if(o.isMesh){used.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){used.add(m);for(const t of Object.values(m))if(t?.isTexture)used.add(t);}}});for(const v of used)v.dispose();}
/** One visual world for the existing SceneManager, never a second physics clock. */
export class SharedWorldAssets{
 constructor(owner){
  this.owner=owner;this.scene=owner.scene;this.manager=owner.manager;this.disposed=false;this.hidden=new Map();this.pending=new Map();this.sources=[];this.garageBackground=new THREE.Color(0x151d26);
  this.root=new THREE.Group();this.root.name='H5_12_SHARED_WORLD';this.garage=new THREE.Group();this.drive=new THREE.Group();this.root.add(this.garage,this.drive);this.scene.add(this.root);
  this.dummy=new THREE.Object3D();this.placements=[];this.batches=[];this.roof=[];this.walls=[];this.floors=[];this.terrainMaps=[];
  let seed=512;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};let previous=-1;
  for(let i=0;i<42;i++){let variant=Math.floor(random()*3);if(variant===previous)variant=(variant+1)%3;previous=variant;this.placements.push({variant,x:(i%2?-1:1)*(14+random()*19),z:-115+Math.floor(i/2)*11.5,scale:(2.5+random()*1.3)*2.7,yaw:random()*Math.PI*2});}
  this.sync(false);
 }
 load(file,apply){if(this.pending.has(file))return this.pending.get(file);
  const promise=this.owner.enqueue(async()=>{try{const {scene}=await this.owner.gltf.loadAsync(asset(file));if(this.disposed){release(scene);return;}
   this.sources.push(scene);scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isMesh){o.raycast=noop;o.castShadow=false;o.receiveShadow=true;}});apply(scene);this.owner.failures.delete(file);this.owner.status();
  }catch(error){if(!this.disposed){this.owner.failures.add(file);this.owner.status();console.warn('H5.12: recurso no disponible, respaldo activo',file,error);}}});this.pending.set(file,promise);return promise;
 }
 prepareGarage(){return this.load('basement_garage.glb',model=>{
  model.traverse(o=>{if(!o.isMesh)return;const box=new THREE.Box3().setFromObject(o);const material=Array.isArray(o.material)?o.material[0]:o.material;
   // Cut away roof and perimeter only for top/exterior inspection cameras.
   // Interior columns, floor, doors and fixtures remain part of the garage.
   if(box.max.y<.2&&box.max.y-box.min.y<.2&&box.max.x-box.min.x>6)this.floors.push(o);
   if(box.min.y>3.1)this.roof.push(o);
   else if(material.name==='wall'&&box.max.x-box.min.x>20&&box.max.y>3.3)this.walls.push(o);
   if(material.name==='emissing'){material.emissive?.set(0xdbeaf3);material.emissiveIntensity=.65;}
  });this.garage.add(model);this.garageReady=true;
 });}
 prepareDrive(){
  this.load('pine_variants_lod.glb',model=>{
   const names=['pine_sapling_small_b','pine_sapling_small_a','pine_sapling_small_c'];
   names.forEach((name,variant)=>{for(let lod=0;lod<2;lod++){
    const group=model.getObjectByName(name+'_lod'+lod);if(!group)throw Error('Falta variante/LOD '+name+'/'+lod);
    group.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);const mesh=new THREE.InstancedMesh(geometry,o.material,42);mesh.count=0;mesh.frustumCulled=false;mesh.raycast=noop;mesh.castShadow=false;mesh.receiveShadow=true;mesh.name=name+'_instances_lod'+lod;this.drive.add(mesh);this.batches.push({variant,lod,mesh});});
   }});this.pineReady=true;this.lastToken=null;
  });
  this.load('rocky_ground_material.glb',model=>{
   let source;model.traverse(o=>{if(o.isMesh&&!source)source=o;});if(!source)throw Error('Material rocoso vacío');
   this.terrainMaterial=source.material.clone();this.terrainMaterial.normalScale?.set(.55,.55);
   for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap']){const map=this.terrainMaterial[key];if(!map)continue;
    // ARM channels may share one texture; clone once, repeat in metres.
    let clone=this.terrainMaps.find(t=>t.userData.source===map.uuid);if(!clone){clone=map.clone();clone.userData={source:map.uuid};clone.wrapS=clone.wrapT=THREE.RepeatWrapping;clone.repeat.set(90/4,260/4);clone.anisotropy=Math.min(4,this.manager.renderer.capabilities?.getMaxAnisotropy?.()??1);clone.needsUpdate=true;this.terrainMaps.push(clone);}this.terrainMaterial[key]=clone;
   }
   for(const side of [-1,1]){const geo=new THREE.PlaneGeometry(90,260);geo.setAttribute('uv1',geo.attributes.uv.clone());const ground=new THREE.Mesh(geo,this.terrainMaterial);ground.rotation.x=-Math.PI/2;ground.position.set(side*54,-.04,0);ground.receiveShadow=true;ground.raycast=noop;ground.name='H512_ROCKY_SHOULDER';this.drive.add(ground);}
   this.rockReady=true;this.lastToken=null;
  });
 }
 hide(object){if(object&&!this.hidden.has(object)){this.hidden.set(object,object.visible);object.visible=false;}}
 sync(driving){
  if(this.disposed)return;this.garage.visible=!driving;this.drive.visible=driving;
  if(!driving){this.prepareGarage();if(this.garageReady){const y=this.manager.camera?.position.y??2;const cutaway=y>3.1||y<.1;for(const o of this.floors)o.visible=y>=.1;for(const o of this.roof)o.visible=!cutaway;for(const o of this.walls)o.visible=!cutaway;this.scene.background=this.garageBackground;if(this.scene.fog){this.scene.fog.color.set(0x151d26);this.scene.fog.density=.009;}}return;}
  this.prepareDrive();
  const legacy=this.scene.getObjectByName('H5_3_VISUAL_ENVIRONMENT');if(this.pineReady&&legacy?.userData.vegetation)this.hide(legacy.userData.vegetation);
  const road=this.scene.getObjectByName('H2_DRIVING_SCENERY');if(this.rockReady)for(const o of road?.children??[]){const p=o.geometry?.parameters;if(p?.width===24&&p?.height===260)this.hide(o);}
  const distance=this.owner.distance,camera=this.manager.camera?.position;const token=distance.toFixed(3)+'/'+this.owner.routeEnabled+'/'+(camera?`${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.z.toFixed(2)}`:'0');if(token===this.lastToken)return;this.lastToken=token;
  // Keep the two nearest full trees; all other silhouettes are baked from the source.
  // Fixed capacity avoids multiplying the 122k-143k triangle source 42 times.
  let first=null,second=null;
  for(const t of this.placements){t.renderZ=((t.z-distance+120)%240+240)%240-120;t.range=Math.hypot(t.x-(camera?.x??0),t.renderZ-(camera?.z??0));
   t.serviceClear=this.owner.routeEnabled&&clearServiceFootprint(ROUTE_STATIONS,this.owner.routePosition,t.x,t.renderZ);if(t.serviceClear||t.range>=32)continue;if(!first||t.range<first.range){second=first;first=t;}else if(!second||t.range<second.range)second=t;
  }
  for(const batch of this.batches){let count=0;for(const t of this.placements){if(t.variant!==batch.variant||t.serviceClear)continue;
    const lod=t===first||t===second?0:1;if(t.range>145||batch.lod!==lod)continue;
    this.dummy.position.set(t.x,0,t.renderZ);this.dummy.rotation.set(0,t.yaw,0);this.dummy.scale.setScalar(t.scale);this.dummy.updateMatrix();batch.mesh.setMatrixAt(count++,this.dummy.matrix);
   }batch.mesh.count=count;batch.mesh.instanceMatrix.needsUpdate=true;}
  for(const map of this.terrainMaps)map.offset.y=-(((distance%4)+4)%4)/4;
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const s of this.sources)release(s);for(const b of this.batches)b.mesh.geometry.dispose();this.drive.traverse(o=>{if(o.name==='H512_ROCKY_SHOULDER')o.geometry.dispose();});this.terrainMaterial?.dispose();for(const t of this.terrainMaps)t.dispose();for(const [o,v] of this.hidden)o.visible=v;this.root.removeFromParent();}
}
