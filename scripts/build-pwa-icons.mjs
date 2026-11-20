// Ícones PNG nítidos e independentes de bibliotecas externas, gerados no deploy.
import fs from "node:fs";
import path from "node:path";
import {deflateSync} from "node:zlib";
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
function chunk(name,payload){
 const label=Buffer.from(name),size=Buffer.alloc(4),check=Buffer.alloc(4);
 size.writeUInt32BE(payload.length);
 let crc=0xffffffff;
 for(const byte of Buffer.concat([label,payload]))crc=crcTable[(crc^byte)&255]^(crc>>>8);
 check.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([size,label,payload,check]);
}
function rounded(x,y,l,t,r,b,rad){
 const nx=Math.max(l+rad,Math.min(r-rad,x)),ny=Math.max(t+rad,Math.min(b-rad,y));
 return Math.hypot(x-nx,y-ny)<=rad;
}
function segment(x,y,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,q=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(x-ax-q*dx,y-ay-q*dy);
}
// Tradução em pixels antialias do desenho vetorial aprovado (sem robótica).
// Depende só de Node: os PNGs continuam sendo gerados sem serviços externos.
function pointStroke(x,y,ax,ay,bx,by,w){
 return segment(x,y,ax,ay,bx,by)<=w;
}
const swooshSegments=[];
for(const [a,c,b] of [
 [[.330,.803],[.525,.857],[.742,.693]],
 [[.742,.693],[.836,.619],[.832,.494]]
]){
 let previous=a;
 for(let i=1;i<=14;i++){
  const t=i/14,u=1-t,p=[u*u*a[0]+2*u*t*c[0]+t*t*b[0],u*u*a[1]+2*u*t*c[1]+t*t*b[1]];
  swooshSegments.push([previous,p]);previous=p;
 }
}
function onSwoosh(x,y){
 if(x<.30||x>.90||y<.46||y>.87)return false;
 return swooshSegments.some(([a,b])=>pointStroke(x,y,a[0],a[1],b[0],b[1],.0137));
}
function pixel(x,y,maskable){
 if(!maskable&&!rounded(x,y,0,0,1,1,.207))return [0,0,0,0];
 const scale=maskable?.8:1,px=(x-.5)/scale+.5,py=(y-.5)/scale+.5;
 let t=Math.max(0,Math.min(1,(px+(1-py))/2));
 let rgb=[Math.round(51+111*t),Math.round(0+34*t),Math.round(99+156*t),255];
 // Duas curvas discretas mantêm as ondas roxas no fundo.
 if(py<.42-.25*px&&px<.75)rgb=[Math.round(rgb[0]*.77),0,Math.round(rgb[2]*.83),255];
 if(py>.90-.23*px)rgb=[Math.round(rgb[0]*.74),0,Math.round(rgb[2]*.8),255];
 const white=[255,255,255,255],lavender=[224,197,255,255],hole=[91,0,169,255];
 // Moldura da prancheta com cantos arredondados.
 if(rounded(px,py,.198,.264,.802,.793,.12)&&
   !rounded(px,py,.240,.305,.760,.751,.078))rgb=white;
 // Presilha superior e arco circular.
 if(rounded(px,py,.367,.220,.633,.338,.042))rgb=white;
 const d=Math.hypot(px-.5,py-.201);
 if(d>=.058&&d<=.096&&py<.24)rgb=white;
 if(d<.024)rgb=hole;
 // Checklist: três vistos, três linhas.
 for(const row of [0,.09375,.1875]){
  if(pointStroke(px,py,.305,.424+row,.334,.453+row,.0137)||
     pointStroke(px,py,.334,.453+row,.383,.398+row,.0137))rgb=white;
 }
 if(rounded(px,py,.432,.416,.690,.443,.0137)||
    rounded(px,py,.432,.510,.690,.537,.0137)||
    rounded(px,py,.432,.604,.627,.631,.0137))rgb=lavender;
 // Barras de progresso ascendentes.
 if(rounded(px,py,.506,.684,.572,.773,.018)||
    rounded(px,py,.588,.633,.654,.773,.018)||
    rounded(px,py,.670,.572,.736,.773,.018))rgb=white;
 if(onSwoosh(px,py))rgb=white;
 return rgb;
}
function generate(size,maskable){
 const raw=Buffer.alloc((size*4+1)*size);
 for(let y=0;y<size;y++){
  const row=y*(size*4+1);raw[row]=0;
  for(let x=0;x<size;x++){
   const rgba=[0,0,0,0];
   for(const [sx,sy] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){
    const sample=pixel((x+sx)/size,(y+sy)/size,maskable);
    for(let i=0;i<4;i++)rgba[i]+=sample[i];
   }
   for(let i=0;i<4;i++)raw[row+1+4*x+i]=Math.round(rgba[i]/4);
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]);
}
export function generatePwaIcons(directory){
 fs.mkdirSync(directory,{recursive:true});
 for(const dimension of [192,512])for(const maskable of [false,true]){
  const name="pet-gestao-"+(maskable?"maskable-":"")+dimension+".png";
  fs.writeFileSync(path.join(directory,name),generate(dimension,maskable));
 }
 // Ícone de 180 px para "Adicionar à Tela de Início" no Safari/iOS.
 fs.writeFileSync(path.join(directory,"pet-gestao-180.png"),generate(180,false));
}
