const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
/** Requested-stop longitudinal controller. Pedals only: never writes speed or position. */
export class StationStopAssist{
 constructor(){this.cancel();}
 cancel(){this.active=false;this.ready=false;this.waitingForW=false;this.manualBraked=false;this.targetM=0;this.entryM=0;this.entrySpeed=0;this.acceleration=0;this.lastInputs=null;}
 static deceleration(physics){
  if(!physics?.compute)return 3.2;
  return Math.min(3.2,Math.max(.1,-physics.compute({throttle:0,brake:1,regenMode:'off'}).accelerationMS2*.8));
 }
 static stoppingDistance(speedMS,physics){const v=Math.max(0,speedMS),a=this.deceleration(physics);return v*v/(2*a)+v*(a/1.4)/2+Math.min(6,Math.max(.5,v*.4));}
 start(targetM,positionM,speedMS){this.cancel();this.active=true;this.targetM=targetM;this.entryM=positionM;this.entrySpeed=Math.max(0,speedMS);this.ready=speedMS>.02;}
 commands(physics,position,manual,regenMode,dt=0){
  // Read-only calls (network / UI) cannot integrate controller state.
  if(!(dt>0))return this.lastInputs??{throttle:0,brake:0,regenMode};
  const v=physics.speedMS,d=this.targetM-position;
  const finish=inputs=>(this.lastInputs={...inputs,regenMode:inputs.regenMode??regenMode});
  if(!this.active)return finish(manual);
  if(manual.brake>.01){this.manualBraked=true;if(Math.abs(v)<.08)this.waitingForW=true;this.acceleration=Math.min(0,physics.accelerationMS2);return finish({throttle:0,brake:manual.brake});}
  if(d<=.8&&d>=-1&&Math.abs(v)<.15)return finish({throttle:0,brake:1});
  if(d<-.8||v<-.001)return finish({throttle:0,brake:1});
  if(!this.ready||this.waitingForW){
   if(manual.throttle<=.01)return finish({throttle:0,brake:1});
   this.ready=true;this.waitingForW=false;this.manualBraked=false;this.entryM=position;this.entrySpeed=Math.max(3,v);this.acceleration=0;
  }
  if(v<=.001&&d>1&&(this.entrySpeed>3||this.manualBraked)){this.waitingForW=true;return finish({throttle:0,brake:1});}
  const span=Math.max(1,this.targetM-this.entryM-.3),reference=this.entrySpeed*Math.sqrt(clamp((d-.3)/span,0,1));
  const aMax=StationStopAssist.deceleration(physics);
  const feedforward=-Math.min(aMax,this.entrySpeed*this.entrySpeed/(2*span));
  const wanted=clamp(feedforward+1.5*(reference-v),-aMax,1.1);
  this.acceleration+=clamp(wanted-this.acceleration,-1.4*dt,1.4*dt);
  // Invert the existing force model instead of imposing a velocity cap or moving the car.
  const coast=physics.compute({throttle:0,brake:0,regenMode:'off'}).accelerationMS2;
  if(this.acceleration>coast+.005){
   const full=physics.compute({throttle:1,brake:0,regenMode:'off'}).accelerationMS2;
   const throttle=clamp((this.acceleration-coast)/Math.max(.001,full-coast),0,.45);
   return finish({throttle,brake:0,regenMode:throttle<=.01?'off':regenMode});
  }
  const full=physics.compute({throttle:0,brake:1,regenMode}).accelerationMS2;
  const brake=clamp((coast-this.acceleration)/Math.max(.001,coast-full),0,1);
  return finish({throttle:0,brake,regenMode:brake<=.01?'off':regenMode});
 }
}
