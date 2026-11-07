// Lectura de estado: no integra muestras, no avanza el reloj y no modifica la simulación.
export const ENGINEERING_METRICS=Object.freeze([
  {key:'socPct',label:'SOC batería',unit:'%',digits:2},
  {key:'batteryPowerKW',label:'Potencia neta batería (+ descarga / − carga)',unit:'kW',digits:2},
  {key:'batteryTempC',label:'Temperatura batería',unit:'°C',digits:1},
  {key:'motorTempC',label:'Temperatura motor',unit:'°C',digits:1},
  {key:'energyTerminalKWh',label:'Energía terminal batería (+ salida / − entrada)',unit:'kWh',digits:3,cumulative:true},
  {key:'energyTractionKWh',label:'Energía DC de tracción acumulada',unit:'kWh',digits:3,cumulative:true},
  {key:'energyRegenKWh',label:'Energía DC recuperada acumulada',unit:'kWh',digits:3,cumulative:true},
  {key:'energyGridKWh',label:'Energía de red acumulada',unit:'kWh',digits:3,cumulative:true},
  {key:'energyStoredKWh',label:'Energía de recarga almacenada',unit:'kWh',digits:3,cumulative:true}
]);
const finite=value=>Number.isFinite(value)?value:null;

export function captureEngineeringSnapshot({physics,charging,mode,runId=0}){
  const battery=physics?.battery,thermal=physics?.thermal;
  const charge=charging?.snapshot?.();
  const outputs=physics?.outputs;
  if(!battery||!outputs||!charge)return null;
  const inCharge=mode==='charging';
  const powerW=inCharge?
    (charge.state==='CARGANDO'?-charge.batteryReceivedW:0):
    outputs.batteryNetPowerW;
  const values={
    socPct:finite(battery.soc*100),
    batteryPowerKW:finite(powerW/1000),
    batteryTempC:finite(battery.temperatureC),
    motorTempC:finite(thermal?.motorC),
    // Los acumulados vienen del BMS, DrivePhysics y ChargingSystem existentes.
    energyTerminalKWh:finite(battery.terminalEnergyWh/1000),
    energyTractionKWh:finite(physics.energyWh?.tractionDc/1000),
    energyRegenKWh:finite(physics.energyWh?.regeneratedDc/1000),
    energyGridKWh:finite(charge.gridWh/1000),
    energyStoredKWh:finite(charge.batteryStoredWh/1000)
  };
  const context=inCharge?`Recarga · ${charging.equipment?.port??'—'} · ${charge.state}`:
    mode==='thermal'?'Conducción · vista térmica':mode==='battery'?'Conducción · batería':
    mode==='energy'?'Conducción · energía':'Conducción';
  return Object.freeze({runId,timeS:finite(physics.timeS),context,values:Object.freeze(values)});
}

export function compareEngineeringSnapshots(a,b){
  const sameRun=!!a&&!!b&&a.runId===b.runId;
  return {
    sameRun,
    rows:ENGINEERING_METRICS.map(metric=>{
      const valueA=finite(a?.values?.[metric.key]),valueB=finite(b?.values?.[metric.key]);
      const comparable=valueA!==null&&valueB!==null&&(!metric.cumulative||sameRun);
      return {...metric,a:valueA,b:valueB,delta:comparable?valueB-valueA:null};
    })
  };
}
