import * as THREE from 'three';
import {ROUTE_STATIONS} from './route-journey.js';
import {SERVICE_AREA,entryPositionM,exitPositionM,parkedBay,serviceIntervals,containsX,mergeSafe} from './service-area-layout.js';
/** Adapter only: ChargingSystem remains the sole electrical/thermal integrator. */
export class ServiceAreaController{
 constructor(c){this.c=c;this.session=null;this.bodyOrientation=c.scene.car.quaternion.clone();this.savedVisuals=null;this.mergeBlocked=false;this.edgeBlocked=false;
  this.notice=document.createElement('output');this.notice.id='service-area-notice';this.notice.className='service-area-notice';this.notice.hidden=true;this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');document.getElementById('drive-stage').append(this.notice);
  c.route.physicalStops=true;c.route.spatialGuard=()=>this.locationAllowed();
 }
 snapshot(){const c=this.c,r=c.roadExperience;return {positionM:c.route.position(c.physics.distanceM),x:r.sim.x,speedMS:c.physics.speedMS,vx:r.sim.vx,maneuver:c.pressed.throttle||c.pressed.brake||r.keys.size>0};}
 candidate(){if(Math.abs(this.c.scene.car.quaternion.dot(this.bodyOrientation))<.995)return null;return this.c.route.enabled?parkedBay(ROUTE_STATIONS,this.snapshot()):null;}
 locationAllowed(){const c=this.c;if(!c.route.enabled)return true;const bay=this.session,found=this.candidate();return !!bay&&c.h5Mode==='charging'&&found?.id===bay.id;}
 key(e,down){if(e.key.toLowerCase()!=='e'||!down||e.repeat||e.target?.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName??''))return false;
  if(!this.c.route.enabled)return false;e.preventDefault();this.begin();return true;}
 begin(){const c=this.c,bay=this.candidate();if(this.session||!c.roadExperience.isRoad()||!bay||c.charging.state!=='DESCONECTADO'||!['VIAJANDO'].includes(c.route.state))return false;
  if(c.route.hasVisited(bay.station.id)){c.onStatus('Esta estación ya se utilizó en el viaje.');return false;}
  if(!c.route.dock(bay.station,c.physics,bay)){c.onStatus(c.route.event);return false;}
  this.session=bay;c.pause();c.physics.speedMS=0;c.physics.outputs=c.physics.compute({throttle:0,brake:0});c.roadExperience.sim.vx=0;
  c.charging.selectStation(bay.station.equipment);document.getElementById('charge-station').value=c.charging.station;c.h5Visual.setStation(c.charging.station);
  c.enterH5('charging');this.mountCable(bay);this.update();return true;
 }
 finish(){const c=this.c;if(!this.session)return true;if(c.charging.state!=='DESCONECTADO')return false;
  this.restoreVisuals();this.session=null;c.route.leave();this.mergeBlocked=false;this.edgeBlocked=false;return true;
 }
 reset(){this.restoreVisuals();this.session=null;this.mergeBlocked=false;this.edgeBlocked=false;this.notice.hidden=true;}
 intervals(positionM){return serviceIntervals(ROUTE_STATIONS,positionM,this.c.roadExperience.sim.limitX);}
 constrainMotion(previousDistance){const c=this.c;if(!c.route.enabled||this.session)return;
  // Solid service-area boundaries: block crossing the unpaved separator or lot end.
  // This is a spatial contact, never a relocation to a station or merge point.
  const position=c.route.position(c.physics.distanceM),x=c.roadExperience.sim.x;
  this.edgeBlocked=!containsX(this.intervals(position),x);
  if(this.edgeBlocked){c.physics.distanceM=previousDistance;c.physics.speedMS=0;c.physics.outputs=c.physics.compute({throttle:0,brake:0});}
 }
 mergeAllowed(){const c=this.c,p=c.route.position(c.physics.distanceM);return !ROUTE_STATIONS.some(s=>{const z=p-s.distanceM;return z>SERVICE_AREA.exitStartM&&z<SERVICE_AREA.exitEndM+10;})||mergeSafe(c.roadExperience.sim.vehicles,c.physics.speedMS);}
 mountCable(bay){const c=this.c,v=c.h5Visual;
  // Keep the physical tótem in its plaza. Reuse the existing socket, handle,
  // and exactly one pair of cable meshes; no second charging scene/model.
  this.savedVisuals=v.chargeRoot.children.map(o=>[o,o.visible]);for(const o of v.chargeRoot.children)o.visible=o===v.port||o===v.cable;
  const startX=bay.chargerX-c.roadExperience.sim.x,startZ=bay.chargerPositionM-c.route.position(c.physics.distanceM);
  const end=v.connector.position.clone().add(new THREE.Vector3(-.153,-.096,0).applyQuaternion(v.connector.quaternion));
  const lead=v.connector.position.clone().add(new THREE.Vector3(-.208,-.179,0).applyQuaternion(v.connector.quaternion));
  this.originalCableGeometry=[v.acCable.geometry,v.dcCable.geometry];
  for(const [i,mesh] of [v.acCable,v.dcCable].entries()){
   const points=[new THREE.Vector3(startX,i?.9:1.01,startZ+.07),new THREE.Vector3(startX,.35,startZ+.4),new THREE.Vector3(1.7,.2,1.8),lead,end];
   mesh.geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),72,i?.034:.023,10,false);
  }
  v.chargeRoot.userData.physicalDock=true;
 }
 restoreVisuals(){const v=this.c.h5Visual;if(this.savedVisuals){for(const [o,visible]of this.savedVisuals)o.visible=visible;this.savedVisuals=null;}
  if(this.originalCableGeometry){for(const [i,mesh]of [v.acCable,v.dcCable].entries()){mesh.geometry.dispose();mesh.geometry=this.originalCableGeometry[i];}this.originalCableGeometry=null;}
  v.chargeRoot.userData.physicalDock=false;v.setCableConnected(false);
 }
 update(){const c=this.c,road=c.active&&!c.batteryMode&&(!c.h5Mode||c.h5Mode==='thermal'||this.session);this.notice.hidden=!c.route.enabled||!road;if(this.notice.hidden)return;
  const p=c.route.position(c.physics.distanceM),bay=this.candidate(),area=ROUTE_STATIONS.find(s=>p>=entryPositionM(s)&&p<=exitPositionM(s)&&c.roadExperience.sim.x< -9.2),next=ROUTE_STATIONS.find(s=>entryPositionM(s)>p);
  let message='';
  if(this.session){message=c.charging.state==='DESCONECTADO'?'Recarga: conecta el cable o pulsa Continuar para salir.':'Recarga activa: detén la sesión y desconecta el cable antes de salir.';c.running=false;c.pressed={throttle:false,brake:false};c.roadExperience.clear();c.roadExperience.sim.vx=0;
   // Do not disconnect a live session if its guard fails: pause via the existing system.
   if(c.charging.state==='CARGANDO'&&!this.locationAllowed()){c.charging.pause();c.charging.reason='Sesión pausada: vehículo fuera de la plaza autorizada.';}
   c.h5Visual.parkedCable.visible=false;c.h5Visual.statusLED.visible=false;
  }else if(bay){message=c.route.hasVisited(bay.station.id)?'Estación ya visitada — continúa hacia la salida.':'Pulsa E para iniciar la recarga';}
  else if(this.mergeBlocked)message='Cede el paso: espera un hueco seguro en el tráfico.';
  else if(this.edgeBlocked)message='Límite de la zona: sigue el pavimento y la salida señalizada.';
  else if(area)message='Para iniciar la recarga, estaciona junto a un cargador. Salida → Puebla';
  else if(ROUTE_STATIONS.some(s=>Math.abs(p-entryPositionM(s))<25))message='Zona de recarga: sigue la señalización';
  else if(next){const distance=Math.max(0,Math.ceil(entryPositionM(next)-p));message=distance<=200?`Entrada a zona de recarga en ${distance.toLocaleString('es-MX')} m`:`Estación de recarga en ${distance.toLocaleString('es-MX')} m`;}
  this.notice.hidden=!message;this.notice.dataset.ready=String(!!bay&&!this.session&&!c.route.hasVisited(bay.station.id));if(this.notice.textContent!==message)this.notice.textContent=message;
 }
}
