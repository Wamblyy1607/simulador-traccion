/** Physical world geometry in metres. +Z travel, negative X roadside/right.
 * One source for pavement, access openings, drive bounds and interaction. */
export const SERVICE_AREA=Object.freeze({entryStartM:-220,entryEndM:-70,exitStartM:70,exitEndM:220,
 lotMinX:-37,lotMaxX:-16,lotHalfLengthM:84,rampHalfWidthM:4.8,
 highwayX:-7.5,aisleX:-21,bayX:-29,chargerX:-25.85,bayOffsets:Object.freeze([-40,0,40]),
 halfWidthM:1.08,halfLengthM:2.25,parkingHalfWidthM:1.15,parkingHalfLengthM:1.35,
 interactionRadiusM:3.9,stopToleranceMS:.001,lateralToleranceMS:.02,mergeGapS:2.5});
export const entryPositionM=s=>s.distanceM+SERVICE_AREA.entryStartM;
export const exitPositionM=s=>s.distanceM+SERVICE_AREA.exitEndM;
const smooth=t=>t*t*(3-2*t);
/** Tangent-continuous taper + broad curved connector; reflected for the exit. */
export function rampCenter(relativeM){
 const r=Math.abs(relativeM);if(r<70||r>220)return null;
 return r>=160?-11.7+4.2*smooth((r-160)/60):-21+9.3*smooth((r-70)/90);
}
export function rampHalfWidth(relativeM){const r=Math.abs(relativeM);return r>=160?1.5+3.3*smooth((220-r)/60):SERVICE_AREA.rampHalfWidthM;}
/** Exact shared pavement envelope: one strip, including the flared lot mouths. */
export function pavementBounds(relativeM){
 const r=Math.abs(relativeM);if(r>220)return null;
 if(r<=64)return [SERVICE_AREA.lotMinX,SERVICE_AREA.lotMaxX];
 const center=rampCenter(relativeM)??SERVICE_AREA.aisleX,half=rampHalfWidth(relativeM);
 const bounds=[center-half,center+half];if(r>=84)return bounds;
 const blend=smooth((84-r)/20);return [bounds[0]+(SERVICE_AREA.lotMinX-bounds[0])*blend,bounds[1]+(SERVICE_AREA.lotMaxX-bounds[1])*blend];
}
export function serviceIntervals(stations,positionM,mainLimit){
 const out=[[-mainLimit,mainLimit]],g=SERVICE_AREA;
 for(const s of stations){
  // Erode the rendered envelope by the entire axis-aligned body footprint.
  const samples=[-g.halfLengthM,0,g.halfLengthM].map(d=>pavementBounds(positionM-s.distanceM+d));
  if(samples.every(Boolean)){const lo=Math.max(...samples.map(b=>b[0]))+g.halfWidthM,hi=Math.min(...samples.map(b=>b[1]))-g.halfWidthM;if(lo<=hi)out.push([lo,hi]);}
 }
 out.sort((a,b)=>a[0]-b[0]);const merged=[];for(const v of out){const p=merged.at(-1);if(p&&v[0]<=p[1])p[1]=Math.max(p[1],v[1]);else merged.push([...v]);}
 // Charger cabinets and protective bollards are solid, outside the parking bay.
 for(const station of stations)for(const offset of g.bayOffsets)if(Math.abs(positionM-station.distanceM-offset)<4.3){
  const lo=g.chargerX-1.25,hi=g.chargerX+1.25;
  for(let i=merged.length-1;i>=0;i--){const [a,b]=merged[i];if(b<=lo||a>=hi)continue;merged.splice(i,1,...(a<lo?[[a,lo]]:[]),...(b>hi?[[hi,b]]:[]));}
 }
 return merged;
}
export function containsX(intervals,x){return intervals.some(([a,b])=>x>=a-1e-8&&x<=b+1e-8);}
export function restrictLateral(intervals,oldX,nextX){const region=intervals.find(([a,b])=>oldX>=a-1e-6&&oldX<=b+1e-6);return region?Math.max(region[0],Math.min(region[1],nextX)):oldX;}
export function chargerBays(station){return SERVICE_AREA.bayOffsets.map((offset,index)=>({id:`${station.id}-${index+1}`,station,index,x:SERVICE_AREA.bayX,positionM:station.distanceM+offset,chargerX:SERVICE_AREA.chargerX,chargerPositionM:station.distanceM+offset+.58}));}
export function parkedBay(stations,{positionM,x,speedMS,vx=0,maneuver=false},settings=SERVICE_AREA){
 if(![positionM,x,speedMS,vx].every(Number.isFinite)||Math.abs(speedMS)>settings.stopToleranceMS||Math.abs(vx)>settings.lateralToleranceMS||maneuver)return null;
 for(const s of stations)for(const bay of chargerBays(s))if(Math.abs(x-bay.x)<=settings.parkingHalfWidthM&&Math.abs(positionM-bay.positionM)<=settings.parkingHalfLengthM&&Math.hypot(x-bay.chargerX,positionM-bay.chargerPositionM)<=settings.interactionRadiusM)return bay;
 return null;
}
export function accessOpening(relativeM){const b=pavementBounds(relativeM);return !!b&&b[0]<=-7.5&&b[1]>=-11.9&&Math.abs(relativeM)>100;}
export function clearServiceFootprint(stations,positionM,x,z,padding=5){return stations.some(s=>{const r=positionM+z-s.distanceM;return x< -10&&x> SERVICE_AREA.lotMinX-padding&&r> SERVICE_AREA.entryStartM-padding&&r<SERVICE_AREA.exitEndM+padding;});}
export function mergeSafe(vehicles,playerSpeedMS,halfLength=2.25){return !vehicles.some(v=>v.x< -5.3&&Math.abs(v.z)<halfLength+v.halfLength+7+Math.abs(v.speedMS-playerSpeedMS)*SERVICE_AREA.mergeGapS);}
