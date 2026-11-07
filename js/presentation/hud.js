import {template} from './template.js';
import {readPresentation} from './readouts.js';
import {plot} from './charts.js';
import {PRESETS,CHEMISTRIES,presetResult,wind,discriminant,sop,regenLimit,clamp} from './models.js';
const f=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const editing=e=>['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName);
export class PresentationHUD{
 constructor(controller){
  this.c=controller;this.open=false;this.page=1;this.timer=null;this.history=[];this.abort=new AbortController();this.signal=this.abort.signal;this.previousFocus=null;this.updates=0;
  this.system={gridGPerKWh:40,manufacturingReferenceKg:6000,consumptionKWh100Km:16,referenceGKm:235,lifeKm:200000};
  this.bank={ocvV:350,resistanceOhm:.12,minVoltageV:300,thermalCurrentA:250,hardwareCurrentA:300,demandW:300000,motorKW:60,bmsKW:35,efficiency:.85,chassisKW:45,brakingKW:30};
  this.panel=document.createElement('section');this.panel.id='presentation-panel';this.panel.className='lecture-panel';this.panel.hidden=true;this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-modal','false');this.panel.setAttribute('aria-labelledby','lecture-title');this.panel.innerHTML=template();document.body.append(this.panel);
  this.values=new Map([...this.panel.querySelectorAll('[data-lecture]')].map(e=>[e.dataset.lecture,e]));this.controls=new Map([...this.panel.querySelectorAll('[data-lecture-control]')].map(e=>[e.dataset.lectureControl,e]));this.charts=new Map([...this.panel.querySelectorAll('[data-chart]')].map(e=>[e.dataset.chart,e]));
  this.stages=Array.from({length:5},(_,i)=>{const el=document.createElement('div');el.innerHTML='<b></b><strong></strong><small></small>';this.panel.querySelector('[data-flow]').append(el);return el;});
  this.units=Array.from({length:5},()=>{const el=document.createElement('span');this.panel.querySelector('[data-units]').append(el);return el;});
  this.button=document.getElementById('tab-presentation');this.button.disabled=false;this.button.addEventListener('click',()=>this.setOpen(!this.open),{signal:this.signal});
  this.panel.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&e.target.closest('button'))e.stopPropagation();},{signal:this.signal});
  this.panel.addEventListener('click',e=>this.click(e),{signal:this.signal});this.panel.addEventListener('input',e=>this.input(e),{signal:this.signal});this.panel.addEventListener('change',e=>{if(e.target.matches('select,[type=checkbox]'))this.input(e);},{signal:this.signal});
  // Capture only our shortcuts; W/S continue to the existing controller outside fields.
  window.addEventListener('keydown',e=>{const key=/^Digit([1-4])$/.exec(e.code??'');if(e.altKey&&!e.ctrlKey&&!e.metaKey&&key){e.preventDefault();e.stopImmediatePropagation();this.setOpen(true,+key[1]);}else if(this.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.setOpen(false);}else if(this.open&&editing(e)&&this.panel.contains(e.target)){e.stopPropagation();}},{capture:true,signal:this.signal});
  document.addEventListener('visibilitychange',()=>{this.cancel();if(this.open&&!document.hidden)this.refresh();},{signal:this.signal});
  this.installDrag();this.syncControls();this.renderBank();
  controller.physics.lecture.canExport=()=>controller.charging.state==='DESCONECTADO'&&!(controller.h5Mode==='charging'&&controller.charging.state!=='DESCONECTADO');
 }
 put(key,text){const e=this.values.get(key);if(e&&e.textContent!==String(text))e.textContent=String(text);}
 feedback(text,error=false){const el=this.panel.querySelector('#lecture-feedback');el.textContent=text;el.classList.toggle('is-error',error);}
 cancel(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
 setOpen(open,page=this.page){this.open=!!open;this.page=page;this.panel.hidden=!this.open;this.button.setAttribute('aria-expanded',String(this.open));this.button.classList.toggle('active',this.open);this.cancel();
  for(const el of this.panel.querySelectorAll('[data-lecture-page]'))el.hidden=+el.dataset.lecturePage!==page;
  for(const el of this.panel.querySelectorAll('[data-lecture-tab]')){const selected=+el.dataset.lectureTab===page;el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected));}
  if(this.open){this.previousFocus=document.activeElement;this.refresh();}else this.button.focus();
 }
 click(event){const target=event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-dynamics-reference')){this.applyExample(4);return;}
  if(target.dataset.lectureTab){this.setOpen(true,+target.dataset.lectureTab);return;}
  if(target.dataset.example){this.applyExample(+target.dataset.example);return;}
  if(target.dataset.surface){this.controls.get('mu').value=target.dataset.surface;this.changePhysical('mu',+target.dataset.surface);this.refresh();return;}
  const action=target.dataset.action;
  if(action==='lecture-close')this.setOpen(false);
  if(action==='lecture-expand'){this.panel.classList.toggle('maximized');this.panel.style.removeProperty('left');this.panel.style.removeProperty('top');this.panel.style.removeProperty('width');this.panel.style.removeProperty('height');}
  if(action==='lecture-pause'){this.c.pause();this.refresh();}
  if(action==='lecture-run'){
   if(this.c.charging.state!=='DESCONECTADO'){this.feedback('Desconecta la recarga antes de reanudar el ensayo.',true);return;}
   if(!this.c.exitH5())return;this.c.setChartsMode(false);this.c.setActive(true);this.c.setBatteryMode(false);this.c.play();this.feedback('Física en marcha. W acelera y S frena; en viaje no se aplica aceleración automática.');this.refresh();
  }
  if(action==='lecture-restore'){
   if(!this.safeChange())return;const routeConfig=this.c.route.enabled?{allowReverse:this.c.physics.config.allowReverse,scenario:this.c.physics.config.scenario,gradePct:this.c.physics.config.gradePct,liftOffRegen:this.c.physics.config.liftOffRegen}:null;this.c.physics.restoreConfiguration();if(routeConfig){Object.assign(this.c.physics.config,routeConfig);this.c.physics.refresh();}this.c.physics.thermal.setMode('AUTO');this.button.textContent='∑ Exposición';this.clearPedals();this.syncControls();this.panel.querySelector('#lecture-example').textContent='Parámetros originales restaurados; odómetro, tiempo y visitas conservados.';this.feedback('Restaurado perfil de H5.12. Se conservan SOC y posición actuales.');this.refresh();
  }
 }
 safeChange(){if(this.c.charging.state!=='DESCONECTADO'){this.feedback('Cambio bloqueado: detén y desconecta el cable para conservar la sesión de recarga.',true);return false;}if(this.c.route.enabled&&['APROXIMACIÓN','EN ESTACIÓN','FRENANDO DESTINO'].includes(this.c.route.state)){this.feedback('Finaliza la parada y pulsa Continuar antes de cambiar condiciones iniciales. El banco editable sigue disponible.',true);return false;}this.c.pause();return true;}
 clearPedals(){for(const id of ['drive-throttle','drive-brake']){const e=document.getElementById(id);if(e)e.value='0';}for(const id of ['throttle-value','brake-value']){const e=document.getElementById(id);if(e)e.textContent='0 %';}}
 applyExample(id){if(!this.safeChange())return;if(this.c.route.enabled&&['APROXIMACIÓN','EN ESTACIÓN','FRENANDO DESTINO'].includes(this.c.route.state)){this.feedback('Finaliza la parada y pulsa Continuar antes de cargar condiciones de exposición. El banco editable sigue disponible.',true);return;}this.clearPedals();const p=this.c.physics,routeConfig=this.c.route.enabled?{allowReverse:p.config.allowReverse,scenario:p.config.scenario,gradePct:p.config.gradePct,liftOffRegen:p.config.liftOffRegen}:null,input=p.applyPreset(id,{setSpeed:!this.c.route.enabled});if(routeConfig){Object.assign(p.config,routeConfig);p.refresh();}
  this.bank={...this.bank,...input};if(input.brakingKW!==undefined){const brake=clamp(input.brakingKW*1000/(Math.max(1,Math.abs(p.speedMS))*p.massKg*p.config.brakeMaxDecelMS2),0,1);const field=document.getElementById('drive-brake');if(field)field.value=String(brake*100);const read=document.getElementById('brake-value');if(read)read.textContent=f(brake*100)+' %';const regen=document.getElementById('regen-mode');if(regen)regen.value='standard';}
  this.button.textContent='∑ Exposición · E'+String(id).padStart(2,'0');this.renderExample(id);this.syncControls();this.renderBank();this.feedback(`Ejemplo ${String(id).padStart(2,'0')} cargado y pausado. ${this.c.route.enabled?'Ruta y velocidad conservadas; la condición del banco no cambia la estación.':'Condiciones iniciales aplicadas al motor físico.'}`);this.refresh();
 }
 renderExample(id){const {input:i,result:r}=presetResult(id);let lines=[];
  if(id===1)lines=[`Iᵥ = (350 − 300) / 0.12 = ${f(r.voltageCurrentA,1)} A`,`I = min(416.7, 250, 300) = ${f(r.currentA,0)} A`,`Vₜ = 350 − 250 × 0.12 = ${f(r.terminalV,0)} V`,`SOP = 320 × 250 = ${f(r.powerW/1000,1)} kW · protección térmica`];
  if(id===2)lines=[`Pᵦₘₛ/η = 35 / 0.85 = ${f(35/.85,2)} kW`,`Pregen = min(60, 41.18, 45) = ${f(r.allowedKW,2)} kW`,`Pbatería = ${f(r.allowedKW,2)} × 0.85 = ${f(r.batteryKW,1)} kW · BMS de carga`];
  if(id===3)lines=[`SOC = 95 % · T = 5 °C · límite de carga supuesto = 5 kW`,`Pregen = min(60, 5/0.85, 45) = ${f(r.allowedKW,2)} kW`,`Pdiscos = 30 − ${f(r.allowedKW,2)} = ${f(r.frictionKW,2)} kW`,`Pbatería = ${f(r.batteryKW,1)} kW. Los 5 kW son un límite asignado al ejemplo; no una ley universal de SOC/T.`];
  if(id===4)lines=[`N = 0.60 × 1757 × 9.81 = ${f(r.normalN,3)} N ≈ ${f(r.roundedNormalN,0)} N`,`Con N redondeada: Fmáx = 0.35 × 10,342 = ${f(r.presentationForceN,1)} N`,`Pchasis = 3619.7 × 20 / 1000 = ${f(r.presentationForceN*20/1000,1)} kW`,`Sin redondeo intermedio: Fmáx = ${f(r.maximumN,4)} N; P = ${f(r.chassisKW,4)} kW. Motor dinámico añade transferencia de carga.`];
  if(id===5)lines=[`Pmáx = 350² / (4 × 0.12) = ${f(r.maximumW/1000,1)} kW`,`D = 122,500 − 144,000 = ${f(r.dV2,0)} V² < 0`,`Colapso de tensión: D < 0, no existe corriente real para la potencia solicitada`,`Demanda de banco: 300 kW. La simulación real rechaza la demanda imposible y mantiene su límite BMS; no se inyecta NaN ni una corriente ficticia.`];
  const box=this.panel.querySelector('#lecture-example');box.replaceChildren();const title=document.createElement('b');title.textContent=`EJEMPLO ${String(id).padStart(2,'0')} · ${i.name}`;box.append(title);for(const line of lines){const p=document.createElement('p');p.textContent=line;box.append(p);}box.classList.toggle('is-error',id===5);
 }
 input(event){const el=event.target,key=el.dataset.lectureControl;if(!key)return;if((el.tagName==='SELECT'||el.type==='checkbox')&&event.type==='input')return;
  if(el.type==='number'&&(!el.checkValidity()||el.value===''))return;const value=el.type==='checkbox'?el.checked:el.tagName==='SELECT'?el.value:Number(el.value);
  if(key.startsWith('bank-')){const map={'bank-ocv':'ocvV','bank-r':'resistanceOhm','bank-vmin':'minVoltageV','bank-it':'thermalCurrentA','bank-ih':'hardwareCurrentA','bank-demand':'demandW','bank-motor':'motorKW','bank-charge':'bmsKW','bank-eta':'efficiency','bank-chassis':'chassisKW','bank-brake':'brakingKW'};this.bank[map[key]]=key==='bank-demand'?value*1000:value;this.renderBank();this.feedback('Banco de ecuaciones modificado; el vehículo conserva sus parámetros.');this.refresh();return;}
  const systemMap={'grid':'gridGPerKWh','manufacture':'manufacturingReferenceKg','consumption':'consumptionKWh100Km','reference-emissions':'referenceGKm','life-km':'lifeKm'};
  if(key==='mix'){this.system.gridGPerKWh=+value;this.controls.get('grid').value=value;}else if(systemMap[key])this.system[systemMap[key]]=value;
  else if(['chemistry','density','capacity','soh-enabled','soh'].includes(key)){
   if(!this.safeChange()){this.syncControls();return;}const p=this.c.physics,l=p.lecture,chemistry=this.controls.get('chemistry').value;
   if(key==='chemistry'){this.controls.get('density').value=CHEMISTRIES[chemistry].densityWhKg;}
   p.setPack({chemistry,densityWhKg:+this.controls.get('density').value,capacityKWh:+this.controls.get('capacity').value,sohEnabled:this.controls.get('soh-enabled').checked,soh:+this.controls.get('soh').value/100});this.feedback('Cambio de pack aplicado con física pausada. Masa y capacidad se recalculan; no se cambia el modelo 3D.');this.syncControls();
  }else if(key==='v2g'||key==='v2g-power'){
   const p=this.c.physics;if(key==='v2g'&&value&&(Math.abs(p.speedMS)>.001||this.c.charging.state!=='DESCONECTADO')){this.controls.get('v2g').checked=false;this.feedback('V2G requiere vehículo detenido y ninguna sesión de recarga conectada.',true);return;}if(key==='v2g')p.lecture.v2g=value;else p.lecture.v2gKW=value;
   this.feedback('V2G educativo: Reanudar física inicia el intercambio solo detenido y con SOC >20 %.');
  }else{this.changePhysical(key,value);}
  this.refresh();
 }
 changePhysical(key,value){const p=this.c.physics;const map={mu:'roadFriction',cd:'dragCoefficient',crr:'rollingCoefficient',area:'frontalAreaM2',rho:'airDensityKgM3',front:'frontStaticLoadFraction'};
  if(this.c.charging.state!=='DESCONECTADO'){this.feedback('No se alteran parámetros durante una sesión conectada.',true);this.syncControls();return;}
  if(map[key])p.config[map[key]]=value;
  else if(key==='eta-inverter')p.energyModel.settings.inverterDriveEfficiency=value;
  else if(key==='eta-motor')p.energyModel.settings.motorDriveEfficiency=value;
  else if(key==='eta-transmission')p.config.transmissionEfficiency=value;
  else if(key==='grade'){p.setGrade(value);p.config.scenario='manual';}
  else if(key==='payload'){this.c.pause();p.setPayload(value);p.brakeLedger.reset();}
  else if(key==='soc'||key==='battery-temp'){if(!this.safeChange())return;if(key==='soc'){p.battery.soc=value/100;p.battery.vPolarization=0;}else{p.battery.temperatureC=value;p.thermal.batteryC=value;p.thermal.batteryCoolantC=value;}p.brakeLedger.reset();}
  else if(key==='inverter-temp'){p.thermal.electronicsC=value;}
  p.refresh();this.syncControls();this.feedback('Parámetro aplicado al motor físico. Las lecturas en vivo usan la nueva configuración.');
 }
 syncControls(){const p=this.c.physics,l=p.lecture,c=p.config;const vals={grade:p.gradeForScenario(),mu:c.roadFriction,cd:c.dragCoefficient,crr:c.rollingCoefficient,area:c.frontalAreaM2,rho:c.airDensityKgM3,front:c.frontStaticLoadFraction,payload:c.payloadKg,'eta-inverter':p.energyModel.settings.inverterDriveEfficiency,'eta-motor':p.energyModel.settings.motorDriveEfficiency,'eta-transmission':c.transmissionEfficiency,soc:(p.battery?.soc??0)*100,'battery-temp':p.battery?.temperatureC??25,'inverter-temp':p.thermal.electronicsC,chemistry:l.chemistry,density:l.densityWhKg,capacity:l.capacityKWh,'soh-enabled':l.sohEnabled,soh:l.initialSoh*100,v2g:l.v2g,'v2g-power':l.v2gKW};
  for(const [key,value] of Object.entries(vals)){const el=this.controls.get(key);if(!el||document.activeElement===el)continue;if(el.type==='checkbox')el.checked=!!value;else el.value=String(value);}
  const chem=CHEMISTRIES[l.chemistry];this.controls.get('density').min=String(chem.min);this.controls.get('density').max=String(chem.max);
  for(const out of this.panel.querySelectorAll('[data-control-value]')){const el=this.controls.get(out.dataset.controlValue);out.textContent=f(+el.value,(String(el.step).split('.')[1]??'').length)+(out.dataset.controlUnit?' '+out.dataset.controlUnit:'');}
  const old={ 'drive-grade':c.gradePct,'drive-payload':c.payloadKg,'drive-scenario':this.c.route.enabled?'route':c.scenario};for(const [id,v] of Object.entries(old)){const el=document.getElementById(id);if(el)el.value=String(v);}
  const grade=document.getElementById('grade-value');if(grade)grade.textContent=f(c.gradePct)+' %';const payload=document.getElementById('payload-value');if(payload)payload.textContent=f(c.payloadKg,0)+' kg';
 }
 renderBank(){const keys={'bank-ocv':'ocvV','bank-r':'resistanceOhm','bank-vmin':'minVoltageV','bank-it':'thermalCurrentA','bank-ih':'hardwareCurrentA','bank-demand':'demandW','bank-motor':'motorKW','bank-charge':'bmsKW','bank-eta':'efficiency','bank-chassis':'chassisKW','bank-brake':'brakingKW'};for(const [key,prop] of Object.entries(keys)){const e=this.controls.get(key);if(e&&document.activeElement!==e)e.value=String(this.bank[prop]/(key==='bank-demand'?1000:1));}const s=sop(this.bank),d=discriminant(this.bank),r=regenLimit(this.bank);this.values.get('bank').classList.toggle('is-error',!d.valid);this.put('bank',`BANCO EDITABLE · Iᵥ=${f(s.voltageCurrentA)} A · I=${f(s.currentA)} A · Vₜ=${f(s.terminalV)} V · SOP=${f(s.powerW/1000)} kW | D=${f(d.dV2,0)} V² · Pmáx=${f(d.maximumW/1000)} kW${d.valid?'':' · NO EXISTE CORRIENTE REAL'} | Regen=${f(r.allowedKW,2)} kW · batería=${f(r.batteryKW,2)} kW · discos=${f(r.frictionKW,2)} kW`);}
 refresh(){this.cancel();if(!this.open||document.hidden)return;const s=readPresentation(this.c,this.system);this.updates++;const o=s.output,l=this.c.physics.lecture;
  this.put('source',l.preset?`EN VIVO + EJEMPLO ${String(l.preset).padStart(2,'0')} · iniciales resaltadas`:'EN VIVO · MOTOR FÍSICO');this.put('clock',`${this.c.running?'SIMULANDO':'PAUSA'} · t=${f(s.time)} s · ${f(s.distance/1000,3)} km · 4 Hz`);
  if(this.history.length&&s.time<this.history.at(-1)[0])this.history=[];if(!this.history.length||s.time>this.history.at(-1)[0])this.history.push([s.time,s.speed*3.6]);while(this.history.length&&this.history[0][0]<s.time-30)this.history.shift();
  if(this.page===1)this.renderDynamics(s);else if(this.page===2)this.renderEnergy(s);else if(this.page===3)this.renderBms(s);else this.renderSystem(s);
  this.timer=setTimeout(()=>this.refresh(),250);
 }
 renderDynamics(s){const o=s.output,c=s.config,d=o.lecture??{},a=s.adhesion;for(const [key,value] of Object.entries({traction:o.forceTractionN,aero:o.forceAeroN,rolling:o.forceRollingN,'grade-force':o.forceSlopeN,friction:o.forceFrictionBrakeN,'regen-force':o.forceRegenN,acceleration:o.accelerationMS2}))this.put(key,f(value,key==='acceleration'?3:1));
  this.put('acceleration',`${f(this.c.physics.accelerationMS2,3)} / ${f(o.forceNetN/s.massEq,3)}`);this.put('mass',`${f(s.mass,1)} / ${f(s.massEq,1)}`);this.put('road-power',`${f(s.currentWind.roadKW)} / ${f(o.tractionWheelPowerW/1000)}`);this.put('static-normal',f(a.normalN));this.put('dynamic-normal',f(s.dynamicNormal));this.put('fmax',f(s.dynamicNormal*c.roadFriction));this.put('chassis',f(s.dynamicNormal*c.roadFriction*s.speed/1000));
  const warn=d.adhesionCut||d.requestedBrakeN>d.fourWheelMaximumN;this.put('slip',warn?'SLIP / VCU-ESC DIDÁCTICO · demanda supera adherencia; fuerza recortada':d.requestedBrakeN>d.frontMaximumN?'Frenada superior a capacidad delantera: reparto a discos de las cuatro ruedas.':'ADHERENCIA DISPONIBLE · par aplicado dentro del límite');this.values.get('slip').classList.toggle('is-error',!!warn);
  this.put('wind120',`120 km/h: aire ${f(s.wind120.aeroN)} N · rodadura ${f(s.wind120.rollingN)} N · aire ${f(s.wind120.aeroShare*100)} % de ambas resistencias en llano; no del consumo total.`);
  const points=Array.from({length:91},(_,i)=>{const w=wind(c,s.mass,i*2/3.6);return {v:i*2,...w};});plot(this.charts.get('wind'),{xMax:180,yMax:Math.max(800,...points.map(p=>p.aeroN))*1.08,series:[{color:'#6ec8ff',points:points.map(p=>[p.v,p.aeroN])},{color:'#f0c77a',points:points.map(p=>[p.v,p.rollingN])}],marker:{x:120,label:'120 km/h · 33.33 m/s'},xLabel:'km/h',yLabel:'Fuerza [N]'});
  plot(this.charts.get('history'),{xMax:30,yMax:Math.max(120,...this.history.map(p=>p[1]))*1.1,series:[{color:'#58ddba',points:this.history.map(([t,v])=>[30-s.time+t,v])}],xLabel:'últimos 30 s',yLabel:'Velocidad [km/h]'});
 }
 renderEnergy(s){const o=s.output;this.put('flow-title',s.reverse?'Flujo invertido · ruedas → generador → AC/DC → química':'El río eléctrico · química → DC → AC → torque → ruedas');this.stages.forEach((el,i)=>{const stage=s.stages[i];el.children[0].textContent=stage.label;el.children[1].textContent=f(stage.value/1000,2)+' kW';el.children[2].textContent=i?`Peaje ${f(Math.max(0,s.stages[i-1].value-stage.value)/1000,2)} kW`:s.stages[0].value>1?(s.reverse?'Rama regenerativa':'Rama de tracción'):'Sin tracción';});
  this.units.forEach((el,i)=>{el.textContent=f(s.template[i],1)+' u';el.style.setProperty('--units',String(s.template[i])+'%');});
  this.put('efficiency',s.reverse?`Regeneración: ${s.efficiencies.map(e=>f(e*100,1)+' %').join(' × ')} = ${f(s.template.at(-1),1)} %. 100 u de ruedas → ${f(s.template.at(-1),1)} u químicas; último factor neto incluye auxiliares y pérdidas de batería.`:`${s.efficiencies.map(e=>f(e*100,1)+' %').join(' × ')} = ${f(s.template.at(-1),1)} % · 100 u químicas → ${f(s.template.at(-1),1)} u ruedas. 100 u DC → ${f(s.efficiencies.slice(1).reduce((a,b)=>a*b,100),1)} u ruedas.`);
  this.put('battery-heat',f((o.batteryHeatLossW??0)/1000,3));this.put('auxiliary',f(o.auxiliaryPowerW/1000,3));this.put('rc-storage',f((s.battery.ocvV??0)*(s.battery.currentA??0)-(s.battery.powerW??0)-(s.battery.heatLossW??0),2));
  this.panel.querySelector('[data-meter=tank]').value=(s.battery.soc??0)*100;this.panel.querySelector('[data-meter=pipe]').value=Math.abs(o.batteryNetPowerW??0)/1000;
  this.put('tank',`${f(s.pack.effectiveKWh)} kWh de capacidad × ${f((s.battery.soc??0)*100)} % SOC ≈ ${f(s.pack.effectiveKWh*(s.battery.soc??0))} kWh nominales restantes`);this.put('pipe',`${f(Math.abs(o.batteryNetPowerW)/1000)} kW actual · límite descarga ${f((s.limits.availableDischargeW??0)/1000)} kW`);
  const b=s.braking;b.percent.forEach((v,i)=>{const el=this.panel.querySelector(`[data-part="${i}"]`);el.style.width=v+'%';el.textContent=v>9?f(v,0)+' %':'';});this.put('partition',b.availableJ>0?`Almacenada ${f(b.percent[0])} % · calor/otras ${f(b.percent[1])} % · discos ${f(b.percent[2])} % (${this.c.physics.brakeLedger.active?'frenando':'última frenada'})`:'Sin frenada registrada · conduce, suelta W o utiliza S para calcular el reparto.');
  this.put('kinetic',`${f(s.kineticJ/1000)} / ${f(s.kineticEquivalentJ/1000)}`);this.put('brake-budget',f(b.availableJ/1000));this.put('potential',f(b.potentialJ/1000));
 }
 renderBms(s){const b=s.battery,lim=s.limits;this.put('soc',f((b.soc??0)*100,2));this.put('temperature',`${f(b.temperatureC)} / ${f(this.c.physics.thermal.electronicsC)}`);this.put('bms-power',`${f((lim.availableDischargeW??0)/1000)} / ${f((lim.availableChargeW??0)/1000)}`);this.put('derating',`${f((lim.temperatureFraction??0)*100)} % / ${f(s.inverterFactor*100)} %`);
  this.values.get('derating').parentElement.classList.toggle('is-error',lim.temperatureFraction<.999||s.inverterFactor<.999);this.put('sop-live',`ENVOLVENTE OCV–R: Iᵥ=${f(s.sop.voltageCurrentA)} A; I=${f(s.sop.currentA)} A; Vₜ=${f(s.sop.terminalV)} V; P=${f(s.sop.powerW/1000)} kW. SOP BMS completa=${f((lim.availableDischargeW??0)/1000)} kW (${lim.warning??'sin batería'}). Corriente real=${f(b.currentA)} A.`);
  const r=s.regen;this.put('regen-live',`Límites: ${r.bounds.map(([name,v])=>name+' '+f(v,2)+' kW').join(' · ')} → ${f(r.allowedKW,2)} kW; manda ${r.limit}. Demanda ${f(Math.abs(s.output.forceBrakingN)*s.speed/1000)} kW; regeneración real en ruedas ${f(s.output.regenWheelPowerW/1000,2)} kW; neta batería ${f(Math.max(0,-s.output.batteryNetPowerW)/1000,2)} kW; discos ${f(s.output.forceFrictionBrakeN*s.speed/1000,2)} kW.`);
  this.put('discriminant-live',`Rama aceptada 1RC: Vef=${f((b.ocvV??0)-(b.vPolarization??0))} V; R=${f(this.c.physics.battery.settings.resistanceOhm,3)} Ω; P=${f(s.output.batteryNetPowerW/1000)} kW; D=${f(s.discriminant.dV2,0)} V²; techo teórico=${f(s.discriminant.maximumW/1000)} kW. El techo no sustituye los límites BMS.`);
  const currentMax=(b.ocvV??350)/(2*this.c.physics.battery.settings.resistanceOhm),v=(b.ocvV??350)-(b.vPolarization??0),r0=this.c.physics.battery.settings.resistanceOhm,points=Array.from({length:101},(_,i)=>{const current=currentMax*i/100;return [current,(v*current-r0*current*current)/1000];});
  plot(this.charts.get('sop'),{xMax:currentMax,yMax:Math.max(100,...points.map(p=>p[1]))*1.1,series:[{color:'#6ec8ff',points}],marker:{x:s.sop.currentA,label:'I permitida OCV–R'},xLabel:'Corriente [A]',yLabel:'Potencia [kW]'});
 }
 renderSystem(s){const l=this.c.physics.lecture,ch=CHEMISTRIES[l.chemistry];this.put('chemistry',`${l.chemistry} · ${ch.name} · ${ch.min}–${ch.max} Wh/kg de celda. ${ch.note}`);this.put('pack-mass',`${f(s.pack.massKg)} / ${f(s.pack.cellMassKg)}`);this.put('pack-vehicle',`${f(s.mass)} / ${f(s.pack.effectiveKWh)}`);this.put('wear',f(s.mass/1757,3)+'×');this.put('health',`${f(l.efc,5)} / ${f(l.sohEnabled?l.soh*100:100,3)}`);
  const life=s.life;this.put('lifecycle',`Calculadora propia: deuda inicial ${f(life.debtKg,0)} kgCO₂e; equilibrio ${life.breakEvenKm===null?'no se alcanza con este mix':f(life.breakEvenKm,0)+' km'}; BEV en uso ${f(life.bevGKm)} gCO₂e/km; reducción a ${f(this.system.lifeKm,0)} km: ${f(life.reduction*100)} %. A tu odómetro: BEV ${f(life.atDistance.bevKg,0)} / referencia ${f(life.atDistance.referenceKg,0)} kgCO₂e.`);
  const max=this.system.lifeKm,points=Array.from({length:61},(_,i)=>{const x=i/60*max;return {x,...life.total(x)};});plot(this.charts.get('life'),{xMax:max,yMax:Math.max(...points.map(x=>Math.max(x.bevKg,x.referenceKg)))*1.1,series:[{color:'#58ddba',points:points.map(p=>[p.x,p.bevKg])},{color:'#f0c77a',points:points.map(p=>[p.x,p.referenceKg])}],marker:{x:life.breakEvenKm!==null&&life.breakEvenKm<max?life.breakEvenKm:17000,label:life.breakEvenKm!==null&&life.breakEvenKm<max?'Equilibrio calculado':'17,000 km · referencia'},xLabel:'Distancia [km]',yLabel:'Acumulado [kgCO₂e]'});
  this.put('v2g',`${l.v2g?'Habilitado':'Deshabilitado'} · ${this.c.running&&l.lastExportW>0?'EXPORTANDO':'sin intercambio activo'} · ${f(this.c.running?l.lastExportW/1000:0,2)} kW a red · ${f(l.exportedKWh,5)} kWh acumulados · reserva SOC 20 % · ${f(l.throughputKWh,5)} kWh de throughput total.`);
 }
 installDrag(){const handle=this.panel.querySelector('[data-drag-handle]');let drag=null;
  handle.addEventListener('pointerdown',e=>{if(e.target.closest('button')||this.panel.classList.contains('maximized'))return;const r=this.panel.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();},{signal:this.signal});
  handle.addEventListener('pointermove',e=>{if(!drag)return;this.panel.style.left=clamp(drag.left+e.clientX-drag.x,0,Math.max(0,window.innerWidth-160))+'px';this.panel.style.top=clamp(drag.top+e.clientY-drag.y,0,Math.max(0,window.innerHeight-80))+'px';this.panel.style.right='auto';},{signal:this.signal});
  for(const type of ['pointerup','pointercancel'])handle.addEventListener(type,()=>{drag=null;},{signal:this.signal});
 }
 dispose(){this.cancel();this.c.physics.lecture.v2g=false;this.abort.abort();this.panel.remove();this.open=false;}
}
