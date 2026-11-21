// Regressão isolada: iOS 16.4+, privacidade e abertura de avisos Android.
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const app=read("app-live.js");
const html=read("index.html");
const manifest=JSON.parse(read("site.webmanifest"));
const sw=read("sw.js");
const server=read("worker/src/index.js");
const web=read("worker/src/web-push.js");
const android=read("android-app/app/src/main/java/br/ufs/peteducacao/gestao/MainActivity.java");
const messaging=read("android-app/app/src/main/java/br/ufs/peteducacao/gestao/AppPushMessagingService.java");
const deploy=read("scripts/prepare-deploy.mjs");
const privacy=read("privacidade.html");
const migration=read("worker/migrations/0028_ios_web_push.sql");

assert.equal(manifest.display,"standalone","iPhone precisa de PWA instalável");
assert.ok(manifest.id&&manifest.start_url.startsWith("/pet-gestao/"));
assert.ok(html.includes('rel="apple-touch-icon"'),"iOS precisa de ícone próprio");
assert.ok(html.includes('href="./privacidade.html"'),"Aviso de privacidade deve estar acessível");
assert.ok(deploy.includes('"privacidade.html"'),"Deploy deve copiar o aviso ao site");
assert.ok(privacy.includes("Cloudflare")&&privacy.includes("Firebase")&&privacy.includes("Google"));
assert.ok(privacy.includes("Apple")&&privacy.includes("LGPD"));
assert.ok(server.includes("tasks:user?rawTasks.map("),"Visitantes não podem consultar títulos de demandas");

assert.ok(app.includes("function iosDevice(){"),"Identificar iPhone/iPad");
assert.ok(app.includes("function renderIOSInstall(){"),"Card de instalação próprio");
assert.ok(app.includes('data-do="install-ios-app"'),"Instruções de instalação acionáveis");
assert.ok(app.includes('platform:iosDevice()?"ios":"pc"'),"Salvar inscrição iOS como celular");
assert.ok(app.includes("ios&&!installed"),"Bloquear autorização prematura antes da instalação");
assert.ok(web.includes('platform==="ios"'),"Servidor precisa reconhecer inscrições Apple");
assert.ok(web.includes('registeredIphones'),"Computadores e iPhones devem ser contados separadamente");
assert.ok(migration.includes("DEFAULT 'pc'"),"Inscrições existentes devem continuar como PC");
assert.ok(sw.includes("meus-lembretes"),"Service Worker deve abrir lembretes pelo aviso");

for(const code of [android,messaging]){
 assert.ok(code.includes("/meus-lembretes"),"Rota de lembretes obrigatória no Android");
 assert.ok(code.includes("/minhas-pendencias"),"Rota de pendências obrigatória no Android");
}
assert.ok(android.indexOf("if (launchRoute != null)")<android.indexOf("else if (savedInstanceState != null)"),
 "Abrir notificação deve ter prioridade sobre página restaurada");
console.log("OK: instalação iPhone/iPad, transparência LGPD, rotas Android e isolamento de inscrições.");
