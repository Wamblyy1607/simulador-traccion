export const STATION_CULLING=Object.freeze({showM:75,hideM:95,shoulderX:-15});
export function stationDistanceM(station,positionM){
  return Math.hypot(STATION_CULLING.shoulderX,station.distanceM-positionM);
}
export function stationModelVisible(station,positionM,wasVisible=false){
  const distance=stationDistanceM(station,positionM);
  return Number.isFinite(distance)&&distance<=(wasVisible?STATION_CULLING.hideM:STATION_CULLING.showM);
}
