import {VEHICLE_REFERENCE as P} from '../vehicle-parameters.js';
import {wind,adhesion,discriminant,sop,regenLimit,clamp,pack,lifeCycle} from './models.js';
/** Read-only projection; no step, reset, settings assignment or fake telemetry. */
export function readPresentation(controller,system={}){
 const p=controller.physics,o=p.outputs,c=p.config,b=p.battery,l=p.lecture,v=Math.abs(p.speedMS),limits=b?.getLimits()??{},snapshot=b?.snapshot()??{},battery={...snapshot,currentA:o.batteryCurrentA??snapshot.currentA,voltageV:o.batteryVoltageV??snapshot.voltageV,ocvV:o.batteryOcvV??snapshot.ocvV,powerW:o.batteryNetPowerW??snapshot.powerW,heatLossW:o.batteryHeatLossW??snapshot.heatLossW},eta=c.transmissionEfficiency*p.energyModel.settings.motorGenerationEfficiency*p.energyModel.settings.inverterGenerationEfficiency;
 const omega=v/c.tireDynamicRadiusM*P.gearRatio,normal=o.lecture?.normalFrontN??Math.max(0,p.massKg*c.gravityMS2*Math.cos(Math.atan(p.gradeForScenario()/100))*c.frontStaticLoadFraction-p.massKg*p.accelerationMS2*c.cgHeightM/c.wheelbaseM);
 const motorWheelKW=Math.min((l.profile?.motorKW??p.regenController.settings.regenMotorPowerLimitW/c.transmissionEfficiency/1000)*(o.lecture?.inverterFactor??1)*1000,p.regenController.settings.regenTorqueLimitNm*P.gearRatio*v/(c.tireDynamicRadiusM*c.transmissionEfficiency))/1000;
 const chassisKW=Math.min(normal*c.roadFriction*v/1000,l.profile?.chassisKW??Infinity);
 const regen=regenLimit({motorKW:motorWheelKW,bmsKW:Math.max(0,limits.availableChargeW??0)/1000,efficiency:eta,chassisKW,brakingKW:Math.abs(o.forceBrakingN??0)*v/1000});
 const energy=p.energyModel.settings,dc=o.dcTractionPowerW??0,ac=dc*energy.inverterDriveEfficiency,shaft=ac*energy.motorDriveEfficiency,wheel=o.tractionWheelPowerW??0;
 const chem=Math.max(0,(battery.ocvV??0)*(battery.currentA??0)),terminal=Math.max(0,battery.powerW??0),etaB=chem>1?clamp(terminal/chem,0,1):.98,chemicalTraction=dc/Math.max(.01,etaB);
 let stages=[{label:'Química HV',value:chemicalTraction},{label:'DC batería',value:dc},{label:'AC inversor',value:ac},{label:'Eje PMSM',value:shaft},{label:'Ruedas',value:wheel}],efficiencies=[etaB,energy.inverterDriveEfficiency,energy.motorDriveEfficiency,c.transmissionEfficiency];
 const reverse=(o.dcRegeneratedPowerW??0)>1;
 if(reverse){const genShaft=Math.max(0,-o.motorMechanicalPowerW),genAc=genShaft*energy.motorGenerationEfficiency,genDc=o.dcRegeneratedPowerW,stored=Math.max(0,-(battery.ocvV??0)*(battery.currentA??0));
  stages=[{label:'Ruedas',value:o.regenWheelPowerW},{label:'Eje generador',value:genShaft},{label:'AC generada',value:genAc},{label:'DC inversor',value:genDc},{label:'Química HV',value:Math.min(genDc,stored)}];
  efficiencies=[c.transmissionEfficiency,energy.motorGenerationEfficiency,energy.inverterGenerationEfficiency,genDc>0?clamp(stored/genDc,0,1):0];
 }
 const template=[100];for(const e of efficiencies)template.push(template.at(-1)*e);
 const packState=pack({capacityKWh:l.capacityKWh,densityWhKg:l.densityWhKg,soh:l.sohEnabled?l.soh:1}),life=lifeCycle({...system,distanceKm:Math.max(0,p.distanceM)/1000});
 const ocv=b?.ocvV??350,r=b?.settings.resistanceOhm??.09,thermalCurrent=(b?.lectureProfile?.thermalCurrentA??b?.settings.maxDischargeCurrentA??0)*(limits.temperatureFraction??1);
 return {time:p.timeS,distance:p.distanceM,running:controller.running,speed:v,output:o,config:c,mass:p.massKg,wind120:wind(c,p.massKg,120/3.6),currentWind:wind(c,p.massKg,v,p.gradeForScenario()),adhesion:adhesion({massKg:p.massKg,frontFraction:c.frontStaticLoadFraction,mu:c.roadFriction,speedMS:v,gravity:c.gravityMS2}),dynamicNormal:normal,
  reverse,massEq:p.massKg*(1+c.rotatingMassFactor),limits,battery,regen,eta,stages,efficiencies,template,braking:p.brakeLedger.snapshot(),pack:packState,life,
  sop:sop({ocvV:ocv-(b?.vPolarization??0),resistanceOhm:r,minVoltageV:b?.settings.minTerminalVoltageV??290,thermalCurrentA:thermalCurrent,hardwareCurrentA:b?.settings.maxDischargeCurrentA??0}),
  discriminant:discriminant({ocvV:ocv-(b?.vPolarization??0),resistanceOhm:r,demandW:o.batteryNetPowerW??0}),
  inverterFactor:o.lecture?.inverterFactor??1,kineticJ:.5*p.massKg*v*v,kineticEquivalentJ:.5*p.massKg*(1+c.rotatingMassFactor)*v*v,motorOmega:omega};
}
