/** HITO 5 — red térmica educativa de 3 circuitos del Bolt EV.
 * Las capacidades, intercambios y umbrales son HIPÓTESIS, NO calibración GM.
 * El refrigerante del habitáculo es conceptualmente separado del de batería y electrónica.
 */
export const THERMAL_ASSUMPTIONS=Object.freeze({
 ambientC:25,batteryCapacityJC:460000,batteryCoolantCapacityJC:72000,
 motorCapacityJC:37000,electronicsCapacityJC:24000,powerCoolantCapacityJC:58000,
 cabinCapacityJC:250000,
 batteryCouplingWK:95,motorCouplingWK:65,electronicsCouplingWK:70,
 batteryAmbientWK:8,powerAmbientWK:35,cabinAmbientWK:26,
 batteryChillerMaxW:4500,batteryHeaterMaxW:3800,
 powerFanMaxW:5600,cabinHeaterMaxW:3400,
 pumpElectricW:90,fanElectricW:140,chillerCop:2.5,
 batteryTargetLowC:17,batteryTargetHighC:32,powerFanOnC:43,
 cabinSetPointC:22
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class ThermalSystem{
 constructor(settings={}){this.p={...THERMAL_ASSUMPTIONS,...settings};this.reset();}
 reset(initialC=25,ambientC=this.p.ambientC){
  this.ambientC=clamp(ambientC,-25,55);
  this.batteryC=clamp(initialC,-35,75);
  this.batteryCoolantC=this.batteryC;this.motorC=this.ambientC;this.electronicsC=this.ambientC;
  this.powerCoolantC=this.ambientC;this.cabinC=22;
  this.mode='AUTO';this.auxiliaryPowerW=0;
  this.actuators={batteryPump:false,powerPump:false,chiller:false,heater:false,fan:false,cabinHeater:false};
  this.heatInputW=0;this.batteryHeatW=0;this.energyAuxWh=0;
 }
 setAmbient(t){this.ambientC=clamp(Number(t)||0,-25,55);}
 setMode(mode){this.mode=['AUTO','ECO','OFF'].includes(mode)?mode:'AUTO';}
 get snapshot(){return {batteryC:this.batteryC,batteryCoolantC:this.batteryCoolantC,
  motorC:this.motorC,electronicsC:this.electronicsC,powerCoolantC:this.powerCoolantC,
  cabinC:this.cabinC,ambientC:this.ambientC,mode:this.mode,
  auxiliaryPowerW:this.auxiliaryPowerW,actuators:{...this.actuators},batteryHeatW:this.batteryHeatW};}
 step(dt,{batteryHeatW=0,motorLossW=0,inverterLossW=0,obcLossW=0,vehicleCharging=false}={}){
  if(!(dt>0&&dt<=.2))throw new RangeError('Paso térmico inválido');
  const p=this.p,auto=this.mode!=='OFF';
  const batteryNeedsCool=this.batteryC>p.batteryTargetHighC+.5;
  const batteryNeedsHeat=this.batteryC<p.batteryTargetLowC-.5;
  const batteryPump=auto&&(batteryNeedsCool||batteryNeedsHeat||vehicleCharging||batteryHeatW>1300);
  const powerPump=auto&&(motorLossW+inverterLossW+obcLossW>350||this.powerCoolantC>35);
  const fan=powerPump&&(this.powerCoolantC>p.powerFanOnC||this.electronicsC>55);
  const chiller=batteryPump&&batteryNeedsCool;
  const heater=batteryPump&&batteryNeedsHeat;
  const cabinHeater=this.mode==='AUTO'&&this.cabinC<19;
  const coolantTransfer=batteryPump?p.batteryCouplingWK*(this.batteryC-this.batteryCoolantC):0;
  const motorTransfer=powerPump?p.motorCouplingWK*(this.motorC-this.powerCoolantC):0;
  const elTransfer=powerPump?p.electronicsCouplingWK*(this.electronicsC-this.powerCoolantC):0;
  const chillerW=chiller?p.batteryChillerMaxW*(this.mode==='ECO'?.55:1):0;
  const heaterW=heater?p.batteryHeaterMaxW*(this.mode==='ECO'?.55:1):0;
  const fanW=fan?p.powerFanMaxW:0;
  const cabinHeatW=cabinHeater?p.cabinHeaterMaxW:0;
  const batteryAmbient=p.batteryAmbientWK*(this.batteryC-this.ambientC);
  const powerAmbient=p.powerAmbientWK*(this.powerCoolantC-this.ambientC);
  this.batteryC+=dt*(batteryHeatW-coolantTransfer-batteryAmbient)/p.batteryCapacityJC;
  this.batteryCoolantC+=dt*(coolantTransfer+heaterW-chillerW-12*(this.batteryCoolantC-this.ambientC))/p.batteryCoolantCapacityJC;
  this.motorC+=dt*(motorLossW-motorTransfer-8*(this.motorC-this.ambientC))/p.motorCapacityJC;
  this.electronicsC+=dt*(inverterLossW+obcLossW-elTransfer-7*(this.electronicsC-this.ambientC))/p.electronicsCapacityJC;
  this.powerCoolantC+=dt*(motorTransfer+elTransfer-powerAmbient-fanW)/p.powerCoolantCapacityJC;
  this.cabinC+=dt*(cabinHeatW-p.cabinAmbientWK*(this.cabinC-this.ambientC))/p.cabinCapacityJC;
  this.batteryC=clamp(this.batteryC,-40,85);this.motorC=clamp(this.motorC,-40,180);
  this.electronicsC=clamp(this.electronicsC,-40,170);
  this.auxiliaryPowerW=(batteryPump?p.pumpElectricW:0)+(powerPump?p.pumpElectricW:0)
     +(fan?p.fanElectricW:0)+(chiller?chillerW/p.chillerCop:0)+heaterW+cabinHeatW;
  this.energyAuxWh+=this.auxiliaryPowerW*dt/3600;
  this.batteryHeatW=batteryHeatW;
  this.heatInputW=batteryHeatW+motorLossW+inverterLossW+obcLossW;
  this.actuators={batteryPump,powerPump,chiller,heater,fan,cabinHeater};
  return this.snapshot;
 }
}
