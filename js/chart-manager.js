import {TELEMETRY_CHANNELS} from './telemetry-manager.js';
const num=v=>Number.isFinite(v)?v.toFixed(Math.abs(v)<10?1:0):'--';
export class ChartManager{
 constructor(canvas){this.canvas=canvas;this.channel='speedKmh';this.windowS=60;}
 setChannel(key){if(TELEMETRY_CHANNELS[key])this.channel=key;}
 render(samples){
  const dpr=Math.min(window.devicePixelRatio||1,2),rect=this.canvas.getBoundingClientRect(),w=Math.max(300,rect.width),h=Math.max(140,rect.height);
  if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
  const ctx=this.canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const left=50,right=w-16,top=16,bottom=h-28,plotW=right-left,plotH=bottom-top;
  const meta=TELEMETRY_CHANNELS[this.channel];
  const end=samples.at(-1)?.timeS??0,start=Math.max(0,end-this.windowS),values=samples.filter(x=>x.timeS>=start).map(x=>x[this.channel]);
  let min=Math.min(meta.min??Infinity,...values),max=Math.max(meta.min??-Infinity,...values);
  if(!Number.isFinite(min)||!Number.isFinite(max)){min=0;max=1;}
  if(Math.abs(max-min)<1e-5){max+=1;min=Math.min(0,min-1);}
  else {const pad=(max-min)*.14;max+=pad;min=Math.min(meta.min??-Infinity,min-pad);}
  ctx.font='11px system-ui,sans-serif';ctx.fillStyle='#8ba9bc';ctx.textAlign='right';
  for(let i=0;i<=4;i++){
    const y=top+plotH*i/4,val=max-(max-min)*i/4;
    ctx.strokeStyle='#34516a';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    ctx.fillText(num(val),left-8,y+4);
  }
  ctx.fillStyle='#7e96a9';ctx.textAlign='center';
  const windowS=this.windowS;
  for(let i=0;i<=4;i++){
    const t=end-windowS+i*windowS/4;
    ctx.fillText((this.windowS>=300?(Math.max(0,t)/60).toFixed(0)+' min':Math.max(0,t).toFixed(0)+' s'),left+i*plotW/4,bottom+18);
  }
  if(!values.length)return;
  const tmin=Math.max(0,end-windowS),tspan=Math.max(8,end-tmin);
  ctx.beginPath();let first=true;
  for(const s of samples){if(s.timeS<tmin)continue;
    const x=left+(s.timeS-tmin)/tspan*plotW;
    const y=top+(max-s[this.channel])/(max-min)*plotH;
    if(first){ctx.moveTo(x,y);first=false;}else ctx.lineTo(x,y);
  }
  ctx.strokeStyle=meta.color;ctx.lineWidth=2.3;ctx.lineJoin='round';ctx.stroke();
 }
}
