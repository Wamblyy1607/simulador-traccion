import * as THREE from 'three';
export class InteractionManager {
  constructor(scene,camera,canvas,car,registry,onSelection){
    this.scene=scene;this.camera=camera;this.canvas=canvas;this.car=car;this.registry=registry;this.onSelection=onSelection;
    this.raycaster=new THREE.Raycaster();this.mouse=new THREE.Vector2();
    this.helper=null;this.item=null;this.pointerStart=null;this.enabled=true;
    canvas.addEventListener('pointerdown',e=>{this.pointerStart={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{
      if(!this.enabled||e.button!==0||!this.pointerStart)return;
      const distance=Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y);
      this.pointerStart=null;
      if(distance>6)return;
      const rect=canvas.getBoundingClientRect();
      this.mouse.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
      this.raycaster.setFromCamera(this.mouse,camera);
      const hits=this.raycaster.intersectObject(car,true).filter(h=>h.object.visible);
      const item=this.xray?.enabled?this.xray.pick(this.raycaster,hits):(hits.length?registry.hitToItem(hits[0].object):null);
      if(item)this.select(item);
    });
  }
  select(item){
    this.clearHighlight();this.item=item;
    if(item){
      const bounds=new THREE.Box3();for(const o of item.anchors)bounds.expandByObject(o);
      const helper=new THREE.Box3Helper(bounds,0x58efdd);helper.material.transparent=true;helper.material.opacity=.95;
      this.scene.add(helper);this.helper=helper;
    }
    this.xray?.highlight(item);
    this.onSelection(item);
  }
  clearHighlight(){if(this.helper){this.scene.remove(this.helper);this.helper.geometry.dispose();this.helper.material.dispose();this.helper=null;}}
  clear(){this.select(null);}
}
