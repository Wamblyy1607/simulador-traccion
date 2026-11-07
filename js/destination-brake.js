const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Arrival braking: jerk-limited pedals through the existing force/BMS model.
 * Does not assign speed, distance, SOC, or render state. dt=0 is read-only.
 */
export class DestinationBrake{
 constructor(){this.cancel();}
 cancel(){this.active=false;this.acceleration=0;this.lastInputs=null;}
 start(){this.cancel();this.active=true;}
 commands(physics,regenMode,dt=0){
  if(!(dt>0))return this.lastInputs??{throttle:0,brake:0,regenMode};
  if(!this.active)return {throttle:0,brake:0,regenMode};
  if(Math.abs(physics.speedMS)<=.001)return this.lastInputs={throttle:0,brake:1,regenMode};
  const coast=physics.compute({throttle:0,brake:0,regenMode:'off'}).accelerationMS2;
  const full=physics.compute({throttle:0,brake:1,regenMode}).accelerationMS2;
  const sign=Math.sign(physics.speedMS),maximum=Math.max(.2,-sign*full);
  // Exponential approach at low speed, bounded service deceleration at speed.
  const wanted=-sign*Math.min(2,maximum*.8,Math.max(.45,Math.abs(physics.speedMS)*.65));
  this.acceleration+=clamp(wanted-this.acceleration,-.9*dt,.9*dt);
  const brake=clamp((coast-this.acceleration)/(Math.abs(coast-full)>.0001?coast-full:.0001),0,1);
  return this.lastInputs={throttle:0,brake,regenMode:brake<=.01?'off':regenMode};
 }
}
