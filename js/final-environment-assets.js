import * as THREE from 'three';
import {SharedWorldAssets} from './shared-world-assets.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {ENVIRONMENT_PROFILES,MODEL_FILES,STATION_VISUALS,environmentProfile,repeatPosition,accessGap} from './final-asset-catalog.js';
import {ROUTE_STATIONS} from './route-journey.js';
const url=file=>new URL('../assets/final/'+file,import.meta.url).href;
const disablePicking=root=>root.traverse(o=>{if(o.isMesh){o.raycast=()=>{};o.receiveShadow=true;o.castShadow=false;}});
function release(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});for(const x of [...geometries,...materials,...textures])x.dispose();}
/** Deferred, cached visual assets. The route and physics are read-only inputs. */
export class FinalEnvironmentAssets{
 constructor(manager,options={}){
  this.manager=manager;this.scene=manager.scene;this.disposed=false;this.mode=null;this.key=null;this.activeTexture=null;
  this.choice='mountain';this.distance=0;this.routePosition=0;this.routeEnabled=false;this.matrix=new THREE.Matrix4();this.rotation=new THREE.Quaternion();this.scale=new THREE.Vector3(1,1,1);this.vector=new THREE.Vector3();
  this.environments=new Map();this.environmentPending=new Map();this.models=new Map();this.modelPending=new Map();this.failures=new Set();this.hiddenLegacy=new Map();this.bindings=[];
  this.gltf=options.gltf||new GLTFLoader();this.rgbe=options.rgbe||new RGBELoader();this.exr=options.exr||new EXRLoader();this.makePMREM=options.makePMREM||(()=>new THREE.PMREMGenerator(manager.renderer));
  this.schedule=options.schedule||(callback=>new Promise(resolve=>{const run=()=>resolve(callback());if(globalThis.requestIdleCallback)requestIdleCallback(run,{timeout:1200});else setTimeout(run,0);}));
  this.queue=Promise.resolve();this.root=new THREE.Group();this.root.name='H5_10_FINAL_ASSETS';this.scene.add(this.root);
  this.driveRoot=new THREE.Group();this.campusRoot=new THREE.Group();this.root.add(this.driveRoot,this.campusRoot);this.driveRoot.visible=false;this.campusRoot.visible=false;
  this.world=options.world||new SharedWorldAssets(this);
 }
 status(){const e=document.getElementById('visual-assets-status');if(e)e.textContent=this.failures.size?'Entorno disponible con respaldo · '+this.failures.size+' recurso(s) no cargado(s)':'Recursos preparados: '+(this.models.size+this.environments.size);}
 enqueue(work){const task=this.queue.then(()=>this.disposed?null:this.schedule(work));this.queue=task.catch(()=>null);return task;}
 loadModel(id){
  if(this.modelPending.has(id))return this.modelPending.get(id);
  const promise=this.enqueue(async()=>{try{const gltf=await this.gltf.loadAsync(url(MODEL_FILES[id]));if(this.disposed){release(gltf.scene);return null;}
   disablePicking(gltf.scene);gltf.scene.traverse(o=>{if(o.isMesh){o.frustumCulled=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(m.emissiveIntensity>1)m.emissiveIntensity=.3;
    if(id==='detail'&&m.color){m.color.set(0xb8c4c8);m.metalness=.28;m.roughness=.48;}
   }}});this.models.set(id,gltf.scene);this.failures.delete(id);this.status();return gltf.scene;
  }catch(error){if(!this.disposed){this.failures.add(id);this.status();console.warn('Activo visual no disponible; se conserva respaldo:',id,error);}return null;}});
  this.modelPending.set(id,promise);return promise;
 }
 loadEnvironment(key){
  if(this.environments.has(key))return Promise.resolve(this.environments.get(key));
  if(this.environmentPending.has(key))return this.environmentPending.get(key);
  const p=ENVIRONMENT_PROFILES[key];const promise=this.enqueue(async()=>{let raw=null;try{
   raw=await (p.kind==='exr'?this.exr:this.rgbe).loadAsync(url(p.file));if(this.disposed){raw.dispose();return null;}
   raw.mapping=THREE.EquirectangularReflectionMapping;
   this.pmrem??=this.makePMREM();const target=this.pmrem.fromEquirectangular(raw);const entry={raw,target};this.environments.set(key,entry);this.failures.delete(key);
   if(this.key===key)this.applyEnvironment(key,entry);this.trimEnvironments();this.status();return entry;
  }catch(error){raw?.dispose();if(!this.disposed){this.failures.add(key);this.status();console.warn('HDR no disponible; se conserva fondo de respaldo:',key,error);}return null;}
  }).finally(()=>this.environmentPending.delete(key));this.environmentPending.set(key,promise);return promise;
 }
 trimEnvironments(){while(this.environments.size>2){const old=[...this.environments.keys()].find(k=>k!==this.key);const e=this.environments.get(old);e.raw.dispose();e.target.dispose();this.environments.delete(old);}}
 applyEnvironment(key,entry){
  if(this.disposed||key!==this.key)return;const p=ENVIRONMENT_PROFILES[key];this.activeTexture=entry.raw;
  this.scene.environment=entry.target.texture;this.scene.environmentIntensity=p.intensity;
  this.scene.environmentRotation?.set(0,p.yaw,0);this.scene.backgroundRotation?.set(0,p.yaw,0);
  this.scene.background=p.background?entry.raw:new THREE.Color(0x172635);this.scene.backgroundIntensity=key==='technical'?.48:.72;this.scene.backgroundBlurriness=key==='technical'?.12:0;
  this.manager.renderer.toneMappingExposure=p.exposure;
  // Match the key direction to each panorama's sun / studio key, including panorama yaw.
  const direction=new THREE.Vector3(...p.sun).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),p.yaw);
  for(const light of this.scene.children)if(light.isDirectionalLight&&light.castShadow){
   light.position.copy(direction).multiplyScalar(14);light.color.set(key==='sky'?0xffdfb3:0xfff5e8);
   const extent=key==='technical'?10:24;light.shadow.camera.left=-extent;light.shadow.camera.right=extent;light.shadow.camera.top=extent;light.shadow.camera.bottom=-extent;light.shadow.camera.updateProjectionMatrix();
  }
 }
 setDrivingProfile(choice){this.choice=choice==='sky'?'sky':'mountain';if(this.mode)this.sync(this.mode);}
 sync(mode){
  if(this.disposed)return;this.mode=mode;this.driveRoot.visible=mode==='driving';this.campusRoot.visible=false;
  const next=environmentProfile(mode==='charging'?'technical':mode,this.choice);
  if(next!==this.key){this.key=next;this.activeTexture=null;this.scene.environment=null;

   const entry=this.environments.get(next);if(entry)this.applyEnvironment(next,entry);else this.loadEnvironment(next);
   for(const light of this.scene.children){if(light.isHemisphereLight)light.intensity=.7;else if(light.isDirectionalLight)light.intensity=light.castShadow?1.2:.18;}
  }
  if(mode==='technical'){this.scene.fog.color.set(0x172635);this.scene.fog.density=.008;}
  if(mode==='driving'){if(!this.driveRequested){this.driveRequested=true;this.prepareDriving();}this.hideLegacyRoad();this.animateDriving();}

  this.world.sync(mode==='driving');
  this.syncCharging();
 }
 fit(template,height){const item=template.clone(true);const bounds=new THREE.Box3().setFromObject(item);const size=bounds.getSize(new THREE.Vector3());const scale=height/Math.max(.001,size.y);item.scale.multiplyScalar(scale);disablePicking(item);item.traverse(o=>{if(o.isMesh)o.castShadow=true;});return item;}
 async prepareDriving(){
  const road=await this.loadModel('road');if(road&&!this.disposed){let mesh;road.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});
   const geo=mesh.geometry.clone();geo.scale(9,1,6);this.road=new THREE.InstancedMesh(geo,mesh.material,24);this.road.frustumCulled=false;this.road.raycast=()=>{};this.road.receiveShadow=true;this.driveRoot.add(this.road);
   this.hideLegacyRoad();this.lastDistance=null;
  }
  const guard=await this.loadModel('guard');if(guard&&!this.disposed){this.guard=this.makeInstances(guard,60);this.driveRoot.add(this.guard);this.lastDistance=null;}
  const terminal=await this.loadModel('terminal');if(terminal&&!this.disposed){this.terminal=this.makeInstances(terminal,4);this.driveRoot.add(this.terminal);this.lastDistance=null;}
 }
 makeInstances(model,count){let mesh;model.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});const item=new THREE.InstancedMesh(mesh.geometry,mesh.material,count);item.frustumCulled=false;item.raycast=()=>{};return item;}
 hideLegacyRoad(){if(!this.road)return;const root=this.scene.getObjectByName('H2_DRIVING_SCENERY');if(!root)return;
  for(const o of root.children){const p=o.geometry?.parameters;if(p&&(((p.width===12||p.width===18)&&p.height===260)||(p.width===.12&&p.height===4.1&&!o.userData.h515Lane))){if(!this.hiddenLegacy.has(o))this.hiddenLegacy.set(o,o.visible);o.visible=false;}}
 }
 updateDistance(distance,route){this.distance=Number.isFinite(distance)?distance:0;this.routeEnabled=!!route?.enabled;this.routePosition=route?.enabled?route.position(this.distance):this.distance;}
 animateDriving(){
  const token=this.distance.toFixed(2)+'/'+this.routeEnabled+'/'+this.routePosition.toFixed(2);if(token===this.lastDistance)return;this.lastDistance=token;
  if(this.road){for(let i=0;i<24;i++){this.matrix.makeTranslation(0,-.026,repeatPosition(-138+i*12,this.distance,288));this.road.setMatrixAt(i,this.matrix);}this.road.instanceMatrix.needsUpdate=true;}
  if(this.guard){let count=0;this.rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2);
   for(const side of [-1,1])for(let i=0;i<30;i++){const z=repeatPosition(-58+i*4,this.distance,120);if(accessGap(z,side,this.routePosition,this.routeEnabled,ROUTE_STATIONS))continue;
    this.vector.set(side*9.7,0,z);this.matrix.compose(this.vector,this.rotation,this.scale);this.guard.setMatrixAt(count++,this.matrix);
   }this.guard.count=count;this.guard.instanceMatrix.needsUpdate=true;
  }
  if(this.terminal){let count=0;for(const side of [-1,1])for(const z of [-60,60]){if(accessGap(z,side,this.routePosition,this.routeEnabled,ROUTE_STATIONS))continue;this.vector.set(side*9.7,0,z);this.rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),z<0?-Math.PI/2:Math.PI/2);this.matrix.compose(this.vector,this.rotation,this.scale);this.terminal.setMatrixAt(count++,this.matrix);}this.terminal.instanceMatrix.needsUpdate=true;}
 }
 bindStation(marker){
  this.bindings.push(marker);const recipe=STATION_VISUALS[marker.station.id];marker.recipe=recipe;marker.assetRequested=false;
 }
 updateStation(marker){
  if(marker.near&&!marker.assetRequested){marker.assetRequested=true;const recipe=marker.recipe;
   this.loadModel(recipe.body).then(model=>{if(model&&!this.disposed){const item=this.fit(model,recipe.height);item.position.set(0,.12,0);if(marker.serviceBay&&recipe.body==='low')item.rotation.y=Math.PI;marker.body.add(item);marker.importedBody=item;marker.fallback.visible=false;}});
   if(recipe.shelter&&!marker.serviceBay)this.loadModel('shelter').then(model=>{if(model&&!this.disposed){const item=this.fit(model,2.7);item.position.set(-3.8,0,0);marker.group.add(item);marker.importedShelter=item;}});
  }
 }
 attachCharging(visual){this.chargingVisual=visual;}
 syncCharging(){
  // Roll back H5.10 pedestal swapping: H5.9 owns the bay, plaques and live cable.
  const v=this.chargingVisual;if(!v)return;
  this.chargingItem?.removeFromParent();this.chargingItem=null;this.chargingKey=null;
  v.ac.visible=!v.isDC;v.dc.visible=v.isDC;
 }

 dispose(){if(this.disposed)return;this.disposed=true;this.scene.environment=null;this.world.dispose();
  for(const entry of this.environments.values()){entry.raw.dispose();entry.target.dispose();}this.environments.clear();this.pmrem?.dispose();
  for(const marker of this.bindings){marker.importedBody?.removeFromParent();marker.importedShelter?.removeFromParent();marker.fallback.visible=true;}this.bindings=[];
  for(const model of this.models.values())release(model);this.models.clear();this.modelPending.clear();this.road?.geometry.dispose();this.chargingItem?.removeFromParent();
  if(this.chargingVisual){this.chargingVisual.ac.visible=!this.chargingVisual.isDC;this.chargingVisual.dc.visible=this.chargingVisual.isDC;}
  for(const [o,visible] of this.hiddenLegacy)o.visible=visible;this.hiddenLegacy.clear();this.root.removeFromParent();
 }
}
