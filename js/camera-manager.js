import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export const VIEW_LABELS={iso:'ISOMÉTRICA 3/4',front:'FRONTAL',rear:'TRASERA',left:'LATERAL IZQUIERDA',right:'LATERAL DERECHA',top:'SUPERIOR'};
export class CameraManager {
  constructor(camera,canvas){
    this.camera=camera;
    this.controls=new OrbitControls(camera,canvas);
    this.controls.enableDamping=true;
    this.controls.dampingFactor=.075;
    this.controls.enablePan=false;
    this.controls.minDistance=1.0;
    this.controls.maxDistance=22;
    this.controls.minPolarAngle=.06;
    this.controls.maxPolarAngle=Math.PI*.52;
    this.controls.target.set(0,.78,0);
    this.extent=4.35;
    this.view='iso';
    this.tween=null;
  }
  initialize(bounds){
    const size=bounds.getSize(new THREE.Vector3());
    this.extent=Math.max(size.x,size.z,size.y*2.2);
    this.controls.minDistance=this.extent*.48;
    this.controls.maxDistance=this.extent*5.4;
    this.preset('iso',false);
  }
  preset(view,animate=true){
    const d=this.extent*1.88;
    const t=new THREE.Vector3(0,.76,0);
    const directions={iso:[1.0,.56,1.1],front:[0,.21,1],rear:[0,.21,-1],left:[1,.18,0],right:[-1,.18,0],top:[0,1.0,.012]};
    const vec=directions[view]||directions.iso;
    const destination=new THREE.Vector3(...vec).normalize().multiplyScalar(d).add(t);
    this.view=view in directions?view:'iso';
    this.move(destination,t,animate);
  }
  move(pos,target,animate=true){
    if(!animate){this.tween=null;this.camera.position.copy(pos);this.controls.target.copy(target);this.controls.update();return;}
    this.tween={fromPos:this.camera.position.clone(),toPos:pos.clone(),fromTarget:this.controls.target.clone(),toTarget:target.clone(),start:performance.now(),duration:690};
  }
  update(){
    if(this.tween){
      const p=Math.min(1,(performance.now()-this.tween.start)/this.tween.duration);
      const s=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
      this.camera.position.lerpVectors(this.tween.fromPos,this.tween.toPos,s);
      this.controls.target.lerpVectors(this.tween.fromTarget,this.tween.toTarget,s);
      if(p>=1)this.tween=null;
    }
    this.controls.update();
  }
  focus(anchors){
    if(!anchors||!anchors.length)return;
    const box=new THREE.Box3();for(const object of anchors)box.expandByObject(object);
    const center=box.getCenter(new THREE.Vector3());
    const s=box.getSize(new THREE.Vector3());
    const radius=Math.max(.27,s.length()*.5);
    const distance=THREE.MathUtils.clamp(radius*3.3,this.controls.minDistance,this.controls.maxDistance);
    const dir=new THREE.Vector3().subVectors(this.camera.position,this.controls.target).normalize();
    this.move(center.clone().addScaledVector(dir,distance),center,true);
  }
  zoom(factor){
    const offset=this.camera.position.clone().sub(this.controls.target);
    const length=THREE.MathUtils.clamp(offset.length()*factor,this.controls.minDistance,this.controls.maxDistance);
    this.tween=null;
    this.camera.position.copy(this.controls.target).add(offset.normalize().multiplyScalar(length));
  }
  reset(){this.preset('iso');}
}
