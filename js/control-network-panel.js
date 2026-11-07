import {CONTROL_NODES,PROTOCOL_REFERENCES,readControlNetwork} from './control-network.js';
const $=id=>document.getElementById(id);
const positions={vcu:[350,135],bms:[100,45],inverter:[600,45],thermal:[100,225],charger:[600,225]};
const fmt=(v,u='')=>v===null?'—':`${v.toFixed(1)} ${u}`.trim();
export class ControlNetworkPanel{
  constructor(read){
    this.read=read;this.open=false;this.timer=null;this.selected='vcu';this.updates=0;
    this.panel=$('control-network-panel');this.abort=new AbortController();const signal=this.abort.signal;
    const svg=$('control-network-svg'),ns='http://www.w3.org/2000/svg';
    const element=(name,attrs)=>{const el=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};
    for(const [from,to,dual] of [['bms','vcu'],['vcu','inverter',true],['thermal','vcu'],['vcu','charger'],['bms','thermal'],['bms','charger',true]]){
      const a=positions[from],b=positions[to],dx=b[0]-a[0],dy=b[1]-a[1];
      const trim=Math.min(87/Math.abs(dx),45/Math.abs(dy));
      const line=element('line',{x1:a[0]+dx*trim,y1:a[1]+41+dy*trim,x2:b[0]-dx*trim,y2:b[1]+41-dy*trim,class:'cn-illustrative','marker-end':'url(#cn-arrow)'});
      if(dual)line.setAttribute('marker-start','url(#cn-arrow)');svg.append(line);
    }
    this.nodeTexts=new Map();
    for(const node of CONTROL_NODES){
      const [x,y]=positions[node.id],g=element('g',{transform:`translate(${x-83},${y})`,role:'button',tabindex:'0','aria-label':`Inspeccionar ${node.name}`,'aria-pressed':String(node.id===this.selected),class:'cn-node','data-cn-node':node.id});
      g.append(element('rect',{width:166,height:82,rx:12}));
      const title=element('text',{x:83,y:23,'text-anchor':'middle'});title.textContent=node.name;g.append(title);
      const value=element('text',{x:83,y:44,'text-anchor':'middle',class:'cn-value'}),status=element('text',{x:83,y:64,'text-anchor':'middle',class:'cn-status'});g.append(value,status);svg.append(g);this.nodeTexts.set(node.id,{g,value,status});
      const select=()=>{this.selected=node.id;this.showSelection();};g.addEventListener('click',select,{signal});
      g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}},{signal});
    }
    this.rows=new Map();
    // Build once. Subsequent updates touch only changed text; no per-frame layout reads.
    const initial=readControlNetwork(this.read());
    for(const m of initial?.messages||[]){const tr=document.createElement('tr');for(const text of [`${m.from.toUpperCase()} → ${m.to.toUpperCase()}`,m.label,'',m.source]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
      $('cn-messages').append(tr);this.rows.set(m.id,tr.children[2]);}
    for(const ref of PROTOCOL_REFERENCES){const li=document.createElement('li');li.dataset.protocol=ref.id;const a=document.createElement('a');a.textContent=ref.name;a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,document.createTextNode(' · '+ref.scope));$('cn-protocols').append(li);}
    $('tab-control-network').disabled=false;
    $('tab-control-network').addEventListener('click',()=>this.setOpen(!this.open),{signal});
    $('cn-close').addEventListener('click',()=>this.setOpen(false),{signal});
    this.panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.setOpen(false);}},{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();else if(this.open)this.refresh();},{signal});
    this.showSelection();
  }
  put(el,text){if(el.textContent!==text)el.textContent=text;}
  showSelection(){
    const node=CONTROL_NODES.find(n=>n.id===this.selected);
    this.put($('cn-inspector-title'),node.name);this.put($('cn-role'),node.role);
    this.put($('cn-inputs'),node.inputs);this.put($('cn-outputs'),node.outputs);
    for(const [id,{g}] of this.nodeTexts)g.setAttribute('aria-pressed',String(id===this.selected));
  }
  setOpen(open){
    this.open=!!open;this.panel.hidden=!this.open;
    const button=$('tab-control-network');button.setAttribute('aria-expanded',String(this.open));button.classList.toggle('active',this.open);
    this.cancel();if(this.open){this.refresh();$('cn-close').focus();}else button.focus();
  }
  cancel(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
  refresh(){
    this.cancel();if(!this.open||document.hidden)return;
    const state=readControlNetwork(this.read());
    if(state){this.updates++;
      this.put($('cn-mode'),state.mode);this.put($('cn-time'),`t modelo: ${fmt(state.timeS,'s')} · lectura visual ≤ 4 Hz`);
      for(const [id,ui] of this.nodeTexts){const node=state.nodes[id];this.put(ui.value,fmt(node.value,node.unit));this.put(ui.status,node.state);}
      for(const m of state.messages)this.put(this.rows.get(m.id),fmt(m.value,m.unit));
      const active=Object.entries(state.actuators).filter(([,v])=>v).map(([k])=>({batteryPump:'bomba batería',powerPump:'bomba potencia',chiller:'enfriador',heater:'calefactor batería',fan:'ventilador',cabinHeater:'calefactor cabina'}[k]||k));
      this.put($('cn-actuators'),active.length?active.join(' · '):'Ningún actuador térmico activo');
      for(const li of $('cn-protocols').children)li.classList.toggle('cn-current-protocol',li.dataset.protocol===state.protocol);
    }
    this.timer=setTimeout(()=>this.refresh(),250);
  }
  dispose(){this.cancel();this.abort.abort();this.open=false;this.panel.hidden=true;}
}
