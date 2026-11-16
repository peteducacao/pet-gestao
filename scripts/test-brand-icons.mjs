// Regressão visual sem navegador nem rede: todos os ícones derivam da mesma marca.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {inflateSync} from "node:zlib";
import {generatePwaIcons} from "./build-pwa-icons.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const icon=read("assets/gestao-icon.svg");
assert.equal(icon,read("assets/favicon.svg"),"Favicon e marca principal precisam ser o mesmo desenho");
assert.match(icon,/<rect width="512" height="512" rx="112"/);
assert.match(icon,/<path d="m197 303 44 45 77-79"/,"Prancheta branca com um visto roxo");
assert.doesNotMatch(icon,/<text\\b/i,"A marca não pode conter texto visual");

const html=read("index.html"),manifest=JSON.parse(read("site.webmanifest")),sw=read("sw.js");
assert.match(html,/<img class="startup-splash-logo" src="assets\\/gestao-icon.svg/);
assert.match(html,/class="startup-splash-waves"/);
assert.match(html,/pet-splash-pulse 1\\.25s/,"Animação de abertura preservada");
assert.match(html,/rel="apple-touch-icon" sizes="180x180"/);
assert.match(html,/class="brand-icon brand-mark"[^>]*><img src="assets\\/gestao-icon.svg/);
assert.match(sw,/pet-gestao-public-shell-v20261116-prancheta/);
assert.ok(manifest.icons.some(i=>i.type==="image/svg+xml"&&i.src.includes("prancheta-20261116")));

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pet-gestao-icons-"));
try {
 generatePwaIcons(dir);
 for(const size of [192,512]){
  for(const maskable of [false,true]){
   const name="pet-gestao-"+(maskable?"maskable-":"")+size+".png";
   const file=fs.readFileSync(path.join(dir,name));
   assert.deepEqual([...file.subarray(0,8)],[137,80,78,71,13,10,26,10]);
   assert.equal(file.readUInt32BE(16),size);
   assert.equal(file.readUInt32BE(20),size);
   assert.ok(manifest.icons.some(i=>i.src==="assets/"+name),"Manifesto referencia "+name);
  }
 }
 const apple=fs.readFileSync(path.join(dir,"pet-gestao-180.png"));
 assert.equal(apple.readUInt32BE(16),180,"Ícone da tela inicial do iPhone");

 const png=fs.readFileSync(path.join(dir,"pet-gestao-192.png"));
 const i=png.indexOf(Buffer.from("IDAT")),n=png.readUInt32BE(i-4);
 const raw=inflateSync(png.subarray(i+4,i+4+n));
 const color=(x,y)=>[...raw.subarray(y*(192*4+1)+1+x*4,y*(192*4+1)+1+x*4+4)];
 const board=color(96,148),tick=color(90,130),background=color(96,18);
 assert.deepEqual(board,[255,255,255,255],"Corpo da prancheta é branco");
 assert.ok(tick[0]<170&&tick[2]>100,"Visto central roxo legível");
 assert.ok(background[2]>80&&background[0]>40,"Fundo roxo nítido");
 console.log("OK: ícones 192/512 maskable, iOS 180, favicon, barra lateral e splash consistentes.");
}finally{fs.rmSync(dir,{recursive:true,force:true})}
