import * as THREE from 'three';
/** Explicit GLB hierarchy classification. Wheels and original alpha-zero glass are
 * deliberately preserved; cabin trim and floor/underhood shells are occluders,
 * not fictitious powertrain components. */
export function xrayRole(mesh){
 for(let node=mesh;node;node=node.parent){const name=node.name||'';
  if(/^bolt_wheel(?:[._]|$)|^wheel_rf_dummy$/.test(name))return null;
  if(['bolt_interior_1','bolt_interior_2','bolt_steering_wheel','salon.002'].includes(name))return 'trim';
  if(['bolt_floor','podkapot'].includes(name))return 'occluder';
  if(['bolt_body','bonnet_dummy','bump_front_dummy','bump_rear_dummy','boot_dummy','door_lf_dummy','door_rf_dummy','door_lr_dummy','door_rr_dummy','windscreen_dummy'].includes(name))return 'exterior';
 }return null;
}
const COMPONENTS={
 battery:{title:'Batería HV',icon:'▰',color:0x2fd2c5},motor:{title:'Motor eléctrico + reductor',icon:'⚙',color:0x60c6e4},inverter:{title:'Inversor de tracción',icon:'ϟ',color:0x7daaff},pdu:{title:'Distribución de alta tensión',icon:'◇',color:0xf0a45e}
};
export class ExplorerXRay{
 constructor({driving,registry,visibility,interaction,onChange=()=>{}}){
  this.c=driving;this.powertrain=driving.energyVisual;this.registry=registry;this.visibility=visibility;this.interaction=interaction;this.onChange=onChange;this.enabled=false;
  this.leases=new Map();this.clones=new Map();this.savedRoot=null;this.selected=null;
  this.items=Object.entries(COMPONENTS).map(([id,spec])=>{const part=this.powertrain.parts[id];return {id:'xray-'+id,...spec,category:'Tren eléctrico · modelo educativo',description:part.desc+(id==='motor'?' Motor y reducción forman un único conjunto disponible; no hay un modelo independiente de transmisión.':''),representation:'Componente educativo existente · no OEM Bolt',anchors:[part.anchor],xrayPart:id};});
  visibility.xray=this;interaction.xray=this;
 }
 setEnabled(enabled){
  enabled=!!enabled;if(enabled===this.enabled)return;if(enabled&&this.c.active)return;
  if(!enabled){this.enabled=false;this.releaseMaterials();this.visibility.restore();this.restoreRoot();
   for(const item of this.items){const index=this.registry.items.indexOf(item);if(index>=0)this.registry.items.splice(index,1);for(const a of item.anchors)this.registry.nodesToItem.delete(a);}
   if(this.interaction.item?.xrayPart)this.interaction.clear();this.selected=null;this.onChange(false);return;
  }
  // Finish any temporary isolation material before obtaining reversible leases.
  this.visibility.restore();this.enabled=true;this.selected=this.interaction.item;
  const p=this.powertrain;this.savedRoot={visible:p.root.visible,children:new Map(),modulesOpen:p.modulesOpen};p.root.traverse(o=>this.savedRoot.children.set(o,o.visible));
  this.registry.items.unshift(...this.items);for(const item of this.items)for(const a of item.anchors)this.registry.nodesToItem.set(a,item);
  this.showParts();this.applyMaterials();this.onChange(true);
  // Same cached four models as Energy/Battery/Thermal, never another model set.
  p.loadModels().then(()=>{if(this.enabled){this.showParts();this.applyOpaqueParts();this.highlight(this.interaction.item);if(this.visibility.isolated&&this.interaction.item?.xrayPart)this.isolatePart(this.interaction.item);}});
 }
 showParts(){const p=this.powertrain;p.root.visible=true;const anchors=new Set(Object.values(p.parts).map(v=>v.anchor));for(const child of p.root.children)child.visible=anchors.has(child);
  p.modulesGroup.visible=false;for(const part of Object.values(p.parts)){part.anchor.visible=true;if(part.model)part.model.visible=true;part.placeholder.visible=!part.model;}
 }
 restoreRoot(){const saved=this.savedRoot;if(!saved)return;for(const [o,v]of saved.children)o.visible=v;this.powertrain.root.visible=saved.visible;this.savedRoot=null;}
 lease(mesh,role){if(this.leases.has(mesh))return;
  const original=mesh.material,materials=Array.isArray(original)?original:[original];
  if(!role.startsWith('internal-')&&materials.every(m=>(m?.opacity??1)<.06))return;
  const adapted=materials.map(material=>{if(!material)return material;if(!role.startsWith('internal-')&&(material.opacity??1)<.06)return material;
   let entries=this.clones.get(material);if(!entries){entries=new Map();this.clones.set(material,entries);}if(entries.has(role))return entries.get(role);
   const clone=material.clone();
   if(role.startsWith('internal-')){clone.transparent=false;clone.opacity=1;clone.depthWrite=true;clone.depthTest=true;clone.color?.lerp(new THREE.Color(COMPONENTS[role.slice(9)].color),.65);if('roughness'in clone)clone.roughness=Math.max(.45,clone.roughness);if('metalness'in clone)clone.metalness=Math.min(.35,clone.metalness);}
   else{clone.transparent=true;clone.opacity=Math.min(material.opacity??1,role==='exterior'?.15:role==='trim'?.09:.08);clone.depthWrite=false;clone.depthTest=true;clone.side=THREE.FrontSide;clone.color?.lerp(new THREE.Color(0x8fc9dc),.15);}
   clone.needsUpdate=true;entries.set(role,clone);return clone;
  });
  this.leases.set(mesh,{original,renderOrder:mesh.renderOrder,castShadow:mesh.castShadow,role});mesh.material=Array.isArray(original)?adapted:adapted[0];mesh.renderOrder=role.startsWith('internal-')?0:role==='exterior'?10:11;if(!role.startsWith('internal-'))mesh.castShadow=false;
 }
 applyMaterials(){if(!this.enabled)return;this.c.scene.car.traverse(o=>{if(o.isMesh){const role=xrayRole(o);if(role)this.lease(o,role);}});this.applyOpaqueParts();}
 applyOpaqueParts(){if(!this.enabled)return;for(const [id,part]of Object.entries(this.powertrain.parts))for(const root of [part.placeholder,part.model])root?.traverse(o=>{if(o.isMesh)this.lease(o,'internal-'+id);});}
 releaseMaterials(){for(const [mesh,record]of this.leases){mesh.material=record.original;mesh.renderOrder=record.renderOrder;mesh.castShadow=record.castShadow;}this.leases.clear();for(const roles of this.clones.values())for(const material of roles.values())material.dispose();this.clones.clear();}
 beforeVisibilityChange(){if(this.enabled)this.releaseMaterials();}
 afterVisibilityChange(){if(this.enabled){this.showParts();this.applyMaterials();this.highlight(this.interaction.item);}}
 onExteriorIsolated(){if(this.enabled)for(const part of Object.values(this.powertrain.parts))part.anchor.visible=false;}
 isolatePart(item){if(!this.enabled||!item.xrayPart)return false;this.c.scene.car.traverse(o=>{if(o.isMesh)o.visible=false;});for(const [id,p]of Object.entries(this.powertrain.parts))p.anchor.visible=id===item.xrayPart;this.visibility.isolated=true;return true;}
 pick(raycaster,hits){const internal=this.powertrain.pickPart(raycaster);if(internal)return this.items.find(item=>item.xrayPart===internal.id);
  for(const hit of hits){let visible=true;for(let node=hit.object;node;node=node.parent)if(!node.visible){visible=false;break;}const mats=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material];if(visible&&mats.some(m=>(m?.opacity??1)>.02)){const item=this.registry.hitToItem(hit.object);if(item)return item;}}
  return null;
 }
 highlight(item){this.selected=item;if(!this.enabled)return;for(const [mesh,record]of this.leases){if(!record.role.startsWith('internal-'))continue;const selected=record.role==='internal-'+item?.xrayPart;const originals=Array.isArray(record.original)?record.original:[record.original],materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials.forEach((material,i)=>{const source=originals[i];if(!material?.emissive||!source)return;material.emissive.copy(source.emissive??new THREE.Color(0));material.emissiveIntensity=source.emissiveIntensity??1;if(selected){material.emissive.lerp(new THREE.Color(0x38d7b0),.5);material.emissiveIntensity=Math.max(.32,material.emissiveIntensity);}});}}
}
