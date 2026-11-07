/** H4.2 — fichas técnicas educativas para piezas 3D importadas.
 * No se inventan especificaciones OEM de modelos MG4 ni del hardware Bolt.
 * Las magnitudes dinámicas proceden exclusivamente de DrivePhysics.outputs.
 */
export const POWERTRAIN_CARDS=Object.freeze({
  battery:{
    name:'Batería de tracción HV',kind:'Almacenamiento electroquímico',
    description:'Almacena energía en corriente continua para alimentar el tren motriz; durante regeneración recibe energía dentro de los límites del BMS.',
    reference:'Bolt EV 2020 de referencia: 66 kWh anunciados y 288 celdas. El GLB visible es una adaptación de batería MG4, no la batería OEM del Bolt.',
    staticFacts:[['Energía anunciada','66 kWh · Bolt 2020'],['Celdas de referencia','288 · Bolt 2020'],['Modelo eléctrico','Thevenin de primer orden (1RC)']],
    metrics:o=>[['Estado de carga',format(o.batterySoc*100,'%',1)],['Tensión terminal',format(o.batteryVoltageV,'V',1)],['Corriente (+ descarga)',format(o.batteryCurrentA,'A',1)],['Potencia DC neta',format(o.batteryNetPowerW/1000,'kW',2)],['SOP descarga',format(o.batteryAllowedDischargeW/1000,'kW',1)],['SOP carga',format(o.batteryAllowedChargeW/1000,'kW',1)]]
  },
  pdu:{
    name:'Unidad de distribución HV · PDU',kind:'Distribución y protección de alta tensión',
    description:'Distribuye energía de alta tensión a distintos circuitos mediante conexiones y elementos de protección. En este simulador su función es principalmente visual; no se modelan contactores ni fusibles internos.',
    reference:'Modelo 3D PDU externo adaptado. Sin tensiones, fusibles o corrientes nominales certificadas para el Bolt EV.',
    staticFacts:[['Función','Distribución de corriente continua HV'],['Protecciones internas','No modeladas individualmente'],['Origen visual','PDU genérica adaptada']],
    metrics:o=>[['Tensión batería (referencia HV)',format(o.batteryVoltageV,'V',1)],['Corriente batería (referencia)',format(o.batteryCurrentA,'A',1)],['Potencia neta del paquete',format(o.batteryNetPowerW/1000,'kW',2)]]
  },
  inverter:{
    name:'Inversor de tracción',kind:'Electrónica de potencia · DC/AC',
    description:'Convierte la energía DC del sistema HV en corriente alterna trifásica para el motor; durante regeneración facilita la conversión inversa hacia el bus DC.',
    reference:'GLB visual basado en inversor MG4, no OEM Chevrolet Bolt. No se simulan conmutación PWM ni corrientes trifásicas de fase.',
    staticFacts:[['Función','Conversión bidireccional DC/AC'],['Modelo energético','Eficiencia agregada supuesta'],['Electrónica interna','No resuelta eléctricamente']],
    metrics:o=>[['Tensión de bus DC (aprox.)',format(o.batteryVoltageV,'V',1)],['Potencia neta batería',format(o.batteryNetPowerW/1000,'kW',2)],['Potencia mecánica eje',format(o.motorMechanicalPowerW/1000,'kW',2)]]
  },
  motor:{
    name:'Unidad motriz eléctrica',kind:'Motor PMSM / reducción',
    description:'Produce par para impulsar las ruedas delanteras y trabaja como generador durante la recuperación de energía. La reducción transmite el par hacia el eje motriz.',
    reference:'Bolt EV 2020 de referencia: 150 kW y 360 Nm máximos anunciados. El GLB de unidad motriz es externo y no reproduce el accionamiento OEM exacto.',
    staticFacts:[['Potencia máxima referencial','150 kW · Bolt 2020'],['Par máximo referencial','360 Nm · Bolt 2020'],['Relación de reducción','7.05:1 · referencia H2']],
    metrics:o=>[['Par motor (signado)',format(o.torqueNm,'Nm',1)],['Velocidad motor',format(o.motorRPM,'rpm',0)],['Potencia mecánica del eje',format(o.motorMechanicalPowerW/1000,'kW',2)],['Velocidad vehículo',format(o.speedKmh,'km/h',1)]]
  }
});
export function format(n,unit,precision=1){return Number.isFinite(n)?`${n.toFixed(precision)} ${unit}`:'No disponible';}
export function getPowertrainCard(id,outputs={},moduleIndex=null){
  const def=POWERTRAIN_CARDS[id];if(!def)return null;
  if(id==='battery'&&Number.isInteger(moduleIndex)&&moduleIndex>=1&&moduleIndex<=12){
    return {
      name:`Módulo didáctico ${String(moduleIndex).padStart(2,'0')} / 12`,kind:'Representación educativa del paquete',
      description:'Bloque conceptual dentro de una maqueta de 12 módulos. No representa necesariamente el número, geometría ni topología de módulos del Chevrolet Bolt EV.',
      reference:'La simulación H4 utiliza un solo circuito equivalente del paquete: no calcula tensión, SOC, capacidad ni temperatura individuales de este módulo.',
      staticFacts:[['Identificador',`Módulo conceptual ${moduleIndex}`],['Módulos dibujados','12 · distribución didáctica'],['Modelo de celdas individual','No implementado']],
      metrics:[['SOC del paquete completo',format(outputs.batterySoc*100,'%',1)],['Tensión del paquete completo',format(outputs.batteryVoltageV,'V',1)]]
    };
  }
  return {...def,metrics:def.metrics(outputs)};
}
