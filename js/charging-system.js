/** H5: estados del conector, carga AC/DC con eficiencia externa y un único BMS.
 * Modelos y eficiencia académicos; sin handshake CCS real ni mapas GM.
 */
export const CHARGING_EQUIPMENT=Object.freeze({
  ac120:{label:'AC doméstica · 120 V / 12 A',kind:'AC',powerW:1440,efficiency:.88,port:'J1772'},
  ac240:{label:'AC nivel 2 · 240 V / 32 A',kind:'AC',powerW:7680,efficiency:.92,port:'J1772'},
  dc50:{label:'DC rápida · 50 kW',kind:'DC',powerW:50000,efficiency:.94,port:'CCS1'},
  dc100:{label:'DC pública · 100 kW',kind:'DC',powerW:100000,efficiency:.94,port:'CCS1'}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class ChargingSystem{
 constructor(physics){this.physics=physics;this.reset();}
 reset(){
  this.state='DESCONECTADO';this.station='ac240';this.targetSoc=.8;this.elapsedS=0;
  this.gridWh=0;this.vehicleDcWh=0;this.batteryStoredWh=0;this.chargerLossWh=0;this.auxWh=0;
  this.gridPowerW=0;this.vehicleDcPowerW=0;this.batteryReceivedW=0;this.stationLossW=0;
  this.auxiliaryW=0;this.reason='Conecta un cargador para comenzar.';
 }
 selectStation(key){if(this.state!=='DESCONECTADO')return false;
  if(!CHARGING_EQUIPMENT[key])return false;this.station=key;return true;}
 connect(){if(this.state!=='DESCONECTADO'||this.physics.speedMS>.01)return false;
  this.state='CONECTADO';this.reason='Conector acoplado; pendiente de verificación.';return true;}
 verify(){if(this.state!=='CONECTADO')return false;
  if(!this.physics.battery){this.state='FALLO';this.reason='Sin modelo de batería.';return false;}
  const cap=CHARGING_EQUIPMENT[this.station];
  if(cap.kind==='DC'&&!['dc50','dc100'].includes(this.station)){this.state='FALLO';this.reason='Incompatibilidad CCS1.';return false;}
  this.state='LISTO';this.reason=`Compatibilidad ${cap.port} verificada (modelo educativo).`;return true;}
 start(){if(!['LISTO','PAUSADO'].includes(this.state))return false;
  if(this.physics.battery.soc>=this.targetSoc-.0000001){this.state='FINALIZADO';this.reason='SOC objetivo alcanzado.';return false;}
  if(this.physics.battery.getLimits(.1).availableChargeW<1){this.state='PAUSADO';this.reason='BMS no admite carga en estas condiciones.';return false;}
  this.state='CARGANDO';this.reason='Sesión de recarga en curso.';return true;}
 pause(){if(this.state!=='CARGANDO')return false;this.state='PAUSADO';this.reason='Suministro detenido.';this.zeroPower();return true;}
 stop(){if(!['CARGANDO','PAUSADO','FINALIZADO'].includes(this.state))return false;
  this.state='LISTO';this.reason='Sesión finalizada; puedes desconectar.';this.zeroPower();return true;}
 disconnect(){if(!['LISTO','CONECTADO','FINALIZADO','FALLO'].includes(this.state))return false;
  this.state='DESCONECTADO';this.reason='Desconectado.';this.zeroPower();return true;}
 zeroPower(){this.gridPowerW=0;this.vehicleDcPowerW=0;this.batteryReceivedW=0;this.stationLossW=0;this.auxiliaryW=0;}
 get equipment(){return CHARGING_EQUIPMENT[this.station];}
 /** Paso <=.1 s compatible con 1RC existente; potencias positivas desde la red. */
 step(dt){
  if(!(dt>0&&dt<=.1))throw new RangeError('Paso de carga inválido');
  if(this.state!=='CARGANDO'){this.zeroPower();return this.snapshot();}
  const b=this.physics.battery,thermal=this.physics.thermal,e=this.equipment;
  if(this.physics.speedMS>.001){this.pause();this.reason='Conducción detectada: sesión suspendida.';return this.snapshot();}
  const lim=b.getLimits(dt),aux=650+(thermal?.auxiliaryPowerW||0);
  // Potencia DC limitada por OBC 7.2kW, cargador externo, vehículo y BMS.
  const sourceDcW=e.kind==='AC'?Math.min(e.powerW,7200)*e.efficiency:Math.min(e.powerW*e.efficiency,55000);
  const maxDcToVehicle=Math.min(sourceDcW,lim.availableChargeW+aux);
  // Si no puede recargar, se pausa para evitar consumir energía del propio paquete indefinidamente.
  if(lim.availableChargeW<1||maxDcToVehicle<=aux+1){this.state='PAUSADO';this.reason='BMS limita recarga; revisa SOC y temperatura.';this.zeroPower();return this.snapshot();}
  this.vehicleDcPowerW=maxDcToVehicle;
  this.gridPowerW=maxDcToVehicle/e.efficiency;
  this.stationLossW=this.gridPowerW-this.vehicleDcPowerW;
  this.auxiliaryW=aux;
  const batteryNetW=aux-this.vehicleDcPowerW; // negativo = carga
  const preview=b.preview(batteryNetW,dt);
  if(Math.abs(preview.acceptedPowerW-batteryNetW)>1e-4)throw new Error('Inconsistencia de aceptación de batería en recarga');
  const bs=b.step(dt,batteryNetW);
  this.batteryReceivedW=Math.max(0,-bs.acceptedPowerW);
  if(thermal){thermal.step(dt,{batteryHeatW:b.heatLossW,obcLossW:e.kind==='AC'?this.stationLossW:0,vehicleCharging:true});b.temperatureC=thermal.batteryC;}
  this.elapsedS+=dt;
  this.gridWh+=this.gridPowerW*dt/3600;this.vehicleDcWh+=this.vehicleDcPowerW*dt/3600;
  this.batteryStoredWh+=this.batteryReceivedW*dt/3600;
  this.chargerLossWh+=this.stationLossW*dt/3600;this.auxWh+=aux*dt/3600;
  this.physics.timeS+=dt;
  this.physics.outputs={...this.physics.outputs,timeS:this.physics.timeS,
   batterySoc:b.soc,batteryVoltageV:b.voltageV,batteryOcvV:b.ocvV,batteryCurrentA:b.currentA,
   batteryNetPowerW:b.powerW,batteryTemperatureC:b.temperatureC,batteryHeatLossW:b.heatLossW,
   batteryAllowedDischargeW:b.getLimits().availableDischargeW,batteryAllowedChargeW:b.getLimits().availableChargeW,
   batteryBmsStatus:b.status,batteryBmsWarning:b.warning,
   batteryEnergyNetKWh:b.terminalEnergyWh/1000,batteryChemicalEnergyKWh:b.chemicalEnergyWh/1000,
   chargeGridPowerW:this.gridPowerW,chargeBatteryPowerW:this.batteryReceivedW,
   chargeGridEnergyKWh:this.gridWh/1000,chargeBatteryEnergyKWh:this.batteryStoredWh/1000,
   chargeSessionState:this.state,...thermal?.snapshot && {thermal:thermal.snapshot}};
  if(b.soc>=this.targetSoc-1e-8){this.state='FINALIZADO';this.reason='SOC objetivo alcanzado.';this.zeroPower();}
  return this.snapshot();
 }
 snapshot(){return {state:this.state,station:this.station,targetSoc:this.targetSoc,
  soc:this.physics.battery?.soc??0,elapsedS:this.elapsedS,
  gridPowerW:this.gridPowerW,vehicleDcPowerW:this.vehicleDcPowerW,
  batteryReceivedW:this.batteryReceivedW,auxiliaryW:this.auxiliaryW,stationLossW:this.stationLossW,
  gridWh:this.gridWh,vehicleDcWh:this.vehicleDcWh,batteryStoredWh:this.batteryStoredWh,
  chargerLossWh:this.chargerLossWh,auxWh:this.auxWh,
  powerBalanceW:this.gridPowerW-this.vehicleDcPowerW-this.stationLossW,
  dcBalanceW:this.vehicleDcPowerW-this.batteryReceivedW-this.auxiliaryW,
  reason:this.reason};}
}
