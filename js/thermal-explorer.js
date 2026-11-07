import * as THREE from 'three';
import {getPowertrainCard} from './powertrain-inspector-data.js';
import {THERMAL_ITEMS,thermalReading,temperatureColor} from './thermal-view-data.js';
/** A view over Energy's existing graph, selection/focus and the existing thermal nodes. */
export class ThermalExplorer{
 constructor(controller){
  this.c=controller;this.active=false;this.selected='battery';this.isolated=false;this.tinted=true;this.materials=new Map();this.visibility=new Map();this.updates=0;
  this.legend=document.getElementById('thermal-legend');this.legendTitle=document.getElementById('thermal-legend-title');
  this.fields={};const inspector=document.getElementById('thermal-inspector');inspector.replaceChildren();
  for(const [key,tag]of [['name','b'],['value','strong'],['note','p'],['source','small'],['technical','p']]){const el=document.createElement(tag);inspector.append(el);this.fields[key]=el;}
  document.getElementById('thermal-panel').addEventListener('click',e=>{const action=e.target.closest('[data-thermal-action]')?.dataset.thermalAction;if(!action)return;
   if(action==='focus')this.focus();if(action==='isolate'){this.isolated=!this.isolated;this.restoreVisibility();this.applyIsolation();}
   if(action==='restore'){this.isolated=false;this.restoreVisibility();}
   if(action==='color'){this.tinted=!this.tinted;if(!this.tinted)this.restoreMaterials();}
   this.update(this.c.physics.thermal.snapshot);
  });
 }
 targets(){
  const e=this.c.energyVisual,v=this.c.h5Visual,part=id=>{const p=e.parts[id];return p?.model?.visible?p.model:p?.placeholder;};
  return {battery:[part('battery')],motor:[part('motor')],inverter:[part('inverter')],pdu:[part('pdu')],
   coolant:[v.batteryFlow,v.batteryReturn,v.chillerToPump,v.frontBatteryJoin],powerCoolant:[v.powerFlow,v.powerReturn],
   cabin:[v.cabinHeater,v.cabinFlow],pump:[v.batteryPumpMount],radiator:[v.radiatorMount,v.fanHousing],plates:[v.plateMount]};
 }
 activate(){
  if(this.active)return;this.active=true;this.tinted=true;this.isolated=false;
  const c=this.c;this.previous={selected:c.selectedPowertrain,part:c.energyVisual.activePart,frame:c.energyVisual.frame.visible};
  // Only the two old floor planes are suppressed; all existing components are reused.
  this.floors=c.h5Visual.thermalRoot.children.filter(o=>o.geometry?.type==='PlaneGeometry');
  for(const o of this.floors)this.hide(o);
  this.select(this.selected,{focus:false});
 }
 deactivate(){
  if(!this.active)return;this.active=false;this.restoreVisibility();this.restoreMaterials();this.isolated=false;
  const c=this.c;c.selectedPowertrain=this.previous.selected;c.energyVisual.activePart=this.previous.part;
  if(this.previous.part)c.energyVisual.focusPart(this.previous.part);c.energyVisual.frame.visible=this.previous.frame;
 }
 hide(object){if(!object)return;if(!this.visibility.has(object))this.visibility.set(object,object.visible);object.visible=false;}
 restoreVisibility(){for(const [object,visible]of this.visibility)object.visible=visible;this.visibility.clear();if(this.active){this.c.h5Visual.setLabelsVisible(this.c.thermalLabels);for(const o of this.floors??[])this.hide(o);}}
 restoreMaterials(){for(const [mesh,{original,clones}]of this.materials){mesh.material=original;for(const material of clones)material.dispose();}this.materials.clear();}
 select(id,{focus=true}={}){
  if(!THERMAL_ITEMS[id])return;this.selected=id;this.c.thermalSelected=id;this.restoreVisibility();
  this.c.h5Visual.setThermalHighlight(id==='powerCoolant'?'inverter':id);
  if(this.c.energyVisual.parts[id])this.c.energyVisual.focusPart(id);else this.c.energyVisual.frame.visible=false;
  if(focus)this.focus();this.update(this.c.physics.thermal.snapshot);
 }
 focus(){
  const c=this.c;if(c.energyVisual.parts[this.selected]){c.focusEnergyPartCamera(this.selected);return;}
  const target=this.targets()[this.selected]?.[0];if(target)c.framePowertrainObject(target,'iso',true);
 }
 applyIsolation(){
  if(!this.active)return;for(const o of this.floors??[])this.hide(o);if(!this.isolated)return;
  const c=this.c,e=c.energyVisual,v=c.h5Visual,keep=this.targets()[this.selected]??[];
  this.hide(c.scene.car);
  for(const [id,part]of Object.entries(e.parts))if(id!==this.selected)this.hide(part.anchor);
  for(const o of [e.line,e.cable,...e.particles,...e.labels])this.hide(o);
  for(const object of v.thermalRoot.children){if(keep.some(target=>{let node=target;while(node){if(node===object)return true;node=node.parent;}return false;}))continue;this.hide(object);}
 }
 pick(raycaster){
  if(!this.active)return null;const targets=this.targets(),owners=[];
  for(const [id,items]of Object.entries(targets))for(const object of items)if(object)owners.push({id,object});
  this.c.energyVisual.root.updateWorldMatrix(true,true);this.c.h5Visual.thermalRoot.updateWorldMatrix(true,true);
  const hits=raycaster.intersectObjects(owners.map(x=>x.object),true);
  for(const hit of hits){let node=hit.object,visible=true,owner;while(node){if(!node.visible){visible=false;break;}owner??=owners.find(x=>x.object===node);node=node.parent;}if(visible&&owner)return owner.id;}
  return null;
 }
 paint(object,color){
  if(!object)return;object.traverse(mesh=>{if(!mesh.isMesh)return;
   let record=this.materials.get(mesh);
   if(!record){const original=mesh.material,clones=(Array.isArray(original)?original:[original]).map(m=>m.clone());record={original,clones};this.materials.set(mesh,record);mesh.material=Array.isArray(original)?clones:clones[0];}
   for(const m of record.clones){m.color?.setHex(color);if(m.emissive){m.emissive.setHex(color);m.emissiveIntensity=.20;}}
  });
 }
 update(snapshot){
  if(!this.active)return;this.updates++;this.lastSnapshot=snapshot;
  const targets=this.targets();
  if(this.tinted){for(const id of ['battery','motor','inverter','pdu','coolant','powerCoolant']){const reading=thermalReading(id,snapshot);for(const target of targets[id])this.paint(target,reading.color);}}
  this.legend.dataset.colored=String(this.tinted);this.legendTitle.textContent=this.tinted?'TEMPERATURA CALCULADA · °C':'COLOR DESACTIVADO · °C EN INSPECTOR';
  this.applyIsolation();const r=thermalReading(this.selected,snapshot),put=(key,value)=>{if(this.fields[key].textContent!==value)this.fields[key].textContent=value;};
  put('name',r.label);put('value',r.value===null?'Sin temperatura propia calculada':r.value.toFixed(2)+' °C');this.fields.value.style.color='#'+r.color.toString(16).padStart(6,'0');
  put('note',r.note+(r.associatedValue===null?'':' Fluido asociado: '+r.associatedValue.toFixed(2)+' °C.'));
  put('source',r.key?'Fuente: ThermalSystem.snapshot.'+r.key:'Sin nodo térmico propio; no se asigna una temperatura de otro componente.');
  const card=this.c.energyVisual.parts[this.selected]?getPowertrainCard(this.selected,this.c.physics.outputs):null;
  put('technical',card?card.description+' '+card.reference:'Geometría educativa ya integrada en el vehículo; temperatura de fluido y temperatura de carcasa son magnitudes distintas.');
  for(const button of document.querySelectorAll('[data-thermal-inspect]'))button.classList.toggle('active',button.dataset.thermalInspect===this.selected);
  const isolate=document.querySelector('[data-thermal-action="isolate"]');isolate.setAttribute('aria-pressed',String(this.isolated));isolate.textContent=this.isolated?'Mostrar contexto':'Aislar componente';
  const tint=document.querySelector('[data-thermal-action="color"]');tint.setAttribute('aria-pressed',String(this.tinted));tint.textContent=this.tinted?'Color térmico: SÍ':'Apariencia normal';
 }
}
