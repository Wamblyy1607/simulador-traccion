import {SERVICE_AREA} from './service-area-layout.js';
import {DestinationBrake} from './destination-brake.js';
import {StationStopAssist} from './station-stop-assist.js';
export const ROUTE_GRAPH=Object.freeze({
  origin:{x:0,z:0,next:['s1']},s1:{x:0,z:800,next:['s2']},s2:{x:0,z:1600,next:['s3']},s3:{x:0,z:2200,next:['end']},end:{x:0,z:2600,next:[]}
});
export const ROUTE_STATIONS=Object.freeze([
  {id:'s1',name:'Estación del valle',distanceM:800,equipment:'ac240'},
  {id:'s2',name:'Estación del bosque',distanceM:1600,equipment:'dc50'},
  {id:'s3',name:'Estación del campus',distanceM:2200,equipment:'dc100'}
].map(Object.freeze));
export const ROUTE_STORAGE_KEY='bev-educational-route-v1-visits';
export function shortestRoute(graph,start,goal){
  if(!graph[start]||!graph[goal])return null;
  const distances=new Map([[start,0]]),previous=new Map(),todo=new Set(Object.keys(graph));
  while(todo.size){
    const node=[...todo].reduce((a,b)=>(distances.get(a)??Infinity)<=(distances.get(b)??Infinity)?a:b);
    if(!Number.isFinite(distances.get(node)))break;todo.delete(node);if(node===goal)break;
    for(const next of graph[node].next){if(!todo.has(next))continue;
      const length=Math.hypot(graph[next].x-graph[node].x,graph[next].z-graph[node].z),candidate=distances.get(node)+length;
      if(candidate<(distances.get(next)??Infinity)){distances.set(next,candidate);previous.set(next,node);}
    }
  }
  if(!distances.has(goal))return null;
  const path=[goal];while(path[0]!==start)path.unshift(previous.get(path[0]));
  return {nodes:path,distanceM:distances.get(goal)};
}
export class RouteJourney{
  constructor({storage=null}={}){
    this.destinationBrake=new DestinationBrake();this.stopAssist=new StationStopAssist();this.storage=storage;this.visits=[];this.persistence=storage?'LOCAL':'REGISTRO NO DISPONIBLE';this.blocked=!storage;
    try{const text=storage?.getItem(ROUTE_STORAGE_KEY);if(text){const data=JSON.parse(text);
      if(!Array.isArray(data)||data.some(v=>!ROUTE_STATIONS.some(s=>s.id===v.id&&Math.abs(s.distanceM-v.positionM)<=SERVICE_AREA.lotHalfLengthM)||!Number.isFinite(v.timeS)||!(v.soc===null||Number.isFinite(v.soc))))throw Error('Registro inválido');
      this.visits=[...new Map(data.map(v=>[v.id,v])).values()];}}
    catch{this.persistence='REGISTRO NO DISPONIBLE';this.blocked=true;}
    this.reset();
  }
  reset({clearVisits=false}={}){
    if(clearVisits){
      try{if(!this.storage)throw Error('Sin almacenamiento');
        this.storage.setItem(ROUTE_STORAGE_KEY,'[]');
        if(this.storage.getItem(ROUTE_STORAGE_KEY)!=='[]')throw Error('Escritura no confirmada');
      }catch{this.event='No se pudo borrar el registro de visitas';return false;}
      this.visits=[];this.blocked=false;this.persistence='LOCAL';
    }
    this.destinationBrake.cancel();this.stopAssist.cancel();this.enabled=false;this.state='LIBRE';this.offsetM=0;this.pending=null;this.plan=null;this.event='Listo para iniciar';return true;
  }
  start(distanceM){if(this.blocked)return false;this.destinationBrake.cancel();this.stopAssist.cancel();this.enabled=true;this.state='VIAJANDO';this.offsetM=distanceM;this.pending=null;
    this.plan=shortestRoute(ROUTE_GRAPH,'origin','end');this.event='Ruta calculada · origen → destino · 2600 m';return true;}
  position(distanceM){return Math.max(0,distanceM-this.offsetM);}
  hasVisited(id){return this.visits.some(v=>v.id===id);}
  requestStatus(id,distanceM,speedMS,physics=null){
    if(this.physicalStops)return 'Conduce hasta la plaza y pulsa E al detenerte';
    const station=ROUTE_STATIONS.find(s=>s.id===id),ahead=station?station.distanceM-this.position(distanceM):-1;
    if(!this.enabled||this.state!=='VIAJANDO')return 'No disponible durante este estado';
    if(this.hasVisited(id))return 'Ya visitada';
    if(ahead<=1)return 'Estación pasada';
    if(ahead>450)return 'Acércate a menos de 450 m';
    if(speedMS<-.001)return 'Detén la marcha atrás antes de solicitar parada';
    if(ahead<StationStopAssist.stoppingDistance(speedMS,physics))return 'Sin margen de frenado: reduce velocidad antes de solicitar';
    return '';
  }
  request(id,distanceM,speedMS,physics=null){
    const reason=this.requestStatus(id,distanceM,speedMS,physics);if(reason){this.event=reason;return false;}
    const position=this.position(distanceM),next=ROUTE_STATIONS.find(s=>s.distanceM>=position)?.id||'end';
    const graph={...ROUTE_GRAPH,current:{x:0,z:position,next:[next]}};
    this.plan=shortestRoute(graph,'current',id);if(!this.plan)return false;
    this.pending=ROUTE_STATIONS.find(s=>s.id===id);this.stopAssist.start(this.pending.distanceM,position,speedMS);this.state='APROXIMACIÓN';this.event=`Parada asistida · ${this.pending.name}`;return true;
  }
  update(physics){
    if(!this.enabled||!['VIAJANDO','APROXIMACIÓN','FRENANDO DESTINO'].includes(this.state))return null;
    const position=this.position(physics.distanceM),target=this.pending?.distanceM??ROUTE_GRAPH.end.z;
    if(!this.pending&&position>=ROUTE_GRAPH.end.z&&this.state!=='FRENANDO DESTINO'){
      this.state='FRENANDO DESTINO';this.destinationBrake.start();this.event='Llegando a Puebla';
    }
    if(this.state==='FRENANDO DESTINO'){
      if(Math.abs(physics.speedMS)>.001)return null;
      this.destinationBrake.cancel();this.state='FINALIZADO';this.event='Se llegó al destino';return 'end';
    }
    if(this.pending&&position>target+1){this.event='Parada rebasada: frenado de seguridad; recarga bloqueada';if(Math.abs(physics.speedMS)<=.001){this.stopAssist.cancel();this.state='ERROR';return 'error';}}
    if(Math.abs(target-position)<=1&&Math.abs(physics.speedMS)<=.001){
      if(this.pending){
        if(this.hasVisited(this.pending.id)){this.state='ERROR';return 'error';}
        this.stopAssist.cancel();this.state='EN ESTACIÓN';this.visits.push({id:this.pending.id,name:this.pending.name,positionM:position,timeS:physics.timeS,soc:physics.battery?.soc??null,recordedAt:new Date().toISOString()});
        try{const payload=JSON.stringify(this.visits);this.storage.setItem(ROUTE_STORAGE_KEY,payload);
          if(this.storage.getItem(ROUTE_STORAGE_KEY)!==payload)throw Error('Escritura no confirmada');this.persistence='LOCAL';}
        catch{this.persistence='REGISTRO NO DISPONIBLE · NO SE PUDO GUARDAR';this.blocked=true;this.state='ERROR';this.event='Llegada detenida: no se pudo guardar la visita; recarga bloqueada';return 'error';}
        this.event='Llegada registrada · vehículo detenido · recarga disponible';return 'arrival';
      }
      this.destinationBrake.cancel();this.state='FINALIZADO';this.event='Se llegó al destino';return 'end';
    }
    if(physics.outputs?.batteryAllowedDischargeW<1&&Math.abs(physics.speedMS)<=.001){
      this.stopAssist.cancel();this.state='ERROR';this.event='BMS sin potencia de tracción: viaje detenido; no se simula una llegada';return 'error';
    }
    return null;
  }
  dock(station,physics,bay){
    if(!this.enabled||this.state!=='VIAJANDO'||this.hasVisited(station.id)||Math.abs(physics.speedMS)>SERVICE_AREA.stopToleranceMS)return false;
    const visit={id:station.id,name:station.name,positionM:this.position(physics.distanceM),bayId:bay.id,timeS:physics.timeS,soc:physics.battery?.soc??null,recordedAt:new Date().toISOString()};
    const next=[...this.visits,visit];
    try{const payload=JSON.stringify(next);this.storage.setItem(ROUTE_STORAGE_KEY,payload);if(this.storage.getItem(ROUTE_STORAGE_KEY)!==payload)throw Error('Registro no confirmado');}
    catch{this.event='No se pudo guardar la visita. Recarga bloqueada; puedes seguir conduciendo.';return false;}
    this.visits=next;this.pending=station;this.state='EN ESTACIÓN';this.event='Estacionado junto al cargador';return true;
  }
  canCharge(distanceM,speedMS,equipment){if(this.enabled&&this.spatialGuard)return this.pending?.equipment===equipment&&this.spatialGuard();return !this.enabled||(this.state==='EN ESTACIÓN'&&this.pending?.equipment===equipment&&Math.abs(this.position(distanceM)-this.pending.distanceM)<=1&&Math.abs(speedMS)<=.001);}
  leave(){if(this.state!=='EN ESTACIÓN')return false;this.stopAssist.cancel();this.plan=shortestRoute(ROUTE_GRAPH,this.pending.id,'end');this.pending=null;this.state='VIAJANDO';this.event='Continuando hacia el destino';return true;}
}
