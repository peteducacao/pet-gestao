// Testa se a versão PUBLICADA pode ser instalada pelo Chrome no Android.
// Executar depois de scripts/prepare-deploy.mjs, usando somente arquivos locais.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root="_site";
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const html=read("index.html"),app=read("app-live.js"),sw=read("sw.js");
const manifest=JSON.parse(read("site.webmanifest"));

assert.equal(manifest.id,"/pet-gestao/","Identidade de instalação deve ser estável.");
assert.equal(manifest.start_url,"/pet-gestao/#/inicio");
assert.equal(manifest.scope,"/pet-gestao/");
assert.equal(manifest.display,"standalone");
assert.equal(manifest.prefer_related_applications,false);
assert.ok(manifest.name&&manifest.short_name,"A identificação do app deve existir.");
assert.ok(html.includes('rel="manifest" href="site.webmanifest?'),"Manifesto deve ser anunciado ao Chrome.");
assert.ok(html.includes('name="theme-color"'),"Tema do Android ausente.");
assert.ok(html.includes('name="mobile-web-app-capable"'),"Suporte ao modo aplicativo ausente.");
assert.match(app,/beforeinstallprompt/);
assert.match(app,/appinstalled/);
assert.match(app,/navigator\.serviceWorker\.register\("\.\/sw\.js"\)/);
assert.match(app,/Baixar aplicativo/);
assert.match(app,/Criar atalho/);
assert.match(app,/Google Chrome/);
assert.match(sw,/pet-gestao-public-shell-v20261111-06/);
assert.ok(!sw.includes('"/api/'),"A API não deve ser armazenada no cache.");

const icons=manifest.icons.filter(icon=>icon.type==="image/png");
for(const icon of icons){
 const file=icon.src.replace(/^\/+/,"");
 const image=fs.readFileSync(path.join(root,file));
 assert.ok(image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"Ícone PNG inválido: "+file);
 const width=image.readUInt32BE(16),height=image.readUInt32BE(20);
 assert.equal(width,height,"Ícone precisa ser quadrado: "+file);
 assert.equal(icon.sizes,width+"x"+height,"Dimensão declarada incorreta: "+file);
 assert.ok(icon.purpose.includes("any")||icon.purpose.includes("maskable"));
}
for(const size of [192,512]){
 assert.ok(icons.some(i=>i.sizes===size+"x"+size&&i.purpose.includes("any")),"Falta ícone padrão "+size);
 assert.ok(icons.some(i=>i.sizes===size+"x"+size&&i.purpose.includes("maskable")),"Falta ícone adaptável "+size);
}
assert.match(html,/animation:pet-splash-pulse 1\.25s/);
assert.match(html,/startup-splash-dots span:nth-child\(2\).*animation-delay:\.19s/);
assert.match(html,/startup-splash-dots span:nth-child\(3\).*animation-delay:\.38s/);
assert.match(html,/translateY\(-10px\)/);
assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);

console.log("OK: manifesto, ícones PNG de 192/512, instalação Android, cache e pontos animados em sequência.");
