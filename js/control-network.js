// A read-only projection of the existing BEV model, never an ECU or a bus emulator.
export const CONTROL_NODES=Object.freeze([
  {id:'vcu',name:'VCU',role:'Coordinación educativa de DrivePhysics; no ECU independiente.',inputs:'Pedales, límites BMS y estado de carga',outputs:'Modo ilustrativo y resultados de tracción'},
  {id:'bms',name:'BMS',role:'BMS Thevenin 1RC existente.',inputs:'SOC, corriente y temperatura',outputs:'Estado y límites de carga/descarga'},
  {id:'inverter',name:'Inversor',role:'Representación del modelo energético agregado existente.',inputs:'Resultados de par y límites de batería',outputs:'Potencia DC de tracción y regeneración'},
  {id:'thermal',name:'Gestión térmica',role:'Red térmica existente; bombas y refrigeración calculadas.',inputs:'Temperaturas y pérdidas',outputs:'Actuadores y consumo auxiliar'},
  {id:'charger',name:'Cargador',role:'Sesión AC/DC existente; OBC en AC y ruta externa en DC.',inputs:'Equipo seleccionado, SOC objetivo y límites BMS',outputs:'Estado de sesión y potencia DC'}
].map(Object.freeze));
export const PROTOCOL_REFERENCES=Object.freeze([
  {id:'can',name:'CAN · familia ISO 11898',scope:'Comunicación entre ECUs: referencia general; topología y DBC del Bolt no verificados.',url:'https://www.bosch-semiconductors.com/products/ip-modules/can-protocols/'},
  {id:'pilot',name:'Piloto de control / PWM · AC',scope:'Señalización vehículo–EVSE; referencia SAE J1772. No se genera señal piloto.',url:'https://saemobilus.sae.org/standards/j1772_202401-sae-electric-vehicle-plug-hybrid-electric-vehicle-conductive-charge-coupler'},
  {id:'plc',name:'PLC · CCS DC',scope:'Referencia DIN SPEC 70121 / ISO 15118. Sin negociación ni mensajes de protocolo implementados.',url:'https://www.charin.global/technology/'}
].map(Object.freeze));
const finite=v=>Number.isFinite(v)?v:null;
const kw=v=>Number.isFinite(v)?v/1000:null;
const scaled=(v,k)=>Number.isFinite(v)?v*k:null;
export function readControlNetwork({physics,charging,running=false,active=false,inputs={}}={}){
  if(!physics?.battery||!charging)return null;
  const b=physics.battery.snapshot(.1),t=physics.thermal?.snapshot||{},c=charging.snapshot(),o=physics.outputs||{};
  const chargingNow=c.state==='CARGANDO';
  const mode=chargingNow?'RECARGA':!active?'EXPLORACIÓN · ESTADO CONSERVADO':!running?'PAUSA · ESTADO CONSERVADO':o.dcRegeneratedPowerW>1?'REGENERACIÓN':o.dcTractionPowerW>1?'TRACCIÓN':'RODAJE / REPOSO';
  const message=(id,from,to,label,value,unit,source)=>Object.freeze({id,from,to,label,value:finite(value),unit,source,kind:'illustrative'});
  const messages=[
    message('discharge','bms','vcu','Límite de descarga',kw(b.availableDischargeW),'kW','battery.snapshot().availableDischargeW'),
    message('charge-limit','bms','charger','Límite de carga',kw(b.availableChargeW),'kW','battery.snapshot().availableChargeW'),
    message('pedal','vcu','inverter','Solicitud ilustrativa del conductor',scaled(inputs.throttle,100),'%','DrivingController.inputs().throttle'),
    message('torque','inverter','vcu','Par calculado · último estado',o.torqueNm,'N·m','physics.outputs.torqueNm'),
    message('temp','bms','thermal','Temperatura de batería',b.temperatureC,'°C','battery.snapshot().temperatureC'),
    message('aux','thermal','vcu','Consumo auxiliar térmico',kw(t.auxiliaryPowerW),'kW','thermal.snapshot.auxiliaryPowerW'),
    message('target','vcu','charger','SOC objetivo de sesión',scaled(c.targetSoc,100),'%','charging.snapshot().targetSoc'),
    message('supply','charger','bms','Potencia DC hacia vehículo',kw(c.vehicleDcPowerW),'kW','charging.snapshot().vehicleDcPowerW')
  ];
  const actuators=Object.freeze({...t.actuators});
  const nodes=Object.freeze({
    vcu:Object.freeze({state:mode,value:scaled(physics.speedMS,3.6),unit:'km/h'}),
    bms:Object.freeze({state:b.status||'—',value:scaled(b.soc,100),unit:'% SOC'}),
    inverter:Object.freeze({state:chargingNow?'SIN TRACCIÓN':!running?'ÚLTIMO ESTADO':o.dcRegeneratedPowerW>1?'REGENERACIÓN':'MODELO AGREGADO',value:kw(o.dcTractionPowerW),unit:'kW DC tracción'}),
    thermal:Object.freeze({state:t.mode||'—',value:finite(t.motorC),unit:'°C motor eléctrico'}),
    charger:Object.freeze({state:c.state,value:kw(c.vehicleDcPowerW),unit:'kW DC vehículo'})
  });
  return Object.freeze({mode,timeS:finite(physics.timeS),nodes,messages:Object.freeze(messages),actuators,
    protocol:c.station?.startsWith('dc')?'plc':'pilot',protocolTraffic:'not-implemented'});
}
