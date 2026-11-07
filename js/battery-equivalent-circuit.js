import {BATTERY_ASSUMPTIONS,interpolateOcv} from './battery-parameters.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const safe=(x,f)=>Number.isFinite(x)?x:f;
/** Thevenin 1RC: I>0 descarga, I<0 carga.
 * Ecuaciones: Vt = Voc(SOC)-I R0-Vp, dVp/dt=I/C1-Vp/(R1 C1).
 * Balance instantáneo Voc*I = Vt*I + I²R0 + Vp²/R1 + d(0.5*C1*Vp²)/dt.
 */
export class BatteryEquivalentCircuit{
 constructor(settings={},initial={}){
  this.settings={...BATTERY_ASSUMPTIONS,...settings};
  this.reset(initial.soc??this.settings.initialSoc,initial.temperatureC??this.settings.ambientTemperatureC);
 }
 reset(soc=this.settings.initialSoc,temperatureC=this.settings.ambientTemperatureC){
  this.soc=clamp(safe(soc,.7),0,1);this.temperatureC=clamp(safe(temperatureC,25),-40,80);
  this.vPolarization=0;this.currentA=0;this.voltageV=interpolateOcv(this.soc,this.settings.ocvTable);
  this.powerW=0;this.heatLossW=0;this.chemicalPowerW=0;this.polarizationStorageW=0;
  this.terminalEnergyWh=0;this.chemicalEnergyWh=0;this.ohmicLossWh=0;this.polarizationLossWh=0;
  this.warning='OPERACIÓN NORMAL';this.status='NORMAL';
 }
 get ocvV(){return interpolateOcv(this.soc,this.settings.ocvTable);}
 /** Límite térmico estático de referencia, sin evolución térmica (H5). */
 temperatureFraction(){
  const t=this.temperatureC;
  if(t<=-15||t>=60)return 0;
  if(t<0)return (t+15)/15;
  if(t>42)return (60-t)/18;
  return 1;
 }
 getLimits(dt=.02){
  const p=this.settings,v=this.ocvV-this.vPolarization,tf=this.temperatureFraction();
  const taperD=clamp((this.soc-p.minimumOperationalSoc)/p.dischargeTaperSoc,0,1);
  const taperC=clamp((p.maximumOperationalSoc-this.soc)/p.chargeTaperSoc,0,1);
  const vDis=Math.max(0,(v-p.minTerminalVoltageV)/p.resistanceOhm);
  const vCh=Math.max(0,(p.maxTerminalVoltageV-v)/p.resistanceOhm);
  const qDt=p.capacityAh*3600/Math.max(.0001,dt);
  const iDis=Math.max(0,Math.min(p.maxDischargeCurrentA*tf*taperD,vDis,this.soc*qDt));
  const iCh=Math.max(0,Math.min(p.maxChargeCurrentA*tf*taperC,vCh,(1-this.soc)*qDt));
  const availableDischargeW=Math.max(0,Math.min(p.hardDischargeLimitW,iDis*(v-iDis*p.resistanceOhm)));
  const availableChargeW=Math.max(0,Math.min(p.hardChargeLimitW,iCh*(v+iCh*p.resistanceOhm)));
  let status='NORMAL',warning='OPERACIÓN NORMAL';
  if(tf<=0){status='PROTECCIÓN';warning='TEMPERATURA FUERA DEL RANGO ACADÉMICO';}
  else if(this.soc<=p.minimumOperationalSoc+1e-6){status='PROTECCIÓN';warning='SOC MÍNIMO · TRACCIÓN LIMITADA';}
  else if(this.soc>=p.maximumOperationalSoc-1e-6){status='LIMITANDO';warning='SOC ALTO · REGENERACIÓN LIMITADA';}
  else if(taperD<.999||taperC<.999||tf<.999){status='LIMITANDO';warning='BMS · POTENCIA LIMITADA';}
  return {availableDischargeW,availableChargeW,maxDischargeCurrentA:iDis,maxChargeCurrentA:iCh,
   temperatureFraction:tf,dischargeFraction:taperD,chargeFraction:taperC,status,warning};
 }
 /** Solución exacta de P=(Voc-Vp-I R0)I, raíz física de baja corriente. */
 currentForPower(powerW){
  const v=this.ocvV-this.vPolarization,r=this.settings.resistanceOhm;
  if(Math.abs(powerW)<1e-12)return 0;
  const disc=v*v-4*r*powerW;
  if(disc<0)throw new RangeError('Demanda de potencia fuera de la rama física de batería.');
  return 2*powerW/(v+Math.sqrt(disc));
 }
 preview(requestedPowerW,dt=.02){
  const lim=this.getLimits(dt);
  const acceptedPowerW=clamp(safe(requestedPowerW,0),-lim.availableChargeW,lim.availableDischargeW);
  const currentA=this.currentForPower(acceptedPowerW);
  const terminalVoltageV=this.ocvV-this.vPolarization-currentA*this.settings.resistanceOhm;
  const ohmicLossW=currentA*currentA*this.settings.resistanceOhm;
  const polarizationHeatW=this.vPolarization*this.vPolarization/this.settings.polarizationResistanceOhm;
  const polarizationStorageW=this.vPolarization*currentA-polarizationHeatW;
  const chemicalPowerW=this.ocvV*currentA;
  return {...lim,requestedPowerW,acceptedPowerW,currentA,terminalVoltageV,ocvV:this.ocvV,
   ohmicLossW,polarizationHeatW,polarizationStorageW,chemicalPowerW,
   balanceResidualW:chemicalPowerW-acceptedPowerW-ohmicLossW-polarizationHeatW-polarizationStorageW};
 }
 step(dt,requestedPowerW){
  if(!Number.isFinite(dt)||dt<=0||dt>.1)throw new RangeError('Paso inválido de batería');
  const p=this.preview(requestedPowerW,dt),s=this.settings;
  this.soc=clamp(this.soc-p.currentA*dt/(s.capacityAh*3600),0,1);
  // Rama RC con actualización exponencial, estable y determinista.
  const alpha=Math.exp(-dt/(s.polarizationResistanceOhm*s.polarizationCapacitanceF));
  this.vPolarization=this.vPolarization*alpha+p.currentA*s.polarizationResistanceOhm*(1-alpha);
  this.currentA=p.currentA;this.voltageV=p.terminalVoltageV;this.powerW=p.acceptedPowerW;
  this.heatLossW=p.ohmicLossW+p.polarizationHeatW;
  this.chemicalPowerW=p.chemicalPowerW;this.polarizationStorageW=p.polarizationStorageW;
  this.terminalEnergyWh+=p.acceptedPowerW*dt/3600;
  this.chemicalEnergyWh+=p.chemicalPowerW*dt/3600;
  this.ohmicLossWh+=p.ohmicLossW*dt/3600;
  this.polarizationLossWh+=p.polarizationHeatW*dt/3600;
  const updated=this.getLimits(dt);this.warning=updated.warning;this.status=updated.status;
  return {...p,soc:this.soc,temperatureC:this.temperatureC,terminalEnergyWh:this.terminalEnergyWh};
 }
 snapshot(dt=.02){
  const lim=this.getLimits(dt);
  return {soc:this.soc,temperatureC:this.temperatureC,currentA:this.currentA,
   voltageV:this.voltageV,ocvV:this.ocvV,vPolarization:this.vPolarization,powerW:this.powerW,
   heatLossW:this.heatLossW,terminalEnergyWh:this.terminalEnergyWh,chemicalEnergyWh:this.chemicalEnergyWh,
   ohmicLossWh:this.ohmicLossWh,polarizationLossWh:this.polarizationLossWh,...lim};
 }
}
