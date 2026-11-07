export const TELEMETRY_CHANNELS=Object.freeze({
  speedKmh:{label:'Velocidad',unit:'km/h',color:'#59d4d0',min:0},
  accelerationMS2:{label:'Aceleración',unit:'m/s²',color:'#f8ba75'},
  mechanicalPowerKW:{label:'Potencia en ruedas',unit:'kW',color:'#86b9ff'},
  torqueNm:{label:'Par del motor',unit:'Nm',color:'#c0a6ff'},
  forceTractionN:{label:'Fuerza tractiva',unit:'N',color:'#87df9a'},
  distanceKm:{label:'Distancia',unit:'km',color:'#ffce91'},
  batteryNetKW:{label:'Potencia batería DC (+ descarga)',unit:'kW',color:'#5ce3d6'},
  regenPowerKW:{label:'Regeneración a batería DC',unit:'kW',color:'#f8bb76',min:0},
  lossPowerKW:{label:'Pérdidas de conversión',unit:'kW',color:'#e49ca5',min:0},
  energyRecoveredKWh:{label:'Energía recuperada',unit:'kWh',color:'#a9a5ff',min:0},
  batterySocPct:{label:'SOC batería',unit:'%',color:'#44d6ba',min:0},
  batteryVoltageV:{label:'Tensión terminal',unit:'V',color:'#f1c784',min:0},
  batteryCurrentA:{label:'Corriente (+ descarga)',unit:'A',color:'#a3b8ff'},
  batteryDischargeLimitKW:{label:'SOP descarga',unit:'kW',color:'#e4aa85',min:0},
  batteryChargeLimitKW:{label:'SOP carga',unit:'kW',color:'#91dfc4',min:0},
  chargeGridKW:{label:'Carga · potencia de red',unit:'kW',color:'#43c4f3',min:0},
  chargeBatteryKW:{label:'Carga · potencia neta a batería',unit:'kW',color:'#47e1bf',min:0},
  chargeEnergyKWh:{label:'Carga · energía de red',unit:'kWh',color:'#f1bf76',min:0},
  thermalBatteryC:{label:'Temperatura batería',unit:'°C',color:'#56e1c7'},
  thermalMotorC:{label:'Temperatura motor',unit:'°C',color:'#ffb77a'},
  thermalElectronicsC:{label:'Temperatura inversor',unit:'°C',color:'#a3acff'},
  thermalCoolantC:{label:'Temperatura refrigerante batería',unit:'°C',color:'#86b9ff'},
  thermalAuxKW:{label:'Potencia gestión térmica',unit:'kW',color:'#f7bb8c',min:0}
});
export class TelemetryManager{
 constructor(){this.windowS=60;this.reset();}
 reset(){this.samples=[];this.lastTime=-Infinity;}
 record(o,force=false){
  if(!force && o.timeS-this.lastTime<(o.chargeSessionState?5:.2)-1e-6)return;
  this.lastTime=o.timeS;
  this.samples.push({timeS:o.timeS,speedKmh:o.speedKmh,accelerationMS2:o.accelerationMS2,
    mechanicalPowerKW:o.mechanicalPowerW/1000,torqueNm:o.torqueNm,
    forceTractionN:o.forceTractionN,distanceKm:o.distanceM/1000,
    batteryNetKW:o.batteryNetPowerW/1000,regenPowerKW:o.dcRegeneratedPowerW/1000,
    lossPowerKW:o.totalLossW/1000,energyRecoveredKWh:o.energyRecoveredKWh,
    batterySocPct:(o.batterySoc??0)*100,batteryVoltageV:o.batteryVoltageV??0,
    batteryCurrentA:o.batteryCurrentA??0,
    batteryDischargeLimitKW:(o.batteryAllowedDischargeW??0)/1000,
    batteryChargeLimitKW:(o.batteryAllowedChargeW??0)/1000,
    chargeGridKW:(o.chargeGridPowerW??0)/1000,chargeBatteryKW:(o.chargeBatteryPowerW??0)/1000,
    chargeEnergyKWh:o.chargeGridEnergyKWh??0,
    thermalBatteryC:o.thermal?.batteryC??o.batteryTemperatureC??25,
    thermalMotorC:o.thermal?.motorC??25,thermalElectronicsC:o.thermal?.electronicsC??25,
    thermalCoolantC:o.thermal?.batteryCoolantC??25,
    thermalAuxKW:(o.thermal?.auxiliaryPowerW??0)/1000});
  while(this.samples.length && this.samples[0].timeS<o.timeS-this.windowS)this.samples.shift();
 }
}
