import {CHARGING_EQUIPMENT} from './charging-system.js';

// Lectura educativa de las mismas constantes y límites usados por ChargingSystem.step().
// No participa en la máquina de estados ni decide la potencia de carga.
export function evaluateBoltCharging(charging,physics){
  const equipment=CHARGING_EQUIPMENT[charging?.station];
  if(!equipment)return {
    status:'NO CONFIRMADO',compatible:false,available:false,
    reason:'Equipo desconocido: no se puede evaluar la conexión.',path:'',
    limits:[],limitingBy:[],dcCeilingW:null,batteryNetCeilingW:null,gridCeilingW:null
  };
  const battery=physics?.battery;
  if(!battery?.getLimits)return {
    status:'NO CONFIRMADO',compatible:false,available:false,
    reason:'No está disponible el BMS del vehículo.',path:'',
    limits:[],limitingBy:[],dcCeilingW:null,batteryNetCeilingW:null,gridCeilingW:null
  };

  // En este BEV los equipos AC son J1772 y los DC son CCS1.
  const compatible=(equipment.kind==='AC'&&equipment.port==='J1772')||
    (equipment.kind==='DC'&&equipment.port==='CCS1');
  if(!compatible)return {
    status:'NO COMPATIBLE',compatible:false,available:false,
    reason:'El conector y el modo AC/DC no corresponden al puerto educativo del Bolt EV.',
    path:'',limits:[],limitingBy:[],dcCeilingW:null,batteryNetCeilingW:null,gridCeilingW:null
  };

  const bms=battery.getLimits(.1); // El paso de la sesión H5 también es de 0.1 s.
  const auxiliaryW=650+(physics.thermal?.auxiliaryPowerW||0);
  const efficiency=equipment.efficiency;
  const limits=[
    {id:'station',label:'Estación tras eficiencia supuesta',watts:equipment.powerW*efficiency},
    ...(equipment.kind==='AC'?
      [{id:'obc',label:'Cargador a bordo (OBC)',watts:7200*efficiency}]:
      [{id:'vehicle',label:'Límite DC del vehículo',watts:55000}]),
    {id:'bms',label:'BMS + consumo auxiliar',watts:bms.availableChargeW+auxiliaryW}
  ];
  // Equivale a min(min(e.powerW,7200)*e.efficiency, BMS+aux) en AC
  // y min(e.powerW*e.efficiency,55000,BMS+aux) en DC.
  const dcCeilingW=Math.min(...limits.map(item=>item.watts));
  const limitingBy=limits.filter(item=>Math.abs(item.watts-dcCeilingW)<1e-6);
  const available=bms.availableChargeW>=1&&dcCeilingW>auxiliaryW+1&&
    battery.soc<(charging.targetSoc??1)-1e-7&&Math.abs(physics.speedMS)<=.001;
  const path=equipment.kind==='AC'?
    'Red AC → J1772 → OBC → BMS → batería':
    'Cargador externo DC → CCS1 → BMS → batería (sin OBC)';
  let reason=equipment.kind==='AC'?
    'J1772 es compatible con la sección AC del puerto CCS1 educativo.':
    'CCS1 permite la ruta DC educativa; el OBC queda fuera de esa ruta.';
  reason+=' El protocolo real y el acceso a la red no se verifican en este simulador.';
  if(!available){
    if(bms.availableChargeW<1)reason+=' El BMS no admite carga con el SOC o la temperatura actuales.';
    else if(battery.soc>=(charging.targetSoc??1)-1e-7)reason+=' Ya se alcanzó el SOC objetivo.';
    else if(Math.abs(physics.speedMS)>.001)reason+=' Detén el vehículo antes de cargar.';
    else reason+=' La potencia disponible no cubre el consumo auxiliar.';
  }
  return {
    status:'COMPATIBLE',compatible:true,available,reason,path,limits,limitingBy,
    dcCeilingW,gridCeilingW:dcCeilingW/efficiency,
    batteryNetCeilingW:available?Math.max(0,dcCeilingW-auxiliaryW):0,
    auxiliaryW,bmsChargeLimitW:bms.availableChargeW,
    equipmentKind:equipment.kind,equipmentPort:equipment.port
  };
}
