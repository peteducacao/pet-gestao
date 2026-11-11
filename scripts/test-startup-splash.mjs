// Teste estático da abertura do PET Gestão. Sem API, usuários ou banco.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("index.html","utf8");
const app=readFileSync("app-live.js","utf8");
const sw=readFileSync("sw.js","utf8");
assert.match(html,/html\.pet-booting\s+\.app-shell\{visibility:hidden!important\}/);
assert.match(html,/html\.pet-booting #startup-loading\{/);
assert.match(html,/<div id="startup-loading" role="status"/);
assert.match(html,/class="startup-splash-waves"/);
assert.match(html,/class="startup-splash-body"/);
assert.match(html,/class="startup-splash-logo"/);
assert.match(html,/<h1 class="startup-splash-title">PET Gestão<\/h1>/);
assert.match(html,/Preparando sua área de trabalho/);
assert.match(html,/PET Gestão \| PET Educação UFS/);
assert.match(html,/class="startup-splash-dots"/);
assert.match(html,/pet-splash-pulse 1\.25s/);
assert.match(html,/translateY\(-10px\)/);
assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
assert.doesNotMatch(html,/startup-loading-card|startup-spinner/,"O card antigo de conexão não pode permanecer na abertura.");
const starts=html.match(/id="startup-loading"/g)||[];
assert.equal(starts.length,1,"Deve existir apenas uma tela de abertura.");
assert.match(app,/finally\{document\.documentElement\.classList\.remove\("pet-booting"\)\}/,
 "A tela deve sumir mesmo após falha do bootstrap.");
assert.match(sw,/CACHE_NAME="pet-gestao-public-shell-v20261111-06"/,
 "A nova versão precisa substituir o cache PWA anterior.");
assert.match(sw,/\.\/index\.html/,"O index deve ficar disponível no cache offline.");
const openingTags=html.match(/<svg\b/g)||[];
const closingTags=html.match(/<\/svg>/g)||[];
assert.equal(openingTags.length,closingTags.length,"Todos os SVGs precisam estar fechados.");
console.log("OK: tela de abertura, acessibilidade, estado inicial e atualização PWA.");
