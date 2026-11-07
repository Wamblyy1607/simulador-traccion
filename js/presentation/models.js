/** Pure educational calculations. SI internally; all assumptions are explicit in HUD. */
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
export const PRESETS=Object.freeze({
  1:{name:'SOP Descarga',ocvV:350,resistanceOhm:.12,minVoltageV:300,thermalCurrentA:250,hardwareCurrentA:300},
  2:{name:'Límite Regen',motorKW:60,bmsKW:35,efficiency:.85,chassisKW:45,brakingKW:60},
  3:{name:'BMS con SOC alto y frío',soc:.95,temperatureC:5,motorKW:60,bmsKW:5,efficiency:.85,chassisKW:45,brakingKW:30},
  4:{name:'Límite de Adherencia',massKg:1757,frontFraction:.60,mu:.35,speedMS:20,gravity:9.81},
  5:{name:'Discriminante Negativo',ocvV:350,resistanceOhm:.12,demandW:300000}
});
export const CHEMISTRIES=Object.freeze({NMC:{name:'Níquel-Manganeso-Cobalto',min:150,max:260,densityWhKg:205,note:'Alta densidad; dependencia de Ni/Co y costo relativo mayor.'},LFP:{name:'Litio-Ferrofosfato',min:100,max:160,densityWhKg:130,note:'Sin Ni/Co en el material activo del cátodo; estabilidad térmica y costo relativo favorable.'}});
export function sop({ocvV,resistanceOhm,minVoltageV,thermalCurrentA,hardwareCurrentA}){
 const r=Math.max(.0001,resistanceOhm),iv=Math.max(0,(ocvV-minVoltageV)/r),current=Math.max(0,Math.min(iv,thermalCurrentA,hardwareCurrentA,ocvV/(2*r))),voltage=ocvV-current*r;
 const limits=[['Tensión mínima',iv],['Protección térmica',thermalCurrentA],['Hardware',hardwareCurrentA],['Rama estable',ocvV/(2*r)]];
 return {voltageCurrentA:iv,currentA:current,terminalV:voltage,powerW:voltage*current,limit:limits.reduce((a,b)=>b[1]<a[1]?b:a)[0]};
}
export function discriminant({ocvV,resistanceOhm,demandW}){const r=Math.max(.0001,resistanceOhm),d=ocvV*ocvV-4*r*demandW;return {dV2:d,maximumW:ocvV*ocvV/(4*r),currentA:d>=0?2*demandW/(ocvV+Math.sqrt(d)):null,valid:d>=0};}
export function regenLimit({motorKW,bmsKW,efficiency,chassisKW,brakingKW=Infinity}){
 const eta=clamp(efficiency,.01,1),bounds=[['Motor + inversor',Math.max(0,motorKW)],['BMS de carga',Math.max(0,bmsKW)/eta],['Adherencia del chasis',Math.max(0,chassisKW)]];
 const bound=bounds.reduce((a,b)=>b[1]<a[1]?b:a),allowed=Math.max(0,bound[1]),actual=Math.min(Math.max(0,brakingKW),allowed);
 return {bounds,allowedKW:allowed,actualKW:actual,batteryKW:actual*eta,frictionKW:Math.max(0,brakingKW-actual),limit:bound[0]};
}
export function adhesion({massKg,frontFraction,mu,speedMS,gravity=9.81}){const normalN=frontFraction*massKg*gravity;return {normalN,maximumN:mu*normalN,chassisKW:mu*normalN*Math.abs(speedMS)/1000,roundedNormalN:Math.round(normalN),presentationForceN:Math.round(normalN)*mu};}
export function wind({airDensityKgM3,dragCoefficient,frontalAreaM2,rollingCoefficient,gravityMS2},massKg,speedMS,gradePct=0){const theta=Math.atan(gradePct/100),aero=.5*airDensityKgM3*dragCoefficient*frontalAreaM2*speedMS**2,rolling=rollingCoefficient*massKg*gravityMS2*Math.cos(theta),grade=massKg*gravityMS2*Math.sin(theta);return {aeroN:aero,rollingN:rolling,gradeN:grade,roadKW:(aero+rolling+grade)*speedMS/1000,aeroShare:aero/(aero+rolling||1)};}
export function pack({capacityKWh=66,densityWhKg=205,overhead=1.25,soh=1}){return {massKg:capacityKWh*1000/Math.max(1,densityWhKg)*overhead,effectiveKWh:capacityKWh*soh,cellMassKg:capacityKWh*1000/Math.max(1,densityWhKg)};}
export function lifeCycle({manufacturingReferenceKg=6000,manufacturingPremium=.4,referenceGKm=235,consumptionKWh100Km=16,gridGPerKWh=40,chargeEfficiency=.9,lifeKm=200000,distanceKm=17000}={}){
 const manufactureBEV=manufacturingReferenceKg*(1+manufacturingPremium),bevGKm=consumptionKWh100Km/100/chargeEfficiency*gridGPerKWh,saving=(referenceGKm-bevGKm)/1000,debt=manufactureBEV-manufacturingReferenceKg;
 const total=km=>({referenceKg:manufacturingReferenceKg+km*referenceGKm/1000,bevKg:manufactureBEV+km*bevGKm/1000});const atLife=total(lifeKm);
 return {manufactureBEV,bevGKm,debtKg:debt,breakEvenKm:saving>0?debt/saving:null,atLife,atDistance:total(distanceKm),reduction:1-atLife.bevKg/atLife.referenceKg,total};
}
export function presetResult(id,custom={}){const input={...PRESETS[id],...custom};return {id,input,result:id==1?sop(input):id==2||id==3?regenLimit(input):id==4?adhesion(input):discriminant(input)};}
/** Integrated braking budget. Gravity is separately reversible potential work.
 * Green is actual chemical energy stored; red includes road/thermal/auxiliary losses
 * and RC energy, explicitly identified. No fixed 50/30/20 recovery assumption.
 */
export class BrakeLedger{
 constructor(){this.reset();}
 reset(){Object.assign(this,{active:false,availableJ:0,storedJ:0,frictionJ:0,otherJ:0,kineticDropJ:0,potentialJ:0,regenWheelJ:0,rcStorageJ:0});}
 step({before,oldSpeed,newSpeed,massEq,dt,chemicalDeltaWh,rcDeltaJ}){
  const braking=Math.abs(oldSpeed)>.02&&before.throttle<=.01&&(before.brake>.01||Math.abs(newSpeed)<Math.abs(oldSpeed));
  if(!braking){this.active=false;return;}if(!this.active){this.reset();this.active=true;}
  const displacement=(oldSpeed+newSpeed)*.5*dt,travel=Math.abs(displacement),regen=before.forceRegenN*travel,friction=before.forceFrictionBrakeN*travel,road=(Math.abs(before.forceAeroN)+Math.abs(before.forceRollingN))*travel,total=regen+friction+road;
  const stored=clamp(-chemicalDeltaWh*3600,0,regen);this.availableJ+=total;this.storedJ+=stored;this.frictionJ+=friction;this.otherJ+=Math.max(0,total-stored-friction);this.regenWheelJ+=regen;this.kineticDropJ+=.5*massEq*(oldSpeed**2-newSpeed**2);this.potentialJ+=before.forceSlopeN*displacement;this.rcStorageJ+=rcDeltaJ;
 }
 snapshot(){const d=this.availableJ;return {availableJ:d,storedJ:this.storedJ,frictionJ:this.frictionJ,otherJ:this.otherJ,kineticDropJ:this.kineticDropJ,potentialJ:this.potentialJ,regenWheelJ:this.regenWheelJ,rcStorageJ:this.rcStorageJ,percent:d?[this.storedJ,this.otherJ,this.frictionJ].map(v=>100*v/d):[0,0,0]};}
}
