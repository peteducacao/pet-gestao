/* PET Gestão: interface real com API autenticada, sem dados fictícios. */
(function frontModule(){
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const CONFIG=window.PET_GESTAO_CONFIG||{},API=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const current=new Date(), tokenKey="pet-gestao:session-token",adminTokenKey="pet-gestao:admin-session-token";
let token=sessionStorage.getItem(tokenKey)||"",adminToken=sessionStorage.getItem(adminTokenKey)||"",data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}},me=null;
const state={year:current.getFullYear(),month:current.getMonth(),week:0,mode:"mensal",committeeWeek:0,assignmentScope:"usuarios",selectedUsers:new Set(),selectedCommissions:new Set(),taskFormId:null,mailAudience:"todos",mailScheduled:false,selectedStatus:"pendente",mailFiles:[],previousRoute:"#/inicio"};
const routeNames={inicio:"Visão geral",demandas:"Demandas",cronograma:"Cronograma",comissoes:"Comissões","minhas-pendencias":"Minhas pendências",atividade:"Atividade",registrar:"Registrar demanda",admin:"Administração",conta:"Minha conta",login:"Entrar",cadastro:"Criar conta",esqueci:"Recuperar senha",redefinir:"Redefinir senha",reunioes:"Memórias"};
let toastTimer,lastHash=location.hash||"#/inicio",firstBootstrap=true;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const id=v=>encodeURIComponent(String(v));
const ico=(name)=>'<svg aria-hidden="true"><use href="#i-'+name+'"></use></svg>';
const opt=(value,label,selected)=>'<option value="'+esc(value)+'" '+(value===selected?"selected":"")+'>'+esc(label)+'</option>';
const textDate=d=>{if(!d)return"—";let v=new Date(String(d).length===10?d+"T12:00:00":d);return Number.isNaN(v.getTime())?"—":new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(v)};
const dt=d=>{if(!d)return null;const v=new Date(String(d).length===10?d+"T12:00:00":d);return Number.isNaN(v.getTime())?null:v};
const dateKey=d=>{const v=dt(d)||current;return v.getFullYear()+"-"+String(v.getMonth()+1).padStart(2,"0")+"-"+String(v.getDate()).padStart(2,"0")};
const stages=t=>Array.isArray(t.deadlines)?t.deadlines:[];
const active=t=>!t.archivedAt;
const committee=n=>data.committees.find(c=>String(c.id)===String(n));
const nameFor=key=>data.users.find(u=>String(u.id)===String(key))?.name||"";
const selectedCommitteeNames=t=>(t.commissionIds||[]).map(k=>committee(k)?.name||"Comissão").join(", ");
const who=t=>(t.assigneeIds||[]).map(nameFor).filter(Boolean).join(", ")||selectedCommitteeNames(t)||"A definir";
const canWrite=()=>Boolean(me&&!me.mustChangePassword);
const isAdmin=()=>me?.role==="admin";
const canNotify=()=>canWrite()&&["tutor","admin"].includes(me.role)&&me.notificationEnabled;
const isLate=t=>active(t)&&stages(t).some(s=>!s.completedAt&&dt(s.dueAt)&&dt(s.dueAt)<new Date(new Date().setHours(0,0,0,0)));
const stateBadge=t=>t.archivedAt?'<span class="pill mint">Concluída</span>':isLate(t)?'<span class="pill overdue-pill">Atrasada</span>':t.status==="aprovada"?'<span class="pill mint">Aprovada</span>':'<span class="pill soft">Pendente</span>';
const completedCount=t=>Object.keys(t.commissionDone||{}).length;
const commissionFinished=(t,cid)=>Boolean(t.commissionDone?.[cid]);
function setToast(message){const box=$("#toast");if(!box)return;box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,5200)}
function header(eye,title,sub="",actions=""){return '<div class="page-header"><div><div class="eyebrow">'+esc(eye)+'</div><h1 class="page-title">'+esc(title)+'</h1>'+(sub?'<p class="page-subtitle">'+esc(sub)+'</p>':"")+'</div><div class="page-actions">'+actions+'</div></div>'}
function empty(title,sub=""){return'<div class="empty"><span class="empty-icon">'+ico("folder")+'</span><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p></div>'}
function button(label,route,primary=false){return'<a href="#/'+route+'" class="button '+(primary?"primary":"ghost")+'">'+esc(label)+'</a>'}
function backButton(){return'<button type="button" class="button ghost" data-do="back">'+ico("chevron-left")+' Voltar</button>'}
function routeParts(){const raw=decodeURIComponent((location.hash||"#/inicio").slice(2));const parts=raw.split("/");return{page:parts[0]||"inicio",parts:parts.slice(1)}}
async function request(path,method="GET",payload,scope){
 if(!API)throw Error("URL da API ainda não publicada.");
 const headers={"Accept":"application/json"};
 const activeToken=scope==="guest"?"":scope==="admin"||(!scope&&routeParts().page==="admin")?adminToken:token;
 if(activeToken)headers.Authorization="Bearer "+activeToken;
 if(payload!==undefined)headers["Content-Type"]="application/json";
 const res=await fetch(API+"/api/v1"+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:"no-store"});
 const obj=await res.json().catch(()=>({error:"Resposta inválida do servidor."}));
 if(!res.ok)throw Error(obj.error||"Falha na operação.");
 return obj;
}
async function reload(){
 try{
   const b=await request("/bootstrap");data=b;me=b.session?.user||null;
   if(firstBootstrap){firstBootstrap=false;try{const saved=JSON.parse(localStorage.getItem("pet-gestao:period")||"{}");if(b.settings?.autoMonth===false){state.year=Number(saved.year)||state.year;state.month=Number.isInteger(saved.month)?saved.month:state.month}if(b.settings?.autoWeek===false)state.week=Number(saved.week)||0;else state.week=weekFor(current)}catch{state.week=weekFor(current)}}
   if(routeParts().page==="admin"){
     if(adminToken&&(!me||me.role!=="admin")){adminToken="";sessionStorage.removeItem(adminTokenKey);me=null;}
   }else if(token&&!me){token="";sessionStorage.removeItem(tokenKey)}
   $("#connection-dot")?.classList.add("online");
   $("#connection-label").textContent="Conectado";
 }catch(e){data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}};me=null;
   $("#connection-label").textContent="Sem conexão";$("#connection-dot")?.classList.remove("online");setToast(e.message);}
 render();
}
function allowPage(p){if(canWrite())return true;return ["inicio","demandas","cronograma","comissoes","login","cadastro","esqueci","redefinir","conta","admin"].includes(p)}
function nav(){
 const {page}=routeParts();const breadcrumb=$("#current-page");
 if(breadcrumb)breadcrumb.innerHTML='<button class="crumb" type="button" data-do="back" aria-label="Voltar">'+ico("chevron-left")+'</button> <a href="#/inicio">PET Educação</a> <span class="breadcrumb-slash">/</span> '+esc(routeNames[page]||"PET Gestão");
 const account=$("#account-button");if(account){account.innerHTML=ico("user")+'<span>'+esc(me?.name||"Acessar conta")+'</span>';account.setAttribute("aria-label",me?"Minha conta":"Entrar")}
 const admin=$("#admin-link");if(admin){admin.hidden=false;admin.classList.toggle("nav-locked",!adminToken);admin.setAttribute("aria-label","Abrir acesso à Administração");admin.innerHTML=ico("settings")+'<span>Administração</span>';admin.title="Administração"}
 $$(".nav-link[data-route]").forEach(el=>{el.classList.toggle("active",el.dataset.route===page);if(el.dataset.route==="minhas-pendencias")el.hidden=!canWrite()});
 $("#today-label").textContent=textDate(new Date());
 document.title=(routeNames[page]||"PET Educação")+" | PET Educação";
}
function weeks(y,m){const days=new Date(y,m+1,0).getDate(),firstDay=new Date(y,m,1).getDay(),firstMonday=1+((8-firstDay)%7),arr=[];let start=1,end=Math.min(days,firstMonday+6);while(start<=days){arr.push({n:arr.length+1,start,end});start=end+1;end=Math.min(days,start+6)}return arr}
function weekFor(d){const x=dt(d);return x?weeks(x.getFullYear(),x.getMonth()).find(w=>x.getDate()>=w.start&&x.getDate()<=w.end)?.n||0:0}
function taskDate(t){return stages(t).filter(x=>!x.completedAt&&x.dueAt).map(x=>x.dueAt).sort()[0]||t.registeredAt}
function filtered(t,mode=state.mode){
 if(mode==="arquivo")return Boolean(t.archivedAt);
 if(!active(t))return false;
 if(mode==="aprovadas")return t.status==="aprovada";
 if(mode==="pendentes")return t.status!=="aprovada";
 const d=dt(taskDate(t));if(!d)return false;
 if(d.getFullYear()!==state.year||d.getMonth()!==state.month)return false;
 if(mode==="semanal")return !state.week||weekFor(d)===state.week;
 return true;
}
function period(){const years=Array.from({length:9},(_,i)=>current.getFullYear()-2+i);
 return'<div class="filters"><div class="filter-item"><label>MÊS</label><select class="select" data-filter="month">'+MONTHS.map((v,i)=>opt(i,v,state.month)).join("")+'</select></div><div class="filter-item"><label>ANO</label><select class="select" data-filter="year">'+years.map(y=>opt(y,y,state.year)).join("")+'</select></div><div class="filter-item"><label>SEMANA</label><select class="select" data-filter="week"><option value="0">Todas as semanas</option>'+weeks(state.year,state.month).map(w=>opt(w.n,"Semana "+w.n+" ("+w.start+"–"+w.end+")",state.week)).join("")+'</select></div><button type="button" class="button ghost" data-do="today">Hoje</button></div>'
}
function taskCard(t,commissionId){
 const total=(t.commissionIds||[]).length,done=completedCount(t);
 return '<article class="placeholder-row task-list-row"><div class="task-list-body"><div class="task-title-row"><strong>'+esc(t.title)+'</strong><span class="task-date-badge">'+ico("calendar")+' '+textDate(taskDate(t))+'</span></div><small>'+esc(selectedCommitteeNames(t)||"Demanda geral")+'</small>'+
 (canWrite()?'<a class="activity-details-link" href="#/atividade/'+id(t.id)+(commissionId?"/"+id(commissionId):"")+'">Ver detalhes '+ico("arrow")+'</a>':"")+'</div><div class="task-row-meta"><span class="task-assignee-label">'+(canWrite()?'<strong>Responsáveis:</strong> '+esc(who(t)):"")+'</span>'+stateBadge(t)+(total>1&&done?'<span class="pill soft">'+done+'/'+total+' comissões concluídas</span>':"")+'</div></article>'
}
function renderHome(){
 const all=data.tasks.filter(active),next=[...all].sort((a,b)=>(dt(taskDate(a))||Infinity)-(dt(taskDate(b))||Infinity)).slice(0,6),late=all.filter(isLate).length;
 return header("Organização","Visão geral","Demandas da equipe e prazos prioritários.")+
 '<div class="stat-grid">'+[[all.length,"Demandas ativas","list"],[all.filter(t=>t.status!=="aprovada").length,"Pendentes","clock"],[late,"Atrasadas","alert"],[all.filter(t=>t.status==="aprovada").length,"Aprovadas","check"]].map(x=>'<div class="card stat"><div class="stat-icon purple">'+ico(x[2])+'</div><div class="stat-copy"><span>'+x[1]+'</span><strong>'+x[0]+'</strong></div></div>').join("")+'</div>'+
 '<div class="dashboard-grid"><section class="card card-pad"><div class="section-head"><div><h2>Pendências semanais</h2><p>As próximas seis atividades em aberto</p></div>'+button("Ver cronograma","cronograma")+'</div>'+ (next.length?next.map(t=>taskCard(t)).join(""):empty("Sem pendências neste momento"))+'</section>'+
 '<section class="card card-pad"><div class="section-head"><h2>Últimas atualizações</h2>'+ico("bell")+'</div>'+((data.events||[]).length?data.events.slice(0,4).map(e=>'<div class="placeholder-row"><div><strong>'+esc(e.summary)+'</strong><small>'+esc(e.actorName)+' · '+textDate(e.createdAt)+'</small></div></div>').join(""):empty("Nenhuma atualização recente"))+'</section></div>';
}
function renderDemandas(){
 const options=[["mensal","Mensal"],["semanal","Semanal"],["pendentes","Pendentes"],["aprovadas","Aprovadas"],["arquivo","Arquivadas"]];
 const actions=canWrite()?button("+ Registrar demanda","registrar",true):"";
 let list=data.tasks.filter(t=>filtered(t));
 if(state.mode==="arquivo"){
   list=list.filter(t=>{const d=dt(t.archivedAt);return d&&d.getFullYear()===state.year&&d.getMonth()===state.month&&(!state.week||weekFor(d)===state.week)});
 }
 list.sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 return header("Acompanhamento","Demandas","Atividades organizadas por período e situação.",actions)+
 '<section class="card card-pad"><div class="segmented">'+options.map(([v,l])=>'<button type="button" data-do="mode" data-value="'+v+'" class="'+(state.mode===v?"active":"")+'">'+l+'</button>').join("")+'</div><div class="list-toolbar">'+((["mensal","semanal","arquivo"].includes(state.mode))?period():"")+'</div><hr class="divider">'+
 (list.length?list.map(t=>'<div class="live-task-card">'+taskCard(t)+(state.mode==="arquivo"&&canWrite()?'<button class="button subtle-danger small-action" data-do="delete-task" data-id="'+esc(t.id)+'">Excluir definitivamente</button>':"")+'</div>').join(""):empty("Nenhuma demanda encontrada","Selecione outro período ou registre uma demanda."))+'</section>'+
 '<section class="card card-pad demand-memories"><div class="section-head"><div><h2>Memórias dos encontros</h2><p>Registros das reuniões da equipe</p></div>'+(canWrite()?button("+ Nova memória","reunioes/nova"):"")+'</div>'+
 (data.meetings?.length?data.meetings.map(m=>'<div class="placeholder-row"><div><strong>'+esc(m.title)+'</strong><small>'+textDate(m.date)+'</small></div>'+(canWrite()?button("Ver memória","reunioes/"+id(m.id)):"")+'</div>').join(""):empty("Nenhuma memória registrada"))+'</section>';
}
function renderCronograma(){
 const all=data.tasks.filter(t=>active(t)&&filtered(t,"mensal")&&(!state.week||weekFor(taskDate(t))===state.week));
 const groups=new Map();for(const t of all){const w=weekFor(taskDate(t));if(!groups.has(w))groups.set(w,[]);groups.get(w).push(t)}
 return header("Planejamento","Cronograma","Acompanhe os prazos das comissões.")+'<section class="card card-pad">'+period()+
 (groups.size?[...groups].sort((a,b)=>a[0]-b[0]).map(([week,items])=>'<section class="committee-group"><h3 class="committee-group-label">Semana '+week+' · '+MONTHS[state.month]+'</h3>'+items.map(t=>taskCard(t)).join("")+'</section>').join(""):empty("Sem atividades neste período"))+'</section>';
}
function renderComissoes(){
 return header("Trabalho em equipe","Comissões","Organização das equipes.",canWrite()?button("+ Nova comissão","comissoes/nova",true):"")+
 '<section class="card card-pad"><div class="section-head"><h2>Comissões cadastradas</h2><span class="pill soft">'+data.committees.length+' comissões</span></div><div class="commission-cards-grid">'+data.committees.map(c=>{
 const members=c.memberCount??(c.memberIds||[]).length,cmax=c.maxMembers||0,joined=Boolean(me&&(c.memberIds||[]).includes(me.id));
 const linkTag=canWrite()?"a":"div",linkProps=canWrite()?' href="#/comissoes/'+id(c.id)+'"':"";
 return '<article class="commission-tile" style="--commission-bg:'+esc(c.backgroundColor||"#f7f3ff")+'"><'+linkTag+linkProps+' class="commission-tile-link"><div class="commission-tile-main"><span class="commission-icon">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="">':ico("users"))+'</span><div class="commission-tile-info"><h3>'+esc(c.name)+'</h3><p>'+esc(c.description||"")+'</p></div></div><div class="commission-tile-members">'+ico("users")+' '+members+(cmax?" / "+cmax:"")+' integrantes</div>'+(canWrite()?'<span class="commission-tile-view">Ver atividades '+ico("arrow")+'</span>':"")+'</'+linkTag+'>'+
 (canWrite()?'<details class="commission-tile-menu"><summary title="Opções">⋮</summary><div class="commission-tile-menu-items">'+button("Editar","comissoes/editar/"+id(c.id))+
 (isAdmin()?'<button type="button" data-do="delete-commission" data-id="'+esc(c.id)+'">Excluir</button>':joined?'<button type="button" data-do="leave-commission" data-id="'+esc(c.id)+'">Sair da comissão</button>':'<button type="button" data-do="join-commission" data-id="'+esc(c.id)+'" '+(cmax&&members>=cmax?"disabled":"")+'>Fazer parte</button>')+'</div></details>':"")+'</article>'
 }).join("")+'</div></section>';
}
function renderCommittee(cid){
 const c=committee(cid);if(!c)return empty("Comissão não encontrada");
 const d=data.tasks.filter(t=>active(t)&&(t.commissionIds||[]).includes(cid)&&!commissionFinished(t,cid)&&filtered(t,"mensal")&&(!state.week||weekFor(taskDate(t))===state.week));
 const actions=canWrite()?button("Editar comissão","comissoes/editar/"+id(cid))+button("+ Nova demanda","registrar/novo/"+id(cid),true):"";
 return header("Comissões",c.name,c.description||"",actions)+
 '<section class="card card-pad"><div class="section-head"><h2>Cronograma e atividades</h2><span class="pill soft">'+d.length+' registros</span></div>'+period()+(d.length?d.map(t=>taskCard(t,cid)).join(""):empty("Nenhuma demanda ativa neste período"))+'</section>';
}
function renderCommitteeEdit(cid){
 if(!canWrite())return authRequired();
 const c=cid?committee(cid):null;if(cid&&!c)return empty("Comissão não encontrada");
 return header("Comissões",c?"Editar comissão":"Nova comissão","",backButton())+
 '<section class="card card-pad register-page"><form id="commission-form" data-id="'+esc(cid||"")+'" class="register-form">'+
 '<label>Nome da comissão *<input name="name" required maxlength="90" value="'+esc(c?.name||"")+'"></label>'+
 '<label>Descrição (opcional)<textarea name="description" rows="3">'+esc(c?.description||"")+'</textarea></label>'+
 '<label>Fundo do card (opcional)<div class="live-color-row"><input type="color" name="backgroundColor" value="'+esc(c?.backgroundColor||"#f7f3ff")+'"><button type="button" class="button ghost" data-do="reset-color">Restaurar cor padrão</button></div></label>'+
 '<label>Imagem da comissão (opcional)<input type="file" id="commission-upload" accept="image/png,image/jpeg,image/webp"></label><input type="hidden" name="imageData" value="'+esc(c?.imageData||"")+'">'+
 '<button class="button primary" type="submit">Salvar comissão</button></form></section>';
}
function renderMine(){
 if(!canWrite())return authRequired();
 const a=data.tasks.filter(t=>active(t)&&((t.assigneeIds||[]).includes(me.id)||stages(t).some(stage=>(stage.assigneeIds||[]).includes(me.id))));
 return header("Pessoal","Minhas pendências","Demandas atribuídas à sua conta.")+'<section class="card card-pad">'+(a.length?a.map(t=>taskCard(t)).join(""):empty("Nenhuma pendência atribuída"))+'</section>';
}
function assignmentView(){
 const opts=[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","PETianos(as)"]];
 const users=data.users||[],comms=data.committees||[];
 const choices=state.assignmentScope==="comissoes"?comms.map(x=>({key:x.id,name:x.name})):users.map(x=>({key:x.id,name:x.name,role:x.role}));
 const currentSelection=state.assignmentScope==="comissoes"?state.selectedCommissions:state.selectedUsers;
 return '<div class="register-assignment"><h3>Responsáveis *</h3><div class="segmented assignment-modes">'+opts.map(([s,n])=>'<button type="button" class="'+(state.assignmentScope===s?"active":"")+'" data-do="assignment-scope" data-value="'+s+'">'+n+'</button>').join("")+'</div>'+
 (state.assignmentScope==="todos"?'<p class="assignment-all">Todos(as) os(as) usuários(as) cadastrados(as) serão responsáveis.</p>':choices.map(x=>'<label class="assignment-option"><input type="checkbox" data-assign="'+state.assignmentScope+'" value="'+esc(x.key)+'" '+(currentSelection.has(x.key)?"checked":"")+'><span>'+esc(x.name)+'</span></label>').join(""))+
 '<p class="notice-line">Pessoas: '+state.selectedUsers.size+' · Comissões: '+state.selectedCommissions.size+'</p></div>';
}
function stageRow(stage={},i=0){
 const tutor=data.users.filter(x=>x.role==="tutor"),owners=stage.assigneeIds||[],defaultTutor=owners[0]||(stage.label==="Correção"?tutor[0]?.id:"")||"";
 return '<div class="register-deadline live-stage" data-stage-id="'+esc(stage.id||crypto.randomUUID())+'"><label>Etapa<select class="select" data-stage="label">'+["Prazo","Correção","Postagem"].map(v=>opt(v,v,stage.label||"Prazo")).join("")+'</select></label>'+
 '<label>Data<input type="date" data-stage="day" value="'+esc((stage.dueAt||"").slice(0,10))+'" min="'+current.getFullYear()+'-01-01"></label>'+
 '<label>Horário<input type="time" data-stage="hour" value="'+esc((stage.dueAt||"").slice(11,16)||"23:59")+'"></label>'+
 '<label>Responsável (opcional)<select class="select" data-stage="assignee"><option value="">Responsáveis da demanda</option>'+data.users.map(u=>opt(u.id,u.role==="tutor"?"Tutor(a) — "+u.name:u.name,defaultTutor)).join("")+'</select></label>'+
 '<button type="button" class="button ghost" data-do="remove-stage">'+ico("close")+' Remover</button></div>';
}
function renderTaskForm(routeId){
 if(!canWrite())return authRequired();
 let t=null,cid=null;
 if(routeId.startsWith("novo/"))cid=routeId.slice(5);
 else t=data.tasks.find(x=>x.id===routeId);
 if(routeId&&!cid&&!t)return empty("Demanda não encontrada");
 if(state.taskFormId!==routeId){
   state.taskFormId=routeId;
   state.selectedUsers=new Set(t?.assigneeIds||[]);
   state.selectedCommissions=new Set(t?.commissionIds||(cid?[cid]:[]));
   state.assignmentScope="usuarios";
 }
 return header("Cadastros",t?"Editar demanda":"Registrar demanda","Defina o prazo obrigatório e os responsáveis.",backButton())+
 '<section class="card card-pad register-page"><form id="task-form" data-id="'+esc(t?.id||"")+'" class="register-form"><label>Título da demanda *<input name="title" maxlength="180" required value="'+esc(t?.title||"")+'"></label>'+
 '<label>Descrição (opcional)<textarea rows="3" name="description">'+esc(t?.description||"")+'</textarea></label>'+
 '<div id="assignment-container">'+assignmentView()+'</div>'+
 '<div class="register-deadlines"><div class="section-head"><h3>Prazos por etapa</h3><button class="button ghost" type="button" data-do="add-stage">+ Adicionar etapa</button></div><div id="stage-rows">'+(t?.deadlines?.length?t.deadlines:[{label:"Prazo",dueAt:""}]).map(stageRow).join("")+'</div></div>'+
 '<label>Observações (opcional)<textarea name="captionText" rows="4">'+esc(t?.captionText||"")+'</textarea></label>'+
 '<div class="form-actions"><button type="submit" class="button primary">Salvar demanda</button></div></form></section>';
}
function historyFor(taskId){return(data.history||[]).filter(x=>x.task_id===taskId)}
function statusSelect(t){return '<div class="quick-task-status"><div class="quick-task-status-title"><span>Situação da demanda</span><strong>'+esc(t.status==="aprovada"?"Aprovada":t.archivedAt?"Concluída":"Pendente")+'</strong></div><div class="quick-task-status-actions">'+[["pendente","Pendente"],["aprovada","Aprovada"],["concluida","Concluída"]].map(([s,label])=>'<button type="button" class="quick-status-choice '+(t.status===s?"active status-"+s:"")+'" data-do="choose-status" data-value="'+s+'">'+label+'</button>').join("")+'</div><div class="form-actions"><button class="button primary" type="button" data-do="save-status" data-id="'+esc(t.id)+'">Salvar situação</button></div></div>'}
function renderDetail(taskId,contextCid){
 if(!canWrite())return authRequired();
 const t=data.tasks.find(t=>t.id===taskId);if(!t)return empty("Demanda não encontrada");
 if(state.statusTaskId!==taskId){state.statusTaskId=taskId;state.selectedStatus=t.status}
 const assigned=(t.assigneeIds||[]).map(nameFor).filter(Boolean);
 const details=historyFor(taskId);
 return header("Atividade",t.title,"",button("Editar demanda","registrar/"+id(t.id))+backButton())+
 '<section class="card card-pad activity-status-panel">'+statusSelect(t)+'</section>'+
 '<div class="activity-detail-grid"><div class="stack"><section class="card card-pad"><h2>Prazos e etapas</h2>'+
 stages(t).map(s=>'<div class="deadline-record"><div class="deadline-step">'+ico("clock")+' <strong>'+esc(s.label)+'</strong></div><div class="deadline-field"><small>Responsável</small><strong>'+esc((s.assigneeIds||[]).map(nameFor).filter(Boolean).join(", ")||who(t))+'</strong></div><div class="deadline-field"><small>Data</small><strong>'+textDate(s.dueAt)+'</strong></div>'+ (s.completedAt||contextCid&&s.commissionCompleted?.[contextCid]?'<span class="pill mint">Concluído</span>':Object.keys(s.commissionCompleted||{}).length?'<span class="pill soft">'+Object.keys(s.commissionCompleted||{}).length+' comissão(ões) concluída(s)</span>':'<span class="pill soft">Pendente</span>')+'</div>').join("")+
 '</section><section class="card card-pad"><div class="section-head"><h2>Observações</h2><button class="button ghost" data-do="edit-notes" type="button" title="Editar observações">✏️ Editar</button></div><p class="saved-activity-text" id="notes-preview">'+esc(t.captionText||"Nenhuma observação registrada.")+'</p><div id="notes-editor" hidden><textarea id="notes-content" rows="6">'+esc(t.captionText||"")+'</textarea><button class="button primary" type="button" data-do="save-notes" data-id="'+esc(t.id)+'">Salvar observações</button></div></section></div>'+
 '<div class="stack"><section class="card card-pad"><h2>Responsáveis</h2><p>'+esc(assigned.join(", ")||selectedCommitteeNames(t)||"A definir")+'</p></section>'+
 '<section class="card card-pad"><h2>Conclusão por comissão</h2>'+
 ((t.commissionIds||[]).length?(t.commissionIds||[]).map(cid=>{
 const done=t.commissionDone?.[cid];return'<div class="live-commission-finish"><strong>'+esc(committee(cid)?.name||"Comissão")+'</strong>'+(done?'<span class="pill mint">Concluída por '+esc(done.byName||"integrante")+'</span>':!t.archivedAt?'<button type="button" class="button ghost" data-do="finish-commission" data-id="'+esc(t.id)+'" data-commission="'+esc(cid)+'">Marcar concluída</button>':"")+'</div>';
 }).join(""):t.archivedAt?'<span class="pill mint">Concluída</span>':'<button class="button ghost" data-do="finish-commission" data-id="'+esc(t.id)+'" data-commission="">Concluir demanda</button>')+'</section>'+
 '<details class="card card-pad"><summary><strong>Histórico de alterações</strong> ('+details.length+')</summary><div class="revision-list">'+(details.length?details.map(h=>'<div><strong>'+esc(h.action)+'</strong> — '+esc(h.actor_name)+'<small>'+textDate(h.created_at)+' '+esc(new Date(h.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}))+'</small></div>').join(""):'<p>Nenhum registro anterior.</p>')+'</div></details></div></div>';
}
function renderMemory(routeId){
 if(!canWrite())return authRequired();
 const editor=routeId==="nova"||routeId.startsWith("editar/");
 const m=routeId==="nova"?null:data.meetings.find(x=>x.id===(editor?routeId.slice(7):routeId));
 if(!m&&routeId!=="nova")return empty("Memória não encontrada");
 if(!editor)return header("Demandas",m.title,"",button("Editar memória","reunioes/editar/"+id(m.id))+'<button type="button" class="button subtle-danger" data-do="delete-meeting" data-id="'+esc(m.id)+'">Excluir memória</button>'+backButton())+'<section class="card card-pad"><p>'+textDate(m.date)+'</p><pre class="live-memory-text">'+esc(m.rawNotes||"")+'</pre></section>';
 return header("Memórias",m?"Editar memória":"Nova memória","",backButton())+'<section class="card card-pad register-page"><form id="meeting-form" data-id="'+esc(m?.id||"")+'" class="register-form"><label>Título *<input name="title" required value="'+esc(m?.title||"")+'"></label><label>Data *<input name="date" type="date" required value="'+esc(m?.date||dateKey(current))+'"></label><label>Memória da reunião<textarea name="rawNotes" rows="12">'+esc(m?.rawNotes||"")+'</textarea></label><button type="submit" class="button primary">Salvar memória</button></form></section>';
}
function authRequired(){return header("Acesso","Entre na sua conta","Esta funcionalidade exige autenticação.")+'<section class="card card-pad">'+button("Entrar","login",true)+'</section>'}
function renderLogin(){
 return header("Conta","Entrar","Acesse suas atividades e demandas.")+'<section class="card card-pad live-auth"><form id="login-form" class="register-form"><label>E-mail<input type="email" name="email" required autocomplete="email"></label><label>Senha<span class="password-control"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button class="button primary" type="submit">Entrar</button></form><p>'+button("Criar conta","cadastro")+button("Esqueceu sua senha?","esqueci")+'</p></section>';
}
function renderRegisterAccount(){return header("Conta","Criar conta","Nome, e-mail e senha.")+'<section class="card card-pad live-auth"><form id="register-account-form" class="register-form"><label>Nome<input name="name" required minlength="2" maxlength="120"></label><label>E-mail<input name="email" type="email" required></label><label>Senha<span class="password-control"><input name="password" type="password" required minlength="10" autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button type="submit" class="button primary">Criar conta</button></form></section>'}
function renderForgot(){return header("Conta","Esqueceu sua senha?","Enviaremos um link para o e-mail cadastrado.")+'<section class="card card-pad live-auth"><form id="forgot-form" class="register-form"><label>E-mail<input type="email" name="email" required></label><button type="submit" class="button primary">Enviar link</button></form></section>'}
function renderReset(tokenPart){return header("Conta","Redefinir senha","O link é válido por 30 minutos e pode ser usado uma única vez.")+'<section class="card card-pad live-auth"><form id="reset-form" data-token="'+esc(tokenPart)+'" class="register-form"><label>Nova senha<span class="password-control"><input type="password" name="password" minlength="10" required><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button class="button primary" type="submit">Alterar senha</button></form></section>'}
function renderAccount(){
 if(!me)return authRequired();
 return header("Pessoal","Minha conta","Identificação e preferências.")+'<section class="card card-pad live-auth"><h2>'+esc(me.name)+'</h2><p>'+esc(me.email)+'</p><p><strong>Cargo:</strong> '+esc(me.role==="tutor"?"Tutor(a)":me.role==="petiano"?"PETiano(a)":me.role==="usuario"?"Usuário":"Administração")+'</p>'+
 (me.mustChangePassword?'<p class="status-note">Sua senha é temporária. Altere-a para acessar o sistema.</p>':"")+
 (["tutor","admin"].includes(me.role)?'<label class="live-toggle"><input type="checkbox" id="account-notify" '+(me.notificationEnabled?"checked":"")+'> Perguntar se desejo notificar os(as) responsáveis por e-mail</label>':"")+
 '<h3>Alterar senha</h3><form id="change-password-form" class="register-form"><label>Senha atual<span class="password-control"><input type="password" name="password" required><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><label>Nova senha<span class="password-control"><input type="password" name="newPassword" required minlength="10"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button type="submit" class="button primary">Alterar senha</button></form><button class="button ghost" type="button" data-do="logout">Sair da conta</button></section>';
}
function renderAdmin(){
 if(!adminToken||!isAdmin())return header("Sistema","Administração","Acesso administrativo independente.")+
 '<section class="card card-pad live-auth admin-signin"><h2>Entrar como Admin</h2><p>Use o acesso administrativo do PET Gestão. Sua conta de usuário continuará conectada.</p>'+
 '<form id="admin-login-form" class="register-form"><label>Admin ou e-mail<input name="identifier" type="text" value="Admin" required autocomplete="username" autocapitalize="none"></label><label>Senha<span class="password-control"><input name="password" type="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><button type="submit" class="button primary">Entrar na Administração</button></form>'+
 '<p>'+button("Voltar ao PET Gestão","inicio")+'</p></section>';
 return header("Sistema","Administração","Painel administrativo · acesso independente.",'<button type="button" class="button ghost" data-do="admin-signout">Sair da Administração</button>'+button("Voltar ao PET Gestão","inicio"))+
 '<section class="card card-pad"><h2>Usuários</h2><div class="live-admin-list" id="admin-users"><p>Carregando usuários...</p></div></section>'+
 '<section class="card card-pad"><h2>Vagas e ordem das comissões</h2><p>Use ↑ e ↓ para organizar a ordem de exibição.</p>'+
 data.committees.map((c,i)=>'<div class="live-admin-row"><span>'+esc(c.name)+'</span><label>Vagas <input type="number" min="0" max="999" data-vagas="'+esc(c.id)+'" value="'+esc(c.maxMembers||0)+'"></label><button class="button ghost small-action" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="-1" '+(i===0?"disabled":"")+'>↑</button><button class="button ghost small-action" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="1" '+(i===data.committees.length-1?"disabled":"")+'>↓</button><button class="button ghost small-action" data-do="save-vagas" data-id="'+esc(c.id)+'">Salvar</button></div>').join("")+'</section>'+
 '<section class="card card-pad"><h2>Navegação automática dos cronogramas</h2><label class="live-toggle"><input type="checkbox" id="setting-month" '+(data.settings.autoMonth?"checked":"")+'> Atualizar o mês automaticamente</label><label class="live-toggle"><input type="checkbox" id="setting-week" '+(data.settings.autoWeek?"checked":"")+'> Atualizar a semana automaticamente</label><button class="button primary" data-do="save-settings">Salvar configurações</button></section>'+
 '<section class="card card-pad"><h2>E-mails manuais e agendados</h2><form id="mail-form" class="register-form"><label>Destinatários<select id="mail-audience" name="audience" class="select">'+[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","Usuários"]].map(([v,l])=>opt(v,l,state.mailAudience)).join("")+'</select></label><div id="mail-recipients"></div><label>Assunto<input name="subject" required maxlength="200"></label><label>Mensagem<textarea name="message" rows="6" required></textarea></label><label><input type="checkbox" id="mail-scheduled"> Agendar envio</label><div id="mail-scheduling"></div><div id="mail-attachments"></div><button class="button primary" type="submit">Registrar envio</button></form></section>'+
 '<section class="card card-pad"><div class="section-head"><h2>Fila e histórico de e-mails</h2><button class="button ghost" data-do="clear-mail">Limpar registros finalizados</button></div><div id="mail-history"><p>Carregando...</p></div></section>';
}
function renderMailRecipients(){
 const el=$("#mail-recipients");if(!el)return;
 const list=state.mailAudience==="comissoes"?data.committees:state.mailAudience==="usuarios"?data.users:[];
 el.innerHTML=list.map(x=>'<label class="assignment-option"><input type="checkbox" name="mail-target" value="'+esc(x.id)+'"><span>'+esc(x.name)+'</span></label>').join("");
}
function renderMailScheduling(){
 const el=$("#mail-scheduling");if(el)el.innerHTML=state.mailScheduled?'<label>Data e horário do envio<input type="datetime-local" name="sendAt" required></label>':
 '<label>Anexos (somente envio imediato, máximo 10 MB por arquivo)<input type="file" id="mail-file-input" multiple></label><div id="mail-file-list">'+state.mailFiles.map((f,i)=>'<p>'+esc(f.name)+' ('+(f.size/1024/1024).toFixed(2)+' MB) <button type="button" data-do="remove-mail-file" data-index="'+i+'">Remover</button></p>').join("")+'</div>';
}
function render(){
 nav();const {page,parts}=routeParts(),root=$("#screen");if(!root)return;
 if(!allowPage(page)){location.hash="#/login";return}
 if(me?.mustChangePassword&&page!=="conta"){location.hash="#/conta";return}
 let html="";
 if(page==="inicio")html=renderHome();
 else if(page==="demandas")html=renderDemandas();
 else if(page==="cronograma")html=renderCronograma();
 else if(page==="comissoes")html=!parts.length?renderComissoes():parts[0]==="nova"?renderCommitteeEdit(""):parts[0]==="editar"?renderCommitteeEdit(parts.slice(1).join("/")):renderCommittee(parts.join("/"));
 else if(page==="registrar")html=renderTaskForm(parts.join("/"));
 else if(page==="atividade")html=renderDetail(parts[0],parts[1]||"");
 else if(page==="reunioes")html=renderMemory(parts.join("/"));
 else if(page==="minhas-pendencias")html=renderMine();
 else if(page==="login")html=renderLogin();
 else if(page==="cadastro")html=renderRegisterAccount();
 else if(page==="esqueci")html=renderForgot();
 else if(page==="redefinir")html=renderReset(parts[0]||"");
 else if(page==="conta")html=renderAccount();
 else if(page==="admin")html=renderAdmin();
 else html=renderHome();
 root.innerHTML=html;
 if(page==="admin"&&isAdmin()){loadAdminUsers();loadMailHistory();renderMailRecipients();renderMailScheduling()}
}
function askNotification(){return canNotify()?window.confirm("Deseja notificar os(as) responsáveis por e-mail sobre esta alteração?"):false}
async function saveAndReload(action,success="Alterações salvas."){
 try{await action();await reload();setToast(success);return true}catch(e){setToast(e.message);return false}
}
function userFields(form){return Object.fromEntries(new FormData(form).entries())}
async function saveTask(form){
 const f=userFields(form),stages=$$(".live-stage").map(row=>{
 const label=row.querySelector('[data-stage="label"]').value,day=row.querySelector('[data-stage="day"]').value,time=row.querySelector('[data-stage="hour"]').value,person=row.querySelector('[data-stage="assignee"]').value;
 return{id:row.dataset.stageId,label,dueAt:day?day+"T"+(time||"23:59")+":00":"",assigneeIds:person?[person]:[]}
 });
 if(!f.title.trim())return setToast("Informe o título.");
 if(!stages.some(x=>x.label==="Prazo"&&x.dueAt))return setToast("Uma etapa Prazo com data é obrigatória.");
 if(stages.some(x=>!x.dueAt))return setToast("Informe a data de todas as etapas inseridas.");
 if(stages.some(x=>+x.dueAt.slice(0,4)<current.getFullYear()))return setToast("Não cadastre datas de anos anteriores.");
 const users=state.assignmentScope==="todos"?data.users.map(x=>x.id):[...state.selectedUsers],commissions=[...state.selectedCommissions];
 if(!users.length&&!commissions.length)return setToast("Selecione ao menos um responsável ou comissão.");
 const body={title:f.title,description:f.description,captionText:f.captionText,deadlines:stages,assigneeIds:users,commissionIds:commissions,notify:askNotification()},taskId=form.dataset.id;
 await saveAndReload(async()=>{
   const r=await request(taskId?"/tasks/"+id(taskId):"/tasks",taskId?"PUT":"POST",body);
   state.taskFormId=null;location.hash="#/demandas";return r;
 },"Demanda salva com sucesso.");
}
async function chooseStatusSave(taskId){
 const t=data.tasks.find(x=>x.id===taskId);if(!t)return;
 if(state.selectedStatus==="concluida"){
   if((t.commissionIds||[]).length!==1){setToast("Conclua cada comissão na seção de conclusão abaixo.");return}
   await finishTask(t,t.commissionIds[0]);return;
 }
 await saveAndReload(()=>request("/tasks/"+id(taskId)+"/status","PATCH",{status:state.selectedStatus,notify:askNotification()}),"Situação atualizada.");
}
async function finishTask(t,cid){
 const future=stages(t).some(s=>dt(s.dueAt)>new Date()),remaining=(t.commissionIds||[]).filter(x=>x!==cid&&!t.commissionDone?.[x]);
 const message=(future?"Esta atividade possui prazos futuros. Confirmar conclusão antecipada?\n\n":"Confirmar conclusão desta participação?\n\n")+
 (remaining.length?"A demanda só será arquivada quando "+remaining.map(x=>committee(x)?.name||x).join(", ")+" também concluir.":"A demanda será arquivada após a confirmação.");
 if(!window.confirm(message))return;
 const saved=await saveAndReload(()=>request("/tasks/"+id(t.id)+"/finish","PATCH",{commissionId:cid,early:future,notify:askNotification()}),remaining.length?"Participação concluída. A outra comissão ainda precisa confirmar.":"Demanda concluída e arquivada.");
 if(saved)location.hash=cid?"#/comissoes/"+id(cid):"#/demandas";
}
async function saveCommission(form){
 const values=userFields(form);const ok=await saveAndReload(()=>request("/commissions"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{name:values.name,description:values.description,backgroundColor:values.backgroundColor,imageData:values.imageData}),"Comissão salva.");if(ok)location.hash="#/comissoes";
}
async function loadAdminUsers(){
 try{
 const {users}=await request("/admin/users"),target=$("#admin-users");if(!target)return;
 target.innerHTML=users.map(u=>'<div class="live-admin-row"><div><strong>'+esc(u.name)+'</strong><small>'+esc(u.email)+'</small></div><select class="select" data-role="'+esc(u.id)+'">'+[["usuario","Usuário"],["petiano","PETiano(a)"],["tutor","Tutor(a)"],["admin","Administração"]].map(([v,l])=>opt(v,l,u.role)).join("")+'</select><label><input type="checkbox" data-notify="'+esc(u.id)+'" '+(u.notificationEnabled?"checked":"")+'> Notificações</label><button class="button ghost small-action" data-do="save-user" data-id="'+esc(u.id)+'">Salvar</button><button class="button ghost small-action" data-do="temp-pass" data-id="'+esc(u.id)+'">Senha temporária</button></div>').join("");
 }catch(e){setToast(e.message)}
}
async function loadMailHistory(){
 try{const r=await request("/mail"),box=$("#mail-history");if(box)box.innerHTML=r.items.length?r.items.map(x=>'<div class="live-admin-row"><div><strong>'+esc(x.subject)+'</strong><small>'+textDate(x.scheduled_at)+' · '+x.recipientEmails.length+' destinatários</small><small>'+esc(x.error_message||"")+'</small></div><span class="pill '+(x.status==="enviado"?"mint":"soft")+'">'+esc(x.status)+'</span>'+(x.status==="falhou"&&!x.body?.startsWith("[Envio com anexos")?'<button type="button" class="button ghost small-action" data-do="retry-mail" data-id="'+esc(x.id)+'">Tentar novamente</button>':"")+'</div>').join(""):empty("Nenhum e-mail registrado");
 }catch(e){setToast(e.message)}
}
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(file)});
async function sendMail(form){
 const f=userFields(form),ids=$('input[name="mail-target"]:checked').map(el=>el.value),userIds=state.mailAudience==="usuarios"?ids:[],committeeIds=state.mailAudience==="comissoes"?ids:[];
 if(state.mailScheduled&&!f.sendAt)return setToast("Informe a data de envio.");
 const scheduledAt=state.mailScheduled?new Date(f.sendAt).toISOString():null;
 if(state.mailAudience!=="todos"&&!ids.length)return setToast("Selecione ao menos um destinatário.");
 const attachments=state.mailScheduled?[]:await Promise.all(state.mailFiles.map(async file=>({nome:file.name,mimeType:file.type||"application/octet-stream",base64:await fileData(file)})));
 const ok=await saveAndReload(()=>request("/mail","POST",{all:state.mailAudience==="todos",userIds,committeeIds,subject:f.subject,message:f.message,scheduledAt,attachments}),state.mailScheduled?"E-mail agendado.":"E-mail registrado para envio.");
 if(ok){state.mailFiles=[];loadMailHistory()}
}
async function handleClick(e){
 const b=e.target.closest("[data-do]");if(!b||b.disabled)return;
 e.preventDefault();
 const action=b.dataset.do,tid=b.dataset.id;
 if(action==="back"){if(state.navStack?.length>1){state.navStack.pop();state.goingBack=true;location.hash=state.navStack.at(-1)}else location.hash="#/inicio";return}
 if(action==="mode"){state.mode=b.dataset.value;render();return}
 if(action==="today"){state.year=current.getFullYear();state.month=current.getMonth();state.week=0;render();return}
 if(action==="assignment-scope"){state.assignmentScope=b.dataset.value;$("#assignment-container").innerHTML=assignmentView();return}
 if(action==="add-stage"){$("#stage-rows").insertAdjacentHTML("beforeend",stageRow());return}
 if(action==="remove-stage"){b.closest(".live-stage")?.remove();return}
 if(action==="reset-color"){$('input[name="backgroundColor"]').value="#f7f3ff";return}
 if(action==="choose-status"){state.selectedStatus=b.dataset.value;$$(".quick-status-choice").forEach(x=>x.classList.toggle("active",x.dataset.value===state.selectedStatus));return}
 if(action==="save-status"){await chooseStatusSave(tid);return}
 if(action==="finish-commission"){const t=data.tasks.find(x=>x.id===tid);if(t)await finishTask(t,b.dataset.commission||"");return}
 if(action==="edit-notes"){$("#notes-editor").hidden=false;$("#notes-preview").hidden=true;return}
 if(action==="save-notes"){await saveAndReload(()=>request("/tasks/"+id(tid)+"/notes","PATCH",{captionText:$("#notes-content").value,notify:askNotification()}),"Observações salvas.");return}
 if(action==="join-commission"||action==="leave-commission"){
   const c=committee(tid);if(!window.confirm(action==="join-commission"?"Deseja fazer parte da comissão "+c?.name+"?":"Deseja sair da comissão "+c?.name+"?"))return;
   await saveAndReload(()=>request("/commissions/"+id(tid)+"/"+(action==="join-commission"?"join":"leave"),"POST",{}),"Participação atualizada.");return;
 }
 if(action==="delete-commission"){
   if(!isAdmin())return;const c=committee(tid);
   if(!window.confirm('Excluir definitivamente a comissão "'+c?.name+'"? Os registros vinculados impedem a exclusão.'))return;
   await saveAndReload(()=>request("/commissions/"+id(tid),"DELETE"),"Comissão excluída.");return;
 }
 if(action==="delete-meeting"){if(!window.confirm("Excluir esta memória? As demandas vinculadas não serão apagadas."))return;await saveAndReload(()=>request("/meetings/"+id(tid),"DELETE"),"Memória excluída.");location.hash="#/demandas";return}
 if(action==="delete-task"){
   const t=data.tasks.find(x=>x.id===tid);
   if(!t?.archivedAt||!window.confirm('Excluir definitivamente a demanda "'+t.title+'", incluindo etapas, observações e histórico? Essa ação não pode ser desfeita.'))return;
   await saveAndReload(()=>request("/tasks/"+id(tid),"DELETE"),"Demanda removida definitivamente.");return;
 }
 if(action==="logout"){try{await request("/auth/logout","POST",{})}catch{}token="";me=null;sessionStorage.removeItem(tokenKey);await reload();location.hash="#/inicio";return}
 if(action==="move-commission"){
   const ids=data.committees.map(x=>x.id),old=ids.indexOf(tid),target=old+Number(b.dataset.direction);[ids[old],ids[target]]=[ids[target],ids[old]];
   await saveAndReload(()=>request("/admin/commission-order","PUT",{ids}),"Ordem salva.");return;
 }
 if(action==="save-vagas"){
   const c=committee(tid),n=Number($('[data-vagas="'+CSS.escape(tid)+'"]').value);
   await saveAndReload(()=>request("/commissions/"+id(tid),"PUT",{name:c.name,description:c.description,backgroundColor:c.backgroundColor,imageData:c.imageData,maxMembers:n}),"Vagas atualizadas.");return;
 }
 if(action==="save-settings"){await saveAndReload(()=>request("/admin/settings","PUT",{autoMonth:$("#setting-month").checked,autoWeek:$("#setting-week").checked}),"Preferências atualizadas.");return}
 if(action==="save-user"){
   const role=$('[data-role="'+CSS.escape(tid)+'"]').value,notificationEnabled=$('[data-notify="'+CSS.escape(tid)+'"]').checked;
   await saveAndReload(()=>request("/admin/users/"+id(tid),"PATCH",{role,notificationEnabled}),"Perfil atualizado.");return;
 }
 if(action==="temp-pass"){
   if(!window.confirm("Gerar uma nova senha temporária? A senha anterior deixará de funcionar e a pessoa precisará alterá-la ao entrar."))return;
   try{const v=await request("/admin/users/"+id(tid)+"/temporary-password","POST",{});window.prompt("Senha temporária (copie agora; não será exibida novamente):",v.temporaryPassword);setToast("Senha temporária gerada.");}catch(e){setToast(e.message)}return;
 }
 if(action==="clear-mail"){if(!window.confirm("Limpar apenas registros de e-mails enviados ou com falha? Os pendentes e agendados serão preservados."))return;await saveAndReload(()=>request("/mail/clear","POST",{}),"Histórico finalizado limpo.");return}
 if(action==="retry-mail"){await saveAndReload(()=>request("/mail/retry","POST",{id:tid}),"Nova tentativa solicitada.");return}
 if(action==="remove-mail-file"){state.mailFiles.splice(Number(b.dataset.index),1);renderMailScheduling();return}
}
async function handleSubmit(e){
 const form=e.target;if(!form.id)return;e.preventDefault();
 try{
 if(form.id==="login-form"||form.id==="admin-login-form"){
   const f=userFields(form),r=await request("/auth/login","POST",f);
   if(form.id==="admin-login-form"&&r.user.role!=="admin")throw Error("Esta conta não possui permissão de Administração.");
   token=r.token;sessionStorage.setItem(tokenKey,token);await reload();location.hash=r.user.mustChangePassword?"#/conta":form.id==="admin-login-form"?"#/admin":"#/inicio";setToast("Acesso autorizado.");return;
 }
 if(form.id==="register-account-form"){await request("/auth/register","POST",userFields(form));location.hash="#/login";setToast("Conta criada. Faça login.");return}
 if(form.id==="forgot-form"){const r=await request("/auth/forgot","POST",userFields(form));setToast(r.message);return}
 if(form.id==="reset-form"){await request("/auth/reset","POST",{token:form.dataset.token,password:userFields(form).password});location.hash="#/login";setToast("Senha redefinida.");return}
 if(form.id==="change-password-form"){await request("/auth/change-password","POST",userFields(form));token="";sessionStorage.removeItem(tokenKey);await reload();location.hash="#/login";setToast("Senha atualizada. Entre novamente.");return}
 if(form.id==="task-form"){await saveTask(form);return}
 if(form.id==="commission-form"){await saveCommission(form);return}
 if(form.id==="meeting-form"){const f=userFields(form);const ok=await saveAndReload(()=>request("/meetings"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{title:f.title,date:f.date,rawNotes:f.rawNotes}),"Memória salva.");if(ok)location.hash="#/demandas";return}
 if(form.id==="mail-form"){await sendMail(form);return}
 }catch(err){setToast(err.message)}
}
async function handleChange(e){
 const t=e.target;if(!t)return;
 if(t.dataset.stage==="label"&&t.value==="Correção"){const person=t.closest(".live-stage")?.querySelector('[data-stage="assignee"]');if(person&&!person.value)person.value=data.users.find(x=>x.role==="tutor")?.id||"";return;}
 if(t.dataset.assign){
   const set=t.dataset.assign==="comissoes"?state.selectedCommissions:state.selectedUsers;
   if(t.checked)set.add(t.value);else set.delete(t.value);const el=$("#assignment-container");if(el)el.innerHTML=assignmentView();return;
 }
 if(t.dataset.filter){
   const val=Number(t.value);
   if(t.dataset.filter==="month"){state.month=val;state.week=0}
   if(t.dataset.filter==="year"){state.year=val;state.week=0}
   if(t.dataset.filter==="week")state.week=val;
   localStorage.setItem("pet-gestao:period",JSON.stringify({year:state.year,month:state.month,week:state.week}));render();return;
 }
 if(t.id==="account-notify"){await saveAndReload(()=>request("/account","PATCH",{notificationEnabled:t.checked}),"Preferência de notificações salva.");return}
 if(t.id==="mail-audience"){state.mailAudience=t.value;renderMailRecipients();return}
 if(t.id==="mail-scheduled"){state.mailScheduled=t.checked;state.mailFiles=[];renderMailScheduling();return}
 if(t.id==="mail-file-input"){for(const file of t.files){if(file.size>10*1024*1024){setToast("O arquivo "+file.name+" excede 10 MB.");continue}state.mailFiles.push(file)}renderMailScheduling();return}
 if(t.id==="commission-upload"){
   const file=t.files?.[0];if(!file)return;if(file.size>650000)return setToast("Imagem de comissão muito grande. Use até 650 KB.");
   const reader=new FileReader();reader.onload=()=>{$('input[name="imageData"]').value=String(reader.result)};reader.readAsDataURL(file);return;
 }
}
function onNavigation(){if(lastHash!==location.hash){if(!state.goingBack)state.navStack.push(location.hash);else state.goingBack=false;state.previousRoute=lastHash;lastHash=location.hash}render();window.scrollTo({top:0})}
function start(){
 state.navStack=[lastHash];
 if(!location.hash)location.replace(location.pathname+location.search+"#/inicio");
 $("#account-button")?.addEventListener("click",()=>{location.hash=me?"#/conta":"#/login"});
 $("#admin-link")?.addEventListener("click",()=>{location.hash="#/admin"});
 $("#open-menu")?.addEventListener("click",()=>{$("#sidebar").classList.add("open");$("#overlay").hidden=false});
 $("#close-menu")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 $("#overlay")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 window.addEventListener("hashchange",()=>{onNavigation();$("#sidebar")?.classList.remove("open");$("#overlay").hidden=true});
 document.addEventListener("click",e=>{
   const toggle=e.target.closest("[data-password-toggle]");
   if(toggle){
     const input=toggle.closest(".password-control")?.querySelector("input");
     if(!input)return;
     const show=input.type==="password";
     input.type=show?"text":"password";
     toggle.textContent=show?"Ocultar":"Mostrar";
     toggle.setAttribute("aria-label",show?"Ocultar senha":"Mostrar senha");
     toggle.setAttribute("title",show?"Ocultar senha":"Mostrar senha");
     toggle.setAttribute("aria-pressed",String(show));
     return;
   }
   if(e.target.closest("[data-do]"))handleClick(e).catch(err=>setToast(err.message));
 });
 document.addEventListener("submit",e=>handleSubmit(e));
 document.addEventListener("change",e=>handleChange(e).catch(err=>setToast(err.message)));
 reload();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
