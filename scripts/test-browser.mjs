import fs from "node:fs";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const PORT=8091,origin="http://127.0.0.1:"+PORT;
const server=spawn("python3",["-m","http.server",String(PORT),"-b","127.0.0.1"],{stdio:"ignore"});
for(let i=0;i<50;i++){try{const r=await fetch(origin);if(r.ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1420,height:900}});
const page=await context.newPage();
const user={id:"u1",name:"Usuário de teste",role:"tutor",email:"exemplo@local.test",notificationEnabled:false};
const admin={id:"admin",name:"Admin",role:"admin",email:"admin@local.test",notificationEnabled:false,adminSession:true};
const task={id:"t1",title:"Poesia no PET",description:"Ideias 📚",captionText:"Olá!\n\n#PET",
  assigneeIds:["u1"],commissionIds:["videos"],userDone:{},commissionDone:{},
  deadlines:[{id:"p1",label:"Prazo",dueAt:"2026-11-09T12:00:00",assigneeIds:["u1"]}],
  registeredAt:"2026-11-09",archivedAt:null,status:"pendente"};
let tasks=[task],meetings=[{id:"m1",title:"Reunião de teste",date:"2026-11-09",rawNotes:"Pauta\nResponsável: (???)"}];
const committees=[{id:"videos",name:"Vídeos",memberIds:["u1"],memberCount:1,maxMembers:0,backgroundColor:"#f7f3ff"}];
const bootstrap=adminMode=>({session:{user:adminMode?admin:user},users:[user],committees,tasks,meetings,events:[],history:[],settings:{autoMonth:true,autoWeek:true}});
const calls=[];
await page.route("**/api/v1/**",async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1",""),method=req.method(),adminMode=req.headers()["authorization"]?.includes("admin-token");
 if(method==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE","access-control-allow-headers":"Authorization,Content-Type"}});
 let result={ok:true},status=200;let body={};try{body=req.postDataJSON()||{}}catch{}
 calls.push({method,p,body});
 if(p==="/auth/me")result={user};
 else if(p==="/bootstrap")result=bootstrap(adminMode);
 else if(p==="/mail")result={items:[]};
 else if(p==="/mail/status")result={connected:true,message:"Teste isolado"};
 else if(p==="/tasks"&&method==="POST"){tasks.push({id:"t"+(tasks.length+1),...body,commissionDone:{},userDone:{},registeredAt:"2026-11-10",archivedAt:null});status=201;result={ok:true,id:"t"+tasks.length};}
 else if(p==="/meetings"&&method==="POST"){meetings.push({id:"m"+(meetings.length+1),...body});result={ok:true};}
 else if(p.startsWith("/tasks/")&&method==="PATCH"){task.userDone.u1={at:new Date().toISOString(),by:"u1"};task.commissionDone.videos={at:new Date().toISOString(),by:"u1"};task.archivedAt=new Date().toISOString();result={ok:true,archived:true};}
 await route.fulfill({status,contentType:"application/json; charset=utf-8",headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"},body:JSON.stringify(result)});
});
await page.addInitScript(()=>{
 localStorage.setItem("pet-gestao:session-token","user-token");
 localStorage.setItem("pet-gestao:admin-session-token","admin-token");
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await page.goto(origin+"/#/demandas",{waitUntil:"domcontentloaded"});
 await page.locator(".demand-activity-title").first().waitFor({timeout:10000});
 assert.equal(await page.locator('a[data-route="cronograma"]').count(),0,"Cronograma duplicado não deve aparecer no menu");
 assert.equal(await page.locator('a[data-route="reunioes"]').count(),1,"Atas no menu");
 assert.equal(await page.locator('select[data-filter="status"]').count(),1);
 assert.equal(await page.locator('.task-status-atrasada').count()>0,true);
 assert.equal(await page.locator('a#account-button[href="#/conta"]').count(),1);
 const [extra]=await Promise.all([context.waitForEvent("page"),page.locator('a[data-route="comissoes"]').click({modifiers:["Control"]})]);
 await extra.waitForLoadState("domcontentloaded");assert.ok(extra.url().includes("#/comissoes"),"Comissão abre em outra guia");await extra.close();
 await page.locator('a[data-route="reunioes"]').click();
 await page.locator(".meeting-card-link").waitFor({timeout:5000});
 await page.locator(".meeting-card-link").click();
 await page.locator("#meeting-form textarea").waitFor({timeout:5000});
 assert.equal(await page.locator("#meeting-form textarea").inputValue(),"Pauta\nResponsável: (???)");
 await page.goto(origin+"/#/atividade/t1");
 await page.locator('button[data-do="finish-joint-open"]').waitFor();
 await page.locator('button[data-do="finish-joint-open"]').click();
 assert.equal(await page.locator('#finish-dialog input[data-kind="commission"]').count(),1);
 await page.locator('[data-do="finish-close"]').last().click();
 await page.goto(origin+"/#/registrar/t1");
 await page.locator('[data-rich-input="captionText"]').waitFor();
 assert.ok((await page.locator('[data-rich-input="captionText"]').innerText()).includes("#PET"),"Legenda preservada");
 await page.locator('a[data-route="demandas"]').click();
 await page.setViewportSize({width:390,height:844});
 await wait(200);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+4);
 assert.equal(overflow,false,"Sem rolagem horizontal excessiva no celular");
 await page.goto(origin+"/#/admin/emails");
 await page.locator("#notification-template-form").waitFor({timeout:10000});
 assert.equal(await page.locator('#mail-form [data-rich-input="message"]').count(),1);
 console.log("BROWSER: navegação, nova guia, responsividade, Atas, editor, status e Admin — OK.");
}finally{await browser.close();server.kill();}
