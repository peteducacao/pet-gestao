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
function pixel(x,y,maskable){
 const scale=maskable?.8:1,px=(x-.5)/scale+.5,py=(y-.5)/scale+.5;
 if(!maskable&&!rounded(x,y,0,0,1,1,.22))return [0,0,0,0];
 const blend=Math.max(0,Math.min(1,(x+y)/2));
 const color=[Math.round(139-57*blend),Math.round(82-38*blend),Math.round(226-67*blend),255];
 const outside=rounded(px,py,.265,.235,.735,.826,.074);
 const inside=rounded(px,py,.329,.299,.671,.762,.019);
 if((outside&&!inside)||rounded(px,py,.382,.195,.618,.310,.036))return [255,255,255,255];
 if(segment(px,py,.381,.573,.473,.659)<.042||segment(px,py,.473,.659,.681,.428)<.042)return [180,247,206,255];
 return color;
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
}
