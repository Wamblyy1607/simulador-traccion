import {DrivePhysics} from '../drive-physics.js';
import {BatteryEquivalentCircuit} from '../battery-equivalent-circuit.js';
import {VEHICLE_REFERENCE} from '../vehicle-parameters.js';
import {PRESETS,CHEMISTRIES,clamp,pack,BrakeLedger,sop} from './models.js';
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
/** Extra BMS envelope for explicitly selected lecture examples. Default = base 1RC. */
export class EducationBattery extends BatteryEquivalentCircuit{
 step(dt,powerW){const state=super.step(dt,powerW);this.onThroughput?.(Math.abs(state.acceptedPowerW)*dt/3.6e6);return state;}
 getLimits(dt=.02){
  const base=super.getLimits(dt),profile=this.lectureProfile;if(!profile)return base;
  const v=this.ocvV-this.vPolarization,p=this.settings;
  if(profile.thermalCurrentA!==undefined){
   const thermal=profile.thermalCurrentA*this.temperatureFraction()*base.dischargeFraction;
   const limit=sop({ocvV:v,resistanceOhm:p.resistanceOhm,minVoltageV:p.minTerminalVoltageV,thermalCurrentA:thermal,hardwareCurrentA:p.maxDischargeCurrentA});
   base.availableDischargeW=Math.min(base.availableDischargeW,limit.powerW);base.maxDischargeCurrentA=Math.min(base.maxDischargeCurrentA,limit.currentA);if(limit.powerW<super.getLimits(dt).availableDischargeW){base.status='LIMITANDO';base.warning='PERFIL EXPOSICIÓN · CORRIENTE TÉRMICA';}
  }
  if(profile.chargeCapW!==undefined){base.availableChargeW=Math.min(base.availableChargeW,Math.max(0,profile.chargeCapW));base.status='LIMITANDO';base.warning='PERFIL EXPOSICIÓN · LÍMITE BMS DE CARGA ASIGNADO';if(this.soc>=1-1e-10)base.availableChargeW=0;
   const r=p.resistanceOhm;const i=2*base.availableChargeW/(v+Math.sqrt(v*v+4*r*base.availableChargeW));base.maxChargeCurrentA=Math.min(base.maxChargeCurrentA,i);
  }
  return base;
 }
}
/** Opt-in extension: the original force, 1RC, thermal and charging files stay intact. */
export class EducationPhysics extends DrivePhysics{
 constructor(config={}){
  super(config);const battery=this.battery;
  if(battery)this.battery=Object.assign(new EducationBattery(clone(battery.settings)),battery);
  this.lecture={preset:null,profile:null,packMassDeltaKg:0,chemistry:'NMC',densityWhKg:205,capacityKWh:66,packOverhead:1.25,sohEnabled:false,initialSoh:1,soh:1,throughputKWh:0,efc:0,agePercentPerEfc:.02,v2g:false,v2gKW:3.3,v2gEfficiency:.92,reserveSoc:.2,exportedKWh:0,lastExportW:0,canExport:()=>true};
  this.baseline={config:clone(this.config),battery:clone(this.battery?.settings),energy:clone(this.energyModel.settings),regen:clone(this.regenController.settings),thermalMode:this.thermal.mode};
  this.brakeLedger=new BrakeLedger();if(this.battery)this.battery.onThroughput=amount=>this.recordThroughput(amount);
 }
 get massKg(){return super.massKg+(this.lecture?.packMassDeltaKg??0);}
 reset(){super.reset();this.brakeLedger?.reset();if(this.lecture){this.lecture.throughputKWh=0;this.lecture.efc=0;this.lecture.exportedKWh=0;this.lecture.lastExportW=0;this.lecture.soh=this.lecture.initialSoh;if(this.baseline)this.updateHealthCapacity();}}
 restoreConfiguration(){
  this.config=clone(this.baseline.config);this.energyModel.settings=clone(this.baseline.energy);this.regenController.settings=clone(this.baseline.regen);
  if(this.battery){this.battery.settings=clone(this.baseline.battery);this.battery.lectureProfile=null;}
  Object.assign(this.lecture,{preset:null,profile:null,packMassDeltaKg:0,chemistry:'NMC',densityWhKg:205,capacityKWh:66,sohEnabled:false,initialSoh:1,soh:1,throughputKWh:0,efc:0,v2g:false,lastExportW:0});this.thermal.setMode(this.baseline.thermalMode);this.thermal.auxiliaryPowerW=0;this.brakeLedger.reset();this.refresh();
 }
 applyPreset(id,{setSpeed=true}={}){
  if(!PRESETS[id])throw new RangeError('Ejemplo desconocido');this.restoreConfiguration();const input=PRESETS[id];this.lecture.preset=Number(id);this.lecture.profile={};
  Object.assign(this.config,{gravityMS2:9.81,frontStaticLoadFraction:.60,payloadKg:141,scenario:'manual',gradePct:0,liftOffRegen:true});
  if(this.battery){this.battery.soc=input.soc??.70;this.battery.temperatureC=input.temperatureC??25;this.battery.vPolarization=0;this.battery.currentA=0;this.battery.powerW=0;this.battery.heatLossW=0;this.battery.chemicalPowerW=0;this.battery.polarizationStorageW=0;
   this.battery.lectureProfile=this.lecture.profile;
   if(input.ocvV){this.battery.settings.ocvTable=[[0,input.ocvV],[1,input.ocvV]];this.battery.settings.resistanceOhm=input.resistanceOhm;}
   if(id==1){this.battery.settings.minTerminalVoltageV=input.minVoltageV;this.battery.settings.maxDischargeCurrentA=input.hardwareCurrentA;this.lecture.profile.thermalCurrentA=input.thermalCurrentA;}
   if(id==2||id==3){this.lecture.profile.chargeCapW=input.bmsKW*1000;this.lecture.profile.motorKW=input.motorKW;this.lecture.profile.chassisKW=input.chassisKW;this.battery.settings.maximumOperationalSoc=1;this.battery.settings.chargeTaperSoc=.0001;}
   this.battery.voltageV=this.battery.ocvV;
  }
  this.thermal.batteryC=input.temperatureC??25;this.thermal.batteryCoolantC=this.thermal.batteryC;this.thermal.electronicsC=25;
  if(id==2||id==3){
   this.energyModel.settings.auxiliaryPowerW=0;this.thermal.mode='OFF';this.thermal.auxiliaryPowerW=0;
   this.energyModel.settings.motorGenerationEfficiency=input.efficiency/(this.config.transmissionEfficiency*this.energyModel.settings.inverterGenerationEfficiency);
   Object.assign(this.regenController.settings,this.energyModel.settings,{regenMotorPowerLimitW:Math.min(input.motorKW,input.chassisKW)*1000*this.config.transmissionEfficiency,batteryAcceptanceLimitW:input.bmsKW*1000});
  }
  if(id==4)this.config.roadFriction=input.mu;
  if(setSpeed)this.speedMS=id==4||id==2||id==3?20:0;
  this.accelerationMS2=0;this.refresh();return input;
 }
 setPack({chemistry=this.lecture.chemistry,densityWhKg,capacityKWh=this.lecture.capacityKWh,sohEnabled=this.lecture.sohEnabled,soh=this.lecture.soh}={}){
  const c=CHEMISTRIES[chemistry];if(!c)throw new RangeError('Química no válida');const density=clamp(densityWhKg??c.densityWhKg,c.min,c.max),health=clamp(soh,.5,1),reference=pack({capacityKWh:66,densityWhKg:205});
  Object.assign(this.lecture,{chemistry,densityWhKg:density,capacityKWh:clamp(capacityKWh,20,100),sohEnabled:!!sohEnabled,soh:health,initialSoh:health,throughputKWh:0,efc:0});
  this.lecture.packMassDeltaKg=pack({capacityKWh:this.lecture.capacityKWh,densityWhKg:density}).massKg-reference.massKg;
  this.updateHealthCapacity();this.brakeLedger.reset();this.refresh();
 }
 recordThroughput(kWh){const l=this.lecture;l.throughputKWh+=kWh;l.efc=l.throughputKWh/(2*l.capacityKWh);if(l.sohEnabled){l.soh=clamp(l.initialSoh-l.efc*l.agePercentPerEfc/100,.5,1);this.updateHealthCapacity();}}
 updateHealthCapacity(){if(this.battery){const l=this.lecture;this.battery.settings.capacityAh=this.baseline.battery.capacityAh*l.capacityKWh/66*(l.sohEnabled?l.soh:1);}}
 refresh(){this.outputs=this.compute({throttle:0,brake:0,regenMode:'off'});}
 compute(inputs={},grade){
  if(!this.lecture)return super.compute(inputs,grade);
  const p=VEHICLE_REFERENCE,c=this.config,v=Math.abs(this.speedMS),omega=v/c.tireDynamicRadiusM*p.gearRatio;
  const factor=clamp((110-this.thermal.electronicsC)/40,0,1),originalThrottle=clamp(inputs.throttle??0,0,1),shaftAtFull=Math.min(p.motorPeakPowerW,p.motorPeakTorqueNm*Math.max(35,omega));
  const effectiveThrottle=Math.min(originalThrottle,p.motorPeakPowerW*factor/Math.max(1,shaftAtFull));
  const regenPower=this.regenController.settings.regenMotorPowerLimitW,acceptance=this.regenController.settings.batteryAcceptanceLimitW;
  const wheelMotor=(this.lecture.profile?.motorKW??regenPower/c.transmissionEfficiency/1000)*factor,wheelChassis=this.lecture.profile?.chassisKW??Infinity;
  let output;try{this.regenController.settings.regenMotorPowerLimitW=Math.min(wheelMotor,wheelChassis)*1000*c.transmissionEfficiency;
   // Lecture convention when BMS blocks charging: no generator contribution, even to auxiliaries.
   if(this.battery&&this.battery.getLimits().availableChargeW<=1e-9)this.regenController.settings.batteryAcceptanceLimitW=0;
   output=super.compute({...inputs,throttle:effectiveThrottle},grade);
  }finally{this.regenController.settings.regenMotorPowerLimitW=regenPower;this.regenController.settings.batteryAcceptanceLimitW=acceptance;}

  const theta=Math.atan(output.gradePct/100),normal=Math.max(0,this.massKg*c.gravityMS2*Math.cos(theta)*c.frontStaticLoadFraction-this.massKg*this.accelerationMS2*c.cgHeightM/c.wheelbaseM),maximum=normal*c.roadFriction;
  const bms=this.battery?.getLimits(),aux=this.energyModel.settings.auxiliaryPowerW+this.thermal.auxiliaryPowerW,driveDC=bms?Math.max(0,bms.availableDischargeW-Math.min(aux,bms.availableDischargeW)):Infinity;
  const bmsTorque=driveDC*this.energyModel.settings.motorDriveEfficiency*this.energyModel.settings.inverterDriveEfficiency/Math.max(35,omega);
  const requested=(inputs.brake??0)>.01?0:effectiveThrottle*Math.min(p.motorPeakTorqueNm,p.motorPeakPowerW/Math.max(1,omega),bmsTorque)*p.gearRatio*c.transmissionEfficiency/c.tireDynamicRadiusM;
  return {...output,lecture:{inverterFactor:factor,normalFrontN:normal,frontMaximumN:maximum,requestedTractionN:requested,requestedBrakeN:(inputs.brake??0)*c.brakeMaxDecelMS2*this.massKg,fourWheelMaximumN:c.roadFriction*this.massKg*c.gravityMS2*Math.cos(theta),tractionCut:requested>Math.abs(output.forceTractionN)+1,adhesionCut:requested>maximum+1}};
 }
 step(dt,inputs={}){
  const l=this.lecture;if(!l)return super.step(dt,inputs);
  const oldV=this.speedMS,chemical=this.battery?.chemicalEnergyWh??0,rc0=.5*(this.battery?.settings.polarizationCapacitanceF??0)*(this.battery?.vPolarization??0)**2;
  const auxiliary=this.energyModel.settings.auxiliaryPowerW;let exportW=0;
  if(l.v2g&&Math.abs(oldV)<.001&&(inputs.throttle??0)<=.01&&this.battery?.soc>l.reserveSoc&&l.canExport()){
   const limits=this.battery.getLimits(dt),iReserve=Math.min(limits.maxDischargeCurrentA,Math.max(0,this.battery.soc-l.reserveSoc)*this.battery.settings.capacityAh*3600/dt),energyRoom=iReserve*Math.max(0,this.battery.ocvV-this.battery.vPolarization-iReserve*this.battery.settings.resistanceOhm);
   exportW=Math.max(0,Math.min(l.v2gKW*1000,Math.max(0,limits.availableDischargeW-auxiliary-this.thermal.auxiliaryPowerW)*l.v2gEfficiency,Math.max(0,energyRoom-auxiliary-this.thermal.auxiliaryPowerW)*l.v2gEfficiency));
  }
  this.energyModel.settings.auxiliaryPowerW=auxiliary+exportW/l.v2gEfficiency;
  try{
   const before=this.compute(inputs),out=super.step(dt,inputs);l.lastExportW=exportW;l.exportedKWh+=exportW*dt/3.6e6;
   const rc1=.5*(this.battery?.settings.polarizationCapacitanceF??0)*(this.battery?.vPolarization??0)**2;
   this.brakeLedger.step({before,oldSpeed:oldV,newSpeed:this.speedMS,massEq:this.massKg*(1+this.config.rotatingMassFactor),dt,chemicalDeltaWh:(this.battery?.chemicalEnergyWh??0)-chemical,rcDeltaJ:rc1-rc0});
   return out;
  }finally{this.energyModel.settings.auxiliaryPowerW=auxiliary;}
 }
}
