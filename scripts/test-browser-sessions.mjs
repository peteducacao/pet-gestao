import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const port=8093,origin="http://127.0.0.1:"+port;
const server=spawn("python3",["-m","http.server",String(port),"-b","127.0.0.1"],{stdio:"ignore"});
try{
 let ready=false;
 for(let i=0;i<45;i++){
  try{const r=await fetch(origin);if(r.ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,"Servidor de teste deve iniciar");
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const petiano={id:"pet",name:"PETiano Teste",email:"pet@local.test",role:"petiano",notificationEnabled:false};
  const admin={id:"admin",name:"Admin",email:"admin@local.test",role:"admin",notificationEnabled:false,adminSession:true};
  let currentToken="",counter=0,previousToken="";
  await context.route("**/api/v1/**",async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname.replace("/api/v1","");
   const bearer=(req.headers()["authorization"]||"").replace("Bearer ","");
   let body={};try{body=req.postDataJSON()||{}}catch{}
   let result={ok:true},status=200;
   if(path==="/auth/login"){
    const actor=body.email===admin.email?admin:petiano;
    previousToken=currentToken;
    currentToken="session-"+actor.role+"-"+(++counter)+"-a234567890123456789";
    result={token:currentToken,user:actor};
   }else if(path==="/auth/logout"){
    if(bearer===currentToken)currentToken="";
   }else if(path==="/bootstrap"){
    const actor=bearer===currentToken&&currentToken?
     (currentToken.includes("-admin-")?admin:petiano):null;
    result={session:actor?{user:actor}:null,users:actor?[petiano,admin]:[],committees:[],
      tasks:[],events:[],meetings:[],history:[],settings:{autoMonth:true,autoWeek:true}};
   }else if(path==="/auth/me"){
    if(bearer!==currentToken||!currentToken){status=401;result={error:"Sessão revogada"}}
   }
   await route.fulfill({status,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"},
      body:JSON.stringify(result)});
  });
  const first=await context.newPage();
  await first.goto(origin+"/#/login");
  async function login(page,email,remember){
   await page.goto(origin+"/#/login");
   const form=page.locator("#login-form");
   await form.locator('[name="email"]').fill(email);
   await form.locator('[name="password"]').fill("SenhaFicticiaSegura123!");
   if(remember)await form.locator('[name="rememberMe"]').check();
   await form.locator('button[type="submit"]').click();
   await page.locator("#screen .page-title").waitFor();
   await page.waitForURL("**/#/inicio");
  }
  await login(first,petiano.email,false);
  assert.equal(await first.evaluate(()=>localStorage.getItem("pet-gestao:session-token")),null,
   "Sem Manter-me conectado, token não persiste no localStorage");
  const firstBrowserId=await first.evaluate(()=>localStorage.getItem("pet-gestao:browser-id"));
  assert.match(firstBrowserId,/^[a-f0-9-]{36}$/i);
  assert.equal(await first.locator("#admin-link").isVisible(),false);
  const second=await context.newPage();
  await second.goto(origin+"/#/inicio");
  const secondBrowserId=await second.evaluate(()=>localStorage.getItem("pet-gestao:browser-id"));
  assert.equal(secondBrowserId,firstBrowserId,"Abas do mesmo navegador compartilham identificador");
  await second.goto(origin+"/#/conta");
  await second.locator(".account-profile-info").waitFor({state:"visible",timeout:7000});
  assert.ok((await second.locator(".account-profile-info").innerText()).includes(petiano.email),
   "Nova aba deve reconhecer a conta mesmo sem Manter-me conectado");
  await login(second,admin.email,true);
  await second.locator("#admin-link").waitFor({state:"visible",timeout:7000});
  await first.locator("#admin-link").waitFor({state:"visible",timeout:7000});
  await first.goto(origin+"/#/conta");
  await first.locator(".account-profile-info").waitFor();
  assert.ok((await first.locator(".account-profile-info").innerText()).includes(admin.email),
    "A primeira aba não pode manter a identidade do PETiano");
  assert.notEqual(previousToken,currentToken,"O login novo substitui o anterior");
  // Sem Manter-me conectado: nenhuma outra aba mantém credenciais antigas.
  await login(second,petiano.email,false);
  await first.locator("#admin-link").waitFor({state:"hidden",timeout:7000});
  assert.equal(await first.evaluate(()=>sessionStorage.getItem("pet-gestao:session-token")),null,
    "Token anterior não fica guardado em outra aba");
  const third=await context.newPage();
  await third.goto(origin+"/#/conta");
  await third.locator(".account-profile-info").waitFor({state:"visible",timeout:7000});
  assert.ok((await third.locator(".account-profile-info").innerText()).includes(petiano.email),
   "Outra aba herda a identidade da sessão temporária atual");
  assert.equal(await third.evaluate(()=>localStorage.getItem("pet-gestao:session-token")),null);
  await context.close();
  console.log("Duas abas e duas contas: identidade sincronizada e sessões antigas revogadas.");
 }finally{await browser.close()}
}finally{server.kill()}
