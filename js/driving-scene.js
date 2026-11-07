import {accessGap} from './final-asset-catalog.js';
import {ROUTE_STATIONS} from './route-journey.js';
import * as THREE from 'three';
import {WheelRig} from './wheel-rig.js';
/** Vista exterior educativa: el automóvil permanece en el origen y el asfalto se desplaza. */
export class DrivingScene{
 constructor(sceneManager,car){
   this.manager=sceneManager;this.scene=sceneManager.scene;this.car=car;
   this.root=new THREE.Group();this.root.name='H2_DRIVING_SCENERY';
   this.scene.add(this.root);this.root.visible=false;
   this.makeRoad();
   this.wheelRig=new WheelRig(this.car);
 }
 makeRoad(){
   const roadMat=new THREE.MeshStandardMaterial({color:0x29313b,roughness:.91,metalness:.02});
   const plane=new THREE.Mesh(new THREE.PlaneGeometry(18,260),roadMat);
   plane.rotation.x=-Math.PI/2;plane.position.y=-.028;plane.receiveShadow=true;
   this.root.add(plane);
   const shoulder=new THREE.MeshStandardMaterial({color:0x3a665c,roughness:1});
   for(const x of [-21,21]){
     const land=new THREE.Mesh(new THREE.PlaneGeometry(24,260),shoulder);
     land.rotation.x=-Math.PI/2;land.position.set(x,-.043,0);land.receiveShadow=true;this.root.add(land);
   }
   const solidMat=new THREE.MeshBasicMaterial({color:0xeff1da});
   this.edgeLines=[];this.edgeDummy=new THREE.Object3D();
   for(const x of [8.8]){
     const line=new THREE.Mesh(new THREE.PlaneGeometry(.12,260),solidMat);
     line.rotation.x=-Math.PI/2;line.position.set(x,-.019,0);this.root.add(line);
   }
   const edge=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.012,4),solidMat,65);edge.frustumCulled=false;this.root.add(edge);this.edgeLines.push(edge);
   const dashMat=new THREE.MeshBasicMaterial({color:0xd5e4e9});
   this.dashes=[];
   for(const laneX of [-5.4,-1.8,1.8,5.4])for(let z=-118;z<=118;z+=10){
     const dash=new THREE.Mesh(new THREE.PlaneGeometry(.12,4.1),dashMat);
     dash.rotation.x=-Math.PI/2;dash.position.set(laneX,-.012,z);dash.userData.h515Lane=true;
     this.root.add(dash);this.dashes.push({node:dash,base:z});
   }
   this.posts=[];
   const postMat=new THREE.MeshStandardMaterial({color:0x9dafb9,roughness:.65});
   const markerMat=new THREE.MeshBasicMaterial({color:0xffb85f});
   for(let z=-120;z<=120;z+=14){
     for(const x of [-10,10]){
       const post=new THREE.Group();
       const body=new THREE.Mesh(new THREE.BoxGeometry(.1,.75,.1),postMat);
       body.position.y=.37;post.add(body);
       const refl=new THREE.Mesh(new THREE.BoxGeometry(.13,.1,.13),markerMat);
       refl.position.y=.57;post.add(refl);
       post.position.set(x,-.02,z);this.root.add(post);
       this.posts.push({node:post,base:z});
     }
   }
 }
 setActive(isActive){
   this.root.visible=isActive;
   for(const name of ['H1_EXPLORER_GRID','H1_EXPLORER_GROUND','H1_EXPLORER_RING']){
     const obj=this.scene.getObjectByName(name);if(obj)obj.visible=!isActive;
   }
   this.scene.fog.density=isActive?.008:.015;
 }
 update(distanceM,rollDistanceM,route=null){
   // Un ciclo de 240 m evita movimiento discontinuo aun en simulaciones largas.
   const wrap=(base,step,period)=>((base-distanceM+period/2+period*10000)%period)-period/2;
   for(const d of this.dashes)d.node.position.z=wrap(d.base,10,240);
   const position=route?.enabled?route.position(distanceM):distanceM,enabled=!!route?.enabled;
   for(const p of this.posts){p.node.position.z=wrap(p.base,14,252);p.node.visible=!accessGap(p.node.position.z,p.node.position.x,position,enabled,ROUTE_STATIONS);}
   for(const edge of this.edgeLines){let count=0;for(let i=0;i<65;i++){const z=-128+i*4;if(accessGap(z,-1,position,enabled,ROUTE_STATIONS))continue;this.edgeDummy.position.set(-8.8,-.019,z);this.edgeDummy.updateMatrix();edge.setMatrixAt(count++,this.edgeDummy.matrix);}edge.count=count;edge.instanceMatrix.needsUpdate=true;}
   this.wheelRig.roll(rollDistanceM);
 }
 resetWheels(){this.wheelRig.reset();}
}
