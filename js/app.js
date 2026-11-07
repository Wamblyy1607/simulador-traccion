import {ExplorerXRay} from './explorer-xray.js';
import {PresentationHUD} from './presentation/hud.js';
import {DrivingController} from './driving-controller.js';
import {SceneManager} from './scene-manager.js';
import {CameraManager,VIEW_LABELS} from './camera-manager.js';
import {ComponentRegistry} from './component-registry.js';
import {VisibilityManager} from './visibility-manager.js';
import {InteractionManager} from './interaction-manager.js';

window.__bevBootStarted=true;
const byId=id=>document.getElementById(id);
const stage=byId('stage');
const loading=byId('loading');
const setStatus=message=>byId('global-status').textContent=message;
const setLoad=(title,message,progress)=>{
  byId('load-title').textContent=title;
  byId('load-text').textContent=message;
  if(progress!==undefined)byId('load-progress').style.width=`${Math.round(progress*100)}%`;
};
let scene=null,cameras=null,registry=null,visibility=null,interaction=null,activeItem=null,driving=null,presentation=null,explorerXRay=null;
window.__bevActiveModule='explorer';

function updateSelection(item){
  activeItem=item;
  byId('empty-selection').classList.toggle('hidden',!!item);
  byId('selected-panel').classList.toggle('hidden',!item);
  if(item){
    byId('selected-title').textContent=item.title;
    byId('selected-category').textContent=item.category;
    byId('selected-availability').textContent=visibility?.isolated && item.id==='windscreen' ? 'Cristal resaltado temporalmente' : (item.representation||'Geometría del GLB');
    byId('selected-description').textContent=item.description;
    byId('isolate-inspector').textContent=visibility?.isolated?'Mostrar todo':'Aislar';
    setStatus(`Inspeccionando: ${item.title}`);
  }else{
    setStatus('Vehículo completo · sin selección');
  }
  document.querySelectorAll('.component-item').forEach(el=>el.classList.toggle('active',el.dataset.component===item?.id));
}
function populateCatalog(){
  const list=byId('component-list');list.replaceChildren();
  const query=byId('catalog-search').value.trim().toLocaleLowerCase('es');
  let count=0;
  for(const item of registry.items){
    if(!(`${item.title} ${item.category}`.toLocaleLowerCase('es').includes(query)))continue;
    count++;
    const button=document.createElement('button');button.className='component-item';
    button.type='button';button.dataset.component=item.id;
    button.title=`Inspeccionar ${item.title}`;
    const mark=document.createElement('span');mark.className='symbol';mark.textContent=item.icon;if(item.xrayPart)mark.style.color='#'+item.color.toString(16).padStart(6,'0');
    const label=document.createElement('span');label.className='item-name';label.textContent=item.title;
    const arrow=document.createElement('span');arrow.textContent='›';
    button.append(mark,label,arrow);
    button.addEventListener('click',()=>{if(visibility.isolated)visibility.restore();interaction.select(item);cameras.focus(item.anchors);});
    list.append(button);
  }
  if(!count){const empty=document.createElement('p');empty.textContent='No se encontraron piezas.';empty.style.cssText='color:#8399ad;font-size:12px;padding:12px';list.append(empty);}
  byId('catalog-count').textContent=String(count);
  document.querySelectorAll('.component-item').forEach(el=>el.classList.toggle('active',el.dataset.component===activeItem?.id));
}
function setCamera(view){
  cameras.preset(view);
  document.querySelectorAll('.camera-button').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  byId('camera-readout').textContent=`CÁMARA · ${VIEW_LABELS[view]||'LIBRE'}`;
}
function resetVehicle(){
  if(!visibility)return;
  visibility.restore();interaction.clear();cameras.reset();
  document.querySelectorAll('.camera-button').forEach(button=>button.classList.toggle('active',button.dataset.view==='iso'));
  byId('camera-readout').textContent='CÁMARA · ISOMÉTRICA 3/4';
  setStatus('Vehículo restaurado');
}
function toggleIsolate(){
  if(!activeItem)return;
  if(visibility.isolated){visibility.restore();setStatus('Componentes restaurados');}
  else if(visibility.isolate(activeItem)){setStatus(`Aislado: ${activeItem.title}`);}
  else{setStatus('No hay geometría visible para aislar en esta pieza');}
  byId('isolate-inspector').textContent=visibility.isolated?'Mostrar todo':'Aislar';
  byId('selected-availability').textContent=visibility.isolated && activeItem.id==='windscreen'?'Cristal resaltado temporalmente':(activeItem.representation||'Geometría del GLB');
}
function doAction(action,button){
  if(action==='help'){openHelp();return;}
  if(!cameras)return;
  switch(action){
    case 'xray':explorerXRay?.setEnabled(!explorerXRay.enabled);break;
    case 'view':setCamera(button.dataset.view||'iso');break;
    case 'catalog':byId('catalog-search').focus();byId('catalog-search').scrollIntoView({block:'nearest',behavior:'smooth'});break;
    case 'reset':resetVehicle();break;
    case 'reset-camera':setCamera('iso');break;
    case 'zoom-in':cameras.zoom(.82);break;
    case 'zoom-out':cameras.zoom(1.22);break;
    case 'isolate':toggleIsolate();break;
    case 'focus':if(activeItem)cameras.focus(activeItem.anchors);else setStatus('Selecciona un componente para enfocarlo');break;
  }
}
function openHelp(){const dlg=byId('help-dialog');if(!dlg.open)dlg.showModal();}
function closeHelp(){byId('help-dialog').close();}
function installControls(){
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>doAction(button.dataset.action,button)));
  document.querySelectorAll('.camera-button').forEach(button=>button.addEventListener('click',()=>setCamera(button.dataset.view)));
  byId('catalog-search').addEventListener('input',populateCatalog);
  byId('clear-selection').addEventListener('click',()=>{visibility.restore();interaction.clear();});
  byId('keyboard-help').addEventListener('click',openHelp);
  byId('close-help').addEventListener('click',closeHelp);
  byId('ok-help').addEventListener('click',closeHelp);
  window.addEventListener('keydown',e=>{
    if(window.__bevActiveModule==='driving'||e.target instanceof HTMLInputElement||byId('help-dialog').open)return;
    if(!registry)return;
    const views=['iso','front','rear','left','right','top'];
    if(e.key>='1'&&e.key<='6'){setCamera(views[Number(e.key)-1]);return;}
    switch(e.key.toLowerCase()){
      case 'x':explorerXRay?.setEnabled(!explorerXRay.enabled);break;
      case 'escape':resetVehicle();break;
      case 'r':setCamera('iso');break;
      case 'f':if(activeItem)cameras.focus(activeItem.anchors);break;
      case 'i':toggleIsolate();break;
      case '?':openHelp();break;
    }
  });
}
async function main(){
  try{
    if(!window.WebGLRenderingContext)throw new Error('Este navegador no dispone de WebGL.');
    scene=new SceneManager(byId('scene-canvas'),stage);
    cameras=new CameraManager(scene.camera,scene.canvas);
    installControls();
    let running=true;
    let lastFrame=performance.now();
    function frame(now){if(!running)return;requestAnimationFrame(frame);const delta=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;driving?.tick(delta,now);cameras.update();scene.render();}
    frame();
    setLoad('Cargando vehículo 3D','Archivo GLB original · 14.5 MiB',.04);
    const {car,bounds}=await scene.loadCar('./assets/chevrolet_bolt_ev.glb',ratio=>{
      setLoad('Cargando vehículo 3D',`Leyendo geometrías · ${Math.round(ratio*100)} %`,ratio);
    });
    cameras.initialize(bounds);
    registry=new ComponentRegistry(car);
    visibility=new VisibilityManager(car);
    interaction=new InteractionManager(scene.scene,scene.camera,scene.canvas,car,registry,updateSelection);
    populateCatalog();
    driving=new DrivingController({scene,cameras,interaction,visibility,returnStage:stage,onStatus:setStatus});
    explorerXRay=new ExplorerXRay({driving,registry,visibility,interaction,onChange:enabled=>{
      byId('explorer-xray').setAttribute('aria-pressed',String(enabled));byId('explorer-xray').classList.toggle('selected',enabled);byId('explorer-normal').classList.toggle('selected',!enabled);byId('explorer-xray-note').hidden=!enabled;populateCatalog();
    }});driving.explorerXRay=explorerXRay;
    presentation=new PresentationHUD(driving);
    byId('tab-driving').disabled=false;byId('tab-energy').disabled=false;byId('tab-battery').disabled=false;byId('tab-charging').disabled=false;byId('tab-thermal').disabled=false;byId('tab-charts').disabled=false;
    byId('scene-state').textContent='MODELO CARGADO';
    setStatus(`GLB cargado · ${registry.items.length} componentes identificados`);
    loading.classList.add('hidden');
  }catch(error){
    console.error('BEV H1 no pudo iniciar:',error);
    byId('scene-state').textContent='ERROR DE CARGA';
    const message=error?.message||String(error);
    setLoad('No se pudo abrir el visor',`${message}. Comprueba la conexión a Internet (Three.js) y ejecuta el servidor local.`,0);
    setStatus('Error de inicialización del visor 3D');
  }
}
main();
