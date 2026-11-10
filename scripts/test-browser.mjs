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
 calls.push({method,p,body});
 if(p==="/auth/me")result={user};
 else if(p==="/bootstrap")result=bootstrap(adminMode);
 else if(p==="/mail")result={items:[]};
 else if(p==="/mail/status")result={connected:true,message:"Teste isolado"};
 else if(p==="/admin/notification-template"&&method==="PUT"){
   settings.notificationTemplates[body.kind]={subject:body.subject,body:body.message};
   result={ok:true};
 }
 else if(p==="/tasks"&&method==="POST"){tasks.push({id:"t"+(tasks.length+1),...body,commissionDone:{},userDone:{},registeredAt:"2026-11-10",archivedAt:null});status=201;result={ok:true,id:"t"+tasks.length};}
 else if(/^\/tasks\/[^/]+$/.test(p)&&method==="PUT"){const current=tasks.find(t=>t.id===p.split("/")[2]);if(current)Object.assign(current,body);result={ok:true};}
 else if(/^\/tasks\/[^/]+$/.test(p)&&method==="DELETE"){tasks=tasks.filter(x=>x.id!==p.split("/")[2]);result={ok:true};}
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
 assert.equal(await page.locator('select[data-filter="periodMode"]').count(),1,"Mensal e semanal em seletor");
 assert.equal(await page.locator('select[data-filter="status"] option').count(),4,"Visualização inclui concluídas");
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
 const oneCommittee=page.locator(".demand-activity-card").filter({hasText:"Atividade exclusiva da comissão"});
 assert.equal(await oneCommittee.locator(".demand-card-single.demand-card-committee").count(),1,"Comissão única visível");
 assert.equal(await oneCommittee.locator(".demand-card-person").count(),0,"Integrante não vira responsável individual automaticamente");
 tasks=tasks.filter(x=>x.id!=="t-selectors");
 committees.splice(1);
 await page.reload();
 // No modo Todos, a interface apresenta o rótulo sem despejar cada nome.
 tasks.push({...task,id:"t-everyone",title:"Demanda para Todos",assigneeIds:["u1","admin"],
  commissionIds:[],userDone:{},commissionDone:{},archivedAt:null});
 await page.reload();
 const allCard=page.locator(".demand-activity-card").filter({hasText:"Demanda para Todos"});
 await allCard.waitFor();
 assert.equal(await allCard.locator(".demand-card-person").innerText(),"Todos","Card mostra Todos como grupo");
 await page.goto(origin+"/#/atividade/t-everyone");
 assert.equal(await page.locator(".assignee-everyone").innerText(),"Todos","Detalhes exibem Todos sem nomes individuais");
 assert.equal(await page.locator(".assignee-commissions-panel").count(),0,"Sem comissão não aparece coluna vazia");
 await page.goto(origin+"/#/registrar/t-everyone");
 await page.locator('.assignment-modes [data-value="todos"].active').waitFor();
 assert.equal(await page.locator("#assignment-container [data-assign]").count(),0,"Editar Todos(as) não mostra seleção individual");
 await page.locator('.task-form-header-save').click();
 await page.waitForTimeout(180);
 assert.equal(calls.filter(x=>x.p==="/tasks/t-everyone"&&x.method==="PUT").at(-1)?.body.assignmentScope,"todos","Salvar mantém a seleção Todos(as)");
 tasks=tasks.filter(x=>x.id!=="t-everyone");
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
 await page.goto(origin+"/#/registrar/t1");
 await page.locator('input[name="overviewVisibility"][value="comissao"]').check();
 assert.equal(await page.locator('#task-form button[type="submit"]').count(),0,"Nenhum Salvar demanda duplicado abaixo do formulário de edição");
 assert.equal(await page.locator('.page-actions button[form="task-form"].task-form-header-save').count(),1,"Salvar demanda junto de Voltar no cabeçalho");
 const formButtons=await page.locator('.page-actions').evaluate(el=>{
  const buttons=[...el.querySelectorAll('button')],save=buttons.find(b=>b.classList.contains("task-form-header-save")),back=buttons.find(b=>b.dataset.do==="back");
  return {save:!!save,back:!!back,near:Math.abs(save.getBoundingClientRect().top-back.getBoundingClientRect().top)<8};
 });
 assert.ok(formButtons.save&&formButtons.back&&formButtons.near,"Salvar e Voltar devem ficar na mesma linha");
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
 await page.locator("#meeting-form textarea").waitFor({timeout:5000});
 assert.equal(await page.locator("#meeting-form textarea").inputValue(),"Pauta\nResponsável: (???)");
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
 await page.locator('[data-rich="captionText"] [data-format="bold"]').click();
 assert.match(await editor.innerHTML(),/<(b|strong)>/i,"Negrito funciona");
 await editor.selectText();
 await page.locator('[data-rich="captionText"] input[type="color"]').fill("#dd3344");
 assert.match(await editor.innerHTML(),/(color|font)/i,"Aplicar cor funciona");
 assert.equal(await page.locator('[data-rich="captionText"] .rich-toolbar-group').count(),2,"Formatação agrupada");
 assert.ok(await page.locator('[data-rich="captionText"] button[aria-label="Lista numerada"]').count(),"Lista possui nome legível");
 await editor.fill("Primeira linha\nSegunda linha");
 await editor.selectText();
 await page.locator('[data-rich="captionText"] button[data-format="insertOrderedList"]').click();
 assert.match(await editor.innerHTML(),/<ol\b/i,"Lista numerada deve usar marcador semântico real");

 await page.locator('a[data-route="demandas"]').click();
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
 await page.goto(origin+"/#/comissoes/videos");
 await page.locator('select[data-filter="commissionStatus"]').waitFor();
 assert.equal(await page.locator('select[data-filter="commissionStatus"] option').count(),3);
 await page.goto(origin+"/#/minhas-pendencias");
 await page.locator('select[data-filter="mineStatus"]').waitFor();
 assert.equal(await page.locator('select[data-filter="mineStatus"] option').count(),3);
 await page.goto(origin+"/#/admin/emails");
 await page.locator("#notification-template-form").waitFor({timeout:10000});
 assert.equal(await page.locator('#mail-form [data-rich-input="message"]').count(),1);
 const kindSelector=page.locator("#notification-template-kind");
 assert.equal(await kindSelector.locator("option").count(),2,"Dois tipos de notificação");
 await page.locator("#notification-template-form input[name=subject]").fill("Nova demanda personalizada");
 await page.locator("#notification-template-form button[type=submit]").click();
 await page.waitForTimeout(180);
 assert.equal(settings.notificationTemplates.create?.subject,"Nova demanda personalizada");
 await page.locator('#notice-dialog button[data-do="notice-cancel"]').click();
 await page.locator("#notification-template-kind").selectOption("review");
 assert.notEqual(await page.locator("#notification-template-form input[name=subject]").inputValue(),"Nova demanda personalizada","Revisão possui texto próprio");
 await page.locator("#notification-template-form input[name=subject]").fill("Revisão personalizada");
 await page.locator("#notification-template-form button[type=submit]").click();
 await page.waitForTimeout(180);
 assert.equal(settings.notificationTemplates.create.subject,"Nova demanda personalizada","Salvar revisão não altera criação");
 assert.equal(settings.notificationTemplates.review.subject,"Revisão personalizada");
 await page.locator('#notice-dialog button[data-do="notice-cancel"]').click();
 user.notificationEnabled=true;
 tasks.push({...task,id:"t3",title:"Concluir sem e-mail da tutoria",assigneeIds:["u1"],commissionIds:[],createdBy:"u1",
   deadlines:[{id:"p3",label:"Prazo",dueAt:new Date(Date.now()-60000).toISOString(),assigneeIds:["u1"]}],
   userDone:{},commissionDone:{},archivedAt:null,status:"pendente"});
 await page.goto(origin+"/#/minhas-pendencias");
 const personalOnly=page.locator(".mine-task-item").filter({hasText:"Concluir sem e-mail da tutoria"});
 await personalOnly.locator('button[data-do="finish-mine"]').click();
 await page.locator('#notice-dialog [data-do="notice-confirm"]').click();
 await page.waitForTimeout(250);
 const messageAfterFinish=await page.locator("#notice-dialog").innerText();
 assert.ok(messageAfterFinish.includes("Demanda concluída"),"Confirmação de sucesso após concluir");
 assert.ok(!messageAfterFinish.toLowerCase().includes("notificar"),"Conclusão não pede notificação por e-mail");
 const finishCall=calls.find(x=>x.p==="/tasks/t3/finish"&&x.method==="PATCH");
 assert.equal(finishCall?.body.notify,false,"Concluir jamais notifica automaticamente");
 await page.goto(origin+"/#/atividade/t1");
 await page.locator('button[data-do="delete-task"]').click();
 assert.ok((await page.locator("#notice-dialog").innerText()).includes("sem possibilidade de recuperação"));
 await page.locator('#notice-dialog [data-do="notice-confirm"]').click();
 await page.waitForTimeout(250);
 assert.ok(calls.some(x=>x.p==="/tasks/t1"&&x.method==="DELETE"));
 assert.equal(tasks.some(x=>x.id==="t1"),false);
 console.log("BROWSER: navegação, nova guia, responsividade, Atas, editor, status e Admin — OK.");
}finally{await browser.close();server.kill();}
