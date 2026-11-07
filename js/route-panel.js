import {ServiceAreaVisuals} from './service-area-visuals.js';
import {entryPositionM} from './service-area-layout.js';
import * as THREE from 'three';
import {ROUTE_STATIONS} from './route-journey.js';
import {stationModelVisible,STATION_CULLING} from './route-visibility.js';
const $=id=>document.getElementById(id);
export {ServiceAreaVisuals as RouteScenery};
export class RoutePanel{
  constructor(controller){
    this.controller=controller;this.scenery=new ServiceAreaVisuals(controller.scene.scene,controller.scene.visualEnvironment?.assets);this.rows=[];this.actionsVisible=false;
    for(const type of ['keydown','keyup'])for(const id of ['drive-route-strip','route-start'])$(id).addEventListener(type,event=>{if(!['w','s','a','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(event.key.toLowerCase()))event.stopPropagation();});
    const parent=$('route-stations');
    for(const station of ROUTE_STATIONS){
      const option=document.createElement('option');option.value=station.id;parent.append(option);this.rows.push({station,option});
    }
    $('route-start').disabled=false;
    $('route-start').addEventListener('click',()=>this.start());
    $('route-continue').addEventListener('click',()=>this.resume());this.render();
    parent.addEventListener('change',()=>{this.render();parent.blur();});
  }
  start(){
    const c=this.controller;
    if(c.charging.state!=='DESCONECTADO'||Math.abs(c.physics.speedMS)>.001){c.onStatus('Para comenzar el viaje, detén el vehículo y desconecta el cable.');return false;}
    if(!c.route.start(c.physics.distanceM)){c.onStatus('Registro de visitas no disponible: no se inicia el viaje para evitar duplicados.');return false;}
    const destination=$('drive-destination');if(destination)destination.hidden=true;
    if(!c.exitH5())return;c.setChartsMode(false);c.setActive(true);c.setBatteryMode(false);c.setEnergyMode(false);
    c.physics.config.scenario='flat';c.physics.config.gradePct=0;c.physics.config.allowReverse=true;c.physics.config.liftOffRegen=true;$('drive-scenario').value='route';$('drive-grade').value='0';
    c.play();this.render();return true;
  }
  resume(){
    const c=this.controller;
    if(c.charging.state!=='DESCONECTADO'){c.onStatus('Detén la sesión y desconecta el cable antes de continuar.');return;}
    if(c.serviceAreas?.session){if(!c.serviceAreas.finish())return;}else if(!c.route.leave())return;
    c.exitH5();c.setChartsMode(false);c.setActive(true);c.setBatteryMode(false);c.setEnergyMode(false);c.play();this.render();
  }
  render(){
    const c=this.controller,r=c.route,pos=r.enabled?r.position(c.physics.distanceM):0,put=(id,text)=>{const e=$(id);if(e.textContent!==text)e.textContent=text;};
    put('route-state',r.state);put('route-progress',`${(Math.min(2600,pos)/1000).toFixed(3)} / 2.600 km`);
    put('route-event',r.event);put('route-storage',`Registro: ${r.persistence} · ${r.visits.length} estación(es) visitada(s)`);
    put('route-plan',r.plan?`Ruta calculada: ${r.plan.nodes.map(n=>n==='current'?'posición actual':n).join(' → ')} · ${r.plan.distanceM.toFixed(0)} m al calcularla`:'');
    $('route-start').disabled=c.charging.state!=='DESCONECTADO'||Math.abs(c.physics.speedMS)>.001||!!r.blocked;
    $('route-continue').disabled=r.state!=='EN ESTACIÓN'||c.charging.state!=='DESCONECTADO';
    $('drive-scenario').disabled=r.enabled;$('drive-throttle').disabled=r.enabled;$('drive-brake').disabled=r.enabled;
    if(r.enabled){$('drive-grade').disabled=true;$('charge-station').disabled=true;}else $('charge-station').disabled=c.charging.state!=='DESCONECTADO';
    $('route-car').setAttribute('cx',String(20+Math.min(2600,pos)/2600*360));
    for(const {station,option} of this.rows){const reason=r.requestStatus(station.id,c.physics.distanceM,c.physics.speedMS,c.physics),ahead=entryPositionM(station)-pos;
      const text=`${station.id.toUpperCase()} · ${{s1:'Valle',s2:'Bosque',s3:'Campus'}[station.id]} · ${r.hasVisited(station.id)?'visitada':Math.max(0,ahead).toFixed(0)+' m'}`;
      if(option.textContent!==text)option.textContent=text;
    }
    $('route-actions').hidden=!(c.serviceAreas?.session);this.actionsVisible=!!c.serviceAreas?.session;
    $('route-stations').hidden=true;
  }
}
