import {accessOpening} from './service-area-layout.js';
/** Visual inventory. These choices never determine power, connectors or route state. */
export const ENVIRONMENT_PROFILES=Object.freeze({
 technical:{file:'monochrome_studio_2k.hdr',kind:'hdr',background:true,exposure:1.05,intensity:.8,yaw:0,sun:[.4,.8,.4]},
 mountain:{file:'mountain_2k.hdr',kind:'hdr',background:true,exposure:.92,intensity:.65,yaw:Math.PI,sun:[.658,.581,.479]},
 sky:{file:'citrus_sky_2k.hdr',kind:'hdr',background:true,exposure:1.05,intensity:.7,yaw:Math.PI,sun:[.876,.061,.479]},
 charging:{file:'day_campus_2k.exr',kind:'exr',background:true,exposure:.95,intensity:.65,yaw:Math.PI/2,sun:[.81,.58,0]}
});
export const MODEL_FILES=Object.freeze({road:'road_straight.glb',guard:'guardrail_straight.glb',terminal:'guardrail_terminal.glb',low:'charger_low.glb',detail:'charger_detail.glb',shelter:'campus_shelter.glb'});
export const STATION_VISUALS=Object.freeze({s1:{body:'low',height:1.8},s2:{body:'detail',height:1.95},s3:{body:'low',height:1.8,shelter:true}});
export const repeatPosition=(base,distance,period)=>((base-distance+period/2)%period+period)%period-period/2;
export function environmentProfile(mode,choice){return mode==='technical'?'technical':mode==='charging'?'charging':choice==='sky'?'sky':'mountain';}
export function accessGap(z,side,position,enabled,stations){return side<0&&enabled&&stations.some(s=>accessOpening(z+position-s.distanceM));}
