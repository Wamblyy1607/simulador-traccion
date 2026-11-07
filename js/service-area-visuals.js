import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ROUTE_STATIONS} from './route-journey.js';
import {SERVICE_AREA as G,chargerBays,pavementBounds,rampCenter} from './service-area-layout.js';
/** Shared geometry/materials, cached existing charger assets, no per-frame allocation. */
export class ServiceAreaVisuals{
 constructor(scene,assets){this.assets=assets;this.markers=[];this.root=new THREE.Group();this.root.name='H518_PHYSICAL_SERVICE_AREAS';this.root.visible=false;scene.add(this.root);
  const template=new THREE.Group(),buckets=new Map();
  const box=(color,w,h,d,x,y,z,yaw=0)=>{const geo=new THREE.BoxGeometry(w,h,d);geo.rotateY(yaw);geo.translate(x,y,z);if(!buckets.has(color))buckets.set(color,[]);buckets.get(color).push(geo);};
  const arrow=(x,z,yaw=0)=>{const shape=new THREE.Shape();shape.moveTo(-.23,-1.4);shape.lineTo(.23,-1.4);shape.lineTo(.23,.2);shape.lineTo(.85,.2);shape.lineTo(0,1.4);shape.lineTo(-.85,.2);shape.lineTo(-.23,.2);shape.closePath();const geo=new THREE.ShapeGeometry(shape);geo.rotateZ(Math.PI);geo.rotateX(-Math.PI/2);geo.rotateY(yaw);geo.translate(x,-.002,z);const key=0xe4f1df;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(geo.toNonIndexed());};
  // A single triangulated surface prevents seams and coplanar overlapping slabs.
  const positions=[],uv=[],indices=[],samples=[];
  for(let z=G.entryStartM;z<=G.exitEndM;z+=2){const [left,right]=pavementBounds(z);samples.push({z,left,right});positions.push(left,-.018,z,right,-.018,z);uv.push(0,z/8,1,z/8);}
  for(let i=0;i<samples.length-1;i++){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
  const asphalt=new THREE.BufferGeometry();asphalt.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));asphalt.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));asphalt.setIndex(indices);asphalt.computeVertexNormals();buckets.set(0x303e45,[asphalt]);
  // Continuous edge paint follows the exact pavement boundary, not a diagonal box.
  for(let i=1;i<samples.length;i++)for(const edge of ['left','right']){
   const a=samples[i-1],b=samples[i];if(edge==='right'&&(a.right>-9.3||b.right>-9.3))continue;
   const dx=b[edge]-a[edge],dz=b.z-a.z;box(0xe4f1df,.11,.008,Math.hypot(dx,dz)+.015,(a[edge]+b[edge])/2,-.007,(a.z+b.z)/2,Math.atan2(dx,dz));
  }
  for(const sign of [-1,1]){
   for(let r=94;r<212;r+=12){const z=sign*r,x=rampCenter(z),d=(rampCenter(z+1)-rampCenter(z-1))/2;box(0xe4f1df,.12,.008,3.6,x,-.005,z,Math.atan(d));}
   for(const r of [110,150,192]){const z=sign*r,d=(rampCenter(z+1)-rampCenter(z-1))/2;arrow(rampCenter(z),z,Math.atan(d));}
  }
  // Outside curb only: neither access nor internal circulation crosses a wall.
  box(0x9aadb0,.18,.12,128,-37.1,.06,0);
  for(const offset of G.bayOffsets){
   box(0x245e57,5.8,.018,10,G.bayX,-.008,offset);
   for(const x of [-32,-26])box(0xdbf0e5,.10,.015,10,x,.003,offset);
   for(const z of [offset-5,offset+5])box(0xdbf0e5,6,.015,.10,G.bayX,.003,z);
   box(0x9dabb0,1.1,.12,1.2,G.chargerX,.06,offset+.58);
   for(const dz of [-1.1,1.9])box(0xf4d27c,.12,.85,.12,G.chargerX,.425,offset+dz);
   arrow(G.bayX,offset);
  }
  for(const z of [-54,-20,20,54])arrow(G.aisleX,z);
  for(const [color,geometries]of buckets){const geo=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g),false);const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.92,metalness:.02}));mesh.receiveShadow=true;mesh.raycast=()=>{};template.add(mesh);for(const g of geometries)g.dispose();}
  this.template=template;
  for(const station of ROUTE_STATIONS){const group=template.clone(true);group.name='SERVICE_'+station.id;this.root.add(group);const marker={station,group,near:false,bays:[]};this.markers.push(marker);
   for(const bay of chargerBays(station)){
    const mount=new THREE.Group();mount.position.set(bay.chargerX,0,bay.chargerPositionM-station.distanceM);group.add(mount);
    const body=new THREE.Group(),fallback=new THREE.Group();body.add(fallback);mount.add(body);
    const cabinet=new THREE.Mesh(new THREE.BoxGeometry(.7,1.8,.65),new THREE.MeshStandardMaterial({color:0x234858,roughness:.65}));cabinet.position.y=.9;fallback.add(cabinet);
    const m={station,group:mount,body,fallback,near:false,serviceBay:true,bay};marker.bays.push(m);assets?.bindStation(m);
   }
   this.sign(group,`${station.id.toUpperCase()} · RECARGA →`,-17,-224,3.7);
   this.sign(group,'ENTRADA · 20 km/h',-28,-100,3.5);
   this.sign(group,'SALIDA → PUEBLA',-40,60,3.5);
   // The old yield post was inside the exit. Yield remains a contextual HUD guard.
   group.traverse(o=>{if(o.isMesh)o.raycast=()=>{};});
  }
 }
 sign(parent,text,x,z,width){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#123f45';ctx.fillRect(0,0,768,160);ctx.strokeStyle='#d4eee7';ctx.lineWidth=8;ctx.strokeRect(6,6,756,148);ctx.fillStyle='#ecfff4';ctx.font='bold 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,80);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,width*160/768),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.rotation.y=Math.PI;sign.position.set(x,2.55,z);sign.userData.serviceSign={text,x,z};parent.add(sign);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,2.7,6),new THREE.MeshStandardMaterial({color:0x9aa9ad}));pole.position.set(x,1.31,z);pole.userData.serviceSignPole={text,x,z};parent.add(pole);
 }
 update(route,distanceM,visible){this.root.visible=route.enabled&&visible;if(!this.root.visible)return;const position=route.position(distanceM);
  for(const marker of this.markers){const ahead=marker.station.distanceM-position;marker.group.position.set(0,0,ahead);
   // Entire access ramp must already exist on approach; cull only beyond fog.
   marker.near=Math.abs(ahead)<(marker.near?330:310);marker.group.visible=marker.near;
   if(marker.near)for(const bay of marker.bays){bay.near=true;bay.body.visible=true;this.assets?.updateStation(bay);}
  }
 }
}
