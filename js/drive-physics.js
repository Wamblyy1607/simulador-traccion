import {VEHICLE_REFERENCE, initialVehicleConfiguration} from './vehicle-parameters.js';
import {PowertrainEnergyModel} from './powertrain-energy-model.js';
import {RegenerativeBrakingController} from './regenerative-braking-controller.js';
import {BatteryEquivalentCircuit} from './battery-equivalent-circuit.js';
import {ThermalSystem} from './thermal-system.js';
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const finite=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
const P=VEHICLE_REFERENCE;
/**
 * Dinámica longitudinal solamente; signo +Z es avance.
 * +grade = subida; -grade = descenso. Marcha atrás opcional en la ruta manual.
 * Acelerador y freno son consignas adimensionales. H4: BMS y Thevenin 1RC acoplados.
 */
export class DrivePhysics {
  constructor(config={}){this.config={...initialVehicleConfiguration(),...config};
    this.energyModel=new PowertrainEnergyModel();
    this.regenController=new RegenerativeBrakingController();
    this.thermal=new ThermalSystem();
    this.batteryEnabled=this.config.batteryEnabled!==false;
    this.battery=this.batteryEnabled?new BatteryEquivalentCircuit({}, {
      soc:this.config.initialSoc??.70,temperatureC:this.config.initialTemperatureC??25}):null;
    this.reset();}
  setBatteryInitial({soc=this.config.initialSoc??.70,temperatureC=this.config.initialTemperatureC??25}={}){
    this.config.initialSoc=clamp(finite(soc,.70),0,1);
    this.config.initialTemperatureC=clamp(finite(temperatureC,25),-30,70);
  }
  reset(){
    this.thermal.reset(this.config.initialTemperatureC??25,this.thermal.ambientC);
    if(this.battery)this.battery.reset(this.config.initialSoc??.70,this.thermal.batteryC);
    this.timeS=0;this.distanceM=0;this.speedMS=0;this.accelerationMS2=0;
    this.energyWh={tractionDc:0,regeneratedDc:0,auxiliaryDc:0,regenWheel:0,tractionLoss:0,regenLoss:0};
    this.outputs={...this.compute({throttle:0,brake:0},this.config.gradePct),accelerationMS2:0};
  }
  get massKg(){return P.massEmptyKg+this.config.payloadKg;}
  setPayload(kg){this.config.payloadKg=clamp(finite(kg,this.config.payloadKg),0,500);this.outputs=this.compute({throttle:0,brake:0},this.outputs?.gradePct??0);}
  setGrade(pct){this.config.gradePct=clamp(finite(pct,this.config.gradePct),-15,15);}
  /** Perfil pedagógico en función de la distancia; no representa carretera real. */
  gradeForScenario(scenario=this.config.scenario){
    if(scenario==='up')return 6;
    if(scenario==='down')return -6;
    if(scenario==='profile')return 4*Math.sin(this.distanceM/190)+2*Math.sin(this.distanceM/91);
    if(scenario==='manual')return this.config.gradePct;
    return 0;
  }
  compute(inputs={},gradePct=this.gradeForScenario()){
    const c=this.config, signedV=this.speedMS, v=Math.abs(signedV), m=this.massKg;
    const direction=c.allowReverse&&inputs.direction<0?-1:1,travelSign=Math.sign(signedV)||direction;
    const grade=clamp(finite(gradePct,0),-15,15);
    const theta=Math.atan(grade/100),g=c.gravityMS2,cos=Math.cos(theta);
    const throttle=clamp(finite(inputs.throttle,0),0,1);
    const brake=clamp(finite(inputs.brake,0),0,1);
    const motorOmega=v/c.tireDynamicRadiusM*P.gearRatio;
    const motorRPM=motorOmega*60/(2*Math.PI);
    const torqueLimit=motorOmega>1?Math.min(P.motorPeakTorqueNm,P.motorPeakPowerW/motorOmega):P.motorPeakTorqueNm;
    const limits=this.battery?.getLimits()??null;
    const auxiliaryDemandW=this.energyModel.settings.auxiliaryPowerW+this.thermal.auxiliaryPowerW;
    const auxW=limits?Math.min(auxiliaryDemandW,limits.availableDischargeW):auxiliaryDemandW;
    const availableDriveDCW=limits?Math.max(0,limits.availableDischargeW-auxW):Infinity;
    // Limitar la POTENCIA física DC demandada antes de integrar las fuerzas.
    const maxShaftPowerW=availableDriveDCW*this.energyModel.settings.motorDriveEfficiency*this.energyModel.settings.inverterDriveEfficiency;
    const powerConstrainedTorque=Math.min(torqueLimit,maxShaftPowerW/Math.max(motorOmega,35));
    const tractionBmsLimited=!!limits&&throttle>.01&&brake<=.01&&powerConstrainedTorque<torqueLimit-1e-6;
    const torqueRequest=brake>.01?0:throttle*powerConstrainedTorque;
    const thrustUnlimited=torqueRequest*P.gearRatio*c.transmissionEfficiency/c.tireDynamicRadiusM;
    const frontNormal=Math.max(0,m*g*cos*c.frontStaticLoadFraction-m*this.accelerationMS2*c.cgHeightM/c.wheelbaseM);
    const tractionLimit=Math.max(0,frontNormal*c.roadFriction);
    let thrust=Math.min(thrustUnlimited,tractionLimit);
    if(signedV*direction<0)thrust=0; // invertir sentido exige primero detenerse
    const torqueActual=thrust*c.tireDynamicRadiusM/(P.gearRatio*c.transmissionEfficiency);
    const aerodynamic=.5*c.airDensityKgM3*c.dragCoefficient*c.frontalAreaM2*v*v;
    const rolling=c.rollingCoefficient*m*g*cos;
    const slope=m*g*Math.sin(theta);
    const brakeDemand=Math.min(brake*c.brakeMaxDecelMS2*m,c.roadFriction*m*g*cos);
    const frontAdhesion=Math.max(0,frontNormal*c.roadFriction);
    // Lift-off regeneration is educational and configurable; unavailable regen adds no friction.
    const coastDemand=c.liftOffRegen&&throttle<=.01&&brake<=.01?m*({off:0,low:.35,standard:.8}[inputs.regenMode]??0):0;
    const brakeSplit=this.regenController.split({brakeForceDemandN:brakeDemand+coastDemand,speedMS:v,motorOmega,
      gearRatio:P.gearRatio,radiusM:c.tireDynamicRadiusM,transmissionEfficiency:c.transmissionEfficiency,
      frontAdhesionN:frontAdhesion,mode:inputs.regenMode||'off',
      batteryAcceptanceLimitW:limits?limits.availableChargeW+auxW:Infinity});
    const frictionBrake=coastDemand>0?0:brakeSplit.frictionForceN;
    const regenForce=brakeSplit.regenForceN;
    const signedThrust=thrust*direction;
    const forceNet=signedThrust-travelSign*(aerodynamic+rolling+frictionBrake+regenForce)-slope;
    const massEq=m*(1+c.rotatingMassFactor);
    // Resistencias y frenos se oponen al movimiento; step evita que lo inviertan.
    const accel=forceNet/massEq;
    const mechanicalPowerW=thrust*v;
    const motorMechanicalPowerW=torqueActual*motorOmega;
    const generationShaftPowerW=-regenForce*v*c.transmissionEfficiency;
    const signedMotorPowerW=motorMechanicalPowerW+generationShaftPowerW;
    const powertrain=this.energyModel.evaluate({motorShaftPowerW:signedMotorPowerW,
      tractionWheelPowerW:mechanicalPowerW,regenWheelPowerW:regenForce*v,auxiliaryPowerW:auxW});
    const batteryView=this.battery?.preview(powertrain.batteryNetPowerW);
    const approximatedElectricalDemandW=powertrain.batteryNetPowerW; // demanda terminal prevista, BMS académico
    return {
      timeS:this.timeS,distanceM:this.distanceM,speedMS:signedV, speedKmh:signedV*3.6,
      accelerationMS2:accel,gradePct:grade,massKg:m,
      torqueNm:direction*torqueActual-travelSign*regenForce*c.tireDynamicRadiusM*c.transmissionEfficiency/P.gearRatio,motorRPM:motorRPM*travelSign,torqueLimitNm:torqueLimit,
      motorMechanicalPowerW:signedMotorPowerW,mechanicalPowerW,approximatedElectricalDemandW,
      ...powertrain,
      ...(batteryView?{
        batterySoc:this.battery.soc,batteryVoltageV:batteryView.terminalVoltageV,
        batteryOcvV:batteryView.ocvV,batteryCurrentA:batteryView.currentA,
        batteryPolarizationV:this.battery.vPolarization,
        batteryTemperatureC:this.battery.temperatureC,
        batteryAllowedDischargeW:batteryView.availableDischargeW,
        batteryAllowedChargeW:batteryView.availableChargeW,
        batteryHeatLossW:batteryView.ohmicLossW+batteryView.polarizationHeatW,
        batteryOhmicLossW:batteryView.ohmicLossW,
        batteryBalanceResidualW:batteryView.balanceResidualW,
        batteryBmsStatus:batteryView.status==='NORMAL'&&tractionBmsLimited?'LIMITANDO':batteryView.status,
        batteryBmsWarning:batteryView.status==='NORMAL'&&tractionBmsLimited?'BMS · LÍMITE DE POTENCIA EN TRACCIÓN':batteryView.warning,
        batteryEnergyNetKWh:this.battery.terminalEnergyWh/1000,
        batteryChemicalEnergyKWh:this.battery.chemicalEnergyWh/1000
      }:{}),
      thermal:this.thermal.snapshot,
      energyTractionKWh:this.energyWh.tractionDc/1000,energyRecoveredKWh:this.energyWh.regeneratedDc/1000,
      energyAuxiliaryKWh:this.energyWh.auxiliaryDc/1000,
      energyLossKWh:(this.energyWh.tractionLoss+this.energyWh.regenLoss)/1000,
      energyBrakingWheelKWh:this.energyWh.regenWheel/1000,regenMode:inputs.regenMode||'off',
      forceTractionN:signedThrust,forceAeroN:aerodynamic*travelSign,forceRollingN:rolling*travelSign,
      forceSlopeN:slope,forceBrakingN:brakeDemand,forceRegenN:regenForce,forceFrictionBrakeN:frictionBrake,
      forceNetN:forceNet,
      motorPowerLimitW:P.motorPeakPowerW,
      throttle,brake
    };
  }
  step(dt,inputs={}){
    if(!Number.isFinite(dt)||dt<=0||dt>.1)throw new RangeError('El paso físico debe estar entre 0 y 0.1 segundos.');
    const grade=this.gradeForScenario();
    const before=this.compute(inputs,grade);
    const oldV=this.speedMS;
    let newV=oldV+before.accelerationMS2*dt;
    const wantsDrive=before.throttle>.01&&before.brake<=.01;
    // Rolling resistance / regen / brake cannot launch the vehicle backwards from rest.
    if(oldV===0&&!wantsDrive)newV=0;
    if(oldV*newV<0)newV=0;
    if(!this.config.allowReverse)newV=Math.max(0,newV);
    if(this.config.allowReverse&&oldV===0&&wantsDrive){
      const direction=inputs.direction<0?-1:1;
      if(newV*direction<0)newV=0;
    }
    // Potencia y corriente integradas coherentemente en el paso fijo; SOC físico.
    if(this.battery){
      const state=this.battery.step(dt,before.batteryNetPowerW);
      if(Math.abs(state.acceptedPowerW-before.batteryNetPowerW)>1e-5)
        throw new Error('Desacoplamiento de límites BMS/tren motriz: demanda no aceptada.');
    }
    // H5: tres circuitos térmicos agregados; pérdidas reales del tren motriz y 1RC.
    const es=this.energyModel.settings;
    const motorLossW=Math.max(0,before.dcTractionPowerW*es.inverterDriveEfficiency*(1-es.motorDriveEfficiency))
      +Math.max(0,-before.motorMechanicalPowerW)*(1-es.motorGenerationEfficiency);
    const inverterLossW=Math.max(0,before.dcTractionPowerW*(1-es.inverterDriveEfficiency))
      +Math.max(0,-before.motorMechanicalPowerW)*es.motorGenerationEfficiency*(1-es.inverterGenerationEfficiency);
    this.thermal.step(dt,{batteryHeatW:this.battery?.heatLossW??0,
      motorLossW:Math.max(0,motorLossW),inverterLossW:Math.max(0,inverterLossW)});
    if(this.battery)this.battery.temperatureC=this.thermal.batteryC;
    const e=this.energyWh;
    e.tractionDc+=before.dcTractionPowerW*dt/3600;
    e.regeneratedDc+=before.dcRegeneratedPowerW*dt/3600;
    e.auxiliaryDc+=before.auxiliaryPowerW*dt/3600;
    e.regenWheel+=before.regenWheelPowerW*dt/3600;
    e.tractionLoss+=before.tractionLossW*dt/3600;
    e.regenLoss+=before.regenLossW*dt/3600;
    const displ=(oldV+newV)*.5*dt;
    this.distanceM+=displ;
    this.timeS+=dt;
    this.speedMS=newV;
    this.accelerationMS2=(newV-oldV)/dt;
    this.outputs={...this.compute(inputs,grade),accelerationMS2:this.accelerationMS2,
      timeS:this.timeS,distanceM:this.distanceM,gradePct:grade};
    return this.outputs;
  }
}
