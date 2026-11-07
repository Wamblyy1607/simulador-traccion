import * as THREE from 'three';
import {RoadTrafficSimulation} from './road-traffic-sim.js';
/** One owner, one pooled scene graph; ticked by the existing fixed-step loop. */
export class RoadExperience{
 constructor(controller){
  this.c=controller;this.sim=new RoadTrafficSimulation();this.keys=new Set();this.viewOffset=0;this.base=controller.scene.car.position.clone();this.lastNow=0;this.noticeUntil=0;
  this.root=new THREE.Group();this.root.name='H515_TRAFFIC';this.root.visible=false;controller.scene.scene.add(this.root);
  this.dummy=new THREE.Object3D();this.color=new THREE.Color();this.batches=[];this.palette=[0x8fbed7,0xe8d6b8,0xd04d43,0xb1b7c1,0x3d7885];
  const material=(color)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.25});m.transparent=true;
   m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float trafficFade; varying float vTrafficFade;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTrafficFade=trafficFade;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTrafficFade;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= vTrafficFade;');};m.customProgramCacheKey=()=> 'H515_TRAFFIC_FADE';return m;};
  const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const wheel=new THREE.CylinderGeometry(.31,.31,.17,10);wheel.rotateZ(Math.PI/2);
  const specs=[['body',box(1.8,.58,4.3),0xffffff,[[0,.62,0]],true],['glass',box(1.48,.62,2.14),0x203944,[[0,1.21,-.24]],false],['roof',box(1.50,.07,2.12),0xffffff,[[0,1.55,-.24]],true],['wheels',wheel,0x172128,[[-.91,.31,-1.32],[.91,.31,-1.32],[-.91,.31,1.32],[.91,.31,1.32]],false],['headlights',box(.35,.13,.025),0xfff0c9,[[-.55,.75,2.16],[.55,.75,2.16]],false],['taillights',box(.35,.13,.025),0xc33535,[[-.55,.75,-2.16],[.55,.75,-2.16]],false]];
  for(const [name,geometry,color,offsets,tinted]of specs){const capacity=this.sim.vehicles.length*offsets.length,fade=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('trafficFade',fade);const mesh=new THREE.InstancedMesh(geometry,material(color),capacity);mesh.name='H515_'+name;mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);this.batches.push({mesh,offsets,tinted,fade});}
  this.notice=document.createElement('output');this.notice.className='drive-collision-notice';this.notice.hidden=true;this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');this.notice.textContent='Colisión detectada — Reiniciando viaje';document.getElementById('drive-stage').append(this.notice);
  this.draw();
 }
 isRoad(){const c=this.c;return c.active&&!c.batteryMode&&(!c.h5Mode||c.h5Mode==='thermal');}
 isManual(){const panel=globalThis.document?.getElementById?.('presentation-panel');return this.isRoad()&&!this.c.energyMode&&!this.c.chartsMode&&(!panel||panel.hidden);}
 key(e,down){const k=e.key.toLowerCase();if(!['a','d','arrowleft','arrowright'].includes(k))return false;
  if(!down){this.keys.delete(k);return true;}if(!this.isManual()||!this.c.running||e.target?.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName??''))return false;
  this.keys.add(k);e.preventDefault();return true;
 }
 clear(){this.keys.clear();}
 reset(){this.clear();this.sim.reset(this.c.physics.distanceM);this.syncView();this.draw();}
 syncView(){
  const c=this.c,road=this.isRoad(),inline=c.active&&c.h5Mode==='charging'&&c.route.enabled&&c.route.state==='EN ESTACIÓN',x=road||inline?this.sim.x:0;
  const delta=x-this.viewOffset;this.viewOffset=x;c.scene.car.position.x=this.base.x+x;c.energyVisual.root.position.x=x;c.energyVisual.frame.position.x=-x;c.h5Visual.thermalRoot.position.x=x;c.h5Visual.chargeRoot.position.x=inline?x:0;
  if(delta&&c.cameras){const camera=c.scene.camera,controls=c.cameras.controls;camera.position.x+=delta;controls.target.x+=delta;const t=c.cameras.tween;if(t)for(const key of ['fromPos','toPos','fromTarget','toTarget'])t[key].x+=delta;}
  this.root.visible=road||inline;
 }
 step(dt){
  const c=this.c;if(!this.isRoad()){this.sim.lastDistanceM=c.physics.distanceM;return false;}
  const manual=this.isManual(),assist=c.route.enabled&&c.route.state==='APROXIMACIÓN';
  const steer=manual?Number(this.keys.has('a')||this.keys.has('arrowleft'))-Number(this.keys.has('d')||this.keys.has('arrowright')):0;
  const intervals=c.route.enabled&&c.serviceAreas?c.serviceAreas.intervals(c.route.position(c.physics.distanceM)):null;
  const mergeAllowed=!c.serviceAreas||c.serviceAreas.mergeAllowed();
  const hit=this.sim.step(dt,c.physics.distanceM,steer,{collisions:manual&&!assist,stopAssist:assist,intervals,mergeAllowed});
  if(c.serviceAreas)c.serviceAreas.mergeBlocked=this.sim.mergeBlocked;
  this.syncView();
  if(hit===null)return false;
  const wasRoute=c.route.enabled;this.clear();
  const ok=c.reset();
  // The same RESET path clears visits, battery/thermal initial state and telemetry.
  // A failed persistent-store reset remains paused; do not loop on the same hit.
  if(ok!==false){if(wasRoute)c.routePanel.start();else c.play();}
  if(ok===false)this.notice.textContent='Colisión detectada — Reinicio bloqueado por el registro local';else this.notice.textContent='Colisión detectada — Reiniciando viaje';
  this.sim.cooldownS=this.sim.config.cooldownS;this.notice.hidden=false;this.noticeUntil=this.lastNow+1800;c.onStatus(this.notice.textContent);return true;
 }
 serviceTraffic(dt){const c=this.c;if(!c.serviceAreas?.session)return;this.sim.step(Math.min(.1,dt),c.physics.distanceM,0,{collisions:false,intervals:c.serviceAreas.intervals(c.route.position(c.physics.distanceM))});}
 update(now){this.lastNow=now;this.syncView();if(!this.notice.hidden&&now>=this.noticeUntil)this.notice.hidden=true;if(this.root.visible)this.draw();}
 draw(){
  for(const b of this.batches){let i=0;for(const v of this.sim.vehicles)for(const offset of b.offsets){this.dummy.position.set(v.x+offset[0]*v.scale,offset[1]*v.scale,v.z+offset[2]*v.scale);this.dummy.scale.setScalar(v.scale);this.dummy.updateMatrix();b.mesh.setMatrixAt(i,this.dummy.matrix);b.fade.setX(i,this.sim.opacity(v.z));if(b.tinted){this.color.setHex(this.palette[v.id%this.palette.length]);b.mesh.setColorAt(i,this.color);}i++;}b.mesh.instanceMatrix.needsUpdate=true;b.fade.needsUpdate=true;if(b.tinted)b.mesh.instanceColor.needsUpdate=true;}
 }
 dispose(){this.clear();this.root.removeFromParent();for(const b of this.batches){b.mesh.geometry.dispose();b.mesh.material.dispose();}this.notice.remove();}
}
