import fs from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("app-live.js","utf8");
let idNum=0,mailTemplateSaved=false;
const user={id:"u1",name:"PETiana Teste",email:"teste@example.test",role:"tutor",notificationEnabled:false,adminSession:false};
const admin={id:"admin",name:"Admin",email:"admin@example.test",role:"admin",notificationEnabled:true,adminSession:true};
let tasks=[
 {id:"t1",title:"Poesia no PET",description:"Anotar 📚\nIdeias",captionText:"Olá! 🥰\n\n#peteducacao",
  assigneeIds:["u1","u2"],commissionIds:["videos"],commissionDone:{},userDone:{},
  deadlines:[{id:"p1",label:"Prazo",dueAt:"2026-11-09T12:00:00",assigneeIds:["u1"],completedAt:null}],
  registeredAt:"2026-11-09",archivedAt:null,status:"pendente",version:1},
 {id:"t2",title:"V InterPET",description:"",captionText:"",assigneeIds:[],commissionIds:["videos"],commissionDone:{},userDone:{},
  deadlines:[{id:"p2",label:"Prazo",dueAt:"2026-11-23T12:00:00",assigneeIds:[],completedAt:null}],
  registeredAt:"2026-11-10",archivedAt:null,status:"pendente",version:1}
];
let meetings=[{id:"m1",title:"Reunião semanal",date:"2026-11-03",rawNotes:"Pautas\nResponsável: (???)",updatedAt:"2026-11-03"}];
const committees=[{id:"videos",name:"Vídeos",memberIds:["u1","u2"],memberCount:2,maxMembers:0,backgroundColor:"#f7f3ff"}];
const users=[user,{id:"u2",name:"PETiano 2",role:"petiano",email:"u2@example.test"}];
const settings={autoMonth:true,autoWeek:true,notificationTemplate:{subject:"PET Gestão — {tipo}",body:"Olá {autor},\n{acao} em {demanda}."}};
let lastFinish=null,lastMail=null;
const dom=new JSDOM(html,{url:"https://peteducacao.github.io/pet-gestao/#/inicio",runScripts:"outside-only",pretendToBeVisual:true});
const {window}=dom,document=window.document;
window.scrollTo=()=>{};document.execCommand=()=>true;
if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>String(++idNum);
window.PET_GESTAO_CONFIG={apiBaseUrl:"https://api.example.test"};
window.localStorage.setItem("pet-gestao:session-token","user-token");
window.localStorage.setItem("pet-gestao:admin-session-token","admin-token");
const reply=(object,status=200)=>({ok:status<400,status,json:async()=>object});
window.fetch=async (url,options={})=>{
 const path=new URL(url).pathname.replace("/api/v1",""), method=options.method||"GET",body=options.body?JSON.parse(options.body):{};
 const isAdmin=String(options.headers?.Authorization||"").includes("admin-token");
 if(path==="/auth/me")return reply({user});
 if(path==="/bootstrap")return reply({session:{user:isAdmin?admin:user},tasks,meetings,committees,users,history:[],events:[],settings});
 if(path==="/meetings"&&method==="POST"){meetings.unshift({id:"m"+(++idNum),title:body.title,date:body.date,rawNotes:body.rawNotes});return reply({ok:true},201);}
 if(/^\/meetings\/[^/]+$/.test(path)){
   const m=meetings.find(x=>x.id===path.split("/")[2]);
   if(method==="PUT"&&m)Object.assign(m,{title:body.title,date:body.date,rawNotes:body.rawNotes});
   if(method==="DELETE")meetings=meetings.filter(x=>x.id!==path.split("/")[2]);
   return reply({ok:true});
 }
 if(/^\/tasks\/[^/]+\/finish$/.test(path)){
   lastFinish=body;const t=tasks.find(x=>x.id===path.split("/")[2]);
   for(const id of body.userIds||[])t.userDone[id]={at:new Date().toISOString(),by:"u1",byName:user.name};
   for(const id of body.commissionIds||[])t.commissionDone[id]={at:new Date().toISOString(),by:"u1",byName:user.name};
   const archived=t.assigneeIds.every(id=>t.userDone[id])&&t.commissionIds.every(id=>t.commissionDone[id]);
   if(archived){t.archivedAt=new Date().toISOString();t.status="concluida";}
   return reply({ok:true,archived});
 }
 if(/^\/tasks\/[^/]+$/.test(path)&&method==="PUT"){const t=tasks.find(x=>x.id===path.split("/")[2]);Object.assign(t,body);return reply({ok:true});}
 if(path==="/tasks"&&method==="POST"){tasks.push({id:"t"+(++idNum),...body,commissionDone:{},userDone:{},registeredAt:"2026-11-10",archivedAt:null});return reply({ok:true});}
 if(path==="/admin/commissions-batch"&&method==="PUT"){
   const ordered=body.commissions.map(x=>committees.find(c=>c.id===x.id));
   ordered.forEach((c,i)=>{c.maxMembers=body.commissions[i].maxMembers;c.sortOrder=i+1});
   committees.splice(0,committees.length,...ordered);
   return reply({ok:true,updated:ordered.length});
 }
 if(path==="/admin/reminder-settings"&&method==="PUT"){settings.reminderSettings=body;return reply({ok:true});}
 if(path==="/admin/notification-template"&&method==="PUT"){
 mailTemplateSaved=true;
 settings.notificationTemplates={...settings.notificationTemplates,[body.kind]:{subject:body.subject,body:body.message}};
 return reply({ok:true});
}
 if(path==="/mail"&&method==="POST"){lastMail=body;return reply({ok:true,status:"pendente"});}
 if(path==="/mail"&&method==="GET")return reply({items:[]});
 if(path==="/mail/status")return reply({connected:true,message:"Simulação"});
 if(path==="/account"&&method==="PATCH"){Object.assign(user,body);return reply({ok:true});}
 return reply({ok:true});
};
const wait=()=>new Promise(resolve=>setTimeout(resolve,15));
async function move(hash){
 window.location.hash=hash;
 window.dispatchEvent(new window.HashChangeEvent("hashchange"));
 await wait();await wait();
}
function tap(selector){
 const node=document.querySelector(selector);assert.ok(node,"Elemento não encontrado: "+selector);
 node.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true,button:0}));return node;
}
function submit(selector){
 const el=document.querySelector(selector);assert.ok(el,selector);
 el.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));
}
window.eval(js);
document.dispatchEvent(new window.Event("DOMContentLoaded",{bubbles:true}));
await wait();await wait();
assert.ok(document.querySelector('a[data-route="reunioes"]'),"Atas aparece na navegação");
assert.equal(document.querySelector('#account-button'),null,"Sem perfil duplicado no topo");
assert.equal(document.querySelector('a[data-route="conta"]').getAttribute("href"),"#/conta","Perfil acessível no menu lateral");
assert.equal(document.querySelector('a[data-route="cronograma"]'),null,"Cronograma duplicado removido");
await move("#/demandas");
assert.ok(document.querySelector('.task-status-atrasada'),"Situação atrasada visível");
 const singleCommitteeCard=[...document.querySelectorAll(".demand-activity-card")].find(el=>el.querySelector(".demand-activity-title")?.textContent==="V InterPET");
assert.ok(singleCommitteeCard,"Demanda vinculada só a uma comissão aparece");
assert.equal(singleCommitteeCard.querySelectorAll(".demand-card-single.demand-card-committee").length,1,"Uma comissão é só um nome, sem seletor");
assert.equal(singleCommitteeCard.querySelectorAll(".demand-card-person").length,0,"Não inventar pessoa responsável para comissão");
const multiPersonCard=[...document.querySelectorAll(".demand-activity-card")].find(el=>el.querySelector(".demand-activity-title")?.textContent==="Poesia no PET");
assert.equal(multiPersonCard.querySelectorAll(".demand-card-single.demand-card-committee").length,1);
assert.equal(multiPersonCard.querySelectorAll(".demand-card-picker.demand-card-person").length,1,"Duas pessoas usam o seletor");
assert.equal(multiPersonCard.querySelectorAll(".demand-card-person li").length,2);

assert.ok(document.querySelector('select[data-filter="status"]'),"Seletor de status");
assert.equal(document.querySelectorAll('button[data-do="mode"]').length,0,"Período mensal/semanal usa seletor");
assert.ok(document.querySelector('select[data-filter="periodMode"]'),"Seletor de período disponível");
assert.equal(document.querySelector('select[data-filter="status"]').options.length,4,"Todas, Pendentes, Atrasadas, Concluídas");

assert.equal(document.querySelector('input[placeholder*="Buscar demanda"]'),null,"Sem pesquisa textual duplicada");
await move("#/reunioes");
assert.equal(document.querySelectorAll(".meeting-card").length,1,"Atas listadas");
const meetingView=document.querySelector('select[data-filter="meetings"]');
assert.ok(meetingView,"Atas usam um seletor, sem botões de filtros duplicados");
meetingView.value="recentes";meetingView.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.ok(document.querySelector('.meeting-card-link').getAttribute("href").includes("reunioes/editar/m1"));
await move("#/reunioes/editar/m1");
const memo=document.querySelector('#meeting-form textarea[name="rawNotes"]');
assert.ok(memo);memo.value+="\n📚 Poesia no PET";
submit("#meeting-form");await wait();await wait();
assert.ok(meetings[0].rawNotes.includes("📚"),"Emojis e quebras preservados nas Atas");
await move("#/reunioes");
tap('button[data-do="delete-meeting"]');await wait();
tap('button[data-do="notice-confirm"]');await wait();await wait();
assert.equal(meetings.length,0,"Exclusão de ata funciona");
tasks.push({...tasks[0],id:"t-all",title:"Todos(as) na edição",assigneeIds:["u1","u2"],commissionIds:[],assignmentScope:"todos",overviewVisible:true});
await move("#/registrar/t-all");
assert.ok(document.querySelector('.assignment-modes [data-value="todos"].active'),"Editar mantém Todos(as)");
assert.ok(document.querySelector("#collective-event-day"),"Evento coletivo exibe somente a data");
assert.equal(document.querySelectorAll(".live-stage").length,0,"Evento coletivo não mostra etapas");
assert.equal(document.querySelectorAll('[data-do="add-stage"]').length,0,"Evento coletivo não exige prazo/correção/postagem");
tap('.assignment-modes [data-value="usuarios"]');await wait();
assert.ok(document.querySelector("#stage-rows"),"Voltar a Pessoas recupera etapas comuns");
tap('.assignment-modes [data-value="comissoes"]');await wait();
assert.ok(document.querySelector("#stage-rows"),"Comissões mantém formulário comum sem lançar erro");
tap('.assignment-modes [data-value="usuarios"]');await wait();
assert.ok(document.querySelector("#stage-rows"),"Pessoas volta a funcionar após Comissões");
const personChoice=document.querySelector('input[data-assign="usuarios"][value="u1"]');
assert.ok(personChoice,"É possível selecionar um responsável individual");
personChoice.checked=true;
personChoice.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
for(const row of [...document.querySelectorAll('.live-stage')])row.querySelector('[data-do="remove-stage"]').click();
await wait();
assert.equal(document.querySelectorAll(".live-stage").length,0,"Pode retirar todas as etapas");
submit("#task-form");await wait();await wait();
assert.deepEqual(tasks.find(t=>t.id==="t-all").deadlines,[],"Demanda comum salva sem prazos");
await move("#/registrar/t-all");
assert.equal(document.querySelectorAll(".live-stage").length,0,"Edição não recria etapas removidas");
tap('button[data-do="add-stage"]');await wait();
const newStage=document.querySelector('.live-stage');
assert.ok(newStage,"Pode adicionar etapa após remover todas");
assert.equal(document.querySelectorAll(".live-stage").length,1,"Um clique adiciona uma única etapa, sem duplicação de eventos");
newStage.querySelector('[data-stage="day"]').value="2026-11-29";
submit("#task-form");await wait();await wait();
assert.equal(tasks.find(t=>t.id==="t-all").deadlines.length,1,"Etapa adicionada na edição é salva");
await move("#/registrar/t-all");
tap('.assignment-modes [data-value="todos"]');await wait();
assert.ok(document.querySelector("#collective-event-day"),"Troca para Todos(as) exibe data única");
document.querySelector("#collective-event-day").value="2026-11-29";
submit("#task-form");await wait();await wait();
const event=tasks.find(t=>t.id==="t-all");
assert.equal(event.assignmentScope,"todos");
assert.deepEqual(event.deadlines.map(s=>s.label),["Evento"]);
assert.ok(event.deadlines[0].dueAt.startsWith("2026-11-29"));
await move("#/atividade/t-all");
assert.ok(document.querySelector(".details-facts")?.textContent.includes("Data do evento"));
assert.equal(document.querySelector('[data-detail-status]'),null,"Evento coletivo não exige conclusão manual");
tasks=tasks.filter(t=>t.id!=="t-all");
// Marcar somente a correção pessoal de uma demanda já presente no bootstrap.
const pendingReviewTask=tasks.find(t=>t.id==="t2");
assert.ok(pendingReviewTask,"Demanda de comissão atribuída à Tutoria permanece cadastrada");
pendingReviewTask.tutorReviewedByMe=true;
await move("#/demandas");
assert.ok(document.querySelector("#screen")?.textContent.includes("V InterPET"),
  "Após correção, a demanda continua visível na lista geral");
await move("#/minhas-pendencias");
assert.equal(document.querySelector("#screen")?.textContent.includes("V InterPET"),false,
  "A correção some só das pendências daquele Tutor, sem concluir a comissão");
await move("#/demandas");
pendingReviewTask.tutorReviewedByMe=false;
await move("#/atividade/t1");
assert.ok(document.querySelector(".details-facts"),"Etapas em detalhes");
assert.equal(document.querySelector('a[data-route="demandas"]').classList.contains("active"),true,"A seção Demandas é destacada nos detalhes");
assert.equal(document.querySelector(".activity-detail-page")?.textContent.includes("Anotações da comissão"),false,"Anotações somente no formulário");
assert.ok(document.querySelector(".saved-activity-text")?.textContent.includes("Olá!"),"Texto para revisão visível");
assert.ok(document.querySelector(".assignee-team")?.textContent.includes("Vídeos"),"Comissão reconhecida como responsável");
assert.ok(document.querySelector(".stage-compact"),"Etapas organizadas no mesmo painel");
const assigneeDetails=document.querySelector("details.assignee-card");
assert.ok(assigneeDetails,"Responsáveis possui painel recolhível");
assert.equal(assigneeDetails.open,true,"Responsáveis começa expandido");
assigneeDetails.querySelector("summary").click();await wait();
assert.equal(assigneeDetails.open,false,"Responsáveis minimiza ao tocar no cabeçalho");
assigneeDetails.querySelector("summary").click();await wait();
assert.equal(assigneeDetails.open,true,"Responsáveis expande ao tocar novamente");
assert.equal(document.querySelectorAll(".assignee-group-heading").length,0,"Sem legenda roxa redundante");
assert.ok(document.querySelector(".detail-visualization select[data-filter='navigateDemands']"),"Filtro no detalhe");
assert.ok(document.querySelector(".detail-review-full"),"Texto para revisão na última seção, em toda largura");

assert.ok(document.querySelector(".activity-history .history-chevron"),"Histórico tem seta de expansão");
assert.equal(document.querySelector(".activity-history").hasAttribute("open"),false,"Histórico começa recolhido");
const statusSelect=document.querySelector('select[data-detail-status]');
assert.ok(statusSelect,"Status é seletor");
assert.equal(statusSelect.value,"atrasada","Demanda vencida aparece atrasada");
statusSelect.value="concluir";
statusSelect.dispatchEvent(new window.Event("change",{bubbles:true}));
await wait();
assert.ok(document.querySelector("#finish-dialog input[data-kind='commission']"),"Comissões selecionáveis");
assert.ok(document.querySelector('#finish-dialog [data-do="finish-select-self"]'),
  "Mais de um responsável oferece conclusão só da própria participação");
assert.ok(document.querySelector('#finish-dialog [data-do="finish-select-everyone"]'),
  "Há opção explícita para concluir todos(as)");
tap('#finish-dialog [data-do="finish-select-self"]');await wait();
assert.deepEqual([...document.querySelectorAll('#finish-dialog input[name="joint-target"]:checked')].map(x=>x.value),["u1"],
  "Só minha participação não marca outros responsáveis nem comissões");
tap('#finish-dialog [data-do="finish-select-everyone"]');await wait();
assert.equal(document.querySelectorAll('#finish-dialog input[name="joint-target"]:not(:checked)').length,0,
  "Concluir para todos(as) seleciona todas as participações");
const selectAll=document.querySelector('#finish-select-all');
assert.ok(selectAll,"Opção Marcar todos aparece na conclusão");
selectAll.checked=true;selectAll.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.ok([...document.querySelectorAll('#finish-dialog input[name="joint-target"]')].every(x=>x.checked),"Marcar todos seleciona pessoas e comissões");
const firstSelection=document.querySelector('#finish-dialog input[name="joint-target"]');
firstSelection.checked=false;firstSelection.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.equal(selectAll.indeterminate,true,"Desmarcar um item atualiza o estado parcial de Marcar todos");
selectAll.checked=true;selectAll.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.ok([...document.querySelectorAll('#finish-dialog input[name="joint-target"]')].every(x=>x.checked),"Marcar todos seleciona novamente todos os participantes");
tap('button[data-do="finish-joint-confirm"]');await wait();
tap('button[data-do="notice-confirm"]');await wait();await wait();
assert.deepEqual(lastFinish.userIds.sort(),["u1","u2"].sort(),"Conclusão conjunta de pessoas");
assert.deepEqual(lastFinish.commissionIds,["videos"],"Conclusão conjunta de comissão");
assert.ok(tasks[0].archivedAt,"Arquivamento automático");
await move("#/admin/comissoes");
assert.equal(document.querySelectorAll('[data-do="save-vagas"]').length,0,"Salvar individual removido");
assert.equal(document.querySelectorAll('[data-do="save-all-commissions"]').length,1,"Salvar todas aparece no topo");
document.querySelector('[data-vagas="videos"]').value="5";
tap('[data-do="save-all-commissions"]');await wait();await wait();
assert.equal(committees[0].maxMembers,5,"Salvamento em lote aplica as vagas");
await move("#/admin/emails");
assert.ok(document.querySelector("#notification-template-form"),"Modelos de criação e revisão disponíveis em E-mails");
assert.ok(document.querySelector("#mail-form [data-rich-input='message']"),"Editor WYSIWYG no e-mail");
const select=document.querySelector("#notification-template-kind");
assert.equal(select.options.length,2,"Em E-mails permanecem só os modelos de criação e revisão");
assert.equal(document.querySelector("#reminder-days")?.closest(".admin-panel").hidden,true,"Avisos automáticos ficam fora da aba E-mails");
tap('[data-do="mail-preview-template"]');
assert.equal(document.querySelector("#mail-preview-dialog").hidden,false,"Prévia do modelo abre sem enviar e-mail");
assert.ok(document.querySelector("#mail-preview-dialog").textContent.includes("PET Gestão"));
tap('#mail-preview-dialog [data-do="mail-preview-close"]');
assert.equal(document.querySelector("#mail-preview-dialog").hidden,true,"Prévia fecha e volta ao editor");
document.querySelector("#notification-template-form input[name='subject']").value="Criação personalizada";
submit("#notification-template-form");await wait();await wait();
assert.ok(mailTemplateSaved&&settings.notificationTemplates.create,"Modelo de Criação salvo");
const selectReview=document.querySelector("#notification-template-kind");
selectReview.value="review";
selectReview.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.notEqual(document.querySelector("#notification-template-form input[name='subject']").value,"Criação personalizada","Revisão exibe modelo próprio");
document.querySelector("#notification-template-form input[name='subject']").value="Revisão personalizada";
submit("#notification-template-form");await wait();await wait();
assert.equal(settings.notificationTemplates.create.subject,"Criação personalizada");
assert.equal(settings.notificationTemplates.review.subject,"Revisão personalizada");
await move("#/admin/configuracoes");
assert.equal(document.querySelector("#reminder-days")?.closest(".admin-panel").hidden,false,"Avisos agora estão em Configurações");
assert.equal(document.querySelector("#deadline-template-kind")?.options.length,2,"Modelos de prazo possuem seletor próprio");
const kindDue=document.querySelector("#deadline-template-kind");
kindDue.value="due_soon";kindDue.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
tap('[data-do="mail-preview-deadline"]');
assert.ok(document.querySelector("#mail-preview-dialog").textContent.includes("dia(s)"),"Prévia de prazo inclui variável de dias");
tap('#mail-preview-dialog [data-do="mail-preview-close"]');
document.querySelector("#reminder-days").value="5";
document.querySelector("#reminder-soon").checked=true;
document.querySelector("#reminder-overdue").checked=true;
const audience=document.querySelector("#reminder-overdue-audience");
assert.ok(audience,"Admin escolhe quem recebe prazo vencido");
audience.value="all";
tap('[data-do="save-reminder-settings"]');await wait();await wait();
assert.deepEqual(settings.reminderSettings,{dueSoonEnabled:true,overdueEnabled:true,daysBefore:5,overdueAudience:"all"},"Configuração enviada ao Admin com todos os participantes");
await move("#/admin/emails");
document.querySelector("#mail-form [data-rich-input='message']").textContent="Olá ✨\n\n#PET";
document.querySelector("#mail-form input[name='subject']").value="Aviso PET";
tap('[data-do="mail-preview-manual"]');
assert.equal(document.querySelector("#mail-preview-dialog").hidden,false,"Prévia manual antes de enviar");
assert.ok(document.querySelector("#mail-preview-dialog").textContent.includes("Olá ✨"));
tap('#mail-preview-dialog [data-do="mail-preview-close"]');
submit("#mail-form");await wait();await wait();
if(!lastMail)console.log("Mail diagnostic:",document.querySelector("#notice-dialog")?.textContent,document.querySelector("#mail-form")?.outerHTML.slice(0,450));
assert.ok(lastMail?.message?.includes("✨"),"Emojis no envio manual");
console.log("TESTES DE INTERFACE SIMULADA: navegação, Atas (editar e excluir), cores, filtros, conclusão conjunta, arquivamento e e-mails — OK.");
window.close(); // Encerra também o relógio de atualização automática de status no JSDOM.
