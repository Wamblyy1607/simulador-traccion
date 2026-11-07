/** H3: rendimientos agregados educativos, NO mapas o calibración originales de GM. */
export const ENERGY_ASSUMPTIONS=Object.freeze({
  motorDriveEfficiency:.92,inverterDriveEfficiency:.96,
  motorGenerationEfficiency:.90,inverterGenerationEfficiency:.96,
  regenTorqueLimitNm:160,regenMotorPowerLimitW:75000,
  batteryAcceptanceLimitW:55000,auxiliaryPowerW:650,
  regenOnsetSpeedMS:.7,regenFullSpeedMS:3.2
});
const finiteNonnegative=value=>Math.max(0,Number.isFinite(value)?value:0);
export class PowertrainEnergyModel {
  constructor(settings={}) {this.settings={...ENERGY_ASSUMPTIONS,...settings};}
  evaluate({motorShaftPowerW=0,tractionWheelPowerW=0,regenWheelPowerW=0,auxiliaryPowerW=this.settings.auxiliaryPowerW}={}) {
    const s=this.settings;
    const driveShaft=finiteNonnegative(motorShaftPowerW);
    const driveWheel=finiteNonnegative(tractionWheelPowerW);
    const regenerativeWheel=finiteNonnegative(regenWheelPowerW);
    // Conducción: batería DC -> inversor AC -> rotor -> ruedas.
    const driveAc=driveShaft/s.motorDriveEfficiency;
    const driveDc=driveAc/s.inverterDriveEfficiency;
    const driveLoss=driveDc-driveWheel;
    // Generación: ruedas -> reductor -> rotor -> AC -> DC batería.
    // motorShaftPowerW es negativo en regeneración.
    const genShaft=finiteNonnegative(-motorShaftPowerW);
    const genAc=genShaft*s.motorGenerationEfficiency;
    const regenDc=genAc*s.inverterGenerationEfficiency;
    const regenLoss=regenerativeWheel-regenDc;
    const auxiliaryDc=finiteNonnegative(auxiliaryPowerW);
    return {
      dcTractionPowerW:driveDc,dcRegeneratedPowerW:regenDc,auxiliaryPowerW:auxiliaryDc,
      batteryNetPowerW:driveDc+auxiliaryDc-regenDc,
      tractionWheelPowerW:driveWheel,regenWheelPowerW:regenerativeWheel,
      tractionLossW:Math.max(0,driveLoss),regenLossW:Math.max(0,regenLoss),
      totalLossW:Math.max(0,driveLoss+regenLoss),
      tractionBalanceErrorW:driveDc-driveWheel-driveLoss,
      regenBalanceErrorW:regenerativeWheel-regenDc-regenLoss,
      state:regenDc>1?'regenerando':driveDc>1?'tracción':'reposo/coasting'
    };
  }
}
