/** H4 — Paquete BEV académico inspirado en Chevrolet Bolt EV 2020.
 * Referencia pública: 66 kWh nominales, 288 celdas. El resto es hipótesis
 * pedagógica, NO datos de calibración ni límites OEM del BMS.
 */
export const BATTERY_REFERENCE=Object.freeze({
  identity:'Batería Li-ion de referencia Bolt EV 2020',energyAdvertisedKWh:66,cells:288,
  source:'Ficha comercial Chevrolet 2020; 66 kWh no equivale necesariamente a capacidad utilizable.'
});
export const BATTERY_ASSUMPTIONS=Object.freeze({
  nominalVoltageV:350, capacityAh:188.57, // 66 kWh/350 V, hipótesis simplificada
  ocvTable:[[0,302],[.05,314],[.10,323],[.25,335],[.5,351],[.75,369],[.9,386],[.95,392],[1,396]],
  resistanceOhm:.09,polarizationResistanceOhm:.035,polarizationCapacitanceF:5500,
  minTerminalVoltageV:290,maxTerminalVoltageV:405,
  maxDischargeCurrentA:520,maxChargeCurrentA:180,
  hardDischargeLimitW:180000,hardChargeLimitW:55000,
  minimumOperationalSoc:.05,maximumOperationalSoc:.95,
  dischargeTaperSoc:.10,chargeTaperSoc:.10,
  initialSoc:.70,ambientTemperatureC:25
});
export function interpolateOcv(soc,table=BATTERY_ASSUMPTIONS.ocvTable){
 const x=Math.min(1,Math.max(0,soc));
 for(let i=1;i<table.length;i++){
  const [s1,v1]=table[i],[s0,v0]=table[i-1];
  if(x<=s1)return v0+(v1-v0)*(x-s0)/(s1-s0);
 }
 return table.at(-1)[1];
}
