import {ServiceAreaController} from './service-area-controller.js';
import {ThermalExplorer} from './thermal-explorer.js';
import {RoadExperience} from './road-experience.js';
import * as THREE from 'three';
import {EducationPhysics as DrivePhysics} from './presentation/education-physics.js';
import {DrivingScene} from './driving-scene.js';
import {TelemetryManager,TELEMETRY_CHANNELS} from './telemetry-manager.js';
import {ChartManager} from './chart-manager.js';
import {MODEL_ASSUMPTIONS} from './vehicle-parameters.js';
import {PowertrainVisuals} from './powertrain-visuals.js';
import {EnergyPanel} from './energy-panel.js';
import {BatteryExplorer} from './battery-explorer.js';
import {getPowertrainCard} from './powertrain-inspector-data.js';
import {CHARGING_EQUIPMENT} from './charging-system.js';
import {SpatialChargingSystem as ChargingSystem} from './spatial-charging-system.js';
import {RouteJourney} from './route-journey.js';
import {RoutePanel} from './route-panel.js';
import {evaluateBoltCharging} from './charging-compatibility.js';
import {captureEngineeringSnapshot,compareEngineeringSnapshots} from './engineering-comparison.js';
import {ChargingThermalVisuals} from './charging-thermal-visuals.js';
import {ControlNetworkPanel} from './control-network-panel.js';
const $=id=>document.getElementById(id);
export class DrivingController{
 constructor({scene,cameras,interaction,visibility,returnStage,onStatus}){
   this.scene=scene;this.cameras=cameras;this.interaction=interaction;
   this.visibility=visibility;this.returnStage=returnStage;this.onStatus=onStatus;
   this.physics=new DrivePhysics();this.visual=new DrivingScene(scene,scene.car);
   this.energyVisual=new PowertrainVisuals(scene.scene,scene.car);
   this.energyPanel=new EnergyPanel();this.energyMode=false;this.batteryMode=false;
   this.batteryExplorer=new BatteryExplorer();
   let routeStorage=null;try{routeStorage=window.localStorage;}catch{}
   this.route=new RouteJourney({storage:routeStorage});
   this.charging=new ChargingSystem(this.physics);this.h5Visual=new ChargingThermalVisuals(scene.scene);
   this.scene.visualEnvironment?.assets?.attachCharging(this.h5Visual);
   this.charging.locationGuard=()=>this.route.canCharge(this.physics.distanceM,this.physics.speedMS,this.charging.station);
   this.h5Mode=null;this.chargeAccumulated=0;this.chargerSpeed=120;this.lastH5Draw=0;this.thermalLabels=true;
   this.telemetry=new TelemetryManager();this.chart=new ChartManager($('drive-chart'));
   this.overviewCharts={speed:new ChartManager($('chart-overview-speed')),soc:new ChartManager($('chart-overview-soc')),power:new ChartManager($('chart-overview-power')),regen:new ChartManager($('chart-overview-regen'))};
   for(const [name,channel] of Object.entries({speed:'speedKmh',soc:'batterySocPct',power:'batteryNetKW',regen:'regenPowerKW'}))this.overviewCharts[name].setChannel(channel);
   this.chartsMode=false;this.chartsReturnMode='driving';
   this.analysisRunId=0;this.analysisCaptures={A:null,B:null};
   this.selectedPowertrain=null;this.pickRaycaster=new THREE.Raycaster();this.pickPointer=new THREE.Vector2();this.pointerDown=null;
   this.batteryIsolated=true;this.batteryCameraView='iso';this.batteryPriorControls=null;
   this.active=false;this.running=false;this.accumulated=0;this.lastDraw=0;
   this.pressed={throttle:false,brake:false};
   this.thermalExplorer=new ThermalExplorer(this);
   this.roadExperience=new RoadExperience(this);
   this.serviceAreas=new ServiceAreaController(this);
   this.install();this.updatePlayState();this.telemetry.record(this.physics.outputs,true);
   this.controlNetwork=new ControlNetworkPanel(()=>({physics:this.physics,charging:this.charging,running:this.running,active:this.active,inputs:this.inputs()}));
   this.routePanel=new RoutePanel(this);
   this.updateReadings(this.physics.outputs);
 }
 install(){
   $('tab-explorer').addEventListener('click',()=>{if(!this.exitH5())return;this.setChartsMode(false);this.setActive(false);});
   $('tab-driving').addEventListener('click',()=>{if(!this.exitH5())return;this.setChartsMode(false);this.setActive(true);this.setBatteryMode(false);this.setEnergyMode(false);});
   $('tab-energy').addEventListener('click',()=>{if(!this.exitH5())return;this.setChartsMode(false);this.setActive(true);this.setBatteryMode(false);this.setEnergyMode(true);});
   $('tab-battery').addEventListener('click',()=>{if(!this.exitH5())return;this.setChartsMode(false);this.setActive(true);this.setEnergyMode(true);this.setBatteryMode(true);this.focusBattery('iso',false);});
   $('energy-from-explorer').addEventListener('click',()=>{if(!this.exitH5())return;this.setChartsMode(false);this.setActive(true);this.setEnergyMode(true);});
   document.querySelectorAll('[data-energy-part]').forEach(button=>button.addEventListener('click',()=>this.focusEnergyPart(button.dataset.energyPart)));
   $('energy-focus-all').addEventListener('click',()=>{this.energyVisual.activePart=null;this.energyVisual.frame.visible=false;this.selectedPowertrain=null;this.updateTechnicalInspector();this.driveCamera('iso');document.querySelectorAll('[data-energy-part]').forEach(b=>b.classList.remove('active'));});
   $('energy-label-toggle').addEventListener('click',()=>{this.setEnergyLabelsVisible(!this.energyVisual.labelsVisible);});
   for(const button of document.querySelectorAll('[data-powertrain-select]'))button.addEventListener('click',()=>this.selectPowertrainPart(button.dataset.powertrainSelect));
   $('pti-close').addEventListener('click',()=>{this.selectedPowertrain=null;this.energyVisual.activePart=null;this.energyVisual.frame.visible=false;this.updateTechnicalInspector();});
   // Selección sobre mallas GLB en ENERGY / Battery Explorer; no interfiere con OrbitControls ni H1.
   const canvas=this.scene.canvas;
   canvas.addEventListener('pointerdown',event=>{if(event.button===0)this.pointerDown={x:event.clientX,y:event.clientY};});
   canvas.addEventListener('pointercancel',()=>{this.pointerDown=null;});
   canvas.addEventListener('pointerup',event=>{
     const start=this.pointerDown;this.pointerDown=null;
     if(!start||event.button!==0||!this.active||(!this.energyMode&&this.h5Mode!=='thermal')||this.chartsMode)return;
     if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return; // arrastre de cámara
     const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
     this.pickPointer.set(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height);
     this.pickRaycaster.setFromCamera(this.pickPointer,this.scene.camera);
     if(this.h5Mode==='thermal'){
       const id=this.thermalExplorer.pick(this.pickRaycaster);
       if(id)this.thermalExplorer.select(id);
     }else{
       const selection=this.energyVisual.pickPart(this.pickRaycaster);
       if(selection)this.selectPowertrainPart(selection.id,{moduleIndex:selection.moduleIndex,object:selection.object});
     }
   });
   $('tab-charging').addEventListener('click',()=>this.enterH5('charging'));
   $('tab-thermal').addEventListener('click',()=>this.enterH5('thermal'));
   $('charge-station').addEventListener('change',e=>{
     if(!this.charging.selectStation(e.target.value)){e.target.value=this.charging.station;return;}
     this.h5Visual.setStation(this.charging.station);this.renderCharging();
   });
   $('charge-target').addEventListener('input',e=>{this.charging.targetSoc=Number(e.target.value)/100;
     $('charge-target-value').textContent=e.target.value+' %';this.renderCharging();});
   $('charge-speed').addEventListener('change',e=>{
     this.chargerSpeed=Number(e.target.value);$('charge-speed-value').textContent='×'+this.chargerSpeed;
   });
   for(const [button,method] of [['charge-connect','connect'],['charge-verify','verify'],
      ['charge-start','start'],['charge-pause','pause'],['charge-stop','stop'],['charge-disconnect','disconnect']]){
     $(button).addEventListener('click',()=>{
       if(method==='connect')this.pause();
       const ok=this.charging[method]();
       if(!ok)this.onStatus('Recarga: operación no permitida en el estado actual.');
       if(method==='disconnect'){
         this.chargeAccumulated=0;this.physics.outputs=this.physics.compute({throttle:0,brake:0});
       }else if(method==='pause'||method==='stop'){
         this.physics.outputs={...this.physics.outputs,chargeGridPowerW:0,chargeBatteryPowerW:0,
           batteryNetPowerW:0,chargeSessionState:this.charging.state};
         this.telemetry.record(this.physics.outputs,true);
       }
       this.h5Visual.setCableConnected(this.charging.state!=='DESCONECTADO');
       this.renderCharging();
     });
   }
   $('thermal-ambient').addEventListener('input',e=>{
     $('thermal-ambient-value').textContent=e.target.value+' °C';
     this.physics.thermal.setAmbient(Number(e.target.value));this.renderThermal();
   });
   $('thermal-control').addEventListener('change',e=>{this.physics.thermal.setMode(e.target.value);this.renderThermal();});
   document.querySelectorAll('[data-thermal-preset]').forEach(button=>button.addEventListener('click',()=>{
     this.pause();const cfg={normal:[25,25],cold:[-8,-8],hot:[48,42]}[button.dataset.thermalPreset];
     this.physics.thermal.reset(...cfg);this.physics.battery.temperatureC=cfg[0];
     $('thermal-ambient').value=String(cfg[1]);$('thermal-ambient-value').textContent=cfg[1]+' °C';
     this.physics.outputs=this.physics.compute({throttle:0,brake:0});this.renderThermal();
   }));
   // H5-only camera detail: visual navigation, no simulation-state changes.
   document.querySelectorAll('[data-h5-detail]').forEach(button=>button.addEventListener('click',()=>{
     if(this.h5Mode!=='thermal')return;
     this.thermalExplorer.select({pump:'pump',radiator:'radiator',plates:'plates'}[button.dataset.h5Detail]);
   }));
   $('thermal-run').addEventListener('click',()=>this.play());
   $('thermal-pause').addEventListener('click',()=>this.pause());
   $('thermal-focus').addEventListener('click',()=>{
     this.thermalExplorer.isolated=false;this.thermalExplorer.restoreVisibility();
     this.driveCamera('iso');this.renderThermal();
   });
   $('thermal-labels').addEventListener('click',()=>{
     this.thermalLabels=!this.thermalLabels;this.h5Visual.setLabelsVisible(this.thermalLabels);
     $('thermal-labels').textContent=this.thermalLabels?'◈ Etiquetas: SÍ':'◇ Etiquetas: NO';
   });
   document.querySelectorAll('[data-thermal-inspect]').forEach(btn=>btn.addEventListener('click',()=>{
     this.thermalExplorer.select(btn.dataset.thermalInspect);
   }));
   $('tab-charts').addEventListener('click',()=>{if(!this.active)this.setActive(true);this.setChartsMode(true);});
   $('analytics-back').addEventListener('click',()=>this.setChartsMode(false));
   $('analytics-play').addEventListener('click',()=>this.play());
   $('analytics-pause').addEventListener('click',()=>this.pause());
   $('analytics-reset').addEventListener('click',()=>this.reset());
   $('analysis-capture-a').addEventListener('click',()=>this.captureAnalysis('A'));
   $('analysis-capture-b').addEventListener('click',()=>this.captureAnalysis('B'));
   $('analysis-clear').addEventListener('click',()=>{
     this.analysisCaptures={A:null,B:null};this.renderEngineeringComparison();
   });
   for(const btn of document.querySelectorAll('[data-battery-view]'))btn.addEventListener('click',()=>{this.batteryCameraView=btn.dataset.batteryView;this.selectPowertrainPart('battery');});
   $('battery-context').addEventListener('click',()=>this.setBatteryIsolated(!this.batteryIsolated));
   $('regen-mode').addEventListener('change',()=>this.updateReadings(this.physics.outputs));
   for(const [field,suffix] of [['bms-initial-soc',' %'],['bms-initial-temp',' °C']]){
     $(field).addEventListener('input',e=>{
       $(field==='bms-initial-soc'?'bms-soc-setting':'bms-temp-setting').textContent=e.target.value+suffix;
     });
   }
   $('battery-apply').addEventListener('click',()=>this.reset());
   $('battery-focus').addEventListener('click',()=>this.selectPowertrainPart('battery'));
   $('battery-modules').addEventListener('click',()=>{
     this.energyVisual.setBatteryModules(!this.energyVisual.modulesOpen);
     this.updateModulesButton();
     if(this.batteryMode)this.selectPowertrainPart('battery');
   });
   document.querySelectorAll('[data-battery-preset]').forEach(button=>button.addEventListener('click',()=>{
     const profiles={normal:[70,25],low:[7,25],high:[94,25]};
     const [soc,temp]=profiles[button.dataset.batteryPreset];
     $('bms-initial-soc').value=String(soc);$('bms-initial-temp').value=String(temp);
     $('bms-soc-setting').textContent=soc+' %';$('bms-temp-setting').textContent=temp+' °C';
     this.reset();
   }));
   $('drive-play').addEventListener('click',()=>this.play());
   $('drive-pause').addEventListener('click',()=>this.pause());
   $('drive-reset').addEventListener('click',()=>this.reset());
   $('drive-scenario').addEventListener('change',e=>{
     if(e.target.value==='route'){if(this.routePanel.start()===false)e.target.value=this.physics.config.scenario;return;}
     this.physics.config.scenario=e.target.value;
     $('drive-grade').disabled=e.target.value!=='manual';
     this.updateReadings(this.physics.outputs);
   });
   $('drive-grade').addEventListener('input',e=>{this.physics.setGrade(+e.target.value);$('grade-value').textContent=(+e.target.value).toFixed(1)+' %';});
   $('drive-payload').addEventListener('input',e=>{this.physics.setPayload(+e.target.value);$('payload-value').textContent=e.target.value+' kg';this.updateReadings(this.physics.outputs);});
   for(const type of ['throttle','brake']){
     $('drive-'+type).addEventListener('input',e=>{$(type+'-value').textContent=e.target.value+' %';});
   }
   for(const btn of document.querySelectorAll('[data-drive-camera]'))btn.addEventListener('click',()=>this.driveCamera(btn.dataset.driveCamera));
   for(const btn of document.querySelectorAll('[data-channel]'))btn.addEventListener('click',()=>{
     this.chart.setChannel(btn.dataset.channel);
     document.querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('active',b===btn));
     const m=TELEMETRY_CHANNELS[btn.dataset.channel];$('chart-title').textContent=`${m.label} (${m.unit})`;
     if(this.chartsMode)this.renderCharts();
   });
   window.addEventListener('keydown',e=>this.keyAction(e,true));
   window.addEventListener('keyup',e=>this.keyAction(e,false));
   window.addEventListener('blur',()=>{this.pressed={throttle:false,brake:false};this.roadExperience?.clear();});
 }
 keyAction(e,down){
   const key=e.key.toLowerCase();
   if(this.serviceAreas?.key(e,down))return;
   if(this.roadExperience?.key(e,down))return;
   // Always release pedals, even if focus moved onto a station selector while holding a key.
   if(!down){
     if(['w','arrowup'].includes(key))this.pressed.throttle=false;
     if(['s','arrowdown'].includes(key))this.pressed.brake=false;
     return;
   }
   if(this.serviceAreas?.session)return;
   if(!this.active || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)return;
   if(['w','arrowup'].includes(key)){this.pressed.throttle=down;e.preventDefault();}
   if(['s','arrowdown'].includes(key)){this.pressed.brake=down;e.preventDefault();}
   if(!down||e.repeat)return;
   if(e.code==='Space'){e.preventDefault();this.running?this.pause():this.play();}
   if(key==='0')this.reset();
 }
 setActive(on){
   if(on)this.explorerXRay?.setEnabled(false);
   if(!on&&!this.exitH5())return;
   if(this.active===on)return;
   this.active=on;this.roadExperience?.syncView();
   if(!on){this.setChartsMode(false);this.setBatteryMode(false);this.setEnergyMode(false);}
   window.__bevActiveModule=on?'driving':'explorer';
   document.querySelector('.shell').classList.toggle('drive-mode',on);
   $('tab-driving').classList.toggle('active',on&&!this.energyMode&&!this.batteryMode);
   $('tab-explorer').classList.toggle('active',!on);
   $('product-mode-title').textContent=on?'DRIVING SIMULATOR / HITO 02':'VEHICLE EXPLORER / HITO 01';
   $('footer-module').textContent=on?'CONDUCCIÓN H2':'INTERFAZ VISUAL H1';
   $('footer-physics').textContent=on?'FÍSICA: LONGITUDINAL ACTIVA':'FÍSICA: NO ACTIVADA EN EXPLORADOR';
   this.visual.setActive(on);
   if(this.routePanel&&!on)this.routePanel.scenery.root.visible=false;
   if(on){
     this.visibility.restore();this.interaction.clear();this.interaction.enabled=false;
     this.scene.useStage($('drive-stage'));
     this.driveCamera('rear',false);
     this.onStatus('Driving Simulator · parámetros de ingeniería');
   }else{
     this.pause();this.pressed={throttle:false,brake:false};
     this.interaction.enabled=true;this.visual.resetWheels();
     this.scene.useStage(this.returnStage);
     this.cameras.reset();
     document.querySelectorAll('.camera-button').forEach(b=>b.classList.toggle('active',b.dataset.view==='iso'));
     $('camera-readout').textContent='CÁMARA · ISOMÉTRICA 3/4';
     this.onStatus('Vehicle Explorer · HITO 1 preservado');
   }
   this.scene.resize();
 }

 /** La seguridad del conector tiene prioridad sobre la navegación. */
 exitH5(){
   if(this.h5Mode==='charging'&&this.charging.state!=='DESCONECTADO'){
     this.onStatus('Antes de salir: detén la sesión y desconecta el cable.');
     this.renderCharging();return false;
   }
   if(this.h5Mode==='charging'&&this.serviceAreas?.session&&!this.serviceAreas.finish())return false;
   this.setH5Mode(null);return true;
 }
 enterH5(mode){
   if(mode==='charging'&&this.route.enabled&&!this.serviceAreas?.session){
     this.onStatus('Estaciona junto a un cargador de la zona de servicio y pulsa E.');return;
   }
   const roadBefore=this.active&&!this.batteryMode&&(!this.h5Mode||this.h5Mode==='thermal');
   if(mode!==this.h5Mode&&!this.exitH5())return;
   this.setChartsMode(false);this.setActive(true);
   this.setBatteryMode(false);this.setEnergyMode(mode==='thermal');
   this.setH5Mode(mode);
   if(mode==='thermal'&&!roadBefore)this.driveCamera('rear',false);
 }
 setH5Mode(mode){
   if(mode===this.h5Mode)return;
   const wasThermal=this.h5Mode==='thermal';
   if(wasThermal&&mode!=='thermal')this.thermalExplorer?.deactivate();
   if(mode==='thermal'&&this.h5Mode!=='thermal')this.energyVisualLabelsBeforeThermal=this.energyVisual.labelsVisible;
   const wasInline=document.querySelector('.shell').classList.contains('route-inline-charging');
   const inlineCharging=mode==='charging'&&this.route.enabled&&this.route.state==='EN ESTACIÓN';
   this.h5Mode=mode;this.roadExperience?.clear();this.roadExperience?.syncView();
   document.querySelector('.shell').classList.toggle('route-inline-charging',inlineCharging);
   if(mode!=='thermal'&&this.energyVisualLabelsBeforeThermal!==undefined){
     this.energyVisual.setLabelsVisible(this.energyVisualLabelsBeforeThermal);
     this.energyVisualLabelsBeforeThermal=undefined;
   }
   this.telemetry.windowS=mode==='charging'?3600:mode==='thermal'?600:60;
   document.querySelector('.shell').classList.toggle('charging-active',mode==='charging');
   document.querySelector('.shell').classList.toggle('thermal-active',mode==='thermal');
   $('charging-panel').hidden=mode!=='charging';$('thermal-panel').hidden=mode!=='thermal';
   $('tab-charging').classList.toggle('active',mode==='charging'&&!inlineCharging);
   $('tab-thermal').classList.toggle('active',mode==='thermal');
   if(mode)$('tab-driving').classList.toggle('active',inlineCharging);
   if(inlineCharging&&this.serviceAreas?.session){this.h5Visual.chargeRoot.visible=true;this.h5Visual.thermalRoot.visible=false;}else this.h5Visual.setMode(mode);
   const channels=mode==='charging' ? ['chargeGridKW','batterySocPct','chargeBatteryKW','chargeEnergyKWh']:
     mode==='thermal'?['thermalBatteryC','thermalMotorC','thermalElectronicsC','thermalAuxKW']:
     ['speedKmh','batterySocPct','batteryNetKW','regenPowerKW'];
   for(const [key,channel] of Object.entries(Object.fromEntries(['speed','soc','power','regen'].map((n,i)=>[n,channels[i]]))))this.overviewCharts[key].setChannel(channel);
   for(const [i,text] of (mode==='charging'?['Potencia red · kW','SOC · %','Carga batería · kW','Energía de red · kWh']:
       mode==='thermal'?['Batería · °C','Motor · °C','Electrónica · °C','Auxiliares · kW']:
       ['Velocidad · km/h','SOC · %','Batería DC · kW','Regeneración · kW']).entries()){
     document.querySelectorAll('.analytics-mini strong')[i].textContent=text;
   }
   this.chart.setChannel(mode==='charging'?'chargeGridKW':mode==='thermal'?'thermalBatteryC':'speedKmh');
   const labels=mode==='charging'?[['POTENCIA RED','kW'],['SOC','%'],['CARGA A BATERÍA','kW'],['ENERGÍA RED','kWh']]:
       mode==='thermal'?[['TEMP. BATERÍA','°C'],['REFRIGERANTE','°C'],['ELECTRÓNICA','°C'],['AUX. TÉRMICOS','kW']]:
       [['VELOCIDAD','km/h'],['SOC','%'],['BATERÍA DC','kW'],['RECUPERACIÓN','kW']];
   document.querySelectorAll('.analytics-stats>div').forEach((card,i)=>{
     card.querySelector('span').textContent=labels[i][0];card.querySelector('small').textContent=labels[i][1];
   });
   $('chart-title').textContent=TELEMETRY_CHANNELS[this.chart.channel].label+' ('+TELEMETRY_CHANNELS[this.chart.channel].unit+')';
   document.querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('active',b.dataset.channel===this.chart.channel));
   this.scene.car.visible=true;
   // H5 usa sus escenarios propios: no superponer carretera/delimitadores de H2.
   this.visual.root.visible=this.active&&(!mode||inlineCharging||mode==='thermal');
   if(mode==='charging'){
     this.pause();this.energyVisual.setEnabled(false);
     if(!inlineCharging){this.driveCamera('iso',false);this.cameras.move(new THREE.Vector3(-8.1,4.25,6.8),new THREE.Vector3(-1,.9,.4),false);}
     $('product-mode-title').textContent=inlineCharging?'DRIVING SIMULATOR / CDMX–PUEBLA':'CHARGING SIMULATOR / HITO 05';
     $('drive-stage-caption').textContent='RECARGA AC/DC · PUERTO Y CABLE CONCEPTUALES · NO GEOMETRÍA OEM';
     $('footer-module').textContent='RECARGA H5';this.renderCharging();
   }else if(mode==='thermal'){
     // Same car, camera, road and physics clock as Energy. No pause or reframe.
     this.energyMode=true;document.querySelector('.shell').classList.add('energy-active');
     this.energyVisual.setEnabled(true);this.energyPanel.setActive(false);
     this.energyVisual.setLabelsVisible(false);
     $('tab-energy').classList.remove('active');
     this.thermalExplorer?.activate();
     $('product-mode-title').textContent='TÉRMICA / VEHÍCULO EN FUNCIONAMIENTO';
     $('drive-stage-caption').textContent='TEMPERATURAS DEL MODELO TÉRMICO COMPARTIDO';
     $('footer-module').textContent='GESTIÓN TÉRMICA EN RUTA';this.renderThermal();
   }else if(this.active){
     this.energyVisual.setEnabled(this.energyMode);
     this.energyVisual.setLabelsVisible(this.energyVisualLabelsBeforeThermal ?? this.energyVisual.labelsVisible);
     $('product-mode-title').textContent='DRIVING SIMULATOR / HITO 02';
     $('drive-stage-caption').textContent='MODELO LONGITUDINAL · REGENERACIÓN H3 · BMS H4';
     $('footer-module').textContent='CONDUCCIÓN H2';
     if(!wasInline&&!wasThermal)this.driveCamera('rear',false);
   }
   const legend=$('thermal-legend');if(legend)legend.hidden=mode!=='thermal';
   if(this.active)this.scene.resize();
 }
 renderCharging(){
   const c=this.charging.snapshot(),battery=this.physics.battery;
   const fmt=(w)=>(w/1000).toFixed(2)+' kW';
   const compatibility=evaluateBoltCharging(this.charging,this.physics);
   $('charge-compat-status').textContent=compatibility.status;
   $('charge-compat-status').dataset.status=compatibility.status;
   $('charge-compat-reason').textContent=compatibility.reason;
   $('charge-compat-path').textContent=compatibility.path;
   $('charge-compat-ceiling').textContent=compatibility.dcCeilingW===null?'—':fmt(compatibility.dcCeilingW)+(compatibility.available?'':' · NO DISPONIBLE');
   $('charge-compat-limiter').textContent=compatibility.limitingBy.map(item=>item.label).join(' + ')||'—';
   $('charge-compat-net').textContent=compatibility.batteryNetCeilingW===null?'—':fmt(compatibility.batteryNetCeilingW);
   $('charge-compat-bms').textContent=compatibility.bmsChargeLimitW===undefined?'':'BMS admite hasta '+fmt(compatibility.bmsChargeLimitW)+' netos; auxiliares previstos: '+fmt(compatibility.auxiliaryW)+'.';
   const limits=$('charge-compat-limits');
   limits.replaceChildren(...compatibility.limits.map(item=>{
     const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');
     label.textContent=item.label;value.textContent=fmt(item.watts);
     if(compatibility.limitingBy.includes(item))row.classList.add('is-limiting');
     row.append(label,value);return row;
   }));
   $('charge-state').textContent=c.state;
   $('charge-soc').textContent=(c.soc*100).toFixed(2)+' %';$('charge-grid').textContent=fmt(c.gridPowerW);
   $('charge-soc-fill').style.width=(100*c.soc).toFixed(2)+'%';
   $('charge-dc').textContent=fmt(c.vehicleDcPowerW);
   $('charge-net').textContent=fmt(c.batteryReceivedW);
   $('charge-vi').textContent=(battery?.voltageV??0).toFixed(1)+' V / '+(battery?.currentA??0).toFixed(1)+' A';
   $('charge-temp').textContent=(battery?.temperatureC??0).toFixed(1)+' °C';
   $('charge-time').textContent=(c.elapsedS/60).toFixed(1)+' min';
   const remainAh=Math.max(0,c.targetSoc-c.soc)*(battery?.settings.capacityAh??188.57);
   const acceptedCurrentA=Math.max(0,-(battery?.currentA??0));
   $('charge-eta').textContent=c.state==='CARGANDO'&&acceptedCurrentA>1?
     'ETA instantánea: '+(remainAh/acceptedCurrentA*60).toFixed(0)+' min':
     c.state==='FINALIZADO'?'Objetivo alcanzado':'ETA: --';
   $('charge-energy').textContent=(c.gridWh/1000).toFixed(2)+' / '+(c.batteryStoredWh/1000).toFixed(2)+' kWh';
   $('charge-message').textContent=c.reason;
   const states={connect:c.state==='DESCONECTADO',verify:c.state==='CONECTADO',
     start:['LISTO','PAUSADO'].includes(c.state),pause:c.state==='CARGANDO',
     stop:['CARGANDO','PAUSADO','FINALIZADO'].includes(c.state),
     disconnect:['LISTO','CONECTADO','FINALIZADO','FALLO'].includes(c.state)};
   const routePermit=this.route.canCharge(this.physics.distanceM,this.physics.speedMS,this.charging.station);
   for(const key of ['connect','verify','start'])states[key]=states[key]&&routePermit;
   if(!routePermit)$('charge-message').textContent='Estaciona correctamente y detén el vehículo junto al cargador.';
   for(const [k,on] of Object.entries(states))$('charge-'+k).disabled=!on;
   $('charge-station').disabled=this.route.enabled||c.state!=='DESCONECTADO';
   this.h5Visual.setCableConnected(c.state!=='DESCONECTADO');
 }
 renderThermal(){
   const t=this.physics.thermal.snapshot;
   const f=v=>v.toFixed(1)+' °C';
   for(const [id,v] of Object.entries({battery:t.batteryC,coolant:t.batteryCoolantC,motor:t.motorC,
    inverter:t.electronicsC,'power-coolant':t.powerCoolantC}))$('thermal-'+id).textContent=f(v);
   $('thermal-aux').textContent=t.auxiliaryPowerW.toFixed(0)+' W';$('thermal-state').textContent=t.mode;
   const a=t.actuators;
   $('thermal-actuators').textContent=`Bomba batería: ${a.batteryPump?'ON':'OFF'} · Bomba electrónica: ${a.powerPump?'ON':'OFF'} · Chiller: ${a.chiller?'ON':'OFF'} · Calentador HV: ${a.heater?'ON':'OFF'} · Ventilador: ${a.fan?'ON':'OFF'}`;
   this.h5Visual.update(t,this.physics.timeS);
   this.thermalExplorer?.update(t);
 }
 setEnergyMode(enabled){
   const on=!!enabled&&this.active;
   this.energyMode=on;this.roadExperience?.clear();this.roadExperience?.syncView();
   document.querySelector('.shell').classList.toggle('energy-active',on);
   $('tab-energy').classList.toggle('active',on&&!this.batteryMode);
   $('tab-driving').classList.toggle('active',this.active&&!on&&!this.batteryMode);
   $('product-mode-title').textContent=on?'ENERGY FLOW / HITO 03':this.active?'DRIVING SIMULATOR / HITO 02':'VEHICLE EXPLORER / HITO 01';
   $('footer-module').textContent=on?'FLUJO ENERGÉTICO H3':this.active?'CONDUCCIÓN H2':'INTERFAZ VISUAL H1';
   $('drive-stage-caption').textContent=on?'H3.1 · MODELOS 3D ADAPTADOS DE MG4 Y OTROS · NO OEM BOLT':'MODELO LONGITUDINAL · REGENERACIÓN CONFIGURABLE H3';
   this.energyVisual.setEnabled(on);
   this.updateTechnicalInspector();
   this.energyPanel.setActive(on&&!this.batteryMode);
   if(on){this.energyPanel.update(this.physics.outputs);this.energyVisual.update(this.physics.outputs,this.physics.timeS);}
   if(this.active){this.onStatus(on?'HITO 3 · Potencia y regeneración':'HITO 2 · Física longitudinal');this.scene.resize();}
 }
 updateModulesButton(){
   const btn=$('battery-modules');
   btn.textContent=this.energyVisual.modulesOpen?'▣ Cerrar módulos / ver GLB':'▤ Mostrar módulos didácticos';
   btn.setAttribute('aria-pressed',String(this.energyVisual.modulesOpen));
 }
 setBatteryMode(enabled){
   const on=!!enabled&&this.active;
   this.batteryMode=on;this.roadExperience?.clear();this.roadExperience?.syncView();
   if(!on){this.energyVisual.setBatteryModules(false);this.updateModulesButton();}
   document.querySelector('.shell').classList.toggle('battery-active',on);
   $('battery-camera-toolbar').hidden=!on;
   if(on){
     if(!this.batteryPriorControls)this.batteryPriorControls={minDistance:this.cameras.controls.minDistance,maxPolarAngle:this.cameras.controls.maxPolarAngle};
     this.cameras.controls.minDistance=.72;this.cameras.controls.maxPolarAngle=Math.PI*.84;
     this.setBatteryIsolated(true,false);
     this.energyVisual.loadModels().then(()=>{if(this.batteryMode&&this.selectedPowertrain?.id==='battery')this.focusBattery(this.batteryCameraView,false);});
   }else{
     this.scene.car.visible=true;this.visual.root.visible=this.active;
     if(this.batteryPriorControls){this.cameras.controls.minDistance=this.batteryPriorControls.minDistance;this.cameras.controls.maxPolarAngle=this.batteryPriorControls.maxPolarAngle;this.batteryPriorControls=null;}
   }
   this.batteryExplorer.setActive(on);
   if(on){this.selectedPowertrain={id:'battery',moduleIndex:null};this.energyVisual.focusPart('battery');}
   this.updateTechnicalInspector();
   this.energyPanel.setActive(this.energyMode&&!on);
   $('tab-battery').classList.toggle('active',on);
   $('tab-energy').classList.toggle('active',this.energyMode&&!on);
   $('tab-driving').classList.toggle('active',this.active&&!this.energyMode&&!on);
   if(on){
     $('product-mode-title').textContent='BATTERY EXPLORER / HITO 04';
     $('footer-module').textContent='BATERÍA + BMS H4';
     $('drive-stage-caption').textContent='BATTERY EXPLORER · THEVENIN 1RC / SUPUESTOS ACADÉMICOS';
     this.batteryExplorer.update(this.physics.outputs);
     this.onStatus('HITO 4 · SOC, tensión, corriente y límites BMS');
   }else if(this.active){
     $('product-mode-title').textContent=this.energyMode?'ENERGY FLOW / HITO 03':'DRIVING SIMULATOR / HITO 02';
     $('footer-module').textContent=this.energyMode?'FLUJO ENERGÉTICO H3':'CONDUCCIÓN H2';
     $('drive-stage-caption').textContent=this.energyMode?'H3.1 · MODELOS 3D ADAPTADOS DE MG4 Y OTROS · NO OEM BOLT':'MODELO LONGITUDINAL · REGENERACIÓN H3 · LIMITADA POR BMS H4';
   }
   if(this.active)this.scene.resize();
 }
  /** Ficha técnica contextual y accesible por mouse o botones. */
  updateTechnicalInspector(){
    const show=this.active&&this.energyMode&&this.h5Mode!=='thermal'&&!!this.selectedPowertrain;
    $('powertrain-inspector').hidden=!show;
    if(!show)return;
    const {id,moduleIndex}=this.selectedPowertrain;
    const card=getPowertrainCard(id,this.physics.outputs,moduleIndex);
    if(!card)return;
    $('pti-title').textContent=card.name;
    $('pti-kind').textContent=card.kind;
    $('pti-description').textContent=card.description;
    $('pti-source').textContent=card.reference;
    const fill=(target,entries)=>{
      const dl=$(target);dl.replaceChildren();
      for(const [label,value] of entries){
        const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
        dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);
      }
    };
    fill('pti-facts',card.staticFacts);fill('pti-metrics',card.metrics);
    document.querySelectorAll('[data-powertrain-select]').forEach(button=>button.classList.toggle('active',button.dataset.powertrainSelect===id));
    document.querySelectorAll('[data-energy-part]').forEach(button=>button.classList.toggle('active',button.dataset.energyPart===id));
  }
  selectPowertrainPart(id,{moduleIndex=null,object=null}={}){
    if(!this.active||!this.energyMode||!this.energyVisual.parts[id])return;
    this.selectedPowertrain={id,moduleIndex};
    this.energyVisual.focusPart(id);
    if(object&&moduleIndex)this.energyVisual.highlightObject(object);
    this.updateTechnicalInspector();
    const target=id==='battery'&&moduleIndex ? object :
      (id==='battery'&&this.energyVisual.modulesOpen?this.energyVisual.modulesGroup:
       (this.energyVisual.parts[id].model||this.energyVisual.parts[id].placeholder));
    if(id==='battery'&&moduleIndex){this.framePowertrainObject(target,'iso');}
    else if(this.batteryMode)this.framePowertrainObject(target,id==='battery'?this.batteryCameraView:'iso');
    else this.focusEnergyPartCamera(id);
    this.onStatus(`Inspeccionando: ${moduleIndex?'Módulo didáctico '+moduleIndex:this.energyVisual.parts[id].label}`);
  }
  /** Encuadre de una geometría real, no distancia fija. */
  framePowertrainObject(object,view='iso',animate=true){
    if(!object)return;
    const bounds=new THREE.Box3().setFromObject(object);if(bounds.isEmpty())return;
    const center=bounds.getCenter(new THREE.Vector3());
    const dir=({iso:[1,1.45,1.4],top:[.06,2,.10],side:[1,.32,.45]}[view]||[1,1.45,1.4]);
    const direction=new THREE.Vector3(...dir).normalize();
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
    const up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const vfov=THREE.MathUtils.degToRad(this.scene.camera.fov)*.5;
    const tanV=Math.tan(vfov),tanH=tanV*Math.max(.55,this.scene.camera.aspect);
    let required=.4;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const offset=new THREE.Vector3(x,y,z).sub(center);
      required=Math.max(required,offset.dot(direction)+Math.abs(offset.dot(right))/tanH,offset.dot(direction)+Math.abs(offset.dot(up))/tanV);
    }
    const distance=THREE.MathUtils.clamp(required*1.22+.20,this.cameras.controls.minDistance+0.1,this.cameras.controls.maxDistance);
    this.cameras.move(center.clone().addScaledVector(direction,distance),center,animate);
  }
  focusEnergyPartCamera(id){
    const part=this.energyVisual.parts[id];if(!part)return;
    const target=new THREE.Vector3();part.anchor.getWorldPosition(target);
    const distance=Math.max(this.cameras.controls.minDistance,2.7);
    const dir=new THREE.Vector3().subVectors(this.scene.camera.position,this.cameras.controls.target).normalize();
    this.cameras.move(target.clone().addScaledVector(dir,distance),target,true);
  }
  setEnergyLabelsVisible(visible){
   this.energyVisual.setLabelsVisible(visible);
   const button=$('energy-label-toggle');button.setAttribute('aria-pressed',String(!!visible));
   button.textContent=visible?'◈ Etiquetas: SÍ':'◇ Etiquetas: NO';
  }
  setChartsMode(on){
   if(on&&!this.active)return;
   this.chartsMode=!!on;
   const shell=document.querySelector('.shell');shell.classList.toggle('charts-active',this.chartsMode);
   $('charts-workspace').hidden=!this.chartsMode;
   $('tab-charts').classList.toggle('active',this.chartsMode);
   for(const id of ['tab-driving','tab-energy','tab-battery','tab-charging','tab-thermal'])if(this.chartsMode)$(id).classList.remove('active');
   if(!this.chartsMode&&this.active){
     const inlineRoute=this.h5Mode==='charging'&&this.route.enabled&&this.route.state==='EN ESTACIÓN';
     $('tab-battery').classList.toggle('active',this.batteryMode);
     $('tab-energy').classList.toggle('active',this.energyMode&&!this.batteryMode&&this.h5Mode!=='thermal');
     $('tab-driving').classList.toggle('active',inlineRoute||(!this.energyMode&&!this.batteryMode&&!this.h5Mode));
     $('tab-charging').classList.toggle('active',this.h5Mode==='charging'&&!inlineRoute);
     $('tab-thermal').classList.toggle('active',this.h5Mode==='thermal');
     this.scene.resize();
   }
   this.chart.windowS=this.h5Mode==='charging'?3600:this.h5Mode==='thermal'?600:60;
   $('chart-window-label').textContent=this.h5Mode==='charging'?'VENTANA MÓVIL · 60 min':this.h5Mode==='thermal'?'VENTANA MÓVIL · 10 min':'VENTANA MÓVIL · 60 s';
   for(const chart of Object.values(this.overviewCharts))chart.windowS=this.chart.windowS;
   if(this.chartsMode){this.renderCharts();this.onStatus('Centro de gráficas · historial dinámico de 60 s');}
   if(this.chartsMode)this.renderEngineeringComparison();
  }
  captureAnalysis(slot){
    const mode=this.h5Mode||(this.batteryMode?'battery':this.energyMode?'energy':'driving');
    const snapshot=captureEngineeringSnapshot({
      physics:this.physics,charging:this.charging,mode,runId:this.analysisRunId
    });
    if(!snapshot)return;
    this.analysisCaptures[slot]=snapshot;
    this.renderEngineeringComparison();
  }
  renderEngineeringComparison(){
    const {A,B}=this.analysisCaptures;
    const {rows,sameRun}=compareEngineeringSnapshots(A,B);
    const stamp=entry=>entry?`${entry.context} · t = ${entry.timeS?.toFixed(1)??'—'} s`:'sin capturar';
    $('analysis-status').textContent=`A: ${stamp(A)} | B: ${stamp(B)}`+
      (A&&B&&!sameRun?' · RESET entre capturas: sin diferencia de energías acumuladas.':'');
    const format=(value,digits,signed=false)=>value===null?'—':
      `${signed&&value>0?'+':''}${Math.abs(value)<10**(-digits)/2?0:value.toFixed(digits)}`;
    const body=$('analysis-rows');
    body.replaceChildren(...rows.map(row=>{
      const tr=document.createElement('tr');
      const th=document.createElement('th');th.scope='row';th.textContent=`${row.label} (${row.unit})`;tr.append(th);
      for(const [index,value] of [row.a,row.b,row.delta].entries()){
        const td=document.createElement('td');
        td.textContent=format(value,row.digits,index===2);
        tr.append(td);
      }
      return tr;
    }));
  }
  renderCharts(){
   if(!this.chartsMode)return;
   const samples=this.telemetry.samples;
   this.chart.render(samples);
   for(const chart of Object.values(this.overviewCharts))chart.render(samples);
   const o=this.physics.outputs;
   if(this.h5Mode==='charging'){
     const c=this.charging.snapshot();
     $('analytics-speed').textContent=(c.gridPowerW/1000).toFixed(1);
     $('analytics-soc').textContent=(c.soc*100).toFixed(1);
     $('analytics-battery').textContent=(c.batteryReceivedW/1000).toFixed(1);
     $('analytics-regen').textContent=(c.gridWh/1000).toFixed(2);
   }else if(this.h5Mode==='thermal'){
     const t=this.physics.thermal.snapshot;
     $('analytics-speed').textContent=t.batteryC.toFixed(1);
     $('analytics-soc').textContent=t.batteryCoolantC.toFixed(1);
     $('analytics-battery').textContent=t.electronicsC.toFixed(1);
     $('analytics-regen').textContent=(t.auxiliaryPowerW/1000).toFixed(2);
   }else{
     $('analytics-speed').textContent=o.speedKmh.toFixed(1);
     $('analytics-soc').textContent=(o.batterySoc*100).toFixed(1);
     $('analytics-battery').textContent=(o.batteryNetPowerW/1000).toFixed(1);
     $('analytics-regen').textContent=(o.dcRegeneratedPowerW/1000).toFixed(1);
   }
  }
  setBatteryIsolated(isolated,refocus=true){
   this.batteryIsolated=!!isolated;
   if(!this.batteryMode)return;
   this.scene.car.visible=!this.batteryIsolated;
   this.visual.root.visible=!this.batteryIsolated;
   const btn=$('battery-context');btn.setAttribute('aria-pressed',String(!this.batteryIsolated));
   btn.textContent=this.batteryIsolated?'◈ Mostrar vehículo':'◎ Aislar batería';
   if(refocus){if(this.batteryIsolated)this.focusBattery(this.batteryCameraView);else this.driveCamera('iso');}
  }
  /** Cámara encuadrada al volumen real del GLB (no distancia de zoom fija). */
  focusBattery(view='iso',animate=true){
   if(!this.batteryMode)return;
   this.batteryCameraView=view;
   for(const b of document.querySelectorAll('[data-battery-view]'))b.classList.toggle('active',b.dataset.batteryView===view);
   const part=this.energyVisual.parts.battery;
   this.energyVisual.focusPart('battery');
   const object=this.energyVisual.modulesOpen?this.energyVisual.modulesGroup:(part.model||part.placeholder);
   const bounds=new THREE.Box3().setFromObject(object);
   if(bounds.isEmpty())return;
   const center=bounds.getCenter(new THREE.Vector3());
   const dir=({iso:[1,1.45,1.4],top:[.06,2,.10],side:[1,.32,.45]}[view]||[1,1.45,1.4]);
   const direction=new THREE.Vector3(...dir).normalize();
   const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
   const up=new THREE.Vector3().crossVectors(direction,right).normalize();
   const vfov=THREE.MathUtils.degToRad(this.scene.camera.fov)*.5;
   const tanV=Math.tan(vfov),tanH=tanV*Math.max(.55,this.scene.camera.aspect);
   let required=.4;
   // Encuadre exacto de las ocho esquinas, incluyendo su profundidad.
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
     const offset=new THREE.Vector3(x,y,z).sub(center);
     required=Math.max(required,offset.dot(direction)+Math.abs(offset.dot(right))/tanH,offset.dot(direction)+Math.abs(offset.dot(up))/tanV);
   }
   const distance=THREE.MathUtils.clamp(required*1.22+.20,this.cameras.controls.minDistance+0.1,this.cameras.controls.maxDistance);
   this.cameras.move(center.clone().addScaledVector(direction,distance),center,animate);
  }
  focusEnergyPart(id){this.selectPowertrainPart(id);}
  driveCamera(view,animate=true){
   if(!this.active)return;
   this.camView=view;
   const roadX=this.roadExperience?.viewOffset??0;
   const target=new THREE.Vector3(roadX,.85,0);
   const positions={rear:[-2.6,2.55,-8.6],iso:[-6.8,3.8,-6.9],side:[-8,2.1,.45]};
   const position=new THREE.Vector3(...(positions[view]||positions.rear));position.x+=roadX;
   this.cameras.move(position,target,animate);
   document.querySelectorAll('[data-drive-camera]').forEach(b=>b.classList.toggle('active',b.dataset.driveCamera===view));
 }
 play(){if(this.serviceAreas?.session||!this.active||this.charging.state!=='DESCONECTADO'||(this.route.enabled&&!['VIAJANDO','APROXIMACIÓN','FRENANDO DESTINO'].includes(this.route.state)))return;this.running=true;this.updatePlayState();}
 pause(){this.running=false;this.accumulated=0;this.pressed={throttle:false,brake:false};this.roadExperience?.clear();this.updatePlayState();}
 updatePlayState(){
   $('drive-state').textContent=this.running?'SIMULANDO':'PAUSA';
   $('drive-state').classList.toggle('running',this.running);
   $('analytics-state').textContent=this.running?'SIMULANDO':'PAUSA';
   $('drive-play').disabled=this.running||this.route?.state==='FINALIZADO';
   $('drive-pause').disabled=!this.running;
 }
 reset(){
   if(this.charging.state!=='DESCONECTADO'){this.onStatus('Desconecta el cable antes de RESET.');return false;}
   this.pause();
   if(!this.route.reset({clearVisits:true})){this.onStatus('RESET no completado: no se pudo borrar el registro guardado de estaciones.');this.routePanel.render();return false;}
   const destination=$('drive-destination');if(destination)destination.hidden=true;
   this.physics.config.scenario='flat';this.physics.config.gradePct=0;this.physics.config.allowReverse=false;this.physics.config.liftOffRegen=false;
   this.physics.setPayload(MODEL_ASSUMPTIONS.basePayloadKg);
   this.physics.setBatteryInitial({soc:+$('bms-initial-soc').value/100,temperatureC:+$('bms-initial-temp').value});
   this.serviceAreas?.reset();this.physics.reset();this.charging.reset();this.roadExperience?.reset();this.analysisRunId++;this.renderEngineeringComparison();
   this.routePanel.render();this.routePanel.scenery.root.visible=false;
   if(document.querySelector('.shell').classList.contains('route-inline-charging'))this.setH5Mode(null);
   this.chargeAccumulated=0;this.telemetry.reset();this.telemetry.record(this.physics.outputs,true);
   $('drive-throttle').value='0';$('drive-brake').value='0';
   $('throttle-value').textContent='0 %';$('brake-value').textContent='0 %';
   $('drive-scenario').value='flat';$('drive-grade').value='0';$('drive-grade').disabled=true;
   $('grade-value').textContent='0.0 %';$('drive-payload').value=String(MODEL_ASSUMPTIONS.basePayloadKg);
   $('payload-value').textContent=MODEL_ASSUMPTIONS.basePayloadKg+' kg';
   this.physics.thermal.setAmbient(Number($('thermal-ambient').value));
   this.physics.thermal.setMode($('thermal-control').value);
   this.visual.update(0,0);this.updateReadings(this.physics.outputs);
   this.energyPanel.update(this.physics.outputs);
   this.batteryExplorer.update(this.physics.outputs);
   if(this.energyMode)this.energyVisual.update(this.physics.outputs,this.physics.timeS);
   this.updateTechnicalInspector();
   this.renderCharts();return true;
 }
 inputs(dt=0){
   if(this.serviceAreas?.session)return {throttle:0,brake:1,regenMode:$('regen-mode').value};
   const throttle=this.pressed.throttle?1:(+$('drive-throttle').value/100);
   const brake=this.pressed.brake?1:(+$('drive-brake').value/100);
   if(this.route.enabled){
     const regenMode=$('regen-mode').value,v=this.physics.speedMS;
     if(this.route.state==='FRENANDO DESTINO')return this.route.destinationBrake.commands(this.physics,regenMode,dt);
     if(this.route.state==='FINALIZADO')return {throttle:0,brake:1,regenMode};
     // Manual travel; only an explicitly requested stop enables the approach controller.
     if(this.route.state==='APROXIMACIÓN'&&this.route.stopAssist?.active)return this.route.stopAssist.commands(this.physics,this.route.position(this.physics.distanceM),{throttle:this.pressed.throttle?1:0,brake:this.pressed.brake?1:0},regenMode,dt);
     if(this.pressed.brake){
       if(this.pressed.throttle||v>0)return {throttle:0,brake:1,regenMode};
       return {throttle:1,brake:0,direction:-1,regenMode};
     }
     if(this.pressed.throttle)return v<0?{throttle:0,brake:1,regenMode}:{throttle:1,brake:0,direction:1,regenMode};
     return {throttle:0,brake:0,regenMode};
   }
   return {throttle,brake,regenMode:$('regen-mode').value};
 }
 tick(deltaS,nowMs){
   if(!this.active){this.roadExperience?.syncView();return;}
   if(this.roadExperience)this.roadExperience.lastNow=nowMs;
   if(this.h5Mode==='charging'&&this.charging.state==='CARGANDO'){
     this.chargeAccumulated+=Math.min(.05,deltaS)*this.chargerSpeed;
     let iterations=0;
     while(this.chargeAccumulated>=.1-1e-9 && iterations<200 && this.charging.state==='CARGANDO'){
       this.charging.step(.1);this.chargeAccumulated-=.1;iterations++;
       this.telemetry.record(this.physics.outputs);
     }
     if(this.charging.state!=='CARGANDO')this.chargeAccumulated=0;
   }
   if(this.serviceAreas?.session)this.roadExperience.serviceTraffic(deltaS);
   if(this.running){
     this.accumulated+=Math.min(deltaS,.1);
     let steps=0;
     while(this.accumulated>=MODEL_ASSUMPTIONS.fixedStepS && steps<8){
       const previousDistance=this.physics.distanceM;
       const result=this.physics.step(MODEL_ASSUMPTIONS.fixedStepS,this.inputs(MODEL_ASSUMPTIONS.fixedStepS));
       this.serviceAreas?.constrainMotion(previousDistance);
       this.telemetry.record(result);
       this.accumulated-=MODEL_ASSUMPTIONS.fixedStepS;steps++;
       if(this.roadExperience?.step(MODEL_ASSUMPTIONS.fixedStepS))break;
       const routeEvent=this.route.update(this.physics);
       if(routeEvent){this.pause();
         if(routeEvent==='end')this.showDestination();
         if(routeEvent==='arrival'){
           this.charging.selectStation(this.route.pending.equipment);$('charge-station').value=this.charging.station;this.h5Visual.setStation(this.charging.station);
           this.enterH5('charging');this.onStatus('Llegada registrada y vehículo detenido. Puedes conectar y verificar la recarga.');
         }else this.onStatus(this.route.event);
         break;
       }
     }
     if(steps>=8)this.accumulated=0; // evita espiral de simulación si se congela una pestaña
     this.visual.update(this.physics.distanceM,this.physics.distanceM,this.route);
     if(this.energyMode)this.energyVisual.update(this.physics.outputs,this.physics.timeS);
   }
   this.scene?.visualEnvironment?.assets?.updateDistance(this.physics.distanceM,this.route);
   const inlineStop=this.h5Mode==='charging'&&this.route.enabled&&this.route.state==='EN ESTACIÓN';
   this.routePanel.scenery.update(this.route,this.physics.distanceM,(!this.h5Mode||inlineStop||this.h5Mode==='thermal')&&!this.batteryMode);
   if(nowMs-this.lastDraw>100){
     this.lastDraw=nowMs;
     this.updateReadings(this.physics.outputs);
     if(this.energyMode)this.energyPanel.update(this.physics.outputs);
     if(this.batteryMode)this.batteryExplorer.update(this.physics.outputs);
     if(this.selectedPowertrain&&this.energyMode)this.updateTechnicalInspector();
     if(this.h5Mode==='charging')this.renderCharging();
     if(this.h5Mode==='thermal')this.renderThermal();
     this.renderCharts();
     this.routePanel.render();
   }
   this.serviceAreas?.update();
   this.roadExperience?.update(nowMs);
 }
 showDestination(){
   const message='Se llegó al destino',element=$('drive-destination');if(element){element.textContent=message;element.hidden=false;}
   if(typeof CustomEvent!=='undefined')document.dispatchEvent?.(new CustomEvent('bev:destination-arrived',{detail:{message,distanceM:this.physics.distanceM,timeS:this.physics.timeS}}));
 }
 updateReadings(o){
   $('drive-speed-hud').textContent=o.speedKmh.toFixed(0);
   $('read-speed').textContent=o.speedKmh.toFixed(1);
   $('read-accel').textContent=o.accelerationMS2.toFixed(2);
   $('read-torque').textContent=o.torqueNm.toFixed(0);
   $('read-power').textContent=(o.mechanicalPowerW/1000).toFixed(1);
   $('read-grade').textContent=(this.physics.gradeForScenario()).toFixed(1);
   $('read-distance').textContent=(o.distanceM/1000).toFixed(3);
   const grade=this.physics.gradeForScenario();
   $('hud-gradient').textContent=grade>0.1?`SUBIDA +${grade.toFixed(1)} %`:grade<-.1?`BAJADA ${grade.toFixed(1)} %`:'CARRETERA PLANA';
 }
}
