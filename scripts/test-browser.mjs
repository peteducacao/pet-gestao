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
  deadlines:[{id:"p1",label:"Prazo",dueAt:new Date(Date.now()-15*60*1000).toISOString(),assigneeIds:["u1"]}],
  registeredAt:"2026-11-09",archivedAt:null,status:"pendente"};
const commissionOnly={...task,id:"t2",title:"Atividade exclusiva da comissão",description:"",captionText:"",assigneeIds:[],commissionIds:["videos"],overviewVisible:false,userDone:{},commissionDone:{},deadlines:[{id:"p2",label:"Prazo",dueAt:"2026-11-20T17:00:00",assigneeIds:[]}]};
let tasks=[task,commissionOnly],meetings=[{id:"m1",title:"Reunião de teste",date:"2026-11-09",rawNotes:"Pauta\nResponsável: (???)"}];
const committees=[{id:"videos",name:"Vídeos",memberIds:["u1"],memberCount:1,maxMembers:0,backgroundColor:"#f7f3ff"}];
const history=[{task_id:"t1",action:"Criou a demanda",actor_name:"Usuário de teste",created_at:new Date().toISOString()},
{task_id:"t1",action:"Editou texto para revisão",actor_name:"Usuário de teste",created_at:new Date().toISOString()}];
const settings={autoMonth:true,autoWeek:true,notificationTemplates:{}};
 const bootstrap=adminMode=>({session:{user:adminMode?admin:user},users:[user,admin],committees,tasks,meetings,events:[],history,settings});
const calls=[];
await page.route("**/api/v1/**",async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname.replace("/api/v1",""),method=req.method(),adminMode=req.headers()["authorization"]?.includes("admin-token");
 if(method==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE","access-control-allow-headers":"Authorization,Content-Type"}});
 let result={ok:true},status=200;let body={};try{body=req.postDataJSON()||{}}catch{}
 calls.push({method,p,body,authorization:req.headers()["authorization"]||""});
 if(p==="/auth/me")result={user:adminMode?admin:user};
 else if(p==="/bootstrap")result=bootstrap(adminMode);
 else if(p==="/auth/login"&&method==="POST")result={token:body.email===admin.email?"admin-token":"user-token",user:body.email===admin.email?admin:user};
 else if(p==="/mail")result={items:[]};
 else if(p==="/mail/status")result={connected:true,message:"Teste isolado"};
 else if(p==="/admin/commissions-batch"&&method==="PUT"){
   const newOrder=body.commissions.map((row,i)=>{
     const item=committees.find(c=>c.id===row.id);
     Object.assign(item,{maxMembers:row.maxMembers,sortOrder:i+1});
     return item;
   });
   committees.splice(0,committees.length,...newOrder);
   result={ok:true};
 }
 else if(p==="/tasks/bulk-delete"&&method==="POST"){
   const chosen=body.taskIds||[];
   if(!adminMode&&!["petiano","tutor"].includes(user.role)){status=403;result={error:"Somente PETianos(as), Tutoria e Administração."};}
   else if(chosen.some(id=>!tasks.find(t=>t.id===id)?.archivedAt)){
     status=409;result={error:"Somente demandas concluídas."};
   }else{
     tasks=tasks.filter(t=>!chosen.includes(t.id));
     result={ok:true,deletedCount:chosen.length};
   }
 }
 else if(p==="/admin/reminder-settings"&&method==="PUT"){settings.reminderSettings=body;result={ok:true};}
 else if(p==="/admin/notification-template"&&method==="PUT"){
   settings.notificationTemplates[body.kind]={subject:body.subject,body:body.message};
   result={ok:true};
 }
 else if(p==="/tasks"&&method==="POST"){tasks.push({id:"t"+(tasks.length+1),...body,commissionDone:{},userDone:{},registeredAt:"2026-11-10",archivedAt:null});status=201;result={ok:true,id:"t"+tasks.length};}
 else if(/^\/tasks\/[^/]+$/.test(p)&&method==="PUT"){const current=tasks.find(t=>t.id===p.split("/")[2]);if(current)Object.assign(current,body);result={ok:true};}
 else if(/^\/tasks\/[^/]+$/.test(p)&&method==="DELETE"){
   const target=tasks.find(x=>x.id===p.split("/")[2]);
   if(target?.archivedAt&&!adminMode&&!["petiano","tutor"].includes(user.role)){status=403;result={error:"Sem permissão para excluir demandas concluídas."};}
   else {tasks=tasks.filter(x=>x.id!==p.split("/")[2]);result={ok:true};}
 }
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
 if(!localStorage.getItem("pet-gestao:session-token"))localStorage.setItem("pet-gestao:session-token","user-token");
 // Administração obtém sessão pelo login comum, não por uma segunda sessão.
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function loginAs(person){
 await page.goto(origin+"/#/login");
 const form=page.locator("#login-form");
 await form.locator('input[name="email"]').fill(person.email);
 await form.locator('input[name="password"]').fill("SenhaDeTeste");
 await form.locator('input[name="rememberMe"]').check();
 await form.locator('button[type="submit"]').click();
 await page.waitForURL("**/#/inicio");
 await page.locator("#screen .page-title").waitFor({state:"visible",timeout:10000});
 const notice=page.locator("#notice-dialog");
 if(await notice.isVisible())await notice.locator('button[data-do="notice-cancel"]').click();
}
try{
 await page.goto(origin+"/#/demandas",{waitUntil:"domcontentloaded"});
 await page.locator(".demand-activity-title").first().waitFor({timeout:10000});
 await page.goto(origin+"/#/conta");
 await page.locator(".profile-commissions").waitFor({state:"visible",timeout:10000});
 assert.ok((await page.locator(".profile-commissions").innerText()).includes("Vídeos"),
   "Meu perfil mostra minhas comissões sem alterar o cadastro");
 await page.goto(origin+"/#/demandas");
 await page.locator(".demand-activity-title").first().waitFor({timeout:10000});
 // Regression: GitHub Pages/browser may fail to load config.js. The PUBLIC fallback
 // must still let the user access PET Gestão without "URL da API ainda não publicada".
 await page.route("**/config.js*",route=>route.abort());
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator(".demand-activity-title").first().waitFor({timeout:10000});
 assert.equal(await page.locator("#notice-dialog").isHidden(),true,"Sem config.js, o site segue conectado a API publica");
 await page.unroute("**/config.js*");
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator(".demand-activity-title").first().waitFor({timeout:10000});
 assert.equal(await page.locator('a[data-route="cronograma"]').count(),0,"Cronograma duplicado não deve aparecer no menu");
 assert.equal(await page.locator('a[data-route="reunioes"]').count(),1,"Atas no menu");
 assert.equal(await page.locator('select[data-filter="status"]').count(),1);
 assert.equal(await page.locator('.task-status-atrasada').count()>0,true);
 assert.equal(await page.locator('select[data-filter="periodMode"]').count(),1,"Mensal e semanal em seletor");
 assert.equal(await page.locator('select[data-filter="status"] option').count(),4,"Visualização sem Geral: Todas, Pendentes, Atrasadas e Concluídas");
 assert.equal(await page.locator('button[data-do="mode"]').count(),0,"Sem controles segmentados redundantes");
 const single=page.locator(".demand-activity-card").filter({hasText:"Poesia no PET"});
 assert.equal(await single.locator(".demand-card-single.demand-card-committee").count(),1,"Uma comissão aparece diretamente, sem seletor");
 assert.equal(await single.locator(".demand-card-single.demand-card-person").count(),1,"Responsável individual real aparece diretamente");
 assert.equal(await single.locator(".demand-card-picker").count(),0,"Não transformar nomes únicos em menus");
 assert.equal(await single.locator(".demand-card-single.demand-card-committee").innerText(),"Vídeos");
 assert.equal(await single.locator(".demand-card-single.demand-card-person").innerText(),"Usuário de teste");
 
 assert.equal(await page.locator('#account-button').count(),0,"Botão Meu perfil removido do topo");
 assert.equal(await page.locator('a[data-route="conta"][href="#/conta"]').count(),1,"Perfil acessível pelo menu lateral");
 // Cenário isolado: quatro comissões + dois responsáveis nomeados.
 committees.push({id:"cards",name:"Cards",memberIds:[],memberCount:0},
  {id:"imaginacao",name:"ImaginAÇÃO",memberIds:[],memberCount:0},
  {id:"cinepet",name:"CinePET",memberIds:[],memberCount:0});
 tasks.push({...task,id:"t-selectors",title:"Demanda com vários vínculos",assigneeIds:["u1","admin"],
  commissionIds:["videos","cards","imaginacao","cinepet"],archivedAt:null,userDone:{},commissionDone:{}});
 await page.reload();
 const mult=page.locator(".demand-activity-card").filter({hasText:"Demanda com vários vínculos"});
 await mult.waitFor();
 assert.equal(await mult.locator(".demand-card-picker").count(),2,"Menus separados para comissão e responsáveis");
 assert.equal(await mult.locator(".demand-card-person>summary").count(),1);
 assert.ok((await mult.locator(".demand-card-committee>summary").innerText()).includes("+3"));
 assert.ok((await mult.locator(".demand-card-person>summary").innerText()).includes("+1"));
 assert.equal(await mult.locator(".demand-card-committee .demand-card-picker-popover li").count(),4);
 assert.equal(await mult.locator(".demand-card-person .demand-card-picker-popover li").count(),2);
 await mult.locator(".demand-card-committee>summary").click();
 assert.equal(await mult.locator(".demand-card-committee").evaluate(x=>x.open),true,"Clicar expande lista de comissões");
 assert.equal(await mult.locator(".demand-card-person").evaluate(x=>x.open),false);
 await mult.locator(".demand-card-person>summary").click();
 assert.equal(await mult.locator(".demand-card-committee").evaluate(x=>x.open),false,"Abrir outro fecha menu anterior");
 assert.equal(await mult.locator(".demand-card-person").evaluate(x=>x.open),true);
 await page.locator(".page-title").click();
 assert.equal(await mult.locator(".demand-card-person").evaluate(x=>x.open),false,"Clicar fora fecha a lista");
 assert.ok((await mult.locator(".demand-card-person .demand-card-picker-popover").textContent()).includes("Admin"),"Lista preserva todos os nomes mesmo quando recolhida");
 assert.equal(await mult.locator(".demand-card-person .demand-card-picker-popover").getByText("Cards").count(),0,"Comissões não aparecem como pessoas");
 const columnsOnDesktop=await mult.evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
 assert.equal(columnsOnDesktop,4,"Quatro colunas compactas: nome, status, data e ação");
 // Painéis recolhíveis e centralização real da Postagem em diferentes larguras.
 const multiTask=tasks.find(x=>x.id==="t-selectors");
 multiTask.deadlines=[
   {id:"p1",label:"Prazo",dueAt:"2026-11-15T15:00:00",assigneeIds:["u1"]},
   {id:"p2",label:"Correção",dueAt:"2026-11-16T15:00:00",assigneeIds:["admin"]},
   {id:"p3",label:"Postagem",dueAt:"2026-11-17T15:00:00",assigneeIds:["u1"]}
 ];
 for(const width of [1420,390]){
   await page.setViewportSize({width,height:850});
   await page.goto(origin+"/#/atividade/t-selectors");
   await page.reload(); // Atualiza os dados simulados alterados após o bootstrap anterior.
   const assignees=page.locator("details.assignee-card");
   const progress=page.locator("details.commission-progress-card");
   assert.equal(await assignees.count(),1,"Responsáveis recolhível no viewport "+width);
   assert.equal(await progress.count(),1,"Andamento das comissões recolhível no viewport "+width);
   for(const section of [assignees,progress]){
     assert.equal(await section.evaluate(e=>e.open),true,"Começa expandido");
     await section.locator("summary").click();
     assert.equal(await section.evaluate(e=>e.open),false,"Minimiza o painel");
     await section.locator("summary").click();
     assert.equal(await section.evaluate(e=>e.open),true,"Expande o painel");
   }
   if(width===390){
     const metrics=await page.locator(".stage-posting-top").evaluate(el=>{
       const parent=el.getBoundingClientRect();
       const icon=el.querySelector(".stage-compact-icon").getBoundingClientRect();
       const info=el.querySelector(".stage-compact-info").getBoundingClientRect();
       const groupCenter=(icon.left+info.right)/2;
       return {offset:Math.abs(groupCenter-(parent.left+parent.right)/2),overflow:info.right>parent.right+2};
     });
     assert.ok(metrics.offset<=16,"Ícone e textos da Postagem ficam centralizados no celular: "+JSON.stringify(metrics));
     assert.equal(metrics.overflow,false,"Texto de Postagem não ultrapassa a faixa");
   }
 }
 await page.setViewportSize({width:1420,height:900});
 await page.goto(origin+"/#/demandas");
 const oneCommittee=page.locator(".demand-activity-card").filter({hasText:"Atividade exclusiva da comissão"});
 assert.equal(await oneCommittee.locator(".demand-card-single.demand-card-committee").count(),1,"Comissão única visível");
 assert.equal(await oneCommittee.locator(".demand-card-person").count(),0,"Integrante não vira responsável individual automaticamente");
 tasks=tasks.filter(x=>x.id!=="t-selectors");
 committees.splice(1);
 await page.reload();
 // Eventos coletivos: uma data, sem etapas e sem conclusão manual.
 tasks.push({...task,id:"t-everyone",title:"Evento para Todos(as)",assignmentScope:"todos",
   assigneeIds:["u1","admin"],commissionIds:[],userDone:{},commissionDone:{},archivedAt:null,
   deadlines:[{id:"evento-data",label:"Evento",dueAt:"2026-11-29T23:59:59",assigneeIds:[]}]});
 await page.reload();
 const allCard=page.locator(".demand-activity-card").filter({hasText:"Evento para Todos(as)"});
 await allCard.waitFor();
 assert.equal(await allCard.locator(".demand-card-person").innerText(),"Todos","Card mostra Todos como grupo");
 await page.goto(origin+"/#/atividade/t-everyone");
 assert.equal(await page.locator(".assignee-everyone").innerText(),"Todos");
 assert.ok((await page.locator(".details-facts").innerText()).includes("Data do evento"));
 assert.equal(await page.locator("[data-detail-status]").count(),0,"Evento coletivo não possui seletor de conclusão");
 user.role="petiano";
 await page.reload();
 await page.goto(origin+"/#/atividade/t-everyone");
 await page.locator('button[data-do="delete-task"]').waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator('button[data-do="delete-task"]').count(),1,"PETiano pode excluir evento ativo");
 assert.equal(await page.locator("[data-detail-status]").count(),0,"PETiano não conclui evento manualmente");
 user.role="tutor";
 await page.reload();
 await page.goto(origin+"/#/registrar/t-everyone");
 await page.locator("#collective-event-day").waitFor();
 await page.setViewportSize({width:390,height:844});
 const eventSettings=page.locator("#deadline-settings");
 assert.equal(await page.locator(".assignment-all").innerText().then(x=>x.includes("permissão de concluir")),false,
   "Texto Todos(as) não deve falar em permissão de concluir");
 const eventInput=page.locator("#collective-event-day");
 assert.equal(await eventInput.getAttribute("min"),null,"Qualquer ano deve ser selecionável");
 assert.equal(await page.locator("#collective-date-year").inputValue(),"2026","Ano editável permanece preenchido");
 assert.equal(await page.locator("#collective-date-day").inputValue(),"29","Editar evento existente mantém o dia");
 assert.equal(await page.locator("#collective-date-month").inputValue(),"11","Editar evento existente mantém o mês");
 const labelBounds=await eventSettings.locator(".collective-date-label-text").boundingBox();
 const starBounds=await eventSettings.locator(".collective-date-label-text .task-form-required").boundingBox();
 assert.ok(labelBounds&&starBounds&&starBounds.y>=labelBounds.y-2&&
   starBounds.y+starBounds.height<=labelBounds.y+labelBounds.height+2,
   "Asterisco fica alinhado ao texto Data do evento no celular");
 await page.locator("#collective-date-year").fill("2015");
 await page.locator("#collective-date-month").fill("04");
 await page.locator("#collective-date-day").fill("12");
 assert.equal(await eventInput.inputValue(),"2015-04-12","Seletor aceita qualquer ano passado");
 await page.locator("#collective-date-year").fill("2026");
 await page.locator("#collective-date-month").fill("12");
 await page.locator("#collective-date-day").fill("01");
 assert.equal(await eventSettings.locator('input[type="date"]').count(),1,
   "No celular, Todos(as) tem exatamente um campo: a data");
 assert.equal(await eventSettings.locator('input[type="time"]').count(),0,
   "Evento coletivo não exige horário");
 assert.equal(await eventSettings.locator('[data-stage="label"], [data-stage="assignee"]').count(),0,
   "Evento coletivo não pede Prazo, Correção, Postagem nem responsável por etapa");
 assert.ok((await eventSettings.innerText()).includes("Data do evento"));
 assert.equal((await eventSettings.innerText()).includes("A etapa Prazo é obrigatória"),false,
   "Mensagem antiga de prazo obrigatório não pode aparecer");
 await page.setViewportSize({width:1420,height:900});
 assert.equal(await page.locator(".live-stage").count(),0,"Todos(as) não usa etapas");
 assert.equal(await page.locator('[data-do="add-stage"]').count(),0,"Todos(as) só solicita a data");
 assert.equal(await page.locator("#collective-date-year").inputValue(),"2026");
 await page.locator(".task-form-header-save").click();
 await page.waitForTimeout(180);
 const savedAll=calls.filter(x=>x.p==="/tasks/t-everyone"&&x.method==="PUT").at(-1)?.body;
 assert.deepEqual(savedAll?.deadlines.map(x=>x.label),["Evento"]);
 assert.ok(savedAll.deadlines[0].dueAt.startsWith("2026-12-01"));
 await page.goto(origin+"/#/registrar");
 await page.locator('.assignment-modes [data-value="todos"]').click();
 assert.equal(await page.locator("#collective-date-year").inputValue(),"2026","Em evento novo, só ano é pré-preenchido");
 assert.equal(await page.locator("#collective-date-day").inputValue(),"","Evento novo não escolhe dia sozinho");
 assert.equal(await page.locator("#collective-date-month").inputValue(),"","Evento novo não escolhe mês sozinho");
 // Saída de uma criação alterada: cancelar mantém; confirmar descarta.
 await page.evaluate(()=>{location.hash="#/atividade/t-everyone"});
 await page.locator("#notice-dialog").waitFor({state:"visible",timeout:10000});
 assert.ok((await page.locator("#notice-title").innerText()).includes("Alterações não salvas"));
 assert.equal(await page.locator("#notice-dialog button[data-do='notice-cancel']").innerText(),"Continuar editando");
 await page.locator("#notice-dialog button[data-do='notice-cancel']").click();
 assert.equal(await page.locator('#task-form input[name="title"]').count(),1,"Cancelar mantém formulário aberto");
 await page.evaluate(()=>{location.hash="#/atividade/t-everyone"});
 await page.locator("#notice-dialog [data-do='notice-confirm']").click();
 await page.locator(".details-facts").waitFor();
 assert.ok((await page.locator(".details-facts").innerText()).includes("Data do evento"));
 // Uma pessoa: data simples e conclusão pela própria pessoa, sem arquivamento por data.
 tasks.push({...task,id:"t-one-person",title:"Atividade individual simples",
   assignmentScope:"usuarios",assigneeIds:["u1"],commissionIds:[],
   userDone:{},commissionDone:{},archivedAt:null,deadlines:[]});
 await page.goto(origin+"/#/registrar/t-one-person");
 await page.reload({waitUntil:"load"});
 await page.locator("#collective-date-year").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator("#collective-date-year").inputValue(),"2026","Ano atual pré-preenchido para uma pessoa");
 assert.equal(await page.locator("#collective-date-day").inputValue(),"","Dia da atividade individual em branco");
 assert.equal(await page.locator("#collective-date-month").inputValue(),"","Mês da atividade individual em branco");
 assert.ok((await page.locator("#deadline-settings").innerText()).includes("Data da atividade"));
 assert.equal(await page.locator(".live-stage").count(),0,"Uma pessoa não recebe etapas de prazo, correção ou postagem");
 assert.equal(await page.locator('[data-do="add-stage"]').count(),0,"Uma pessoa não precisa adicionar etapas");
 await page.locator("#collective-date-day").fill("15");
 await page.locator("#collective-date-month").fill("04");
 await page.locator("#collective-date-year").fill("2015");
 await page.locator(".task-form-header-save").click();
 await page.waitForTimeout(200);
 const singleSaved=tasks.find(t=>t.id==="t-one-person");
 assert.deepEqual(singleSaved.deadlines.map(x=>x.label),["Atividade"],"Data da pessoa é salva sem etapas adicionais");
 assert.equal(singleSaved.archivedAt,null,"A data passada não conclui automaticamente uma tarefa individual");
 await page.goto(origin+"/#/atividade/t-one-person");
 await page.reload({waitUntil:"domcontentloaded"}); // Recarrega bootstrap após edição e mudança de data.
 await page.locator(".details-facts").waitFor({state:"visible",timeout:10000});
 assert.ok((await page.locator(".details-facts").innerText()).includes("Data da atividade"));
 assert.equal(await page.locator("[data-detail-status]").count(),1,
   "A pessoa continua podendo concluir sua própria demanda");
 await page.goto(origin+"/#/registrar/t-one-person");
 await page.locator("#collective-date-year").waitFor({state:"visible"});
 await page.locator('input[data-assign="usuarios"][value="admin"]').check();
 assert.equal(await page.locator("#stage-rows").count(),1,"Duas pessoas usam etapas opcionais");
 await page.locator('input[data-assign="usuarios"][value="admin"]').uncheck();
 assert.equal(await page.locator("#collective-date-day").count(),1,"Retornar a uma pessoa restaura a data simples");
 tasks=tasks.filter(x=>x.id!=="t-one-person");
 await page.reload({waitUntil:"load"});
 // Demanda individual: remover todos os prazos, salvar e voltar para adicionar.
 tasks.push({...task,id:"t-step-empty",title:"Demanda sem etapas",
   assignmentScope:"usuarios",assigneeIds:["u1","admin"],commissionIds:[],
   userDone:{},commissionDone:{},archivedAt:null,deadlines:[]});
 // Atualizar bootstrap numa página existente antes de abrir a nova demanda fictícia.
 await page.goto(origin+"/#/inicio");
 await page.reload({waitUntil:"load"});
 await page.locator(".dashboard-grid").waitFor({state:"visible",timeout:10000});
 await page.goto(origin+"/#/registrar/t-step-empty");
 await page.locator("#task-form").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator(".live-stage").count(),0);
 await page.locator('[data-do="add-stage"]').click();
 assert.equal(await page.locator('.live-stage [data-stage-part="year"]').inputValue(),String(new Date().getFullYear()),
   "Ano da etapa é preenchido automaticamente, inclusive para múltiplos responsáveis");
 assert.equal(await page.locator('.live-stage [data-stage-part="day"]').inputValue(),"","Dia da etapa começa vazio");
 assert.equal(await page.locator('.live-stage [data-stage-part="month"]').inputValue(),"","Mês da etapa começa vazio");
 await page.locator('.live-stage [data-stage-part="day"]').fill("03");
 await page.locator('.live-stage [data-stage-part="month"]').fill("12");
 assert.equal(await page.locator('.live-stage [data-stage="day"]').inputValue(),new Date().getFullYear()+"-12-03",
  "Campos separados atualizam o calendário da etapa");
 await page.locator(".task-form-header-save").click();
 await page.waitForTimeout(180);
 assert.equal(tasks.find(x=>x.id==="t-step-empty").deadlines.length,1,"Adicionar etapa após zerar prazos");
 await page.goto(origin+"/#/registrar/t-step-empty");
 await page.locator('#stage-rows [data-do="remove-stage"]').click();
 await page.locator(".task-form-header-save").click();
 await page.waitForTimeout(180);
 assert.deepEqual(tasks.find(x=>x.id==="t-step-empty").deadlines,[],"Demanda comum aceita remover prazos");
 await page.goto(origin+"/#/registrar/t-step-empty");
 assert.equal(await page.locator(".live-stage").count(),0,"Edição não recria prazo removido");
 await page.locator('[data-do="add-stage"]').click();
 assert.equal(await page.locator(".live-stage").count(),1,"Botão Adicionar etapa continua disponível");
 tasks=tasks.filter(x=>!["t-everyone","t-step-empty"].includes(x.id));
 await page.goto(origin+"/#/demandas");
 await page.reload(); // Recarrega o bootstrap após retirar a demanda fictícia.

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
 const actions=await page.locator(".mine-task-item").first().evaluate(el=>{
   const parent=el.querySelector(".demand-card-actions"),details=parent.querySelector(".demand-activity-action"),finish=parent.querySelector(".demand-finish-action");
   const a=details.getBoundingClientRect(),b=finish.getBoundingClientRect(),p=parent.getBoundingClientRect();
   return {sameRow:Math.abs(a.top-b.top)<3,gap:b.left-a.right,container:p.width,buttons:a.width+b.width};
  });
  assert.equal(actions.sameRow,true,"Ver detalhes e Concluir na mesma linha");
  assert.ok(actions.gap>=10,"Botões devem ter separação visual");
  assert.ok(actions.container>=actions.buttons+10,"Botões não podem se sobrepor");
 assert.ok(mineSize.button<mineSize.card*.45,"Concluir deve ser um botão compacto, não largura total");
 await page.goto(origin+"/#/registrar/t2");
 await page.locator('.task-form-header-save').waitFor();
 await page.locator('input[name="overviewVisibility"][value="comissao"]').waitFor();
 assert.equal(await page.locator('input[name="overviewVisibility"][value="comissao"]').isChecked(),true,"Opção de comissão preservada na edição");
 user.role="petiano";
 await page.goto(origin+"/#/registrar/t1");
 await page.reload({waitUntil:"domcontentloaded"});
 // Seleção múltipla de arquivos locais para guardar na demanda.
 await page.locator("#task-file-input").waitFor({state:"attached",timeout:10000});
 assert.equal(await page.locator("#task-file-input").getAttribute("multiple"),"");
 assert.equal(await page.locator("#task-file-input").getAttribute("accept"),"image/jpeg,image/png,image/webp",
  "Seleção somente dos formatos originais que o servidor preserva");
 const png=await page.evaluate(()=>{
  const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;
  const ctx=canvas.getContext("2d");ctx.fillStyle="#6525bc";ctx.fillRect(0,0,32,32);
  return canvas.toDataURL("image/png").split(",")[1];
 });
 const photoBytes=Buffer.from(png,"base64");
 await page.locator("#task-file-input").setInputFiles([
  {name:"foto-1.png",mimeType:"image/png",buffer:photoBytes},
  {name:"foto-2.png",mimeType:"image/png",buffer:photoBytes}
 ]);
 await page.waitForFunction(()=>document.querySelectorAll("#task-file-selection .task-attachment-item").length===2);
 assert.equal(await page.locator("#task-file-selection .task-attachment-item").count(),2,
  "Duas fotos podem ser escolhidas para a mesma demanda");
 assert.ok((await page.locator("#task-file-selection").innerText()).includes("foto-1.png"),"Extensão original mantida");
 assert.ok((await page.locator("#task-file-selection").innerText()).includes("foto-2.png"),"Não converter imagem em JPEG");
 assert.equal(await page.locator("#task-file-selection img").count(),2,"Miniaturas locais das fotos");
 await page.locator('[data-do="task-photo-preview-local"]').first().click();
 await page.locator("#person-photo-modal img").waitFor();
 assert.equal(await page.locator("#person-photo-modal img").count(),1,"Foto abre prévia ampliada");
 await page.locator("#person-photo-modal [data-do='person-photo-close']:not(.person-photo-backdrop)").click();
 assert.equal(await page.locator("#person-photo-modal").count(),0,"Fechar prévia não remove a foto escolhida");
 await page.locator('[data-do="task-file-unselect"]').first().click();
 assert.equal(await page.locator("#task-file-selection .task-attachment-item").count(),1,
  "Retirar um arquivo mantém os demais");
 await page.locator('[data-do="task-file-unselect"]').first().click();
 assert.equal(await page.locator("#task-file-selection .task-attachment-item").count(),0);
 // A Tutoria não visualiza o seletor e não recebe anexos de PETianos.
 user.role="tutor";
 await page.reload({waitUntil:"domcontentloaded"});
 assert.equal(await page.locator("#task-file-input").count(),0,
  "Tutoria não possui acesso aos anexos das demandas");
 await page.locator('input[name="overviewVisibility"][value="comissao"]').check();
 assert.equal(await page.locator('#task-form button[type="submit"]').count(),0,"Nenhum Salvar demanda duplicado abaixo do formulário de edição");
 assert.equal(await page.locator('.page-actions button[form="task-form"].task-form-header-save').count(),1,"Salvar demanda permanece no cabeçalho");
 const formButtons=await page.locator('.page-actions').evaluate(el=>({
  save:!!el.querySelector(".task-form-header-save"),
  back:!!el.querySelector('[data-do="back"]')
 }));
 assert.ok(formButtons.save&&!formButtons.back,"Salvar no cabeçalho sem Voltar duplicado");
 await page.locator('.task-form-header-save').click();
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
 await page.locator('#meeting-form [data-rich-input="rawNotes"]').waitFor({timeout:5000});
 assert.match(await page.locator('#meeting-form [data-rich-input="rawNotes"]').innerText(),/Pauta[\s\S]*Responsável: \(\?\?\?\)/,
  "Atas antigas em texto simples continuam legíveis");
 assert.equal(await page.locator('#meeting-form [data-format="bold"]').count(),1,"Ata permite negrito");
 assert.equal(await page.locator('#meeting-form [data-format="italic"]').count(),1,"Ata permite itálico");
 assert.equal(await page.locator('#meeting-form [data-format="insertUnorderedList"]').count(),1,"Ata permite marcadores");
 assert.equal(await page.locator('#meeting-form [data-rich-color]').count(),1,"Ata permite cor da letra");
 assert.equal(await page.locator('#meeting-form input[name="title"]').getAttribute("type"),"hidden",
  "Título da ata não se torna editor formatado");
 await page.goto(origin+"/#/atividade/t1");
 await page.locator("select[data-detail-status]").waitFor();
 assert.equal(await page.locator("select[data-detail-status]").inputValue(),"atrasada","Venceu há poucos minutos: status atrasada");
 assert.equal(await page.locator(".detail-status-atrasada").count(),1,"Status vermelho nos detalhes");
 assert.ok((await page.locator(".assignee-card").innerText()).includes("Vídeos"),"Comissão é reconhecida como responsável");
 assert.equal(await page.locator(".activity-detail-page").getByText("Anotações da comissão").count(),0,"Anotações apenas na edição");
 assert.equal(await page.locator(".activity-detail-page .page-actions [data-do=back]").count(),0);
 assert.equal(await page.locator(".activity-detail-page .page-actions .danger-outline").count(),1);
 const buttonLayout=await page.locator(".activity-detail-page .page-actions").evaluate(el=>{
   const edit=el.querySelector('a.button'),status=el.querySelector('.detail-status-control'),remove=el.querySelector('.danger-outline');
   return {editHeight:edit.getBoundingClientRect().height,removeHeight:remove.getBoundingClientRect().height,statusWidth:status.getBoundingClientRect().width};
 });
 assert.ok(buttonLayout.editHeight>=45&&buttonLayout.removeHeight>=45,"Botões devem ser legíveis");
 assert.ok(buttonLayout.statusWidth<290,"Seletor de status não pode ter espaçamento exagerado");
 
 assert.equal(await page.locator(".activity-detail-top .detail-left-column .assignee-card").count(),1);
 assert.equal(await page.locator(".assignee-columns>.assignee-people-panel").count(),1,"Pessoas em uma coluna");
 assert.equal(await page.locator(".assignee-columns>.assignee-commissions-panel").count(),1,"Comissões na outra coluna");
 const sideBySide=await page.locator(".assignee-columns").evaluate(el=>{
  const a=el.querySelector(".assignee-people-panel").getBoundingClientRect();
  const b=el.querySelector(".assignee-commissions-panel").getBoundingClientRect();
  return {sameRow:Math.abs(a.top-b.top)<4,gap:b.left-a.right};
 });
 assert.ok(sideBySide.sameRow&&sideBySide.gap>=10,"Colunas separadas lado a lado no PC");
 assert.equal(await page.locator(".stage-responsible strong").count(),1,"Nome do responsável destacado na etapa");
 const responsibilityFont=await page.locator(".stage-responsible").first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
 assert.ok(responsibilityFont>=13,"Informação de responsável deve ser legível");

 assert.equal(await page.locator(".activity-detail-top .detail-history-column .activity-history").count(),1);
 assert.equal(await page.locator(".detail-review-full").count(),1,"Texto para revisão fica abaixo das colunas");
 assert.equal(await page.locator(".assignee-group-heading").filter({hasText:"Comissões"}).count(),0,"Sem legenda roxa duplicada");
 assert.equal(await page.locator('select[data-filter="navigateDemands"]').count(),1,"Filtro de visualização na atividade");
 const order=await page.locator(".activity-detail-layout").evaluate(el=>{
   const assignees=el.querySelector(".assignee-card").getBoundingClientRect();
   const review=el.querySelector(".detail-review-full").getBoundingClientRect();
   return {assigneesBottom:assignees.bottom,reviewTop:review.top,columns:el.querySelector(".activity-detail-top").getBoundingClientRect().width,reviewWidth:review.width};
 });
 assert.ok(order.reviewTop>order.assigneesBottom,"Revisão desce para baixo de Responsáveis");
 assert.ok(Math.abs(order.columns-order.reviewWidth)<5,"Texto para revisão ocupa a largura completa");
 
 assert.ok(await page.locator(".revision-symbol svg").count()>0);
 assert.equal(await page.locator("#connection-label").count(),0);
 assert.equal(await page.locator('select[data-detail-status] option[value="concluir"]').textContent(),"Concluído");
 assert.equal(await page.locator(".activity-history").evaluate(x=>x.open),true,"Histórico exibido inicialmente na lateral");
 assert.equal(await page.locator(".revision-symbol").count(),2,"Registros aparecem com ícones");
 await page.locator(".activity-history summary").click();
 assert.equal(await page.locator(".activity-history").evaluate(x=>x.open),false,"Histórico recolhe");
 await page.locator(".activity-history summary").click();
 assert.equal(await page.locator(".activity-history").evaluate(x=>x.open),true,"Histórico pode reabrir");
 await page.locator("select[data-detail-status]").selectOption("concluir");
 assert.equal(await page.locator('#finish-dialog input[data-kind="commission"]').count(),1);
 await page.locator('[data-do="finish-close"]').last().click();
 await page.goto(origin+"/#/atividade/t2");
 await page.locator(".assignee-card").waitFor();
 assert.ok((await page.locator(".assignee-card").innerText()).includes("Vídeos"),"Demanda apenas de comissão exibe a equipe");
 assert.equal(await page.locator(".assignee-card").getByText("Não definido").count(),0,"Não mostrar responsável indefinido quando há comissão");
 assert.equal(await page.locator(".assignee-people-panel").count(),0,"Não inventar pessoa quando há apenas comissão");
 assert.equal(await page.locator(".assignee-columns-single").count(),1,"Comissão única ocupa o quadro sem coluna vazia");

 assert.equal(await page.locator(".detail-left-column .assignee-group-heading").filter({hasText:"Comissões"}).count(),0,"Comissão aparece diretamente, sem subtítulo roxo");
 assert.ok((await page.locator(".assignee-team").innerText()).includes("Usuário de teste"),"Integrante da comissão identificado");
 
 assert.equal(await page.locator("select[data-detail-status]").inputValue(),"pendente","Prazo futuro permanece pendente");
 await page.goto(origin+"/#/registrar");
 await page.locator('#task-form button[type="submit"]').waitFor();
 assert.equal(await page.locator('.task-form-header-save').count(),0,"Cadastro mantém o botão Salvar no rodapé");
 await page.goto(origin+"/#/registrar/t1");
 await page.locator('[data-rich-input="captionText"]').waitFor();
 assert.ok((await page.locator('[data-rich-input="captionText"]').innerText()).includes("#PET"),"Legenda preservada");
 const editor=page.locator('[data-rich-input="captionText"]');
 await editor.fill("Revisão 📚 com cores");
 await editor.selectText();
 const toolbar=page.locator('[data-rich="captionText"]');
 await toolbar.locator('[data-format="bold"]').click();
 await toolbar.locator('[data-format="italic"]').click();
 await toolbar.locator('[data-format="underline"]').click();
 await toolbar.locator('[data-rich-color]').fill("#dd3344");
 const combinedHtml=await editor.innerHTML();
 assert.match(combinedHtml,/<strong\b/i,"Negrito é preservado");
 assert.match(combinedHtml,/<em\b/i,"Itálico funciona junto ao negrito");
 assert.match(combinedHtml,/<u\b/i,"Sublinhado funciona com negrito e itálico");
 assert.match(combinedHtml,/style="color:\s*(?:rgb\(221,\s*51,\s*68\)|#dd3344)/i,"Cor aplicada à letra");
 assert.doesNotMatch(combinedHtml,/background(?:-color)?\s*:/i,"Cor do texto não altera o fundo");
 const measured=await editor.locator("strong em u span").evaluate(element=>({
  fontStyle:getComputedStyle(element).fontStyle,
  fontWeight:getComputedStyle(element).fontWeight,
  textDecoration:getComputedStyle(element.closest("u")).textDecorationLine,
  color:getComputedStyle(element).color,
  background:getComputedStyle(element).backgroundColor,
  parentBackground:getComputedStyle(element.closest("[contenteditable]")).backgroundColor
 }));
 assert.equal(measured.fontStyle,"italic","Itálico visível");
 assert.ok(Number(measured.fontWeight)>=600,"Texto continua em negrito");
 assert.ok(measured.textDecoration.includes("underline"),"Sublinhado visível");
 assert.equal(measured.color,"rgb(221, 51, 68)","Cor de fonte correta");
 assert.equal(measured.parentBackground,"rgb(255, 255, 255)","Fundo branco permanece inalterado");
 // Regressão real: botões permanecem marcados ao escrever, até serem desligados.
 await editor.fill("");
 await editor.click();
 for(const name of ["bold","italic","underline"]){
  const control=toolbar.locator('[data-format="'+name+'"]');
  if(await control.getAttribute("aria-pressed")==="true")await control.click();
  await control.click();
  assert.equal(await control.getAttribute("aria-pressed"),"true",name+" fica ativado");
 }
 await page.keyboard.type("Escrevendo com três estilos");
 const firstRun=editor.locator("span[data-rich-typed]").first();
 await firstRun.waitFor({timeout:5000});
 const typed=await firstRun.evaluate(el=>({
  italic:getComputedStyle(el).fontStyle,
  bold:getComputedStyle(el).fontWeight,
  underline:getComputedStyle(el).textDecorationLine,
  content:el.textContent
 }));
 assert.equal(typed.italic,"italic","Digitando com I ativado gera itálico visível");
 assert.ok(Number(typed.bold)>=600,"Negrito ativo permanece durante a digitação");
 assert.ok(typed.underline.includes("underline"),"Sublinhado ativo permanece durante a digitação");
 assert.equal(typed.content,"Escrevendo com três estilos");
 await toolbar.locator('[data-format="italic"]').click();
 assert.equal(await toolbar.locator('[data-format="italic"]').getAttribute("aria-pressed"),"false","I desliga separadamente");
 assert.equal(await toolbar.locator('[data-format="bold"]').getAttribute("aria-pressed"),"true","B permanece ligado");
 assert.equal(await toolbar.locator('[data-format="underline"]').getAttribute("aria-pressed"),"true","U permanece ligado");
 await page.keyboard.type(" sem italico");
 const secondRun=editor.locator("span[data-rich-typed]").last();
 const typed2=await secondRun.evaluate(el=>({italic:getComputedStyle(el).fontStyle,bold:getComputedStyle(el).fontWeight,
  underline:getComputedStyle(el).textDecorationLine}));
 assert.equal(typed2.italic,"normal","Desligar I remove itálico do texto novo");
 assert.ok(Number(typed2.bold)>=600,"B permanece ativo enquanto I foi desligado");
 assert.ok(typed2.underline.includes("underline"),"U permanece ativo enquanto I foi desligado");
 await toolbar.locator('[data-format="underline"]').click();
 await toolbar.locator('[data-format="bold"]').click();
 await page.keyboard.type(" normal");
 assert.equal(await toolbar.locator('[data-format="bold"]').getAttribute("aria-pressed"),"false");
 assert.equal(await toolbar.locator('[data-format="underline"]').getAttribute("aria-pressed"),"false");
 assert.equal(await editor.locator("span[data-rich-typed]").last().evaluate(el=>getComputedStyle(el).fontWeight),"400",
  "Desligar B retira o negrito do texto novo");
 assert.equal(await page.locator('[data-rich="captionText"] .rich-toolbar-group').count(),2,"Formatação agrupada");
 assert.ok(await page.locator('[data-rich="captionText"] button[aria-label="Lista numerada"]').count(),"Lista possui nome legível");
 await editor.fill("Primeira linha\nSegunda linha");
 await editor.selectText();
 await page.locator('[data-rich="captionText"] button[data-format="insertOrderedList"]').click();
 assert.match(await editor.innerHTML(),/<ol\b/i,"Lista numerada deve usar marcador semântico real");

 await page.locator('a[data-route="demandas"]').click();
 await page.locator("#notice-dialog").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator('#notice-dialog button[data-do="notice-confirm"]').innerText(),"Sair sem salvar");
 await page.locator('#notice-dialog button[data-do="notice-confirm"]').click();
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+"/#/atividade/t1");
 await page.locator(".assignee-columns").waitFor();
 const mobileColumns=await page.locator(".assignee-columns").evaluate(el=>{
  const a=el.querySelector(".assignee-people-panel").getBoundingClientRect(),
    b=el.querySelector(".assignee-commissions-panel").getBoundingClientRect();
  return {stacked:b.top>=a.bottom-2,columns:getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length};
 });
 assert.equal(mobileColumns.stacked,true,"Pessoas e Comissões ficam empilhadas no celular");
 assert.equal(mobileColumns.columns,1,"Sem colunas apertadas no celular");
 await page.goto(origin+"/#/inicio");
 await page.locator(".dashboard-grid .demand-activity-card").first().waitFor();
 await page.goto(origin+"/#/minhas-pendencias");
 const mobileSize=await page.locator(".mine-task-item").first().evaluate(el=>({button:el.querySelector(".demand-finish-action").getBoundingClientRect().width,card:el.querySelector(".demand-activity-card").getBoundingClientRect().width}));
 const mobileActions=await page.locator(".mine-task-item").first().evaluate(el=>{
   const group=el.querySelector(".demand-card-actions"),a=group.querySelector(".demand-activity-action").getBoundingClientRect(),b=group.querySelector(".demand-finish-action").getBoundingClientRect();
   return {sameRow:Math.abs(a.top-b.top)<3,gap:b.left-a.right};
  });
  assert.equal(mobileActions.sameRow,true,"Ações na mesma linha no celular");
  assert.ok(mobileActions.gap>=8,"Separação visual no celular");
 assert.ok(mobileSize.button<mobileSize.card*.7,"Concluir deve continuar compacto no celular");
 await wait(200);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+4);
 assert.equal(overflow,false,"Sem rolagem horizontal excessiva no celular");
 // Seletores também devem funcionar no celular sem quebrar o card.
 committees.push({id:"cards",name:"Cards",memberIds:[]},{id:"imaginacao",name:"ImaginAÇÃO",memberIds:[]});
 tasks.push({...task,id:"t-mobile-selectors",title:"Seletor no celular",assigneeIds:["u1","admin"],
  commissionIds:["videos","cards","imaginacao"],archivedAt:null,userDone:{},commissionDone:{}});
 await page.goto(origin+"/#/demandas");
 await page.reload(); // Atualizar bootstrap com cenário fictício.
 const mobileCard=page.locator(".demand-activity-card").filter({hasText:"Seletor no celular"});
 await mobileCard.waitFor();
 assert.equal(await mobileCard.locator(".demand-card-picker").count(),2);
 await mobileCard.locator(".demand-card-committee>summary").click();
 assert.equal(await mobileCard.locator(".demand-card-committee").evaluate(el=>el.open),true);
 const menuRect=await mobileCard.locator(".demand-card-committee .demand-card-picker-popover").boundingBox();
 assert.ok(menuRect?.width>=200,"Lista de comissões legível no celular");
 assert.ok(menuRect.x>=-2&&menuRect.x+menuRect.width<=392,"Lista de comissões dentro da tela");
 await page.keyboard.press("Escape");
 assert.equal(await mobileCard.locator(".demand-card-committee").evaluate(el=>el.open),false,"Esc fecha a lista");
 tasks=tasks.filter(x=>x.id!=="t-mobile-selectors");committees.splice(1);
 await page.goto(origin+"/#/inicio");
 await page.reload();
 await page.locator(".dashboard-grid .demand-card-cover-link").first().click();
 await page.waitForURL(/#\/atividade\/t1/,{timeout:6000});
 assert.ok(await page.locator('a[data-route="inicio"]').evaluate(el=>el.classList.contains("active")),"Visão geral continua destacada após entrar no card");
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
 await page.goto(origin+"/#/reunioes");
 await page.locator('select[data-filter="meetings"]').waitFor();
 assert.equal(await page.locator('select[data-filter="meetings"] option').count(),2,"Atas mostram Todas/Recentes no seletor");
 await page.goto(origin+"/#/ajuda");
 await page.locator(".help-page").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator("#commission-help-title").count(),1,"Ajuda de Comissões integra a Ajuda geral");
 const menuOrder=await page.locator("#primary-nav .nav-link").evaluateAll(nodes=>nodes.map(el=>el.dataset.route));
 assert.equal(menuOrder.indexOf("ajuda"),menuOrder.indexOf("comissoes")+1,"Ajuda abaixo de Comissões");
 await page.goto(origin+"/#/comissoes");
 assert.equal(await page.locator(".commission-help-item").count(),0,"Sem Ajuda duplicada em Comissões");
 await page.goto(origin+"/#/comissoes/videos");
 await page.locator('select[data-filter="commissionStatus"]').waitFor();
 assert.equal(await page.locator('select[data-filter="commissionStatus"] option').count(),3);
 // Com sessão de Tutoria e PETiano(a), o lote de Concluídas aparece sem Admin.
 tasks.push({...task,id:"t-done-roles",title:"Concluída para validar perfis",
  archivedAt:"2026-11-10T18:00:00.000Z",status:"concluida"});
 await page.goto(origin+"/#/demandas");
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator('select[data-filter="status"]').selectOption("concluida");
 await page.locator('[data-do="archive-selection-open"]').waitFor({state:"visible",timeout:10000});
 assert.equal(user.role,"tutor","A Tutoria tem botão Excluir demandas");
 await page.locator('[data-do="archive-selection-open"]').click();
 assert.equal(await page.locator('[data-archive-select]').count()>=1,true,"Tutoria pode marcar concluídas");
 await page.locator('[data-do="archive-selection-cancel"]').click();
 user.role="petiano";
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator('select[data-filter="status"]').selectOption("concluida");
 await page.locator('[data-do="archive-selection-open"]').waitFor({state:"visible",timeout:10000});
 await page.locator('[data-do="archive-selection-open"]').click();
 assert.equal(await page.locator('[data-archive-select]').count()>=1,true,"PETiano(a) pode marcar concluídas");
 await page.locator('[data-do="archive-selection-cancel"]').click();
 user.role="usuario";
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator('select[data-filter="status"]').selectOption("concluida");
 assert.equal(await page.locator('[data-do="archive-selection-open"]').count(),0,"Somente leitura não pode excluir");
 user.role="tutor";
 tasks=tasks.filter(t=>t.id!=="t-done-roles");
 // O teste de perfil Usuário altera o mock sem reemitir um login;
 // autenticar a Tutoria novamente para atualizar papel e sessão no front.
 await loginAs(user);
 await page.goto(origin+"/#/minhas-pendencias");
 await page.locator('select[data-filter="mineStatus"]').waitFor();
 assert.equal(await page.locator('select[data-filter="mineStatus"] option').count(),3);
 // Uma conta recém-promovida ainda tem sessão comum: botão aparece
 // mas exige digitação da senha antes de liberar dados administrativos.
 user.role="admin";user.adminSession=false;
 await loginAs(user);
 await page.locator("#admin-link").waitFor({state:"visible",timeout:10000});
 assert.ok((await page.locator("#admin-link").innerText()).includes("Ativar Administração"),
  "Cargo novo apresenta caminho visível para ativação");
 await page.locator("#open-menu").click();
 await page.locator("#admin-link").click();
 await page.locator("#admin-activation-form").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator('#admin-activation-form input[type="password"]').count(),1,
  "Sessão anterior exige senha antes de ativar Administração");
 assert.equal(await page.locator(".admin-layout").count(),0,"Sessão antiga não acessa painel");
 user.role="tutor";
 // Administração: autenticar pelo mesmo formulário de qualquer integrante.
 await loginAs(admin);
 assert.equal(await page.evaluate(()=>localStorage.getItem("pet-gestao:session-token")),"admin-token","Admin usa o mesmo token do login comum");
 await page.locator("#admin-link").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator("#admin-link").isVisible(),true,"Somente a Administração visualiza Painel Admin");
 // Recarregar confirma que a sessão persistida mantém a conta Admin conectada.
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator("#admin-link").waitFor({state:"visible",timeout:10000});
 // Voltar ao PET Gestão usa uma transição e preserva a identidade Admin.
 await page.goto(origin+"/#/admin/painel");
 await page.locator('[data-do="admin-signout"]').evaluate(el=>el.click());
 await page.locator("#connecting-popup.returning-to-gestao").waitFor({state:"visible",timeout:2500});
 assert.ok((await page.locator(".connecting-message").innerText()).includes("Voltando ao PET Gestão"));
 await page.waitForURL("**/#/inicio");
 await page.locator("#connecting-popup").waitFor({state:"hidden",timeout:10000});
 await page.locator("#admin-link").waitFor({state:"visible",timeout:10000});
 // Administração: mudanças de vagas e de ordem somente após Salvar todas.
 committees.push({id:"cards",name:"Cards",memberIds:[],memberCount:0,maxMembers:0,backgroundColor:"#f7f3ff"});
 await page.goto(origin+"/#/admin/comissoes");
 await page.locator('.admin-commission-item').first().waitFor();
 // O menu lateral do Admin deve fechar ao escolher uma seção no celular.
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-do="admin-menu"]').click();
 await page.locator(".admin-sidebar.open").waitFor({state:"visible",timeout:4000});
 await page.locator('.admin-sidebar a[href="#/admin/usuarios"]').click();
 await page.waitForURL("**/#/admin/usuarios");
 assert.equal(await page.locator(".admin-sidebar.open").count(),0,"Menu Admin fecha ao navegar para Usuários");
 assert.equal(await page.locator('.admin-sidebar a[href="#/admin/demandas"]').count(),0,"Sem Demandas duplicadas no Admin");
 assert.equal(await page.locator('.admin-sidebar a[href="#/admin/reunioes"]').count(),0,"Sem Atas duplicadas no Admin");
 await page.goto(origin+"/#/admin/comissoes");
 await page.locator('.admin-commission-item').first().waitFor();
 assert.equal(await page.locator('[data-do="save-vagas"]').count(),0,"Botões Salvar individuais removidos");
 assert.equal(await page.locator('[data-do="save-all-commissions"]').count(),1,"Único Salvar todas no topo");
 await page.locator('[data-vagas="videos"]').fill("5");
 const countBefore=calls.filter(x=>x.p==="/admin/commissions-batch").length;
 await page.locator('[data-do="move-commission"][data-direction="1"]').first().click();
 assert.equal(calls.filter(x=>x.p==="/admin/commissions-batch").length,countBefore,"Mudar ordem não grava antes de salvar");
 assert.equal(await page.locator(".admin-commission-item").first().getAttribute("data-commission-id"),"cards");
 await page.locator('[data-do="save-all-commissions"]').click();
 await page.waitForTimeout(200);
 const batch=calls.filter(x=>x.p==="/admin/commissions-batch"&&x.method==="PUT").at(-1)?.body;
 assert.deepEqual(batch.commissions.map(x=>x.id),["cards","videos"]);
 assert.equal(batch.commissions.find(x=>x.id==="videos").maxMembers,5,"Vagas e ordem salvas juntas");
 await page.goto(origin+"/#/admin/emails");
 await page.locator("#notification-template-form").waitFor({timeout:10000});
 assert.equal(await page.locator('#mail-form [data-rich-input="message"]').count(),1);
 assert.equal(await page.locator('#mail-form button[type="submit"]').innerText(),"Enviar");
 assert.equal(await page.locator("#mail-scheduled").count(),0,"Agendar não usa checkbox nativo");
 await page.locator('[data-do="mail-toggle-schedule"]').click();
 assert.equal(await page.locator('#mail-form button[type="submit"]').innerText(),"Agendar envio");
 assert.equal(await page.locator('#mail-scheduling input[name="sendAt"]').count(),1);
 await page.locator('[data-do="mail-toggle-schedule"]').click();
 assert.equal(await page.locator('#mail-form button[type="submit"]').innerText(),"Enviar");
 assert.equal(await page.locator('#mail-scheduling input[name="sendAt"]').count(),0);
 const kindSelector=page.locator("#notification-template-kind");
 assert.equal(await kindSelector.locator("option").count(),2,"E-mails só possui modelos criação e revisão");
 assert.equal(await page.locator("#notification-template-form .mail-template-guide-item").count(),4,"Modelo explica as chaves");
 assert.equal(await page.locator("#reminder-days").evaluate(el=>el.closest(".admin-panel").hidden),true,"Avisos fora de E-mails");
 await page.locator('[data-do="mail-preview-template"]').click();
 assert.equal(await page.locator("#mail-preview-dialog").isVisible(),true,"Prévia do modelo abre");
 assert.ok((await page.locator(".mail-preview-envelope").innerText()).includes("PET Gestão"));
 await page.locator('#mail-preview-dialog .mail-preview-heading [data-do="mail-preview-close"]').first().click();
 assert.equal(await page.locator("#mail-preview-dialog").isHidden(),true);
 await page.goto(origin+"/#/admin/configuracoes");
 await page.locator("#reminder-days").waitFor();
 assert.equal(await page.locator("#deadline-template-kind option").count(),2,"Modelos de prazo em Configurações");
 await page.locator("#reminder-days").fill("5");
 await page.locator("#reminder-soon").check();
 await page.locator("#reminder-overdue").check();
 await page.locator("#reminder-overdue-audience").selectOption("all");
 await page.locator('[data-do="save-reminder-settings"]').click();
 await page.waitForTimeout(180);
 assert.equal(settings.reminderSettings?.daysBefore,5,"Prazo personalizável");
 assert.equal(settings.reminderSettings?.dueSoonEnabled,true);
 assert.equal(settings.reminderSettings?.overdueAudience,"all","Aviso vencido seleciona todos os vinculados");
 // Aviso informativo se fecha sozinho em 3 segundos, sem contador.
 await page.locator("#notice-dialog").waitFor({state:"hidden",timeout:5500});
 await page.goto(origin+"/#/admin/emails");
 await page.locator("#notification-template-form input[name=subject]").fill("Nova demanda personalizada");
 await page.locator("#notification-template-form button[type=submit]").click();
 await page.waitForTimeout(180);
 assert.equal(settings.notificationTemplates.create?.subject,"Nova demanda personalizada");
 await page.locator('#notice-dialog button[data-do="notice-cancel"]').click();
 // Modelos de prazo ficam em Configurações, não mais na aba E-mails.
 await page.goto(origin+"/#/admin/configuracoes");
 await page.locator("#deadline-template-kind").selectOption("due_soon");
 await page.locator('[data-do="mail-preview-deadline"]').click();
 assert.ok((await page.locator("#mail-preview-dialog").innerText()).includes("5 dia(s)"),"Prévia traduz a variável dias");
 await page.locator('#mail-preview-dialog .mail-preview-heading [data-do="mail-preview-close"]').first().click();
 await page.goto(origin+"/#/admin/emails");
 await page.locator("#notification-template-kind").selectOption("review");
 assert.notEqual(await page.locator("#notification-template-form input[name=subject]").inputValue(),"Nova demanda personalizada","Revisão possui texto próprio");
 await page.locator("#notification-template-form input[name=subject]").fill("Revisão personalizada");
 await page.locator("#notification-template-form button[type=submit]").click();
 await page.waitForTimeout(180);
 assert.equal(settings.notificationTemplates.create.subject,"Nova demanda personalizada","Salvar revisão não altera criação");
 assert.equal(settings.notificationTemplates.review.subject,"Revisão personalizada");
 await page.locator('#notice-dialog button[data-do="notice-cancel"]').click();
 await page.locator('#mail-form input[name="subject"]').fill("E-mail manual de teste");
 await page.locator('#mail-form [data-rich-input="message"]').fill("Prévia antes do envio");
 await page.locator('[data-do="mail-preview-manual"]').click();
 assert.equal(await page.locator("#mail-preview-dialog").isVisible(),true,"E-mail manual abre prévia");
 assert.ok((await page.locator(".mail-preview-message").innerText()).includes("Prévia antes do envio"));
 await page.locator('#mail-preview-dialog .mail-preview-heading [data-do="mail-preview-close"]').first().click();
 assert.equal(calls.some(x=>x.p==="/mail"&&x.method==="POST"),false,"Prévia não dispara envio");
 // Retornar à conta Tutor(a) para testar suas pendências pessoais.
 await loginAs(user);
 user.notificationEnabled=true;
 tasks.push({...task,id:"t3",title:"Concluir sem e-mail da tutoria",assigneeIds:["u1"],commissionIds:[],createdBy:"u1",
   deadlines:[{id:"p3",label:"Prazo",dueAt:new Date(Date.now()-60000).toISOString(),assigneeIds:["u1"]}],
   userDone:{},commissionDone:{},archivedAt:null,status:"pendente"});
 await page.goto(origin+"/#/minhas-pendencias");
 // O mock incluiu uma demanda após o bootstrap; recarregar para trazê-la ao perfil Tutor(a).
 await page.reload({waitUntil:"domcontentloaded"});
 const personalOnly=page.locator(".mine-task-item").filter({hasText:"Concluir sem e-mail da tutoria"});
 await personalOnly.locator('button[data-do="finish-mine"]').click();
 await page.locator('#notice-dialog [data-do="notice-confirm"]').click();
 await page.waitForTimeout(250);
 const messageAfterFinish=await page.locator("#notice-dialog").innerText();
 assert.ok(messageAfterFinish.includes("Demanda concluída"),"Confirmação de sucesso após concluir");
 assert.ok(!messageAfterFinish.toLowerCase().includes("notificar"),"Conclusão não pede notificação por e-mail");
 const finishCall=calls.find(x=>x.p==="/tasks/t3/finish"&&x.method==="PATCH");
 assert.equal(finishCall?.body.notify,false,"Concluir jamais notifica automaticamente");
 // Voltar ao Admin pela mesma entrada, sem formulário administrativo separado.
 await loginAs(admin);
 await page.locator("#admin-link").waitFor({state:"visible",timeout:10000});
 // Na tela de detalhes de uma concluída, a sessão Admin também é reconhecida fora da rota /admin.
 tasks.push({...task,id:"t-archived",title:"Demanda concluída de teste",
   archivedAt:"2026-11-10T18:00:00.000Z",status:"concluida",
   commissionDone:{videos:{at:"2026-11-10T18:00:00.000Z",by:"u1"}},
   userDone:{u1:{at:"2026-11-10T18:00:00.000Z",by:"u1"}}});
 // Atualizar o bootstrap: a concluída foi adicionada ao mock após o último carregamento.
 await page.reload();
 await page.goto(origin+"/#/atividade/t-archived");
 await page.locator(".activity-detail-page").waitFor({timeout:10000});
 const deleteArchived=page.locator('button[data-do="delete-task"]');
 await deleteArchived.waitFor({state:"visible",timeout:10000});
 assert.equal(await deleteArchived.count(),1,"Detalhe da concluída exibe exclusão definitiva para sessão Admin");
 assert.ok((await deleteArchived.innerText()).includes("Excluir definitivamente"));
 await deleteArchived.click();
 assert.ok((await page.locator("#notice-dialog").innerText()).includes("sem possibilidade de recuperação"),"Exclusão de arquivada exige confirmação");
 await page.locator('#notice-dialog button[data-do="notice-cancel"]').click();
 assert.ok(tasks.some(x=>x.id==="t-archived"),"Cancelar mantém demanda concluída");
 await deleteArchived.click();
 await page.locator('#notice-dialog [data-do="notice-confirm"]').click();
 await page.waitForTimeout(180);
 const deletedArchived=calls.find(x=>x.p==="/tasks/t-archived"&&x.method==="DELETE");
 assert.ok(deletedArchived?.authorization?.includes("admin-token"),"Worker recebe sessão Admin para excluir concluída");
 assert.equal(tasks.some(x=>x.id==="t-archived"),false,"Exclusão definitiva remove a arquivada");
 // Exclusão em lote de Concluídas para PETianos(as), Tutoria e Admin.
 const doneItems=[1,2,3].map(n=>({...task,id:"t-done-"+n,title:"Concluída "+n,
   archivedAt:"2026-11-10T18:00:00.000Z",status:"concluida",
   commissionDone:{videos:{at:"2026-11-10T18:00:00.000Z",by:"u1"}},
   userDone:{u1:{at:"2026-11-10T18:00:00.000Z",by:"u1"}}}));
 tasks.push(...doneItems);
 await page.goto(origin+"/#/demandas");
 await page.reload({waitUntil:"load"});
 await page.locator('select[data-filter="status"]').selectOption("concluida");
 await page.locator('[data-do="archive-selection-open"]').waitFor({state:"visible",timeout:10000});
 const registerAction=await page.locator(".demand-header-actions a.button").boundingBox();
 const deleteAction=await page.locator(".demand-header-actions [data-do='archive-selection-open']").boundingBox();
 assert.ok(registerAction&&deleteAction,"Registrar e Excluir estão no cabeçalho");
 assert.ok(deleteAction.x>registerAction.x && Math.abs(deleteAction.y-registerAction.y)<9,
   "Registrar e Excluir aparecem lado a lado no celular");
 assert.equal(await page.locator('[data-archive-select]').count(),0,
   "As caixas de seleção ficam escondidas até ativar Excluir demandas");
 await page.locator('[data-do="archive-selection-open"]').click();
 const availableToDelete=await page.locator('[data-archive-select]').count();
 assert.ok(availableToDelete>=3,"As três concluídas de teste aparecem com as demais arquivadas");
 await page.locator('[data-do="archive-select-all"]').click();
 assert.equal(await page.locator('[data-archive-select]:checked').count(),availableToDelete,
   "Selecionar todas marca todas as arquivadas visíveis");
 await page.locator('[data-archive-select]').first().uncheck();
 assert.equal(await page.locator('[data-archive-select]:checked').count(),availableToDelete-1,
   "Pode desmarcar individualmente");
 await page.locator('[data-do="archive-select-all"]').click();
 assert.equal(await page.locator('[data-archive-select]:checked').count(),availableToDelete,
   "Selecionar todas remarca as arquivadas visíveis");
 await page.locator('[data-do="archive-delete-selected"]').click();
 assert.ok((await page.locator("#notice-dialog").innerText()).includes(availableToDelete+" demandas selecionadas"),
   "Confirma a quantidade verdadeira antes de excluir");
 await page.locator('#notice-dialog button[data-do="notice-cancel"]').click();
 assert.equal(tasks.filter(t=>t.id.startsWith("t-done-")).length,3,
   "Cancelar não exclui nenhuma demanda");
 await page.locator('[data-do="archive-delete-selected"]').click();
 await page.locator('#notice-dialog button[data-do="notice-confirm"]').click();
 await page.waitForTimeout(250);
 const callBulk=calls.find(x=>x.p==="/tasks/bulk-delete"&&x.method==="POST");
 assert.equal(callBulk?.body.taskIds.length,availableToDelete,"O lote contém todas as concluídas visíveis");
 assert.ok(callBulk?.authorization,"Exclusão em lote usa a sessão autenticada do usuário");
 assert.equal(tasks.some(t=>t.id.startsWith("t-done-")),false,"As três concluídas foram removidas");
 assert.ok(tasks.some(t=>t.id==="t1"),"Demanda ativa permanece intacta");
 await page.goto(origin+"/#/atividade/t1");
 await page.locator('button[data-do="delete-task"]').click();
 assert.ok((await page.locator("#notice-dialog").innerText()).includes("sem possibilidade de recuperação"));
 await page.locator('#notice-dialog [data-do="notice-confirm"]').click();
 await page.waitForTimeout(250);
 assert.ok(calls.some(x=>x.p==="/tasks/t1"&&x.method==="DELETE"));
 assert.equal(tasks.some(x=>x.id==="t1"),false);
 // O controle de exclusão de conta também deve estar acessível pelo perfil.
 await page.goto(origin+"/#/conta");
 await page.locator('[data-do="install-pet-app"]').waitFor({state:"visible",timeout:10000});
 await page.locator('[data-do="install-pet-app"]').click();
 assert.equal(await page.locator("#pet-install-help").isVisible(),true,"Instalação pelo perfil oferece instruções quando não há prompt");
 await page.locator('[data-do="account-delete-open"]').waitFor({state:"visible",timeout:10000});
 await page.locator('[data-do="account-delete-open"]').click();
 assert.equal(await page.locator("#account-delete-dialog").isVisible(),true);
 assert.equal(await page.locator('#delete-account-form input[name="password"]').count(),1);
 assert.equal(await page.locator('#delete-account-form input[name="confirmation"]').count(),1);
 await page.locator('#account-delete-dialog [data-do="account-delete-close"]').last().click();
 assert.equal(await page.locator("#account-delete-dialog").isHidden(),true,
   "Cancelar exclusão da conta não executa nenhuma solicitação");
 assert.equal(calls.some(call=>call.p==="/account"&&call.method==="DELETE"),false);
 // Editor de imagem e RGB da comissão testados em um navegador Chromium real.
 await page.goto(origin+"/#/comissoes/nova");
 await page.locator("#commission-form").waitFor({state:"visible",timeout:10000});
 assert.equal(await page.locator('#commission-form input[name="name"]').count(),1,"Título da comissão continua campo simples");
 assert.equal(await page.locator('#commission-form [data-rich-input="description"]').count(),1,"Descrição usa editor com formatação");
 assert.equal(await page.locator('#commission-form textarea[name="description"]').count(),0,"Descrição não utiliza textarea sem formatação");
 assert.equal(await page.locator('#commission-form [data-format="bold"]').count(),1);
 assert.equal(await page.locator('#commission-form [data-format="italic"]').count(),1);
 assert.equal(await page.locator('#commission-form [data-format="insertOrderedList"]').count(),1);
 assert.equal(await page.locator('#commission-form [data-rich-color]').count(),1);
 assert.equal(await page.locator('#commission-form input[type="color"]:not([data-rich-color])').count(),0,"RGB não usa seletor de cor nativo para a comissão");
 await page.locator('[data-do="commission-preset-gallery"]').click();
 await page.locator("#commission-preset-gallery").waitFor({state:"visible"});
 assert.equal(await page.locator('#commission-preset-gallery .commission-preset-option').count(),12,"Galeria reúne todas as 12 artes");
 await page.locator('[data-do="commission-preset-select"][data-key="videos"]').click();
 await page.locator("#commission-preset-gallery").waitFor({state:"hidden"});
 const presetPng=await page.locator('#commission-form input[name="imageData"]').inputValue();
 assert.match(presetPng,/^data:image\/png;base64,/,"Arte padrão salva como PNG, compatível com o backend");
 await page.locator('#commission-form input[name="name"]').fill("Comissão de Vídeos");
 assert.equal(await page.locator('#commission-form input[name="imageData"]').inputValue(),presetPng,
   "Renomear comissão mantém arte selecionada no campo persistente");
 assert.equal(await page.locator('#commission-image-preview img').count(),1,
   "Imagem escolhida continua visível após mudar o nome");
 await page.locator('[data-do="commission-color-toggle"]').click();
 await page.locator('[data-commission-rgb-range="r"]').fill("128");
 assert.equal((await page.locator('input[name="backgroundColor"]').inputValue()).slice(1,3),"80");
 await page.locator('[data-do="commission-color-preset"][data-color="#deedff"]').click();
 assert.equal(await page.locator('input[name="backgroundColor"]').inputValue(),"#deedff");
 const demoPNG=await page.evaluate(()=>{
   const canvas=document.createElement("canvas");canvas.width=160;canvas.height=110;
   const ctx=canvas.getContext("2d");ctx.fillStyle="#8348c1";ctx.fillRect(0,0,160,110);
   ctx.fillStyle="#ffffff";ctx.fillRect(24,20,112,70);
   return canvas.toDataURL("image/png").split(",")[1];
 });
 await page.locator("#commission-upload").setInputFiles({
   name:"imagem-comissao.png",mimeType:"image/png",buffer:Buffer.from(demoPNG,"base64")
 });
 await page.locator("#commission-image-editor").waitFor({state:"visible",timeout:10000});
 await page.locator("#commission-image-zoom").fill("1.6");
 await page.locator('[data-do="commission-image-rotate"][data-angle="1"]').click();
 await page.locator("#commission-image-resolution").selectOption("768");
 await page.locator('[data-do="commission-image-apply"]').click();
 await page.locator("#commission-image-editor").waitFor({state:"hidden",timeout:10000});
 const preparedImage=await page.locator('#commission-form input[name="imageData"]').inputValue();
 assert.match(preparedImage,/^data:image\/(?:webp|jpeg);base64,/,"Editor produz imagem otimizada");
 assert.ok(preparedImage.length<950000,"Imagem final respeita limite do servidor");
 assert.equal(await page.locator("#commission-image-preview img").count(),1,"Prévia editada aparece no formulário");
 console.log("BROWSER: navegação, evento Todos(as) só com data, exclusão da conta, responsividade e Admin — OK.");
}finally{await browser.close();server.kill();}
