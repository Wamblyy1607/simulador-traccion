/** BEV Bolt 2020: documentados vs hipótesis de ingeniería (NO calibración OEM). */
export const VEHICLE_REFERENCE=Object.freeze({
  identity:'BEV de referencia inspirado en Chevrolet Bolt EV 2020',
  massEmptyKg:1616, // Ficha de referencia; NO es la masa del vehículo instrumentado en ensayo
  motorPeakTorqueNm:360,
  motorPeakPowerW:150000,
  gearRatio:7.05,
  tire:'215/50 R17',
  drive:'FWD',
  source:'Argonne D3 Bolt 2020 y ficha OEM; verificar la configuración exacta'
});
export const MODEL_ASSUMPTIONS=Object.freeze({
  basePayloadKg:141, // Modelo con 1757 kg iniciales; diferencia respecto a 1616 kg en vacío
  tireDynamicRadiusM:.31, // Aproximado; no confundir con radio geométrico nominal
  dragCoefficient:.32,
  frontalAreaM2:2.35,
  rollingCoefficient:.011,
  airDensityKgM3:1.225,
  transmissionEfficiency:.92,
  rotatingMassFactor:.04,
  frontStaticLoadFraction:.59,
  wheelbaseM:2.6,
  cgHeightM:.53,
  roadFriction:.8,
  brakeMaxDecelMS2:8.5,
  gravityMS2:9.80665,
  fixedStepS:.02
});
export function initialVehicleConfiguration(){
 return { ...MODEL_ASSUMPTIONS, payloadKg:MODEL_ASSUMPTIONS.basePayloadKg, gradePct:0, scenario:'flat' };
}
