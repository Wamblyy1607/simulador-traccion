import {ENERGY_ASSUMPTIONS} from './powertrain-energy-model.js';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const REGEN_MODES=Object.freeze(['off','low','standard']);
/** Convierte una demanda total de frenado en par generador y fricción.
 * Sin SOC real: límite de aceptación de batería es una hipótesis fija educativa.
 */
export class RegenerativeBrakingController{
  constructor(settings={}){this.settings={...ENERGY_ASSUMPTIONS,...settings};}
  split({brakeForceDemandN=0,speedMS=0,motorOmega=0,gearRatio=1,radiusM=.31,
      transmissionEfficiency=.92,frontAdhesionN=Infinity,mode='off',batteryAcceptanceLimitW=Infinity}={}){
    const s=this.settings;
    const demand=Math.max(0,brakeForceDemandN),v=Math.max(0,speedMS);
    const fraction={off:0,low:.35,standard:1}[mode]??0;
    const activation=clamp((v-s.regenOnsetSpeedMS)/(s.regenFullSpeedMS-s.regenOnsetSpeedMS),0,1);
    let regenerativeN=0;
    if(fraction>0&&activation>0&&demand>0&&motorOmega>0){
      const forceTorqueLimit=s.regenTorqueLimitNm*gearRatio/(radiusM*transmissionEfficiency);
      const forcePowerLimit=s.regenMotorPowerLimitW/(v*transmissionEfficiency);
      const totalGenEfficiency=transmissionEfficiency*s.motorGenerationEfficiency*s.inverterGenerationEfficiency;
      const forceBatteryLimit=Math.min(s.batteryAcceptanceLimitW,Math.max(0,batteryAcceptanceLimitW))/(v*totalGenEfficiency);
      regenerativeN=Math.max(0,Math.min(demand*fraction*activation,forceTorqueLimit,
        forcePowerLimit,forceBatteryLimit,Math.max(0,frontAdhesionN)));
    }
    return {regenForceN:regenerativeN,frictionForceN:demand-regenerativeN,
      brakeForceDemandN:demand,regenFraction:demand?regenerativeN/demand:0};
  }
}
