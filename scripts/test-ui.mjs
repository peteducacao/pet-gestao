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
  registeredAt:"2026-11-09",archivedAt:null,status:"pendente",version:1,updatedBy:"u1",updatedAt:"2026-11-10T21:20:00Z"},
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
// Uma sessão por vez: Admin entrará pelo formulário comum.
const reply=(object,status=200)=>({ok:status<400,status,json:async()=>object});
window.fetch=async (url,options={})=>{
 const path=new URL(url).pathname.replace("/api/v1",""), method=options.method||"GET",body=options.body?JSON.parse(options.body):{};
 const isAdmin=String(options.headers?.Authorization||"").includes("admin-token");
 if(path==="/auth/login"&&method==="POST")return reply({token:body.email===admin.email?"admin-token":"user-token",user:body.email===admin.email?admin:user});
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
// A exclusão de concluídas precisa aparecer para Tutoria e PETianos(as),
// mesmo quando a conta não possui o escopo administrativo.
tasks.push({...tasks[0],id:"concluida-visibilidade-cargos",
 title:"Concluída visível ao PET",archivedAt:"2026-11-10T12:00:00Z",status:"concluida"});
const selectCompleted=()=>{const el=document.querySelector('select[data-filter="status"]');el.value="concluida";el.dispatchEvent(new window.Event("change",{bubbles:true}));};
selectCompleted();await wait();
assert.ok(document.querySelector('[data-do="archive-selection-open"]'),"Tutoria encontra Excluir demandas em Concluídas");
tap('[data-do="archive-selection-open"]');await wait();
assert.equal(document.querySelectorAll('[data-archive-select]').length,1,"Tutoria pode selecionar concluídas");
tap('[data-do="archive-selection-cancel"]');await wait();
user.role="petiano";
await move("#/inicio");await move("#/demandas");
selectCompleted();await wait();
assert.ok(document.querySelector('[data-do="archive-selection-open"]'),"PETiano(a) encontra Excluir demandas");
user.role="usuario";
await move("#/inicio");
assert.equal(document.querySelectorAll('.demand-card-cover-link, .activity-details-link, .demand-finish-action, [data-do="clear-activity"]').length,0,"Usuário não interage com Visão geral");
assert.equal(document.querySelector('.viewer-dashboard a'),null,"Visão geral não oferece links");
assert.equal(document.querySelector('a[data-route="reunioes"]').hidden,true,"Atas ocultas no menu Usuário");
await move("#/demandas");
selectCompleted();await wait();
assert.equal(document.querySelector('[data-do="archive-selection-open"]'),null,"Usuário somente leitura não exclui");
assert.equal(document.querySelectorAll('.demand-activity-card a, .demand-activity-card button, .demand-card-picker').length,0,"Demandas não têm links, menus ou ações");
await move("#/atividade/t1");
assert.notEqual(window.location.hash,"#/atividade/t1","Detalhes bloqueados por URL");
await move("#/reunioes");
assert.notEqual(window.location.hash,"#/reunioes","Atas bloqueadas por URL");
await move("#/demandas");
user.role="tutor";
tasks.splice(tasks.findIndex(t=>t.id==="concluida-visibilidade-cargos"),1);
await move("#/inicio");await move("#/demandas");
const resetSelection=document.querySelector('select[data-filter="status"]');
resetSelection.value="todas";resetSelection.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.ok(document.querySelector('.task-status-atrasada'),"Situação atrasada visível");
 const singleCommitteeCard=[...document.querySelectorAll(".demand-activity-card")].find(el=>el.querySelector(".demand-activity-title")?.textContent==="V InterPET");
assert.ok(singleCommitteeCard,"Demanda vinculada só a uma comissão aparece");
assert.equal(singleCommitteeCard.querySelectorAll(".demand-card-single.demand-card-committee").length,1,"Uma comissão é só um nome, sem seletor");
assert.equal(singleCommitteeCard.querySelectorAll(".demand-card-person").length,0,"Não inventar pessoa responsável para comissão");
const multiPersonCard=[...document.querySelectorAll(".demand-activity-card")].find(el=>el.querySelector(".demand-activity-title")?.textContent==="Poesia no PET");
assert.equal(multiPersonCard.querySelectorAll(".demand-card-single.demand-card-committee").length,1);
assert.equal(multiPersonCard.querySelectorAll(".demand-card-picker.demand-card-person").length,1,"Duas pessoas usam o seletor");
assert.equal(multiPersonCard.querySelectorAll(".demand-card-person li").length,2);

// O resumo contabiliza cada comissão, inclusive conclusão parcial independente.
committees.push({id:"financas",name:"Finanças",memberIds:[],memberCount:0,maxMembers:0});
tasks.push({...tasks[0],id:"indicador-videos-concluido",title:"Vídeos concluída e Finanças pendente",
 commissionIds:["videos","financas"],commissionDone:{videos:{at:"2026-11-10T13:00:00Z",by:"u1"}},
 archivedAt:null,userDone:{},status:"pendente",deadlines:[]});
await move("#/comissoes");
assert.equal(document.querySelectorAll(".commission-help-item").length,0,"Ajuda não se repete em Comissões");
const menuLinks=[...document.querySelectorAll("#primary-nav .nav-link")].map(a=>a.dataset.route);
assert.equal(menuLinks.indexOf("ajuda"),menuLinks.indexOf("comissoes")+1,"Ajuda aparece logo abaixo de Comissões no menu Organização");
await move("#/ajuda");
assert.equal(document.querySelectorAll(".commission-help-item").length>=16,true,"Ajuda geral contém dúvidas sobre todas as áreas");
assert.ok(document.querySelector("#commission-help-title")?.textContent.includes("Ajuda sobre comissões"));
await move("#/comissoes/videos");
const readMetrics=()=>Object.fromEntries([...document.querySelectorAll(".commission-overview-card")].map(el=>[
 el.querySelector(".commission-overview-label").textContent,
 Number(el.querySelector(".commission-overview-value").textContent)
]));
assert.deepEqual(readMetrics(),{Demandas:3,"Concluídas":1,Atrasadas:1,Pendentes:1},
 "Vídeos contabiliza concluída própria, atraso e pendência da comissão");
await move("#/comissoes/financas");
assert.deepEqual(readMetrics(),{Demandas:1,"Concluídas":0,Atrasadas:0,Pendentes:1},
 "Finanças só contabiliza suas demandas e participações");
tasks.splice(tasks.findIndex(t=>t.id==="indicador-videos-concluido"),1);
committees.splice(committees.findIndex(c=>c.id==="financas"),1);
await move("#/demandas");

// Criar sem preencher não deve interromper; alterar e navegar exige confirmação.
await move("#/registrar");
await move("#/demandas");
assert.equal(document.querySelector("#notice-dialog").hidden,true,"Sem alteração não há alerta");
await move("#/registrar");
const draftTitle=document.querySelector('#task-form input[name="title"]');
draftTitle.value="Não quero perder esta demanda";
draftTitle.dispatchEvent(new window.Event("input",{bubbles:true}));
await move("#/comissoes");
assert.equal(window.location.hash,"#/registrar","Navegação para outra página é interrompida");
assert.equal(document.querySelector("#notice-title").textContent,"Alterações não salvas");
assert.ok(document.querySelector("#notice-dialog").textContent.includes("Sair sem salvar"));
assert.ok(document.querySelector("#notice-dialog").textContent.includes("Continuar editando"));
tap('#notice-dialog [data-do="notice-cancel"]');await wait();
assert.equal(document.querySelector('#task-form input[name="title"]').value,"Não quero perder esta demanda",
 "Cancelar saída mantém conteúdo digitado");
await move("#/comissoes");await wait();
tap('#notice-dialog [data-do="notice-confirm"]');await wait();await wait();
assert.equal(window.location.hash,"#/comissoes","Confirmação permite abandonar rascunho");
await move("#/demandas");

assert.ok(document.querySelector('select[data-filter="status"]'),"Seletor de status");
assert.equal(document.querySelectorAll('button[data-do="mode"]').length,0,"Período mensal/semanal usa seletor");
assert.ok(document.querySelector('select[data-filter="periodMode"]'),"Seletor de período disponível");
assert.equal(document.querySelector('select[data-filter="status"]').options.length,4,"Todas as demandas, Pendentes, Atrasadas, Concluídas");

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
await move("#/admin/painel");await move("#/demandas");
const filteredView=document.querySelector('select[data-filter="status"]');
assert.ok([...filteredView.options].some(option=>option.value==="todas"&&option.textContent==="Todas as demandas"),"Mantém Todas as demandas");
assert.ok(![...filteredView.options].some(option=>option.value==="geral"),"Geral foi removido");
assert.ok(document.querySelector("#screen").textContent.includes("Poesia no PET"),"Todas as demandas permanece disponível");
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
assert.equal(document.querySelector("#collective-date-year").value,String(new Date().getFullYear()),"Ano atual inicia preenchido");
assert.equal(document.querySelector("#collective-date-day").value,"","Novo evento ainda sem dia definido");
assert.equal(document.querySelector("#collective-date-month").value,"","Novo evento ainda sem mês definido");
document.querySelector("#collective-date-day").value="29";
document.querySelector("#collective-date-month").value="11";
submit("#task-form");await wait();await wait();
const event=tasks.find(t=>t.id==="t-all");
assert.equal(event.assignmentScope,"todos");
assert.deepEqual(event.deadlines.map(s=>s.label),["Evento"]);
assert.ok(event.deadlines[0].dueAt.startsWith("2026-11-29"));
await move("#/atividade/t-all");
assert.ok(document.querySelector(".details-facts")?.textContent.includes("Data do evento"));
assert.equal(document.querySelector('[data-detail-status]'),null,"Evento coletivo não exige conclusão manual");
tasks.splice(tasks.findIndex(t=>t.id==="t-all"),1);
// Uma pessoa recebe somente uma data, sem etapas, e conclui individualmente.
tasks.push({...tasks[0],id:"t-single",title:"Entrega individual",assignmentScope:"usuarios",
 assigneeIds:["u1"],commissionIds:[],deadlines:[],userDone:{},commissionDone:{},
 archivedAt:null,status:"pendente",overviewVisible:true});
await move("#/registrar/t-single");
assert.ok(document.querySelector("#collective-date-day"),"Uma pessoa usa os campos simples de data");
assert.ok(document.querySelector("#screen").textContent.includes("Data da atividade"));
assert.equal(document.querySelector("#collective-date-year").value,String(new Date().getFullYear()),
 "Ano atual vem preenchido na atividade individual");
assert.equal(document.querySelector("#collective-date-day").value,"","Dia começa vazio");
assert.equal(document.querySelector("#collective-date-month").value,"","Mês começa vazio");
assert.equal(document.querySelectorAll(".live-stage").length,0,"Sem Prazo, Correção ou Postagem para uma pessoa");
assert.equal(document.querySelectorAll('[data-do="add-stage"]').length,0,"Sem botão para adicionar etapas");
document.querySelector("#collective-date-day").value="24";
document.querySelector("#collective-date-month").value="11";
submit("#task-form");await wait();await wait();
const individual=tasks.find(x=>x.id==="t-single");
assert.deepEqual(individual.deadlines.map(d=>d.label),["Atividade"],"Salva tipo de data individual");
assert.equal(individual.archivedAt,null,"Data não conclui automaticamente atividade individual");
await move("#/atividade/t-single");
assert.ok(document.querySelector(".details-facts")?.textContent.includes("Data da atividade"),"Detalhes informam data simples");
assert.ok(document.querySelector('[data-detail-status]'),"Atividade individual mantém conclusão manual");
await move("#/registrar/t-single");
const secondPerson=document.querySelector('input[data-assign="usuarios"][value="u2"]');
assert.ok(secondPerson,"Pode adicionar segundo responsável");
secondPerson.checked=true;
secondPerson.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.ok(document.querySelector("#stage-rows"),"Duas pessoas voltam ao modo de etapas opcionais");
assert.equal(document.querySelector("#collective-date-day"),null,"Múltiplas pessoas não ficam presas ao seletor simples");
const secondPersonAgain=document.querySelector('input[data-assign="usuarios"][value="u2"]');
assert.ok(secondPersonAgain,"O seletor de participantes é atualizado após adicionar alguém");
secondPersonAgain.checked=false;
secondPersonAgain.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
assert.ok(document.querySelector("#collective-date-day"),"Ao voltar para uma pessoa, restaura data simples");
tasks.splice(tasks.findIndex(t=>t.id==="t-single"),1);
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
assert.ok(document.querySelector(".detail-review-full .review-last-edit")?.textContent.includes("PETiana Teste"),
 "Revisão mostra quem fez a última alteração");
assert.ok(document.querySelector(".review-last-edit")?.textContent.includes("10/11/2026"),
 "Revisão mostra a data da última alteração");
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
assert.equal(document.querySelector('#finish-dialog [data-do="finish-select-everyone"]'),null,"Comando redundante removido");
tap('#finish-dialog [data-do="finish-select-self"]');await wait();
assert.deepEqual([...document.querySelectorAll('#finish-dialog input[name="joint-target"]:checked')].map(x=>x.value),["u1"],
  "Só minha participação não marca outros responsáveis nem comissões");

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
// Trocar para Admin pelo formulário comum, não por uma segunda entrada.
await move("#/login");
const adminLoginForm=document.querySelector("#login-form");
assert.ok(adminLoginForm,"Admin utiliza o login comum");
assert.ok(!/Admin|Painel Admin/i.test(adminLoginForm.textContent),"Tela de entrada discreta");
adminLoginForm.elements.email.value=admin.email;
adminLoginForm.elements.password.value="SenhaDeTeste";
adminLoginForm.elements.rememberMe.checked=true;
submit("#login-form");await wait();await wait();await wait();
assert.equal(window.localStorage.getItem("pet-gestao:session-token"),"admin-token","Login único mantém token do Admin");
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
// Exclusão da conta é acessível por Meu perfil e exige confirmação e senha.
await move("#/conta");
const profileBeforeLogout=document.querySelector(".account-profile-info")?.textContent;
tap('[data-do="logout"]');await wait();
assert.equal(document.querySelector("#notice-title")?.textContent,"Sair da conta?",
 "Logout exige confirmação");
assert.ok(document.querySelector("#notice-dialog")?.textContent.includes("Continuar conectado"));
tap('#notice-dialog [data-do="notice-cancel"]');await wait();
assert.equal(document.querySelector(".account-profile-info")?.textContent,profileBeforeLogout,
 "Cancelar logout preserva a identidade e os dados exibidos");
const deleteAccountButton=document.querySelector('[data-do="account-delete-open"]');
assert.ok(deleteAccountButton,"Meu perfil oferece Excluir minha conta");
tap('[data-do="account-delete-open"]');
assert.equal(document.querySelector("#account-delete-dialog")?.hidden,false,
  "Abre diálogo de exclusão definitiva");
assert.equal(document.querySelector('#delete-account-form input[name="password"]')?.required,true,
  "A senha atual é obrigatória");
assert.equal(document.querySelector('#delete-account-form input[name="confirmation"]')?.required,true,
  "Exige confirmação escrita");
tap('[data-do="account-delete-close"]');
assert.equal(document.querySelector("#account-delete-dialog")?.hidden,true,
  "Cancelar volta ao perfil sem apagar a conta");
assert.equal(user.role,"tutor","Cancelar preserva sessão e perfil");
// No modo Concluídas, todas as contas editoras têm exclusão em lote.
tasks.push({...tasks[0],id:"t-archive-bulk-1",title:"Concluída A",archivedAt:"2026-11-10T12:00:00Z",status:"concluida"},
 {...tasks[0],id:"t-archive-bulk-2",title:"Concluída B",archivedAt:"2026-11-10T12:00:00Z",status:"concluida"});
await move("#/demandas");
const archivedStatusSelect=document.querySelector('[data-filter="status"]');
assert.ok(archivedStatusSelect,"Filtro de situação disponível");
archivedStatusSelect.value="concluida";archivedStatusSelect.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
const bulkEntry=document.querySelector('[data-do="archive-selection-open"]');
assert.ok(bulkEntry.closest(".demand-header-actions"),"Excluir demandas fica ao lado de Registrar demanda");
assert.ok(bulkEntry,"PETiano(a), Tutor(a) e Admin encontram Excluir na lista de concluídas");
tap('[data-do="archive-selection-open"]');await wait();
const availableArchiveCards=document.querySelectorAll('[data-archive-select]').length;
assert.ok(availableArchiveCards>=2,"Caixas individuais aparecem para todas as concluídas do período");
tap('[data-do="archive-select-all"]');await wait();
assert.equal(document.querySelectorAll('[data-archive-select]:checked').length,availableArchiveCards,"Selecionar todas marca todas as concluídas visíveis");
tap('[data-do="archive-select-all"]');await wait();
assert.equal(document.querySelectorAll('[data-archive-select]:checked').length,0,"Botão desmarca todas também");
tap('[data-do="archive-selection-cancel"]');await wait();
assert.equal(document.querySelectorAll('[data-archive-select]').length,0,"Cancelar encerra modo de seleção");
tasks=tasks.filter(t=>!t.id.startsWith("t-archive-bulk-"));
// Regressão: em Admin + Tutoria + Finanças, o Admin tem uma pendência pessoal,
 // mas deve conseguir escolher todas as participações pendentes.
 committees.push({id:"financas",name:"Finanças",memberIds:[],memberCount:0,maxMembers:0});
 tasks.push({...tasks[0],id:"mixed-finance-test",title:"Admin e Tutoria mais Finanças",
   assigneeIds:["admin","u1"],commissionIds:["financas"],userDone:{},commissionDone:{},archivedAt:null,
   deadlines:[{id:"future",label:"Prazo",dueAt:"2026-12-15T18:00:00",assigneeIds:["admin"]}],status:"pendente"});
 await move("#/admin/painel");await move("#/minhas-pendencias");
 const mixedButton=[...document.querySelectorAll('.mine-task-item')].find(el=>el.textContent.includes("Admin e Tutoria mais Finanças"))?.querySelector('[data-do="finish-mine"]');
 assert.ok(mixedButton,"Demanda mista aparece nas pendências do Admin");
 mixedButton.click();await wait();
 const mixedPicker=document.querySelector("#finish-dialog");
 assert.equal(mixedPicker.hidden,false,"Ao concluir uma participação, demanda mista abre a seleção");
 assert.equal(mixedPicker.querySelectorAll('input[name="joint-target"]').length,3,"Seletor mostra Admin, Tutoria e Finanças");
 tap('#finish-dialog [data-do="finish-select-self"]');await wait();
 assert.deepEqual([...mixedPicker.querySelectorAll('input[name="joint-target"]:checked')].map(el=>el.value),["admin"],"Só minha participação marca apenas Admin");
 const allBox=mixedPicker.querySelector("#finish-select-all");allBox.checked=true;allBox.dispatchEvent(new window.Event("change",{bubbles:true}));await wait();
  assert.equal(mixedPicker.querySelectorAll('input[name="joint-target"]:checked').length,3,"Marcar todos marca as três participações");
 tap('#finish-dialog [data-do="finish-close"]');
// Formulário de comissões usa editor RGB próprio (sem seletor nativo Android).
user.role="petiano";
await move("#/comissoes/nova");
assert.ok(document.querySelector("[data-do='commission-color-toggle']"),"Campo RGB disponível");
assert.equal(document.querySelector('#commission-form input[type="color"]'),null,"Sem seletor de cor nativo na comissão");
tap('[data-do="commission-color-toggle"]');await wait();
assert.equal(document.querySelector("#commission-rgb-panel").hidden,false);
const redRGB=document.querySelector('[data-commission-rgb-range="r"]');
redRGB.value="120";redRGB.dispatchEvent(new window.Event("input",{bubbles:true}));
assert.equal(document.querySelector('#commission-form input[name="backgroundColor"]').value[0],"#");
assert.equal(document.querySelector('#commission-form input[name="backgroundColor"]').value.slice(1,3),"78");
tap('[data-do="commission-color-preset"][data-color="#deedff"]');await wait();
assert.equal(document.querySelector('#commission-form input[name="backgroundColor"]').value,"#deedff");
tap('[data-do="reset-color"]');await wait();
assert.equal(document.querySelector('#commission-form input[name="backgroundColor"]').value,"#f7f3ff");
assert.ok(document.querySelector("#commission-image-editor"),"Modal de imagem disponível");
assert.ok(document.querySelector('#commission-upload[accept="image/png,image/jpeg,image/webp"]'));
 window.close(); // Encerra também o relógio de atualização automática de status no JSDOM.


