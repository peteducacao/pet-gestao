/* PET Gestão: interface real com API autenticada, sem dados fictícios. */
(function frontModule(){
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const CONFIG=window.PET_GESTAO_CONFIG||{},API=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const current=new Date(), tokenKey="pet-gestao:session-token",adminTokenKey="pet-gestao:admin-session-token";
// "Manter-me conectado" guarda somente o token de sessão; nunca a senha.
const readSessionToken=key=>sessionStorage.getItem(key)||localStorage.getItem(key)||"";
function saveSessionToken(key,value,remember){
 sessionStorage.removeItem(key);localStorage.removeItem(key);
 (remember?localStorage:sessionStorage).setItem(key,value);
}
function forgetSessionToken(key){sessionStorage.removeItem(key);localStorage.removeItem(key)}
let token=readSessionToken(tokenKey),adminToken=readSessionToken(adminTokenKey),data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}},me=null,regularMe=null;
const state={adminTab:"painel",adminMenuOpen:false,authTransition:false,commissionAction:null,mailItems:[],mailConnection:null,mailMonitorOpen:false,year:current.getFullYear(),month:current.getMonth(),week:0,mode:"mensal",committeeWeek:0,assignmentScope:"usuarios",selectedUsers:new Set(),selectedCommissions:new Set(),taskFormId:null,mailAudience:"todos",mailScheduled:false,selectedStatus:"pendente",mailFiles:[],previousRoute:"#/inicio"};
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
const who=t=>(t.assigneeIds||[]).map(nameFor).filter(Boolean).join(", ")||"Não definido";
// Somente PETianos e tutores usam as ferramentas da área comum; Admin tem login exclusivo.
const canWrite=()=>Boolean(me&&!me.mustChangePassword&&["petiano","tutor","admin"].includes(me.role));
const hasAdminRole=u=>Boolean(u&&["tutor","admin"].includes(u.role));
const adminRole=u=>Boolean(hasAdminRole(u)&&!u.mustChangePassword);
const isAdmin=()=>Boolean(routeParts().page==="admin"&&hasAdminRole(me));
const roleLabel=role=>({usuario:"Usuário",petiano:"PETiano(a)",tutor:"Tutor(a)",admin:"Administração"}[role]||"Usuário");
const canNotify=()=>canWrite()&&["tutor","admin"].includes(me.role)&&me.notificationEnabled;
const isLate=t=>active(t)&&stages(t).some(s=>!s.completedAt&&dt(s.dueAt)&&dt(s.dueAt)<new Date(new Date().setHours(0,0,0,0)));
const stateBadge=t=>t.archivedAt?'<span class="pill mint">Concluída</span>':isLate(t)?'<span class="pill overdue-pill">Atrasada</span>':t.status==="aprovada"?'<span class="pill mint">Aprovada</span>':'<span class="pill soft">Pendente</span>';
const completedCount=t=>Object.keys(t.commissionDone||{}).length;
const commissionFinished=(t,cid)=>Boolean(t.commissionDone?.[cid]);
function setConnecting(show,label="Conectando ao PET Gestão..."){
 const modal=$("#connecting-popup");
 if(!modal)return;
 if(show){const message=modal.querySelector(".connecting-message");if(message)message.textContent=label;}
 modal.hidden=!show;
}
function workspaceHash(route){return routeParts().page==="admin"?"#/admin/"+route:"#/"+route;}
function adminEmbeddedView(parts){
 const [page,...args]=parts,route=args.join("/");
 if(page==="demandas")return renderDemandas();
 if(page==="cronograma")return renderCronograma();
 if(page==="comissoes")return !route?renderComissoes():args[0]==="nova"?renderCommitteeEdit(""):args[0]==="editar"?renderCommitteeEdit(args.slice(1).join("/")):renderCommittee(route);
 if(page==="registrar")return renderTaskForm(route);
 if(page==="atividade")return renderDetail(args[0]||"",args[1]||"");
 if(page==="reunioes")return renderMemory(route);
 if(page==="minhas-pendencias")return renderMine();
 return empty("Página administrativa não encontrada");
}

// Janela de confirmação e orientação de vagas: não usa alert/confirm do navegador.
let lastCommissionFocus=null;
function closeCommissionDialog(){
 const layer=$("#commission-dialog");
 if(layer){layer.innerHTML="";layer.hidden=true}
 state.commissionAction=null;
 document.body.classList.remove("commission-dialog-open");
 if(lastCommissionFocus?.isConnected)lastCommissionFocus.focus();
 lastCommissionFocus=null;
}
function showCommissionDialog(kind,commission,reason=""){
 const layer=$("#commission-dialog");if(!layer||!commission)return;
 const members=Number(commission.memberCount??commission.memberIds?.length??0);
 const limit=Number(commission.maxMembers||0);
 const blocked=kind==="join"&&(limit<=0||members>=limit);
 const noLimit=limit<=0;
 const title=reason?"Não foi possível atualizar a participação":kind==="leave"?"Sair da comissão?":blocked?(noLimit?"Vagas ainda não definidas":"Vagas esgotadas"):"Participar desta comissão?";
 const message=reason?esc(reason):(
   kind==="leave"?'Você deseja deixar a comissão <strong>'+esc(commission.name)+'</strong>? A equipe será atualizada imediatamente.':
   blocked?(noLimit?'A comissão <strong>'+esc(commission.name)+'</strong> ainda não possui vagas cadastradas pela Administração. Aguarde a definição para fazer parte.':
   'Todas as vagas da comissão <strong>'+esc(commission.name)+'</strong> estão ocupadas. Aguarde a liberação de uma vaga.'):
   'Confirma sua participação na comissão <strong>'+esc(commission.name)+'</strong>? Há '+(limit-members)+' vaga(s) disponível(is).');
 const confirm=!blocked&&!reason;
 state.commissionAction=confirm?{kind,id:commission.id}:null;
 lastCommissionFocus=document.activeElement;
 layer.innerHTML='<div class="commission-dialog-shade" data-do="commission-dialog-close"></div>'+
 '<section class="commission-dialog-box" role="dialog" aria-modal="true" aria-labelledby="commission-dialog-title" aria-describedby="commission-dialog-description">'+
 '<div class="commission-dialog-emblem '+(blocked||reason?"commission-dialog-emblem-warn":"")+'">'+
 (blocked||reason?ico("info"):kind==="leave"?ico("users"):ico("checklist"))+'</div>'+
 '<h2 id="commission-dialog-title">'+esc(title)+'</h2>'+
 '<p id="commission-dialog-description">'+message+'</p>'+
 '<div class="commission-dialog-actions">'+
 (confirm?'<button type="button" class="button ghost" data-do="commission-dialog-close">Cancelar</button><button type="button" class="button primary" data-do="commission-dialog-confirm">'+(kind==="leave"?"Confirmar saída":"Confirmar participação")+'</button>':
 '<button type="button" class="button primary" data-do="commission-dialog-close">Entendi</button>')+
 '</div></section>';
 layer.hidden=false;
 document.body.classList.add("commission-dialog-open");
 layer.querySelector('[data-do="commission-dialog-close"],[data-do="commission-dialog-confirm"]')?.focus();
}
// Confirmação visual da recuperação de senha, com conteúdo grande e legível.
let lastAuthMessageFocus=null;
function closeAuthMessage(){
 const layer=$("#auth-message-dialog");
 if(layer){layer.innerHTML="";layer.hidden=true}
 document.body.classList.remove("auth-message-open");
 if(lastAuthMessageFocus?.isConnected)lastAuthMessageFocus.focus();
 lastAuthMessageFocus=null;
}
function showAuthMessage(title,message,isError=false){
 const layer=$("#auth-message-dialog");if(!layer)return;
 lastAuthMessageFocus=document.activeElement;
 layer.innerHTML='<div class="auth-message-shade" data-do="auth-message-close"></div>'+
 '<section class="auth-message-box" role="dialog" aria-modal="true" aria-labelledby="auth-message-title" aria-describedby="auth-message-description">'+
 '<div class="auth-message-icon'+(isError?" auth-message-icon-warn":"")+'">'+ico(isError?"info":"mail")+'</div>'+
 '<h2 id="auth-message-title">'+esc(title)+'</h2>'+
 '<p id="auth-message-description">'+esc(message)+'</p>'+
 '<button type="button" class="button primary auth-message-button" data-do="auth-message-close">Fechar</button>'+
 '</section>';
 layer.hidden=false;
 document.body.classList.add("auth-message-open");
 layer.querySelector(".auth-message-button")?.focus();
}
function setToast(message){const box=$("#toast");if(!box)return;box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,5200)}
function header(eye,title,sub="",actions=""){return '<div class="page-header"><div><div class="eyebrow">'+esc(eye)+'</div><h1 class="page-title">'+esc(title)+'</h1>'+(sub?'<p class="page-subtitle">'+esc(sub)+'</p>':"")+'</div><div class="page-actions">'+actions+'</div></div>'}
function empty(title,sub=""){return'<div class="empty"><span class="empty-icon">'+ico("folder")+'</span><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p></div>'}
function button(label,route,primary=false){return'<a href="#/'+route+'" class="button '+(primary?"primary":"ghost")+'">'+esc(label)+'</a>'}
function backButton(){return'<button type="button" class="button ghost" data-do="back">'+ico("chevron-left")+' Voltar</button>'}
function routeParts(){const raw=decodeURIComponent((location.hash||"#/inicio").slice(2));const parts=raw.split("/");return{page:parts[0]||"inicio",parts:parts.slice(1)}}
async function request(path,method="GET",payload,scope){
 if(!API)throw Error("URL da API ainda não publicada.");
 const headers={"Accept":"application/json"};
 const inAdmin=scope==="admin"||(!scope&&routeParts().page==="admin");
 const activeToken=scope==="guest"?"":inAdmin?adminRole(regularMe)&&token?token:adminToken:token;
 if(activeToken)headers.Authorization="Bearer "+activeToken;
 if(payload!==undefined)headers["Content-Type"]="application/json";
 const res=await fetch(API+"/api/v1"+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:"no-store"});
 const obj=await res.json().catch(()=>({error:"Resposta inválida do servidor."}));
 if(!res.ok)throw Error(obj.error||"Falha na operação.");
 return obj;
}
async function reload(){
 try{
   const inAdmin=routeParts().page==="admin";
   // Uma conta Tutor(a) ou Administração utiliza sua sessão pessoal, sem outro login.
   const personal=token?await request("/auth/me","GET",undefined,"user").catch(()=>null):null;
   regularMe=personal?.user||null;
   if(token&&!regularMe){token="";forgetSessionToken(tokenKey)}
   const scope=inAdmin&&!adminRole(regularMe)?"admin":"user";
   const b=await request("/bootstrap","GET",undefined,scope);
   data=b;
   me=inAdmin&&adminRole(regularMe)?regularMe:b.session?.user||null;
   if(inAdmin&&adminToken&&!hasAdminRole(me)){adminToken="";forgetSessionToken(adminTokenKey)}
   if(firstBootstrap){firstBootstrap=false;try{const saved=JSON.parse(localStorage.getItem("pet-gestao:period")||"{}");if(b.settings?.autoMonth===false){state.year=Number(saved.year)||state.year;state.month=Number.isInteger(saved.month)?saved.month:state.month}if(b.settings?.autoWeek===false)state.week=Number(saved.week)||0;else state.week=weekFor(current)}catch{state.week=weekFor(current)}}
   $("#connection-dot")?.classList.add("online");
   $("#connection-label").textContent="Conectado";
 }catch(e){
   data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}};
   me=null;$("#connection-label").textContent="Sem conexão";$("#connection-dot")?.classList.remove("online");setToast(e.message);
 }
 try{render()}finally{document.documentElement.classList.remove("pet-booting")}
}
function allowPage(p){if(canWrite())return true;return ["inicio","demandas","cronograma","comissoes","atividade","reunioes","login","cadastro","esqueci","redefinir","conta","admin"].includes(p)}
function nav(){
 const {page}=routeParts();const breadcrumb=$("#current-page");
 if(breadcrumb)breadcrumb.innerHTML='<button class="crumb" type="button" data-do="back" aria-label="Voltar">'+ico("chevron-left")+'</button><span class="breadcrumb-current">'+esc(routeNames[page]||"PET Gestão")+'</span>';
 const account=$("#account-button");
 if(account){
   const person=regularMe, logged=Boolean(person);
   account.innerHTML=ico("user")+'<span class="account-identification"><strong>'+esc(logged?person.name:"Entrar")+'</strong>'+(logged?'<small>'+esc(roleLabel(person.role))+'</small>':"")+'</span>';
   account.classList.toggle("logged-in",logged);
   account.setAttribute("aria-label",logged?"Minha conta: "+person.name+" ("+roleLabel(person.role)+")":"Entrar");
   account.title=logged?"Conectado como "+person.name+" — "+roleLabel(person.role):"Entrar";
 }
 const admin=$("#admin-link");if(admin){const visible=adminRole(regularMe);admin.hidden=!visible;admin.classList.remove("nav-locked");admin.setAttribute("aria-label","Abrir painel administrativo");admin.innerHTML=ico("settings")+'<span>Painel administrativo</span>';admin.title="Painel administrativo"}
 $$(".nav-link[data-route]").forEach(el=>{el.classList.toggle("active",el.dataset.route===page);if(el.dataset.route==="minhas-pendencias")el.hidden=!canWrite()});
 $("#today-label").textContent=textDate(new Date());
 document.title=page==="inicio"?"PET Gestão | PET Educação UFS":(routeNames[page]||"PET Gestão")+" | PET Gestão";
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
 return '<article class="placeholder-row task-list-row"><div class="task-list-body"><div class="task-title-row"><strong>'+esc(t.title)+'</strong><span class="task-date-badge">'+ico("calendar")+' '+textDate(taskDate(t))+'</span></div><small>'+esc((t.commissionIds||[]).length?((t.commissionIds||[]).length===1?"Comissão: ":"Comissões: ")+selectedCommitteeNames(t):"Demanda geral")+'</small>'+
 (me?'<a class="activity-details-link" href="#/atividade/'+id(t.id)+(commissionId?"/"+id(commissionId):"")+'">Ver detalhes '+ico("arrow")+'</a>':"")+'</div><div class="task-row-meta"><span class="task-assignee-label">'+(me?'<strong>Responsáveis:</strong> '+esc(who(t)):"")+'</span>'+stateBadge(t)+(total>1&&done?'<span class="pill soft">'+done+'/'+total+' comissões concluídas</span>':"")+'</div></article>'
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
function commissionDefaultArt(name){
 const n=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const art={
  videos:["🎬","#e8dffc"],cards:["🎨","#fce5ed"],imaginacao:["✨","#fff0c9"],cinepet:["🎞️","#e2e9ff"],
  salinha:["🏡","#e3f4e6"],financas:["💰","#fff0d8"],legenda:["💬","#e1f3fa"],
  site:["💻","#e4e9ff"],comemoracoes:["🎉","#ffe4ed"],impressora3d:["🖨️","#e5f2f1"]
 };
 const [symbol,color]=art[n]||["📋","#ece7fa"];
 return '<span class="commission-default-art" style="--art-color:'+color+'" aria-hidden="true">'+symbol+'</span>';
}
function renderComissoes(){
 return header("Trabalho em equipe","Comissões","Organização das equipes.",canWrite()?button("+ Nova comissão","comissoes/nova",true):"")+
 '<section class="card card-pad"><div class="section-head"><h2>Comissões cadastradas</h2><span class="pill soft">'+data.committees.length+' comissões</span></div><div class="commission-cards-grid">'+data.committees.map(c=>{
 const members=c.memberCount??(c.memberIds||[]).length,cmax=c.maxMembers||0,joined=Boolean(me&&(c.memberIds||[]).includes(me.id));
 const linkTag=canWrite()?"a":"div",linkProps=canWrite()?' href="#/comissoes/'+id(c.id)+'"':"";
 return '<article class="commission-tile" style="--commission-bg:'+esc(c.backgroundColor||"#f7f3ff")+'"><'+linkTag+linkProps+' class="commission-tile-link"><div class="commission-tile-main"><span class="commission-icon">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="'+esc(c.name)+'">':commissionDefaultArt(c.name))+'</span><div class="commission-tile-info"><h3>'+esc(c.name)+'</h3><p>'+esc(c.description||"")+'</p></div></div><div class="commission-tile-members">'+ico("users")+' '+members+(cmax?" / "+cmax:"")+' integrantes'+(!cmax?' · Vagas a definir':"")+'</div>'+(canWrite()?'<span class="commission-tile-view">Ver atividades '+ico("arrow")+'</span>':"")+'</'+linkTag+'>'+
 (canWrite()?'<details class="commission-tile-menu"><summary title="Opções">⋮</summary><div class="commission-tile-menu-items">'+button("Editar","comissoes/editar/"+id(c.id))+
 (isAdmin()?'<button type="button" data-do="delete-commission" data-id="'+esc(c.id)+'">Excluir</button>':joined?'<button type="button" data-do="leave-commission" data-id="'+esc(c.id)+'">Sair da comissão</button>':'<button type="button" data-do="join-commission" data-id="'+esc(c.id)+'">Fazer parte</button>')+'</div></details>':"")+'</article>'
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
 return '<div class="register-assignment"><h3>Responsáveis e comissões *</h3><p class="assignment-help">A comissão identifica a equipe. Apenas as pessoas selecionadas aparecem como responsáveis individuais.</p><div class="segmented assignment-modes">'+opts.map(([s,n])=>'<button type="button" class="'+(state.assignmentScope===s?"active":"")+'" data-do="assignment-scope" data-value="'+s+'">'+n+'</button>').join("")+'</div>'+
 (state.assignmentScope==="todos"?'<p class="assignment-all">Todos(as) os(as) usuários(as) cadastrados(as) serão responsáveis.</p>':choices.map(x=>'<label class="assignment-option"><input type="checkbox" data-assign="'+state.assignmentScope+'" value="'+esc(x.key)+'" '+(currentSelection.has(x.key)?"checked":"")+'><span>'+esc(x.name)+'</span></label>').join(""))+
 '<p class="notice-line">Responsáveis individuais: '+(state.assignmentScope==="todos"?data.users.length:state.selectedUsers.size)+' · Comissões: '+state.selectedCommissions.size+'</p></div>';
}
// Sem pessoa cadastrada, a comissão NÃO é automaticamente tratada como responsável individual.
function inheritedAssigneeLabel(){
 const hasPeople=state.assignmentScope==="todos"?data.users.length>0:state.selectedUsers.size>0;
 return hasPeople?"Responsáveis da demanda":"Não definido";
}
function syncStageAssigneePlaceholder(){
 $$('.live-stage select[data-stage="assignee"] option[value=""]').forEach(o=>{o.textContent=inheritedAssigneeLabel()});
}
function stageRow(stage={},i=0){
 const owners=stage.assigneeIds||[],selectedOwner=owners[0]||"";
 return '<div class="register-deadline live-stage" data-stage-id="'+esc(stage.id||crypto.randomUUID())+'"><label>Etapa<select class="select" data-stage="label">'+["Prazo","Correção","Postagem"].map(v=>opt(v,v,stage.label||"Prazo")).join("")+'</select></label>'+
 '<label>Data<input type="date" data-stage="day" value="'+esc((stage.dueAt||"").slice(0,10))+'" min="'+current.getFullYear()+'-01-01"></label>'+
 '<label>Horário<input type="time" data-stage="hour" value="'+esc((stage.dueAt||"").slice(11,16)||"23:59")+'"></label>'+
 '<label>Responsável (opcional)<select class="select" data-stage="assignee"><option value="">'+inheritedAssigneeLabel()+'</option>'+data.users.map(u=>opt(u.id,u.role==="tutor"?"Tutor(a) — "+u.name:u.name,selectedOwner)).join("")+'</select></label>'+
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
function renderDetailReadOnly(t){
 const history=historyFor(t.id);
 const status=t.archivedAt?"Concluída":t.status==="aprovada"?"Aprovada":"Pendente";
 return header("Atividade",t.title,"Visualização somente leitura",backButton())+
 '<section class="card card-pad"><h2>Situação</h2><p>'+esc(status)+'</p><p><strong>Comissões:</strong> '+esc(selectedCommitteeNames(t)||"Demanda geral")+'</p><p><strong>Responsáveis:</strong> '+esc(who(t))+'</p></section>'+
 '<section class="card card-pad"><h2>Prazos e etapas</h2>'+
 (stages(t).length?stages(t).map(s=>'<div class="deadline-record"><div class="deadline-step">'+ico("clock")+' <strong>'+esc(s.label)+'</strong></div><div class="deadline-field"><small>Data</small><strong>'+textDate(s.dueAt)+'</strong></div><div class="deadline-field"><small>Situação</small><strong>'+(s.completedAt?"Concluída":"Pendente")+'</strong></div></div>').join(""):'<p>Sem etapas cadastradas.</p>')+'</section>'+
 '<section class="card card-pad"><h2>Observações</h2><p class="saved-activity-text">'+esc(t.captionText||"Nenhuma observação registrada.")+'</p></section>'+
 '<details class="card card-pad"><summary><strong>Histórico</strong> ('+history.length+')</summary><div class="revision-list">'+(history.length?history.map(h=>'<div><strong>'+esc(h.action)+'</strong> — '+esc(h.actor_name)+'<small>'+textDate(h.created_at)+'</small></div>').join(""):'<p>Sem alterações registradas.</p>')+'</div></details>';
}
function renderDetail(taskId,contextCid){
 if(!me)return authRequired();
 const t=data.tasks.find(t=>t.id===taskId);if(!t)return empty("Demanda não encontrada");
 if(!canWrite())return renderDetailReadOnly(t);
 if(state.statusTaskId!==taskId){state.statusTaskId=taskId;state.selectedStatus=t.status}
 const assigned=(t.assigneeIds||[]).map(nameFor).filter(Boolean);
 const details=historyFor(taskId);
 return header("Atividade",t.title,"",button("Editar demanda","registrar/"+id(t.id))+backButton())+
 '<section class="card card-pad activity-status-panel">'+statusSelect(t)+'</section>'+
 '<div class="activity-detail-grid"><div class="stack"><section class="card card-pad"><h2>Prazos e etapas</h2>'+
 stages(t).map(s=>'<div class="deadline-record"><div class="deadline-step">'+ico("clock")+' <strong>'+esc(s.label)+'</strong></div><div class="deadline-field"><small>Responsável</small><strong>'+esc((s.assigneeIds||[]).map(nameFor).filter(Boolean).join(", ")||who(t))+'</strong></div><div class="deadline-field"><small>Data</small><strong>'+textDate(s.dueAt)+'</strong></div>'+ (s.completedAt||contextCid&&s.commissionCompleted?.[contextCid]?'<span class="pill mint">Concluído</span>':Object.keys(s.commissionCompleted||{}).length?'<span class="pill soft">'+Object.keys(s.commissionCompleted||{}).length+' comissão(ões) concluída(s)</span>':'<span class="pill soft">Pendente</span>')+'</div>').join("")+
 '</section><section class="card card-pad"><div class="section-head"><h2>Observações</h2><button class="button ghost" data-do="edit-notes" type="button" title="Editar observações">✏️ Editar</button></div><p class="saved-activity-text" id="notes-preview">'+esc(t.captionText||"Nenhuma observação registrada.")+'</p><div id="notes-editor" hidden><textarea id="notes-content" rows="6">'+esc(t.captionText||"")+'</textarea><button class="button primary" type="button" data-do="save-notes" data-id="'+esc(t.id)+'">Salvar observações</button></div></section></div>'+
 '<div class="stack"><section class="card card-pad"><h2>Responsáveis</h2><p>'+esc(assigned.join(", ")||"Não definido")+'</p><p class="assignment-help"><strong>Comissões:</strong> '+esc(selectedCommitteeNames(t)||"Nenhuma")+'</p></section>'+
 '<section class="card card-pad"><h2>Conclusão por comissão</h2>'+
 ((t.commissionIds||[]).length?(t.commissionIds||[]).map(cid=>{
 const done=t.commissionDone?.[cid];return'<div class="live-commission-finish"><strong>'+esc(committee(cid)?.name||"Comissão")+'</strong>'+(done?'<span class="pill mint">Concluída por '+esc(done.byName||"integrante")+'</span>':!t.archivedAt?'<button type="button" class="button ghost" data-do="finish-commission" data-id="'+esc(t.id)+'" data-commission="'+esc(cid)+'">Marcar concluída</button>':"")+'</div>';
 }).join(""):t.archivedAt?'<span class="pill mint">Concluída</span>':'<button class="button ghost" data-do="finish-commission" data-id="'+esc(t.id)+'" data-commission="">Concluir demanda</button>')+'</section>'+
 '<details class="card card-pad"><summary><strong>Histórico de alterações</strong> ('+details.length+')</summary><div class="revision-list">'+(details.length?details.map(h=>'<div><strong>'+esc(h.action)+'</strong> — '+esc(h.actor_name)+'<small>'+textDate(h.created_at)+' '+esc(new Date(h.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}))+'</small></div>').join(""):'<p>Nenhum registro anterior.</p>')+'</div></details></div></div>';
}
function renderMemory(routeId){
 if(!me)return authRequired();
 const editor=routeId==="nova"||routeId.startsWith("editar/");
 if(editor&&!canWrite())return header("Memórias","Acesso somente leitura","Seu perfil não pode criar ou editar memórias.",backButton());
 const m=routeId==="nova"?null:data.meetings.find(x=>x.id===(editor?routeId.slice(7):routeId));
 if(!m&&routeId!=="nova")return empty("Memória não encontrada");
 if(!editor)return header("Demandas",m.title,"",(canWrite()?button("Editar memória","reunioes/editar/"+id(m.id))+'<button type="button" class="button subtle-danger" data-do="delete-meeting" data-id="'+esc(m.id)+'">Excluir memória</button>':"")+backButton())+'<section class="card card-pad"><p>'+textDate(m.date)+'</p><pre class="live-memory-text">'+esc(m.rawNotes||"")+'</pre></section>';
 return header("Memórias",m?"Editar memória":"Nova memória","",backButton())+'<section class="card card-pad register-page"><form id="meeting-form" data-id="'+esc(m?.id||"")+'" class="register-form"><label>Título *<input name="title" required value="'+esc(m?.title||"")+'"></label><label>Data *<input name="date" type="date" required value="'+esc(m?.date||dateKey(current))+'"></label><label>Memória da reunião<textarea name="rawNotes" rows="12">'+esc(m?.rawNotes||"")+'</textarea></label><button type="submit" class="button primary">Salvar memória</button></form></section>';
}
function authRequired(){return header("Acesso","Entre na sua conta","Esta funcionalidade exige autenticação.")+'<section class="card card-pad">'+button("Entrar","login",true)+'</section>'}
function renderLogin(){
 return header("Conta","Entrar","Acesse suas atividades e demandas.")+'<section class="card card-pad live-auth"><form id="login-form" class="register-form"><label>E-mail<input type="email" name="email" required autocomplete="email"></label><label>Senha<span class="password-control"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><label class="remember-login-option"><input type="checkbox" name="rememberMe" value="true"><span><strong>Manter-me conectado</strong><small>Continuar conectado neste dispositivo por até 30 dias.</small></span></label><button class="button primary" type="submit">Entrar</button></form><p>'+button("Criar conta","cadastro")+button("Esqueceu sua senha?","esqueci")+'</p></section>';
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
 if(!isAdmin())return header("Sistema","Administração","Acesso administrativo independente.")+
 '<section class="card card-pad live-auth admin-signin"><h2>Entrar como Admin</h2><p>Use o acesso administrativo do PET Gestão. Sua conta de usuário continuará conectada.</p>'+
 '<form id="admin-login-form" class="register-form"><label>Admin ou e-mail<input name="identifier" type="text" value="Admin" required autocomplete="username" autocapitalize="none"></label><label>Senha<span class="password-control"><input name="password" type="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><label class="remember-login-option"><input type="checkbox" name="rememberMe" value="true"><span><strong>Manter-me conectado</strong><small>Continuar conectado neste dispositivo por até 30 dias.</small></span></label><button type="submit" class="button primary">Entrar na Administração</button></form>'+
 '<p>'+button("Voltar ao PET Gestão","inicio")+'</p></section>';
 if(me?.mustChangePassword)return header("Administração","Alterar senha temporária","Essa alteração é obrigatória antes de usar o painel.")+
 '<section class="card card-pad live-auth"><form id="admin-change-password-form" class="register-form"><label>Senha temporária<span class="password-control"><input name="password" type="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><label>Nova senha<span class="password-control"><input name="newPassword" type="password" minlength="10" required autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><button type="submit" class="button primary">Alterar senha administrativa</button></form></section>';

 const adminPanels='<section class="card card-pad admin-panel" '+(state.adminTab==="usuarios"?"":'hidden')+'><h2>Usuários</h2><div class="live-admin-list" id="admin-users"><p>Carregando usuários...</p></div></section>'+
 '<section class="card card-pad admin-commissions admin-panel" '+(state.adminTab==="comissoes"?"":'hidden')+'><div class="admin-section-heading"><div><h2>Comissões</h2><p>Defina as vagas e organize a ordem de exibição.</p></div><span class="pill soft">'+data.committees.length+' comissões</span></div><div class="admin-commission-list">'+
 data.committees.map((c,i)=>'<div class="admin-commission-item"><div class="admin-commission-identity"><span class="admin-commission-avatar">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="">':commissionDefaultArt(c.name))+'</span><div class="admin-commission-title"><strong>'+esc(c.name)+'</strong><small>Posição '+(i+1)+'</small></div></div><div class="admin-commission-controls"><label class="admin-vacancy-field"><span>Vagas</span><input type="number" min="0" max="999" data-vagas="'+esc(c.id)+'" value="'+esc(c.maxMembers||0)+'" inputmode="numeric"></label><div class="admin-order-controls"><button class="button ghost admin-order-button" title="Subir" aria-label="Subir '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="-1" '+(i===0?"disabled":"")+'>↑</button><button class="button ghost admin-order-button" title="Descer" aria-label="Descer '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="1" '+(i===data.committees.length-1?"disabled":"")+'>↓</button></div><button class="button primary admin-save-button" data-do="save-vagas" data-id="'+esc(c.id)+'">Salvar</button></div></div>').join("")+'</div></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Navegação automática dos cronogramas</h2><label class="live-toggle"><input type="checkbox" id="setting-month" '+(data.settings.autoMonth?"checked":"")+'> Atualizar o mês automaticamente</label><label class="live-toggle"><input type="checkbox" id="setting-week" '+(data.settings.autoWeek?"checked":"")+'> Atualizar a semana automaticamente</label><button class="button primary" data-do="save-settings">Salvar configurações</button></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><h2>E-mails manuais e agendados</h2><form id="mail-form" class="register-form"><label>Destinatários<select id="mail-audience" name="audience" class="select">'+[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","Usuários"]].map(([v,l])=>opt(v,l,state.mailAudience)).join("")+'</select></label><div id="mail-recipients"></div><label>Assunto<input name="subject" required maxlength="200"></label><label>Mensagem<textarea name="message" rows="6" required></textarea></label><label><input type="checkbox" id="mail-scheduled"> Agendar envio</label><div id="mail-scheduling"></div><div id="mail-attachments"></div><button class="button primary" type="submit">Registrar envio</button></form></section>'+
 '<section class="card card-pad admin-mail-history admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><div class="section-head"><h2>Fila e histórico do Gmail</h2><button class="button primary" type="button" data-do="mail-monitor-open">Acompanhar envios</button></div><div id="mail-history"><p>Carregando status...</p></div><button type="button" class="button ghost" data-do="clear-mail">Limpar registros finalizados</button></section>';
 const tabs=[["painel","Painel","grid"],["usuarios","Usuários","user"],["comissoes","Comissões","users"],["emails","E-mails","mail"],["configuracoes","Configurações","settings"]];
 const nav=tab=>'<button class="admin-menu-link '+(state.adminTab===tab[0]?"active":"")+'" data-do="admin-tab" data-value="'+tab[0]+'" type="button">'+ico(tab[2])+'<span>'+tab[1]+'</span></button>';
 const mailCount=Array.isArray(state.mailItems)?state.mailItems.length:0;
 const stats=[["Demandas",data.tasks.length,"list"],["Comissões",data.committees.length,"users"],["Usuários",data.users.length,"user"],["E-mails",mailCount,"mail"]];
 const metric=([name,value,iconName])=>'<div class="admin-metric"><span class="admin-metric-icon">'+ico(iconName)+'</span><strong '+(name==="E-mails"?'id="admin-mail-count"':"")+'>'+value+'</strong><span>'+name+'</span></div>';
 const recent=(data.history||[]).slice(0,4);
 const dashboard=state.adminTab==="painel"?'<div class="admin-metrics">'+stats.map(metric).join("")+'</div>'+
 '<section class="admin-box"><h2>Ações rápidas</h2><div class="admin-shortcuts">'+
 '<a href="#/admin/registrar">'+ico("plus")+'<span>Nova demanda</span></a>'+
 '<button type="button" data-do="admin-tab" data-value="comissoes">'+ico("users")+'<span>Gerenciar comissões</span></button>'+
 '<button type="button" data-do="admin-tab" data-value="usuarios">'+ico("user")+'<span>Gerenciar usuários</span></button>'+
 '<button type="button" data-do="admin-tab" data-value="emails">'+ico("mail")+'<span>Enviar e-mail</span></button></div></section>'+
 '<section class="admin-box"><h2>Últimas alterações</h2>'+(recent.length?recent.map(x=>'<div class="admin-history-row"><span class="admin-history-icon">'+ico("list")+'</span><div><strong>'+esc(x.action||"Alteração")+'</strong><small>'+esc(x.actor_name||"")+'</small></div><time>'+textDate(x.created_at)+'</time></div>').join(""):'<p class="admin-muted">Nenhuma alteração registrada.</p>')+'</section>':"";
 const subroute=routeParts().parts,embedded=subroute.length?adminEmbeddedView(subroute):"";
 const headings={painel:"Painel administrativo",usuarios:"Usuários",comissoes:"Comissões",emails:"E-mails",configuracoes:"Configurações"};
 return '<div class="admin-layout">'+
 '<aside class="admin-sidebar '+(state.adminMenuOpen?"open":"")+'" aria-label="Menu administrativo">'+
 '<div class="admin-brand">'+ico("checklist")+'<div><strong>PET Gestão</strong><small>'+esc(me?.name||"Administração")+'</small></div></div>'+
 '<nav class="admin-navigation">'+nav(tabs[0])+'<button type="button" class="admin-menu-link '+(subroute[0]==="demandas"||["registrar","atividade","reunioes"].includes(subroute[0])?"active":"")+'" data-do="admin-route" data-value="demandas">'+ico("list")+'<span>Demandas</span></button>'+tabs.slice(1).map(nav).join("")+'</nav>'+
 '<div class="admin-sidebar-footer"><button type="button" data-do="admin-signout">'+ico("close")+' Sair do modo Admin</button></div></aside>'+
 (state.adminMenuOpen?'<button type="button" class="admin-screen-overlay" aria-label="Fechar menu" data-do="admin-menu"></button>':"")+
 '<div class="admin-workspace"><div class="admin-toolbar"><button type="button" class="admin-open-menu" data-do="admin-menu" aria-label="Abrir menu administrativo">'+ico("menu")+'</button><div class="admin-toolbar-account">'+ico("user")+'<span><strong>'+esc(me.name)+'</strong><small>'+esc(roleLabel(me.role))+'</small></span></div></div>'+
 '<div class="admin-page">'+(subroute.length?'<div class="admin-embedded-view">'+embedded+'</div>':'<div class="admin-page-kicker">ADMINISTRAÇÃO</div><h1>'+esc(headings[state.adminTab]||headings.painel)+'</h1><p class="admin-page-description">Gerencie demandas, comissões, usuários e envios de e-mails.</p>'+
 dashboard+adminPanels)+'</div></div><div id="mail-monitor-container">'+(state.mailMonitorOpen?renderMailMonitorModal():"")+'</div></div>';
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
 document.body.classList.toggle("admin-ui-active",page==="admin"&&isAdmin()&&!me?.mustChangePassword);
 if(!allowPage(page)){location.hash=me?"#/inicio":"#/login";if(me)setToast("Seu perfil possui acesso somente para visualização.");return}
 if(me?.mustChangePassword&&page!=="conta"&&page!=="admin"){location.hash="#/conta";return}
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
 if(page==="admin"&&isAdmin()&&!me?.mustChangePassword&&!parts.length){
   if(state.adminTab==="usuarios")loadAdminUsers();
   if(state.adminTab==="emails"){renderMailRecipients();renderMailScheduling();loadMailHistory();}
   if(state.adminTab==="painel")loadMailHistory();
 }
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
   state.taskFormId=null;location.hash=workspaceHash("demandas");return r;
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
 const values=userFields(form);const ok=await saveAndReload(()=>request("/commissions"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{name:values.name,description:values.description,backgroundColor:values.backgroundColor,imageData:values.imageData}),"Comissão salva.");if(ok)location.hash=workspaceHash("comissoes");
}
async function loadAdminUsers(){
 try{
 const {users}=await request("/admin/users"),target=$("#admin-users");if(!target)return;
 target.innerHTML=users.map(u=>'<div class="live-admin-row"><div><strong>'+esc(u.name)+'</strong><small>'+esc(u.email)+'</small></div><select class="select" data-role="'+esc(u.id)+'">'+[["usuario","Usuário"],["petiano","PETiano(a)"],["tutor","Tutor(a)"],["admin","Administração"]].map(([v,l])=>opt(v,l,u.role)).join("")+'</select><label><input type="checkbox" data-notify="'+esc(u.id)+'" '+(u.notificationEnabled?"checked":"")+'> Notificações</label><button class="button ghost small-action" data-do="save-user" data-id="'+esc(u.id)+'">Salvar</button><button class="button ghost small-action" data-do="temp-pass" data-id="'+esc(u.id)+'">Senha temporária</button></div>').join("");
 }catch(e){setToast(e.message)}
}
const mailQueueStatuses=new Set(["pendente","processando","agendado"]);
const mailStatusLabel=x=>({pendente:"Pendente",processando:"Processando",agendado:"Agendado",enviado:"Enviado",falhou:"Falhou"}[x]||x||"Desconhecido");
const mailRecipients=x=>Array.isArray(x.recipientEmails)?x.recipientEmails:[];
function mailStatusPanel(){
 const c=state.mailConnection;
 if(!c)return '<div class="mail-connection mail-checking">Verificando a integração com o Gmail...</div>';
 return '<div class="mail-connection '+(c.connected?"mail-ready":"mail-warning")+'"><strong>'+(c.connected?"Integração Gmail autenticada":"A integração precisa de atenção")+'</strong><span>'+esc(c.message||"Sem detalhes disponíveis.")+'</span>'+
 (c.connected&&Number.isFinite(c.quota)?'<small>Quota restante informada pelo Google: '+c.quota+' destinatários</small>':"")+'</div>';
}
function mailEntry(x){
 const recipients=mailRecipients(x),failed=x.status==="falhou";
 const mayRetry=failed&&state.mailConnection?.connected&&!String(x.body||"").startsWith("[Envio com anexos");
 return '<article class="mail-history-item"><div class="mail-history-header"><strong>'+esc(x.subject||"Sem assunto")+'</strong><span class="mail-state mail-state-'+esc(x.status||"desconhecido")+'">'+esc(mailStatusLabel(x.status))+'</span></div>'+
 '<div class="mail-history-meta">'+(recipients.length?esc(recipients.join(", "))+" · ":"")+esc(textDate(x.sent_at||x.scheduled_at||x.created_at))+' · '+recipients.length+' destinatário(s)</div>'+
 (failed?'<p class="mail-history-error">'+esc(x.error_message||"O envio foi recusado.")+'</p>':"")+
 (mayRetry?'<button type="button" class="button ghost" data-do="retry-mail" data-id="'+esc(x.id)+'">Tentar novamente</button>':"")+'</article>';
}
function renderMailMonitorModal(){
 const items=Array.isArray(state.mailItems)?state.mailItems:[];
 const queued=items.filter(x=>mailQueueStatuses.has(x.status));
 const past=items.filter(x=>!mailQueueStatuses.has(x.status)).slice(0,25);
 return '<div class="mail-monitor-shade"><section class="mail-monitor-dialog" role="dialog" aria-modal="true" aria-labelledby="mail-monitor-heading">'+
 '<div class="mail-monitor-heading"><div><h2 id="mail-monitor-heading">Fila e histórico do Gmail</h2><p>Confira mensagens pendentes, enviadas e com falha.</p></div><button type="button" class="mail-monitor-close" data-do="mail-monitor-close" aria-label="Fechar acompanhamento">×</button></div>'+
 '<div class="mail-monitor-content">'+mailStatusPanel()+
 '<div class="mail-monitor-section-title"><h3>Fila atual ('+queued.length+')</h3><button type="button" class="button ghost" data-do="mail-monitor-refresh">Atualizar</button></div>'+
 (queued.length?queued.map(mailEntry).join(""):'<div class="mail-monitor-empty">Nenhum e-mail aguardando envio.</div>')+
 '<h3 class="mail-monitor-subtitle">Histórico recente ('+past.length+')</h3>'+
 (past.length?past.map(mailEntry).join(""):'<div class="mail-monitor-empty">Nenhum e-mail finalizado.</div>')+
 '<p class="mail-monitor-footnote">Enviado significa que a ponte Gmail confirmou o envio. A chegada à caixa de entrada depende do provedor.</p></div></section></div>';
}
async function loadMailHistory(){
 try{
   const [r,c]=await Promise.all([
     request("/mail","GET",undefined,"admin"),
     request("/mail/status","GET",undefined,"admin").catch(e=>({connected:false,message:e.message}))
   ]);
   state.mailItems=Array.isArray(r.items)?r.items:[];
   state.mailConnection=c;
   const metric=$("#admin-mail-count");
   if(metric)metric.textContent=String(state.mailItems.length);
   const queued=state.mailItems.filter(x=>mailQueueStatuses.has(x.status));
   const errors=state.mailItems.filter(x=>x.status==="falhou");
   const box=$("#mail-history");
   if(box)box.innerHTML=mailStatusPanel()+'<div class="mail-summary-stats"><span><strong>'+queued.length+'</strong> na fila</span><span><strong>'+errors.length+'</strong> com falha</span><span><strong>'+state.mailItems.length+'</strong> registros</span></div>';
   const modal=$("#mail-monitor-container");
   if(modal)modal.innerHTML=state.mailMonitorOpen?renderMailMonitorModal():"";
 }catch(e){
   state.mailConnection={connected:false,message:e.message};
   const box=$("#mail-history");if(box)box.innerHTML=mailStatusPanel();
   setToast("Não foi possível atualizar a fila: "+e.message);
 }
}
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=reject;reader.readAsDataURL(file)});
async function sendMail(form){
 const f=userFields(form),ids=$$('input[name="mail-target"]:checked').map(el=>el.value),userIds=state.mailAudience==="usuarios"?ids:[],committeeIds=state.mailAudience==="comissoes"?ids:[];
 if(state.mailScheduled&&!f.sendAt)return setToast("Informe a data de envio.");
 const when=state.mailScheduled?new Date(f.sendAt):null;
 if(when&&Number.isNaN(when.getTime()))return setToast("Informe uma data e horário válidos.");
 const scheduledAt=when?when.toISOString():null;
 if(state.mailAudience!=="todos"&&!ids.length)return setToast("Selecione ao menos um destinatário.");
 const button=form.querySelector('button[type="submit"]');
 if(button?.disabled)return;
 try{
  if(button)button.disabled=true;
  const attachments=state.mailScheduled?[]:await Promise.all(state.mailFiles.map(async file=>({nome:file.name,mimeType:file.type||"application/octet-stream",base64:await fileData(file)})));
  const result=await request("/mail","POST",{all:state.mailAudience==="todos",userIds,committeeIds,subject:f.subject,message:f.message,scheduledAt,attachments},"admin");
  state.mailFiles=[];state.mailAudience="todos";state.mailScheduled=false;
  form.reset();
  renderMailRecipients();renderMailScheduling();
  await loadMailHistory();
  setToast(result.status==="enviado"?"E-mail enviado.":result.status==="agendado"?"E-mail agendado.":"E-mail registrado na fila de envio.");
 }catch(e){setToast("Não foi possível registrar o envio: "+e.message)}
 finally{if(button?.isConnected)button.disabled=false}
}
async function handleClick(e){
 const b=e.target.closest("[data-do]");if(!b||b.disabled)return;
 e.preventDefault();
 const action=b.dataset.do,tid=b.dataset.id;
 if(action==="auth-message-close"){closeAuthMessage();return}
 if(action==="admin-tab"){
  if(!isAdmin())return;
  state.adminTab=b.dataset.value;
  state.adminMenuOpen=false;
  if(routeParts().parts.length)location.hash="#/admin";
  else render();
  window.scrollTo({top:0});
  return;
 }
 if(action==="admin-route"){
  if(!isAdmin())return;
  state.adminMenuOpen=false;
  const section=b.dataset.value;
  if(!["demandas","cronograma","comissoes","registrar"].includes(section))return;
  if(location.hash==="#/admin/"+section)render();
  else location.hash="#/admin/"+section;
  window.scrollTo({top:0});
  return;
 }
 if(action==="admin-menu"){state.adminMenuOpen=!state.adminMenuOpen;render();return}
 if(action==="mail-monitor-open"){state.mailMonitorOpen=true;render();return}
 if(action==="mail-monitor-close"){state.mailMonitorOpen=false;render();return}
 if(action==="mail-monitor-refresh"){await loadMailHistory();return}
 if(action==="back"){
   if(routeParts().page==="admin"){
     const previous=state.navStack?.at(-2);
     if(previous?.startsWith("#/admin")){state.navStack.pop();state.goingBack=true;location.hash=previous;}
     else location.hash="#/admin/demandas";
   }else if(state.navStack?.length>1){state.navStack.pop();state.goingBack=true;location.hash=state.navStack.at(-1)}
   else location.hash="#/inicio";
   return;
 }
 if(action==="mode"){state.mode=b.dataset.value;render();return}
 if(action==="today"){state.year=current.getFullYear();state.month=current.getMonth();state.week=0;render();return}
 if(action==="assignment-scope"){state.assignmentScope=b.dataset.value;$("#assignment-container").innerHTML=assignmentView();syncStageAssigneePlaceholder();return}
 if(action==="add-stage"){$("#stage-rows").insertAdjacentHTML("beforeend",stageRow());return}
 if(action==="remove-stage"){b.closest(".live-stage")?.remove();return}
 if(action==="reset-color"){$('input[name="backgroundColor"]').value="#f7f3ff";return}
 if(action==="choose-status"){state.selectedStatus=b.dataset.value;$$(".quick-status-choice").forEach(x=>x.classList.toggle("active",x.dataset.value===state.selectedStatus));return}
 if(action==="save-status"){await chooseStatusSave(tid);return}
 if(action==="finish-commission"){const t=data.tasks.find(x=>x.id===tid);if(t)await finishTask(t,b.dataset.commission||"");return}
 if(action==="edit-notes"){$("#notes-editor").hidden=false;$("#notes-preview").hidden=true;return}
 if(action==="save-notes"){await saveAndReload(()=>request("/tasks/"+id(tid)+"/notes","PATCH",{captionText:$("#notes-content").value,notify:askNotification()}),"Observações salvas.");return}
 if(action==="join-commission"||action==="leave-commission"){
   showCommissionDialog(action==="join-commission"?"join":"leave",committee(tid));return;
 }
 if(action==="commission-dialog-close"){closeCommissionDialog();return}
 if(action==="commission-dialog-confirm"){
   const pending=state.commissionAction;
   if(!pending)return;
   const submit=$("#commission-dialog-confirm")||b;
   submit.disabled=true;
   try{
     await request("/commissions/"+id(pending.id)+"/"+pending.kind,"POST",{});
     await reload();
     closeCommissionDialog();
     setToast(pending.kind==="join"?"Você agora faz parte desta comissão.":"Você saiu da comissão.");
   }catch(err){
     const c=committee(pending.id);
     showCommissionDialog(pending.kind,c,err.message);
   }finally{if(submit.isConnected)submit.disabled=false}
   return;
 }
 if(action==="delete-commission"){
   if(!isAdmin())return;const c=committee(tid);
   if(!window.confirm('Excluir definitivamente a comissão "'+c?.name+'"? Os registros vinculados impedem a exclusão.'))return;
   await saveAndReload(()=>request("/commissions/"+id(tid),"DELETE"),"Comissão excluída.");return;
 }
 if(action==="delete-meeting"){if(!window.confirm("Excluir esta memória? As demandas vinculadas não serão apagadas."))return;await saveAndReload(()=>request("/meetings/"+id(tid),"DELETE"),"Memória excluída.");location.hash=workspaceHash("demandas");return}
 if(action==="delete-task"){
   const t=data.tasks.find(x=>x.id===tid);
   if(!t?.archivedAt||!window.confirm('Excluir definitivamente a demanda "'+t.title+'", incluindo etapas, observações e histórico? Essa ação não pode ser desfeita.'))return;
   await saveAndReload(()=>request("/tasks/"+id(tid),"DELETE"),"Demanda removida definitivamente.");return;
 }
 if(action==="admin-signout"){
   if(adminRole(regularMe)){
     state.adminTab="painel";state.adminMenuOpen=false;
     location.hash="#/inicio";setToast("Você voltou ao PET Gestão.");return;
   }
   try{await request("/auth/logout","POST",{},"admin")}catch{}
   adminToken="";forgetSessionToken(adminTokenKey);
   state.adminTab="painel";state.adminMenuOpen=false;
   location.hash="#/inicio";setToast("Sessão administrativa encerrada.");return;
 }
 if(action==="logout"){
   try{await request("/auth/logout","POST",{},"user")}catch{}
   // Invalida também sessão administrativa independente antes de limpar ambos os tipos de armazenamento.
   if(adminToken){try{await request("/auth/logout","POST",{},"admin")}catch{}}
   token="";me=null;regularMe=null;adminToken="";
   forgetSessionToken(tokenKey);forgetSessionToken(adminTokenKey);
   await reload();location.hash="#/inicio";return;
 }
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
 if(action==="retry-mail"){
   if(!state.mailConnection?.connected)return setToast("Corrija primeiro a integração Gmail antes de repetir o envio.");
   if(!window.confirm("Tentar novamente este e-mail? Confirme que ele não foi enviado anteriormente."))return;
   try{await request("/mail/retry","POST",{id:tid},"admin");await loadMailHistory();setToast("Nova tentativa registrada na fila.");}
   catch(err){setToast(err.message)}
   return;
 }
 if(action==="remove-mail-file"){state.mailFiles.splice(Number(b.dataset.index),1);renderMailScheduling();return}
}
async function handleSubmit(e){
 const form=e.target;if(!form.id)return;e.preventDefault();
 const isLogin=form.id==="login-form"||form.id==="admin-login-form";
 if(isLogin)setConnecting(true,form.id==="admin-login-form"?"Conectando à Administração...":"Conectando ao PET Gestão...");
 try{
 if(form.id==="admin-login-form"){
   const f=userFields(form),rememberMe=form.elements.rememberMe?.checked===true;
   const r=await request("/auth/admin-login","POST",{...f,rememberMe},"guest");
   if(!["tutor","admin"].includes(r.user.role))throw Error("Esta conta não tem permissão administrativa.");
   adminToken=r.token;saveSessionToken(adminTokenKey,adminToken,rememberMe);
   await reload();setToast("Administração desbloqueada.");return;
 }
 if(form.id==="login-form"){
   const f=userFields(form),rememberMe=form.elements.rememberMe?.checked===true;
   const r=await request("/auth/login","POST",{...f,rememberMe},"guest");
   token=r.token;saveSessionToken(tokenKey,token,rememberMe);
   adminToken="";forgetSessionToken(adminTokenKey);
   const destination=r.user.mustChangePassword?"#/conta":r.user.role==="admin"?"#/admin":"#/inicio";
   state.authTransition=true;
   location.hash=destination;
   try{await reload();}finally{state.authTransition=false;}
   setToast("Acesso autorizado.");return;
 }
 if(form.id==="register-account-form"){await request("/auth/register","POST",userFields(form));location.hash="#/login";setToast("Conta criada. Faça login.");return}
 if(form.id==="forgot-form"){
   const submit=form.querySelector('button[type="submit"]');
   if(submit?.disabled)return;
   if(submit)submit.disabled=true;
   try{
     const r=await request("/auth/forgot","POST",userFields(form));
     showAuthMessage("Solicitação recebida",r.message||"Se o e-mail estiver cadastrado, enviaremos as instruções.");
   }catch(err){
     showAuthMessage("Não foi possível solicitar o link",err.message,true);
   }finally{if(submit?.isConnected)submit.disabled=false}
   return;
 }
 if(form.id==="reset-form"){await request("/auth/reset","POST",{token:form.dataset.token,password:userFields(form).password});location.hash="#/login";setToast("Senha redefinida.");return}
 if(form.id==="admin-change-password-form"){
   await request("/auth/change-password","POST",userFields(form),"admin");
   adminToken="";forgetSessionToken(adminTokenKey);
   await reload();setToast("Senha administrativa atualizada. Entre novamente no Admin.");return;
 }
 if(form.id==="change-password-form"){await request("/auth/change-password","POST",userFields(form));token="";forgetSessionToken(tokenKey);await reload();location.hash="#/login";setToast("Senha atualizada. Entre novamente.");return}
 if(form.id==="task-form"){await saveTask(form);return}
 if(form.id==="commission-form"){await saveCommission(form);return}
 if(form.id==="meeting-form"){const f=userFields(form);const ok=await saveAndReload(()=>request("/meetings"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{title:f.title,date:f.date,rawNotes:f.rawNotes}),"Memória salva.");if(ok)location.hash=workspaceHash("demandas");return}
 if(form.id==="mail-form"){await sendMail(form);return}
 }catch(err){state.authTransition=false;setToast(err.message)}
 finally{if(isLogin)setConnecting(false)}
}
async function handleChange(e){
 const t=e.target;if(!t)return;
 // A etapa de Correção não deve atribuir tutor automaticamente sem confirmação explícita.
 if(t.dataset.stage==="label")return;
 if(t.dataset.assign){
   const set=t.dataset.assign==="comissoes"?state.selectedCommissions:state.selectedUsers;
   if(t.checked)set.add(t.value);else set.delete(t.value);const el=$("#assignment-container");if(el)el.innerHTML=assignmentView();syncStageAssigneePlaceholder();return;
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
function onNavigation(){
 const wasAdmin=lastHash.startsWith("#/admin"),nowAdmin=location.hash.startsWith("#/admin");
 if(lastHash!==location.hash){if(!state.goingBack)state.navStack.push(location.hash);else state.goingBack=false;state.previousRoute=lastHash;lastHash=location.hash}
 if(state.authTransition){window.scrollTo({top:0});return}
 if(wasAdmin!==nowAdmin){state.adminMenuOpen=false;reload().finally(()=>setConnecting(false))}else render();
 window.scrollTo({top:0});
}
function start(){
 state.navStack=[lastHash];
 if(!location.hash)location.replace(location.pathname+location.search+"#/inicio");
 $("#account-button")?.addEventListener("click",()=>{location.hash=regularMe?"#/conta":"#/login"});
 $("#admin-link")?.addEventListener("click",()=>{setConnecting(true,"Conectando ao painel administrativo...");location.hash="#/admin"});
 $("#open-menu")?.addEventListener("click",()=>{$("#sidebar").classList.add("open");$("#overlay").hidden=false});
 $("#close-menu")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 $("#overlay")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 window.addEventListener("hashchange",()=>{onNavigation();$("#sidebar")?.classList.remove("open");$("#overlay").hidden=true;closeCommissionDialog();closeAuthMessage()});
 window.addEventListener("keydown",e=>{if(e.key==="Escape"){
   if(!$("#auth-message-dialog")?.hidden){e.preventDefault();closeAuthMessage()}
   else if(!$("#commission-dialog")?.hidden){e.preventDefault();closeCommissionDialog()}
 }});

 document.addEventListener("click",e=>{
   const innerLink=e.target.closest(".admin-layout a[href^='#/']");
   if(innerLink&&isAdmin()){
     const href=innerLink.getAttribute("href")||"";
     if(!href.startsWith("#/admin")){
       e.preventDefault();
       location.hash="#/admin"+href.slice(1);
       return;
     }
   }
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
