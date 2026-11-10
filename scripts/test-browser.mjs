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
const commissionOnly={...task,id:"t2",title:"Atividade exclusiva da comissão",description:"",captionText:"",assigneeIds:[],commissionIds:["videos"],overviewVisible:false,userDone:{},commissionDone:{},deadlines:[{id:"p2",label:"Prazo",dueAt:"2026-11-20T17:00:00",assigneeIds:[]}]};
let tasks=[task,commissionOnly],meetings=[{id:"m1",title:"Reunião de teste",date:"2026-11-09",rawNotes:"Pauta\nResponsável: (???)"}];
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
 else if(/^\/tasks\/[^/]+$/.test(p)&&method==="PUT"){const current=tasks.find(t=>t.id===p.split("/")[2]);if(current)Object.assign(current,body);result={ok:true};}
 else if(p==="/meetings"&&method==="POST"){meetings.push({id:"m"+(meetings.length+1),...body});result={ok:true};}
 else if(/^\/tasks\/[^/]+\/finish$/.test(p)&&method==="PATCH"){
   const current=tasks.find(t=>t.id===p.split("/")[2]);
   if(current){
     const stamp=new Date().toISOString();
     for(const cid of [...(body.commissionIds||[]),...(body.commissionId?[body.commissionId]:[])])current.commissionDone[cid]={at:stamp,by:"u1"};
     for(const uid of body.userIds||[])current.userDone[uid]={at:stamp,by:"u1"};
     if(!body.commissionId&&!(body.userIds?.length||body.commissionIds?.length))current.userDone.u1={at:stamp,by:"u1"};
     const done=current.assigneeIds.every(uid=>current.userDone[uid])&&current.commissionIds.every(cid=>current.commissionDone[cid]);
     if(done){current.archivedAt=stamp;current.status="concluida"}
     result={ok:true,archived:!!current.archivedAt};
   }
 }
 await route.fulfill({status,contentType:"application/json; charset=utf-8",headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"},body:JSON.stringify(result)});
});
await context.addInitScript(()=>{
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
 await extra.waitForURL(/#\/comissoes/,{timeout:10000});assert.ok(extra.url().includes("#/comissoes"),"Comissão abre em outra guia");await extra.close();
 await page.goto(origin+"/#/inicio");
 await page.locator(".dashboard-grid .demand-activity-card").first().waitFor();
 assert.equal(await page.locator(".dashboard-grid .demand-activity-card").count(),1,"Somente tarefas para Visão geral");
 const columns=await page.locator(".dashboard-grid .demand-activity-card").first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
 assert.ok(columns>=4,"Visão geral deve reproduzir o card horizontal de Demandas no desktop");
 await page.goto(origin+"/#/minhas-pendencias");
 await page.locator(".mine-task-item").first().waitFor();
 assert.equal(await page.locator(".mine-task-item").count(),2,"Pessoa vê demanda individual e a atribuída por comissão sem duplicidade");
 assert.equal(await page.locator(".mine-task-item").filter({hasText:"Atividade exclusiva da comissão"}).count(),1);
 const mineSize=await page.locator(".mine-task-item").first().evaluate(el=>({button:el.querySelector(".demand-finish-action").getBoundingClientRect().width,card:el.querySelector(".demand-activity-card").getBoundingClientRect().width}));
 assert.ok(mineSize.button<mineSize.card*.45,"Concluir deve ser um botão compacto, não largura total");
 await page.goto(origin+"/#/registrar/t2");
 await page.locator('input[name="overviewVisibility"][value="comissao"]').waitFor();
 assert.equal(await page.locator('input[name="overviewVisibility"][value="comissao"]').isChecked(),true,"Opção de comissão preservada na edição");
 await page.goto(origin+"/#/registrar/t1");
 await page.locator('input[name="overviewVisibility"][value="comissao"]').check();
 await page.locator('#task-form button[type="submit"]').click();
 await page.waitForTimeout(200);
 assert.ok(calls.some(x=>x.method==="PUT"&&x.p==="/tasks/t1"&&x.body.overviewVisible===false),"Cadastro deve enviar escolha de exibição ao servidor");
 await page.goto(origin+"/#/inicio");
 assert.equal(await page.locator(".dashboard-grid .demand-activity-card").count(),0,"Atividades só nas comissões não devem aparecer na Visão geral");
 task.overviewVisible=true;
 await page.reload();
 await page.locator(".dashboard-grid .demand-activity-card").first().waitFor();
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
 const editor=page.locator('[data-rich-input="captionText"]');
 await editor.fill("Revisão 📚 com cores");
 await editor.selectText();
 await page.locator('[data-rich="captionText"] [data-format="bold"]').click();
 assert.match(await editor.innerHTML(),/<(b|strong)>/i,"Negrito funciona");
 await editor.selectText();
 await page.locator('[data-rich="captionText"] input[type="color"]').fill("#dd3344");
 assert.match(await editor.innerHTML(),/(color|font)/i,"Aplicar cor funciona");

 await page.locator('a[data-route="demandas"]').click();
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+"/#/inicio");
 await page.locator(".dashboard-grid .demand-activity-card").first().waitFor();
 await page.goto(origin+"/#/minhas-pendencias");
 const mobileSize=await page.locator(".mine-task-item").first().evaluate(el=>({button:el.querySelector(".demand-finish-action").getBoundingClientRect().width,card:el.querySelector(".demand-activity-card").getBoundingClientRect().width}));
 assert.ok(mobileSize.button<mobileSize.card*.7,"Concluir deve continuar compacto no celular");
 await wait(200);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+4);
 assert.equal(overflow,false,"Sem rolagem horizontal excessiva no celular");
 await page.goto(origin+"/#/inicio");
 await page.locator(".dashboard-grid .demand-card-cover-link").first().click();
 await page.waitForURL(/#\/atividade\/t1/,{timeout:6000});
 assert.ok(page.url().includes("#/atividade/t1"),"Card inteiro deve abrir os detalhes");
 await page.goto(origin+"/#/minhas-pendencias");
 const mixed=page.locator(".mine-task-item").filter({hasText:"Poesia no PET"});
 await mixed.locator('button[data-do="finish-mine"]').click();
 assert.equal(await page.locator('#finish-dialog input[name="joint-target"]').count(),2,"Participações individual e comissão não são confundidas");
 await page.locator('[data-do="finish-close"]').last().click();
 const only=page.locator(".mine-task-item").filter({hasText:"Atividade exclusiva da comissão"});
 await only.locator('button[data-do="finish-mine"]').click();
 await page.locator('#notice-dialog [data-do="notice-confirm"]').click();
 await page.waitForTimeout(250);
 assert.ok(calls.some(x=>x.p==="/tasks/t2/finish"&&x.body.commissionId==="videos"),"Concluir a pendência da comissão usa sua participação vinculada");
 await page.goto(origin+"/#/minhas-pendencias");
 assert.equal(await page.locator(".mine-task-item").count(),1,"Concluída pela comissão desaparece das pendências do integrante");
 await page.goto(origin+"/#/admin/emails");
 await page.locator("#notification-template-form").waitFor({timeout:10000});
 assert.equal(await page.locator('#mail-form [data-rich-input="message"]').count(),1);
 console.log("BROWSER: navegação, nova guia, responsividade, Atas, editor, status e Admin — OK.");
}finally{await browser.close();server.kill();}
