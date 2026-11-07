import {restrictLateral} from './service-area-layout.js';
/** Pure kinematic road layer, metres/seconds. Does not write powertrain state. */
export const ROAD_CONFIG=Object.freeze({widthM:18,laneWidthM:3.6,lanes:Object.freeze([-7.2,-3.6,0,3.6,7.2]),lateralSpeedMS:3.8,lateralResponse:7,edgeMarginM:.20,playerHalfWidthM:.88,playerHalfLengthM:2.165,spawnM:185,visibleM:125,fadeM:90,cooldownS:1.5,stopLaneX:-7.2});
export function sweptImpact(x0,z0,x1,z1,halfX,halfZ){
 let enter=0,exit=1;
 for(const [a,b,h] of [[x0,x1,halfX],[z0,z1,halfZ]]){
  const d=b-a;if(Math.abs(d)<1e-12){if(Math.abs(a)>h)return false;continue;}
  const t0=(-h-a)/d,t1=(h-a)/d;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));if(enter>exit)return false;
 }return true;
}
export class RoadTrafficSimulation{
 constructor(options={}){this.config={...ROAD_CONFIG,...options};this.vehicles=[];this.reset();}
 reset(distanceM=0){
  this.x=0;this.vx=0;this.lastDistanceM=distanceM;this.cooldownS=this.config.cooldownS;this.latched=false;this.recycles=0;
  this.vehicles.length=0;
  this.config.lanes.forEach((x,lane)=>{for(let i=0;i<2;i++){
   const scale=.94+((lane*3+i)%5)*.025;
   this.vehicles.push({id:lane*2+i,lane,x,z:i?65+lane*13:-140+lane*9,speedMS:12+lane*3.1,scale,halfWidth:.9*scale,halfLength:2.15*scale});
  }});
 }
 get limitX(){return this.config.widthM/2-this.config.playerHalfWidthM-this.config.edgeMarginM;}
 step(dt,distanceM,steer=0,{collisions=true,stopAssist=false,intervals=null,mergeAllowed=true}={}){
  if(!(dt>0&&dt<=.1)||!Number.isFinite(distanceM))return null;
  const c=this.config,oldX=this.x,travel=distanceM-this.lastDistanceM;this.lastDistanceM=distanceM;this.cooldownS=Math.max(0,this.cooldownS-dt);
  const target=stopAssist?Math.max(-c.lateralSpeedMS,Math.min(c.lateralSpeedMS,(c.stopLaneX-this.x)*2)):Math.max(-1,Math.min(1,steer))*c.lateralSpeedMS;
  const decay=Math.exp(-c.lateralResponse*dt),oldV=this.vx;
  this.vx=target+(oldV-target)*decay;this.x+=target*dt+(oldV-target)*(1-decay)/c.lateralResponse;
  const proposed=this.x;
  this.x=intervals?restrictLateral(intervals,oldX,this.x):Math.max(-this.limitX,Math.min(this.limitX,this.x));
  this.mergeBlocked=!mergeAllowed&&oldX<=-9.6+1e-9&&this.x> -9.6;
  if(this.mergeBlocked)this.x=-9.6;
  if(Math.abs(this.x-proposed)>1e-9)this.vx=0;
  let hit=null;
  for(const v of this.vehicles){const oldZ=v.z;v.z+=v.speedMS*dt-travel;
   if(collisions&&!this.latched&&this.cooldownS<=0&&sweptImpact(oldX-v.x,-oldZ,this.x-v.x,-v.z,c.playerHalfWidthM+v.halfWidth,c.playerHalfLengthM+v.halfLength))hit??=v.id;
  }
  // Recycle only OUTSIDE the faded visible zone; never sweep the teleport.
  for(const v of this.vehicles){if(Math.abs(v.z)<=c.spawnM)continue;
   let z=v.z<0?c.spawnM:-c.spawnM;
   const other=this.vehicles.find(o=>o!==v&&o.lane===v.lane&&Math.abs(o.z-z)<25);
   if(other)z+=z>0?30:-30;
   v.z=z;this.recycles++;
  }
  if(hit!==null)this.latched=true;return hit;
 }
 opacity(z){const d=Math.abs(z);return Math.max(0,Math.min(1,(this.config.visibleM-d)/(this.config.visibleM-this.config.fadeM)));}
}
