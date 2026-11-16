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
// Mesmo desenho do SVG oficial: prancheta sólida branca, visto roxo e fundo violeta.
// Renderização interna sem dependências para garantir PNGs idênticos a cada deploy.
function pixel(x,y,maskable){
 const t=Math.max(0,Math.min(1,(x+y)/2));
 const purple=[Math.round(133-67*t),0,Math.round(208-91*t),255];
 const white=[255,255,255,255],check=[101,0,165,255];
 if(!maskable&&!rounded(x,y,0,0,1,1,.219))return [0,0,0,0];
 // A área segura do Android conserva uma folga ao redor do símbolo.
 const scale=maskable?.8:1,px=(x-.5)/scale+.5,py=(y-.5)/scale+.5;
 let result=purple;
 if(rounded(px,py,.264,.322,.736,.814,.073))result=white;
 // Presilha separada por um contorno roxo.
 const outside=rounded(px,py,.291,.285,.709,.457,.066)||Math.hypot(px-.5,py-.289)<=.093;
 const inside=rounded(px,py,.313,.305,.688,.431,.050)||Math.hypot(px-.5,py-.292)<=.080;
 if(outside)result=purple;
 if(inside)result=white;
 if(Math.hypot(px-.5,py-.295)<=.0254)result=check;
 if(segment(px,py,.385,.592,.471,.680)<.033||
    segment(px,py,.471,.680,.621,.525)<.033)result=check;
 return result;
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
