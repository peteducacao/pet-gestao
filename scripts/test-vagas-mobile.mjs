// Regressão isolada: largura real de Vagas na Administração móvel.
// Não toca APIs externas nem D1 de produção.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const port=8094,origin="http://127.0.0.1:"+port;
const server=spawn("python3",["-m","http.server",String(port),"-b","127.0.0.1"],{stdio:"ignore"});
let browser;
try{
 let ready=false;
 for(let i=0;i<60;i++){
  try{if((await fetch(origin)).ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,"Servidor estático deve inicializar");
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>localStorage.setItem("pet-gestao:session-token","admin-token"));
 const page=await context.newPage();
 const admin={id:"admin",name:"Admin",email:"admin@local.test",role:"admin",adminSession:true};
 const committees=[{id:"videos",name:"Vídeos",memberIds:[],memberCount:0,maxMembers:2,backgroundColor:"#8e68e3"},
  {id:"cards",name:"Cards",memberIds:[],memberCount:0,maxMembers:3,backgroundColor:"#f7f3ff"}];
 await page.route("**/api/v1/**",async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace("/api/v1",""),method=req.method();
  if(method==="OPTIONS"){
   await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE","access-control-allow-headers":"Authorization,Content-Type"}});
   return;
  }
  let result={ok:true};
  if(p==="/auth/me")result={user:admin};
  else if(p==="/bootstrap")result={session:{user:admin},users:[admin],committees,tasks:[],meetings:[],events:[],history:[],settings:{autoMonth:true,autoWeek:true,notificationTemplates:{}}};
  else if(p==="/mail")result={items:[]};
  else if(p==="/mail/status")result={connected:true};
  await route.fulfill({contentType:"application/json",headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"},body:JSON.stringify(result)});
 });
 await page.goto(origin+"/#/admin/comissoes");
 await page.locator(".admin-commission-item").first().waitFor({state:"visible",timeout:12000});
 for(const width of [320,360,390,414]){
  await page.setViewportSize({width,height:844});
  const result=await page.locator(".admin-commission-item").first().evaluate(item=>{
   const input=item.querySelector(".admin-vacancy-field input"),
    label=item.querySelector(".admin-vacancy-field"),
    arrows=item.querySelector(".admin-order-controls"),
    left=input.getBoundingClientRect(),right=arrows.getBoundingClientRect(),
    bounds=item.getBoundingClientRect();
   return {inputWidth:left.width,labelWidth:label.getBoundingClientRect().width,
    inputRight:left.right,arrowsLeft:right.left,arrowsRight:right.right,itemRight:bounds.right,
    value:input.value,pageScroll:document.documentElement.scrollWidth,viewport:window.innerWidth};
  });
  assert.ok(result.inputWidth>=63&&result.inputWidth<=65,"Campo Vagas deve ter 64 px em "+width+": "+JSON.stringify(result));
  assert.ok(result.labelWidth<=65,"Rótulo não pode alargar o campo em "+width+": "+JSON.stringify(result));
  assert.ok(result.inputRight+8<=result.arrowsLeft,"Separar campo e setas em "+width+": "+JSON.stringify(result));
  assert.ok(result.arrowsRight<=result.itemRight+2,"Setas dentro do cartão em "+width+": "+JSON.stringify(result));
  assert.ok(result.pageScroll<=width+2,"Sem rolagem horizontal em "+width+": "+JSON.stringify(result));
  assert.equal(result.value,"2","Valor de Vagas não deve mudar");
 }
 console.log("OK: Vagas mede 64px em 320/360/390/414; setas intactas, sem overflow.");
}finally{
 if(browser)await browser.close();
 server.kill();
}
