/** Small fixed resolution Canvas2D charts. Draw only visible panel at <=4 Hz. */
export function plot(canvas,{series,xMax,yMax,marker=null,xLabel='',yLabel=''}){
 const ctx=canvas.getContext('2d');if(!ctx)return;const W=canvas.width,H=canvas.height,L=61,R=20,T=20,B=40,w=W-L-R,h=H-T-B;
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b1728';ctx.fillRect(0,0,W,H);ctx.font='13px system-ui';ctx.lineWidth=1;
 const px=x=>L+x/xMax*w,py=y=>T+h-Math.max(0,y)/yMax*h;
 for(let i=0;i<=4;i++){ctx.strokeStyle='#24384b';ctx.beginPath();ctx.moveTo(L,T+i*h/4);ctx.lineTo(W-R,T+i*h/4);ctx.stroke();ctx.fillStyle='#9cb3c6';ctx.fillText((yMax*(1-i/4)).toFixed(yMax<10?1:0),4,T+i*h/4+5);ctx.fillText((xMax*i/4).toFixed(0),L+i*w/4-8,H-15);}
 for(const line of series){ctx.strokeStyle=line.color;ctx.lineWidth=2.5;ctx.beginPath();line.points.forEach(([x,y],i)=>{if(!Number.isFinite(y))return;i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y));});ctx.stroke();}
 if(marker){ctx.strokeStyle='#ffc979';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(px(marker.x),T);ctx.lineTo(px(marker.x),T+h);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffc979';ctx.fillText(marker.label??'',Math.min(W-180,px(marker.x)+5),T+15);}
 ctx.fillStyle='#c9dce9';ctx.fillText(yLabel,L,T-5);ctx.fillText(xLabel,W-110,H-3);
}
