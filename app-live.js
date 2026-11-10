/* PET Gestão: interface real com API autenticada, sem dados fictícios. */
(function frontModule(){
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 let lastRichRange=null;
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
const state={adminTab:"painel",adminMenuOpen:false,authTransition:false,commissionAction:null,mailItems:[],mailConnection:null,mailMonitorOpen:false,year:current.getFullYear(),month:current.getMonth(),week:0,mode:"mensal",committeeWeek:0,assignmentScope:"usuarios",selectedUsers:new Set(),selectedCommissions:new Set(),taskFormId:null,mailAudience:"todos",mailScheduled:false,selectedStatus:"pendente",mailFiles:[],statusFilter:"todas",commissionStatusFilter:"todas",mineStatusFilter:"todas",meetingView:"todas",templateKind:"create",templateDrafts:{},previousRoute:"#/inicio"};
const routeNames={inicio:"Visão geral",demandas:"Demandas",cronograma:"Demandas",comissoes:"Comissões","minhas-pendencias":"Minhas pendências",atividade:"Atividade",registrar:"Registrar demanda",admin:"Administração",conta:"Meu perfil",login:"Entrar",cadastro:"Criar conta",esqueci:"Recuperar senha",redefinir:"Redefinir senha",reunioes:"Atas de Reunião"};
let toastTimer,lastHash=location.hash||"#/inicio",firstBootstrap=true,lastStatusSnapshot="";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const richTags=new Set(["B","STRONG","I","EM","U","P","DIV","BR","UL","OL","LI","SPAN","FONT"]);
function safeRich(value){
 const raw=String(value??"");
 if(!/<\/?[a-z][a-z0-9]*\b/i.test(raw))return esc(raw).replace(/\r?\n/g,"<br>");
 const fragment=document.createElement("template");fragment.innerHTML=raw;
 const walk=node=>{
  if(node.nodeType===3)return esc(node.textContent);
  if(node.nodeType!==1)return "";
  const tag=node.tagName;
  if(["SCRIPT","STYLE","IFRAME","OBJECT","SVG","MATH"].includes(tag))return "";
  const inside=[...node.childNodes].map(walk).join("");
  if(!richTags.has(tag))return inside;
  if(tag==="BR")return "<br>";
  if(tag==="SPAN"||tag==="FONT"){
    const c=node.style?.color||node.getAttribute("color")||"";
    const color=/^(#[a-f0-9]{3,8}|rgb\([\d\s,.%]+\))$/i.test(c)?' style="color:'+esc(c)+'"':"";
    return "<span"+color+">"+inside+"</span>";
  }
  const name=tag.toLowerCase();
  return "<"+name+">"+inside+"</"+name+">";
 };
 return [...fragment.content.childNodes].map(walk).join("");
}

const formatIcon={
 bold:"<strong>B</strong>",italic:"<em>I</em>",underline:"<u>U</u>",
 insertUnorderedList:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
 insertOrderedList:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 4h2v6M3 10h4M3 15c0-2 4-2 4 0s-4 2-4 5h4M11 6h10M11 12h10M11 18h10"/></svg>'
};
function richEditor(name,value,placeholder="Escreva aqui..."){
 const action=(cmd,label)=>'<button type="button" class="rich-format-button" data-do="rich-format" data-format="'+cmd+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" aria-pressed="false">'+formatIcon[cmd]+'</button>';
 return '<div class="rich-editor" data-rich="'+esc(name)+'"><div class="rich-toolbar" role="toolbar" aria-label="Formatação do texto">'+
 '<div class="rich-toolbar-group" aria-label="Estilo">'+action("bold","Negrito")+action("italic","Itálico")+action("underline","Sublinhado")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<div class="rich-toolbar-group" aria-label="Listas">'+action("insertUnorderedList","Lista com marcadores")+action("insertOrderedList","Lista numerada")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<label class="rich-color-label" title="Cor do texto" aria-label="Cor do texto"><span class="rich-color-symbol" aria-hidden="true">A</span><input type="color" data-rich-color value="#5b3bb5" aria-label="Escolher cor do texto"></label>'+
 '</div><div class="rich-content" contenteditable="true" role="textbox" aria-multiline="true" data-rich-input="'+esc(name)+'" data-placeholder="'+esc(placeholder)+'">'+safeRich(value||"")+'</div></div>';
}

const collectRich=(form,fields)=>{for(const e of form.querySelectorAll("[data-rich-input]"))fields[e.dataset.richInput]=safeRich(e.innerHTML);return fields};

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
// Comissões e atribuições individuais são participações distintas; nunca inferir
// responsáveis individuais a partir da lista de integrantes de uma comissão.
// Somente PETianos e tutores usam as ferramentas da área comum; Admin tem login exclusivo.
const canWrite=()=>Boolean(me&&!me.mustChangePassword&&["petiano","tutor","admin"].includes(me.role));
const hasAdminRole=u=>Boolean(u&&u.role==="admin");
// O Worker valida o cargo e a origem da sessão; a interface apenas apresenta permissões.
const adminRole=u=>Boolean(hasAdminRole(u)&&u.adminSession===true);
const isAdmin=()=>Boolean(routeParts().page==="admin"&&adminRole(me));
const roleLabel=role=>({usuario:"Usuário",petiano:"PETiano(a)",tutor:"Tutor(a)",admin:"Administração"}[role]||"Usuário");
const canNotify=()=>canWrite()&&["tutor","admin"].includes(me.role)&&me.notificationEnabled;
const canDeleteTask=t=>Boolean(me&&t&&(
  isAdmin()||(me.role==="tutor"&&!t.archivedAt)||
  (me.role==="petiano"&&!t.archivedAt&&t.createdBy===me.id)
));
const stageDueAt=value=>{
 const raw=String(value||"");
 const parsed=dt(/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+"T23:59:59.999":raw);
 return parsed&&Number.isFinite(parsed.getTime())?parsed:null;
};
const isLate=t=>active(t)&&stages(t).some(s=>{
 if(s.completedAt)return false;
 const due=stageDueAt(s.dueAt);
 return !!due&&due.getTime()<Date.now();
});
const taskStatus=(t,cid="")=>t.archivedAt||(cid&&t.commissionDone?.[cid])?"concluida":isLate(t)?"atrasada":"pendente";
const statusLabel={pendente:"Pendente",atrasada:"Atrasada",concluida:"Concluída"};
const stateBadge=t=>'<span class="task-status task-status-'+taskStatus(t)+'">'+statusLabel[taskStatus(t)]+'</span>';
const completedCount=t=>Object.keys(t.commissionDone||{}).length;
const isUserDone=(task,uid)=>Boolean(task.userDone?.[uid]);
const isTaskAssignedToMe=task=>Boolean(me&&(task.assigneeIds||[]).includes(me.id));
const canCompleteCommission=cid=>Boolean(me&&(committee(cid)?.memberIds||[]).includes(me.id));
const myPendingParts=t=>({
 personal:Boolean(me&&(t.assigneeIds||[]).includes(me.id)&&!isUserDone(t,me.id)),
 committees:me?(t.commissionIds||[]).filter(cid=>canCompleteCommission(cid)&&!commissionFinished(t,cid)):[]
});
const isMyPending=t=>Boolean(me&&active(t)&&(myPendingParts(t).personal||myPendingParts(t).committees.length));
const taskProgress=task=>({done:Object.keys(task.commissionDone||{}).length+Object.keys(task.userDone||{}).length,total:(task.commissionIds||[]).length+(task.assigneeIds||[]).length});
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
 if(page==="cronograma")return renderDemandas();
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

// Um único diálogo para avisos, confirmações e informações importantes.
let noticePromiseResolve=null,noticeReturnFocus=null;
function closeNotice(confirmed=false){
 const layer=$("#notice-dialog");
 if(layer){layer.hidden=true;layer.innerHTML=""}
 document.body.classList.remove("notice-open");
 if(noticePromiseResolve){const resolve=noticePromiseResolve;noticePromiseResolve=null;resolve(Boolean(confirmed))}
 if(noticeReturnFocus?.isConnected)noticeReturnFocus.focus();
 noticeReturnFocus=null;
}
function showNotice(message,{title="",kind="info",confirm=false,danger=false,secret="",focusAfter=null}={}){
 const layer=$("#notice-dialog");if(!layer)return confirm?Promise.resolve(false):undefined;
 if(!layer.hidden)closeNotice(false);
 noticeReturnFocus=focusAfter||document.activeElement;
 const warning=kind==="warning"||danger,success=kind==="success";
 const heading=title||(confirm?(danger?"Confirmar exclusão":"Confirmar ação"):warning?"Atenção":success?"Tudo certo!":"Aviso do PET Gestão");
 layer.innerHTML='<div class="notice-dialog-shade" data-do="notice-cancel"></div>'+
 '<section class="notice-dialog-card" role="dialog" aria-modal="true" aria-labelledby="notice-title" aria-describedby="notice-description">'+
 '<div class="notice-dialog-icon notice-dialog-'+(warning?"warning":success?"success":"info")+'">'+ico(warning?"alert":success?"check":"info")+'</div>'+
 '<h2 id="notice-title">'+esc(heading)+'</h2>'+
 '<p id="notice-description">'+esc(message)+'</p>'+
 (secret?'<div class="notice-secret"><input id="notice-secret-value" type="text" readonly aria-label="Senha temporária" value="'+esc(secret)+'"><button type="button" class="button ghost" data-do="notice-copy">'+ico("copy")+' Copiar senha</button></div>':"")+
 '<div class="notice-dialog-actions">'+
 (confirm?'<button class="button ghost" type="button" data-do="notice-cancel">Cancelar</button><button class="button primary'+(danger?" notice-dialog-danger":"")+'" type="button" data-do="notice-confirm">'+(danger?"Excluir definitivamente":"Confirmar")+'</button>':
 '<button class="button primary" type="button" data-do="notice-cancel">Fechar</button>')+
 '</div></section>';
 layer.hidden=false;document.body.classList.add("notice-open");
 layer.querySelector(confirm?'[data-do="notice-confirm"]':'.notice-dialog-actions [data-do="notice-cancel"]')?.focus();
 if(confirm)return new Promise(resolve=>{noticePromiseResolve=resolve});
}
function setToast(message,kind="auto"){
 const text=String(message||"");
 const error=/\b(erro|falha|falhou|recusad|inválid|indisponível|obrigatóri|não foi possível|não pode|não é possível|não encontrou|preencha|informe|selecione|corrija|atenção|ausente|excede)\b/i.test(text);
 const success=/\b(salv|conclu|criad|atualiz|autorizad|enviad|removid|registrad|desbloquead|copiad|sucesso)\w*/i.test(text);
 return showNotice(text,{kind:kind==="auto"?(error?"warning":success?"success":"info"):kind});
}
const askConfirm=(message,options={})=>showNotice(message,{...options,confirm:true});
function invalidFieldMessage(field){
 const validity=field.validity||{};
 const label=String(field.closest("label")?.childNodes?.[0]?.textContent||field.getAttribute("aria-label")||field.name||"campo").replace(/[\s*]+$/g,"").trim();
 if(validity.valueMissing)return "Preencha o campo obrigatório: "+label+".";
 if(validity.typeMismatch&&field.type==="email")return "Digite um endereço de e-mail válido.";
 if(validity.tooShort)return "O campo "+label+" precisa ter pelo menos "+field.minLength+" caracteres.";
 return "Confira o preenchimento do campo "+label+" antes de continuar.";
}

function header(eye,title,sub="",actions=""){return '<div class="page-header"><div><div class="eyebrow">'+esc(eye)+'</div><h1 class="page-title">'+esc(title)+'</h1>'+(sub?'<p class="page-subtitle">'+esc(sub)+'</p>':"")+'</div><div class="page-actions">'+actions+'</div></div>'}
function empty(title,sub=""){return'<div class="empty"><span class="empty-icon">'+ico("folder")+'</span><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p></div>'}
function button(label,route,primary=false){return'<a href="'+workspaceHash(route)+'" class="button '+(primary?"primary":"ghost")+'">'+esc(label)+'</a>'}
function backButton(){return'<button type="button" class="button ghost" data-do="back">'+ico("chevron-left")+' Voltar</button>'}
function routeParts(){const raw=decodeURIComponent((location.hash||"#/inicio").slice(2));const parts=raw.split("/");return{page:parts[0]||"inicio",parts:parts.slice(1)}}
async function request(path,method="GET",payload,scope){
 if(!API)throw Error("URL da API ainda não publicada.");
 const headers={"Accept":"application/json"};
 const inAdmin=scope==="admin"||(!scope&&routeParts().page==="admin");
 const activeToken=scope==="guest"?"":inAdmin?adminToken:token;
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
   // Tutoria usa a sessão pessoal; a Administração possui uma sessão separada.
   const personal=token?await request("/auth/me","GET",undefined,"user").catch(()=>null):null;
   regularMe=personal?.user||null;
   if(token&&!regularMe){token="";forgetSessionToken(tokenKey)}
   const scope=inAdmin?(adminToken?"admin":"guest"):"user";
   const b=await request("/bootstrap","GET",undefined,scope);
   data=b;
   me=b.session?.user||null;
   if(inAdmin&&adminToken&&!adminRole(me)){adminToken="";forgetSessionToken(adminTokenKey)}
   if(firstBootstrap){firstBootstrap=false;try{const saved=JSON.parse(localStorage.getItem("pet-gestao:period")||"{}");if(b.settings?.autoMonth===false){state.year=Number(saved.year)||state.year;state.month=Number.isInteger(saved.month)?saved.month:state.month}if(b.settings?.autoWeek===false)state.week=Number(saved.week)||0;else state.week=weekFor(current)}catch{state.week=weekFor(current)}}

 }catch(e){
   data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}};
   me=null;setToast(e.message);
 }
 try{render()}finally{document.documentElement.classList.remove("pet-booting")}
}
function allowPage(p){if(canWrite())return true;return ["inicio","demandas","cronograma","comissoes","atividade","reunioes","login","cadastro","esqueci","redefinir","conta","admin"].includes(p)}
function nav(){
 const {page}=routeParts();const breadcrumb=$("#current-page");
 if(breadcrumb)breadcrumb.innerHTML='<button class="crumb" type="button" data-do="back" aria-label="Voltar">'+ico("chevron-left")+'</button><span class="breadcrumb-current">'+esc(routeNames[page]||"PET Gestão")+'</span>';
 const admin=$("#admin-link"),adminCaption=$("#admin-nav-caption"),adminGroup=$("#admin-nav-group");
 const adminVisible=routeParts().page==="admin"&&isAdmin();
 if(adminCaption)adminCaption.hidden=!adminVisible;
 if(adminGroup)adminGroup.hidden=!adminVisible;
 if(admin){admin.hidden=!adminVisible;admin.classList.remove("nav-locked");admin.setAttribute("aria-label","Abrir painel administrativo");admin.innerHTML=ico("settings")+'<span>Painel administrativo</span>';admin.title="Painel administrativo"}
 // Os detalhes destacam a seção pela qual a pessoa entrou.
 if(["inicio","demandas","comissoes","minhas-pendencias"].includes(page))state.lastListSection=page;
 const selectedSection=["atividade","registrar"].includes(page)?(state.lastListSection||"demandas"):page;
 $$(".nav-link[data-route]").forEach(el=>{
   const profile=el.dataset.route==="conta";
   el.classList.toggle("active",profile?(page==="conta"||page==="login"):el.dataset.route===selectedSection);
   if(el.dataset.route==="minhas-pendencias")el.hidden=!canWrite();
   if(profile){
     el.hidden=false;el.href=regularMe?"#/conta":"#/login";
     const label=el.querySelector("span");if(label)label.textContent=regularMe?"Meu perfil":"Entrar";
   }
 });
 if($("#today-label"))$("#today-label").textContent=textDate(new Date());
 document.title=page==="inicio"?"PET Gestão | PET Educação UFS":(routeNames[page]||"PET Gestão")+" | PET Gestão";
}
function weeks(y,m){const days=new Date(y,m+1,0).getDate(),firstDay=new Date(y,m,1).getDay(),firstMonday=1+((8-firstDay)%7),arr=[];let start=1,end=Math.min(days,firstMonday+6);while(start<=days){arr.push({n:arr.length+1,start,end});start=end+1;end=Math.min(days,start+6)}return arr}
function weekFor(d){const x=dt(d);return x?weeks(x.getFullYear(),x.getMonth()).find(w=>x.getDate()>=w.start&&x.getDate()<=w.end)?.n||0:0}
function taskDate(t){return stages(t).filter(x=>!x.completedAt&&x.dueAt).map(x=>x.dueAt).sort()[0]||t.registeredAt}
function filtered(t,mode=state.mode){
 if(mode==="arquivo")return Boolean(t.archivedAt);
 if(!active(t))return false;
 const d=dt(taskDate(t));if(!d)return false;
 if(d.getFullYear()!==state.year||d.getMonth()!==state.month)return false;
 if(mode==="semanal")return !state.week||weekFor(d)===state.week;
 return true;
}
function period(){const years=Array.from({length:9},(_,i)=>current.getFullYear()-2+i);
 return'<div class="filters"><div class="filter-item"><label>MÊS</label><select class="select" data-filter="month">'+MONTHS.map((v,i)=>opt(i,v,state.month)).join("")+'</select></div><div class="filter-item"><label>ANO</label><select class="select" data-filter="year">'+years.map(y=>opt(y,y,state.year)).join("")+'</select></div><div class="filter-item"><label>SEMANA</label><select class="select" data-filter="week"><option value="0">Todas as semanas</option>'+weeks(state.year,state.month).map(w=>opt(w.n,"Semana "+w.n+" ("+w.start+"–"+w.end+")",state.week)).join("")+'</select></div><button type="button" class="button ghost" data-do="today">Hoje</button></div>'
}
// Card único para Visão geral, Demandas, Comissões, Cronograma e Minhas pendências.
// Prioriza a imagem específica da comissão onde a tarefa está sendo consultada.


function cardPeoplePicker(values,kind){
 const names=[...new Set(values.filter(Boolean))];
 if(!names.length)return "";
 const group=kind==="comissoes";
 const icon=group?"users":"user";
 const category=group?"Comissões vinculadas":"Responsáveis individuais";
 const cls=group?"committee":"person";
 if(names.length===1){
  return '<span class="demand-card-single demand-card-'+cls+'" title="'+esc(category)+': '+esc(names[0])+'">'+
  ico(icon)+'<span>'+esc(names[0])+'</span></span>';
 }
 return '<details class="demand-card-picker demand-card-'+cls+'">'+
 '<summary aria-label="'+esc(category)+': '+names.length+' nomes. Abrir lista">'+
 ico(icon)+'<span class="demand-picker-first">'+esc(names[0])+'</span>'+
 '<span class="demand-picker-count">+'+(names.length-1)+'</span>'+
 '<span class="demand-picker-arrow" aria-hidden="true">⌄</span></summary>'+
 '<div class="demand-card-picker-popover"><strong>'+category+'</strong>'+
 '<ul>'+names.map(name=>'<li>'+esc(name)+'</li>').join("")+'</ul></div></details>';
}
function taskCard(t,commissionId,withFinishAction=false){
 const ids=t.commissionIds||[],selected=committee(commissionId)||ids.map(committee).find(Boolean);
 const status=taskStatus(t,commissionId),progress=taskProgress(t),mine=myPendingParts(t);
 const taskHref=workspaceHash("atividade/"+id(t.id)+(commissionId?"/"+id(commissionId):""));
 const photo=selected?.imageData?'<img class="demand-activity-photo" src="'+esc(selected.imageData)+'" alt="" loading="lazy">':selected?commissionDefaultArt(selected.name):ico("checklist");
 const commissionNames=ids.map(cid=>committee(cid)?.name||"Comissão");
 const individualNames=me?(isEveryoneAssigned(t)?["Todos"]:(t.assigneeIds||[]).map(uid=>nameFor(uid)||"Responsável vinculado")):[];
 const selectors=cardPeoplePicker(commissionNames,"comissoes")+cardPeoplePicker(individualNames,"pessoas");
 return '<article class="placeholder-row task-list-row demand-activity-card status-'+status+'">'+
 (me?'<a class="demand-card-cover-link" href="'+taskHref+'" aria-label="Abrir demanda: '+esc(t.title)+'"></a>':"")+
 '<div class="demand-activity-identity"><span class="demand-activity-art" aria-hidden="true">'+photo+'</span>'+
 '<div class="demand-activity-heading"><strong class="demand-activity-title">'+esc(t.title)+'</strong>'+
 (selectors?'<div class="demand-card-people-rows">'+selectors+'</div>':"")+
 (progress.done&&progress.total&&!t.archivedAt?'<small class="demand-activity-progress">'+progress.done+'/'+progress.total+' participações concluídas</small>':"")+
 '</div></div>'+
 '<span class="task-status task-status-'+status+'">'+statusLabel[status]+'</span>'+
 '<div class="demand-activity-fact demand-activity-date"><span class="demand-activity-fact-icon">'+ico("calendar")+'</span>'+
 '<div><span class="demand-activity-label">Data</span><strong>'+esc(textDate(taskDate(t)))+'</strong></div></div>'+
 (me?'<div class="demand-card-actions"><a class="activity-details-link demand-activity-action" href="'+taskHref+'" aria-label="Ver detalhes de '+esc(t.title)+'">Ver detalhes '+ico("arrow")+'</a>'+
 (withFinishAction&&(mine.personal||mine.committees.length)?'<button type="button" class="button demand-finish-action" data-do="finish-mine" data-id="'+esc(t.id)+'">'+ico("check")+' Concluir</button>':"")+'</div>':"")+
 '</article>';
}

document.addEventListener("click",e=>{
 const inside=e.target.closest?.(".demand-card-picker");
 for(const el of document.querySelectorAll(".demand-card-picker[open]")){
  if(el!==inside)el.open=false;
 }
});
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"){
  for(const el of document.querySelectorAll(".demand-card-picker[open]"))el.open=false;
 }
});
function renderHome(){
 const all=data.tasks.filter(active),visible=all.filter(t=>t.overviewVisible!==false),next=[...visible].sort((a,b)=>(dt(taskDate(a))||Infinity)-(dt(taskDate(b))||Infinity)).slice(0,6),late=visible.filter(isLate).length;
 return header("Organização","Visão geral","Demandas da equipe e prazos prioritários.")+
 '<div class="stat-grid">'+[[all.length,"Demandas ativas","list"],[data.tasks.filter(isMyPending).length,"Minhas atividades","checklist"],[late,"Prazos vencidos","alert"],[data.tasks.filter(t=>t.archivedAt).length,"Concluídas","check"]].map(x=>'<div class="card stat"><div class="stat-icon purple">'+ico(x[2])+'</div><div class="stat-copy"><span>'+x[1]+'</span><strong>'+x[0]+'</strong></div></div>').join("")+'</div>'+
 '<div class="dashboard-grid"><section class="card card-pad"><div class="section-head"><div><h2>Pendências semanais</h2><p>As próximas seis atividades em aberto</p></div>'+button("Ver todas as demandas","demandas")+'</div>'+ (next.length?next.map(t=>taskCard(t)).join(""):empty("Sem pendências neste momento"))+'</section>'+
 '<section class="card card-pad"><div class="section-head"><h2>Últimas atualizações</h2>'+ico("bell")+'</div>'+((data.events||[]).length?data.events.slice(0,4).map(e=>'<div class="placeholder-row"><div><strong>'+esc(e.summary)+'</strong><small>'+esc(e.actorName)+' · '+textDate(e.createdAt)+'</small></div></div>').join(""):empty("Nenhuma atualização recente"))+'</section></div>';
}

const VISUALIZATIONS=[["todas","Todas as demandas"],["pendente","Pendentes"],["atrasada","Atrasadas"],["concluida","Concluídas"]];
function visualizationSelect(filter,value,options=VISUALIZATIONS){
 return '<label class="visualization-control"><span class="visualization-label">Visualização:</span>'+
 '<span class="visualization-select-wrap"><span class="visualization-symbol" aria-hidden="true">'+ico("list")+'</span>'+
 '<select class="visualization-select" data-filter="'+esc(filter)+'" aria-label="Visualização">'+options.map(([v,l])=>opt(v,l,value)).join("")+'</select>'+
 '<span class="visualization-chevron" aria-hidden="true">⌄</span></span></label>';
}
function renderDemandas(){
 const done=state.statusFilter==="concluida"||state.mode==="arquivo";
 const displayMode=state.mode==="arquivo"?"mensal":state.mode;
 const actions=canWrite()?button("+ Registrar demanda","registrar",true):"";
 let list=data.tasks.filter(t=>done?Boolean(t.archivedAt):filtered(t,displayMode));
 if(done)list=list.filter(t=>{
  const date=dt(t.archivedAt);
  return date&&date.getFullYear()===state.year&&date.getMonth()===state.month&&(!state.week||displayMode!=="semanal"||weekFor(date)===state.week);
 });
 else if(state.statusFilter!=="todas")list=list.filter(t=>taskStatus(t)===state.statusFilter);
 list.sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 const periodSelect='<label class="filter-item period-mode-filter"><span>PERÍODO</span><select class="select" data-filter="periodMode" aria-label="Período">'+
 [["mensal","Mensal"],["semanal","Semanal"]].map(([v,l])=>opt(v,l,displayMode)).join("")+'</select></label>';
 return header("Acompanhamento","Demandas","Atividades organizadas por período e situação.",actions)+
 '<section class="card card-pad demand-management-panel">'+
 '<div class="demand-visual-toolbar">'+visualizationSelect("status",state.statusFilter)+periodSelect+'</div>'+
 '<div class="list-toolbar">'+period()+'</div><hr class="divider">'+
 (list.length?list.map(t=>'<div class="live-task-card">'+taskCard(t)+
 (done&&isAdmin()?'<button class="button subtle-danger small-action" data-do="delete-task" data-id="'+esc(t.id)+'">Excluir definitivamente</button>':"")+
 '</div>').join(""):empty("Nenhuma demanda encontrada","Selecione outro período ou registre uma demanda."))+'</section>';
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
 const linkTag=canWrite()?"a":"div",linkProps=canWrite()?' href="'+workspaceHash("comissoes/"+id(c.id))+'"':"";
 return '<article class="commission-tile" style="--commission-bg:'+esc(c.backgroundColor||"#f7f3ff")+'"><'+linkTag+linkProps+' class="commission-tile-link"><div class="commission-tile-main"><span class="commission-icon">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="'+esc(c.name)+'">':commissionDefaultArt(c.name))+'</span><div class="commission-tile-info"><h3>'+esc(c.name)+'</h3><p>'+esc(c.description||"")+'</p></div></div><div class="commission-tile-members">'+ico("users")+' '+members+(cmax?" / "+cmax:"")+' integrantes'+(!cmax?' · Vagas a definir':"")+'</div>'+(canWrite()?'<span class="commission-tile-view">Ver atividades '+ico("arrow")+'</span>':"")+'</'+linkTag+'>'+
 (canWrite()?'<details class="commission-tile-menu"><summary title="Opções">⋮</summary><div class="commission-tile-menu-items">'+button("Editar","comissoes/editar/"+id(c.id))+
 (isAdmin()?'<button type="button" data-do="delete-commission" data-id="'+esc(c.id)+'">Excluir</button>':joined?'<button type="button" data-do="leave-commission" data-id="'+esc(c.id)+'">Sair da comissão</button>':'<button type="button" data-do="join-commission" data-id="'+esc(c.id)+'">Fazer parte</button>')+'</div></details>':"")+'</article>'
 }).join("")+'</div></section>';
}

function renderCommittee(cid){
 const c=committee(cid);if(!c)return empty("Comissão não encontrada");
 const all=data.tasks.filter(t=>active(t)&&(t.commissionIds||[]).includes(cid)&&!commissionFinished(t,cid))
 .filter(t=>state.commissionStatusFilter==="todas"||taskStatus(t,cid)===state.commissionStatusFilter)
 .sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 return header("Comissões",c.name,c.description||"","")+
 '<section class="card card-pad"><div class="section-head"><div><h2>Pendências da comissão</h2><p>Atividades vinculadas a esta equipe em Demandas.</p></div><span class="pill soft">'+all.length+' pendente(s)</span></div>'+
 visualizationSelect("commissionStatus",state.commissionStatusFilter,[["todas","Todas as pendências"],["pendente","Pendentes"],["atrasada","Atrasadas"]])+
 (all.length?all.map(t=>taskCard(t,cid)).join(""):empty("Nenhuma pendência nesta comissão","As atividades atribuídas à comissão aparecerão aqui."))+'</section>';
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
 const a=data.tasks.filter(isMyPending)
 .filter(t=>state.mineStatusFilter==="todas"||taskStatus(t)===state.mineStatusFilter)
 .sort((x,y)=>String(taskDate(x)).localeCompare(String(taskDate(y))));
 return header("Pessoal","Minhas pendências","Suas atividades individuais e das comissões das quais participa.")+
 '<section class="card card-pad mine-list">'+visualizationSelect("mineStatus",state.mineStatusFilter,[["todas","Todas as pendências"],["pendente","Pendentes"],["atrasada","Atrasadas"]])+(a.length?a.map(t=>'<div class="mine-task-item">'+taskCard(t,null,true)+'</div>').join(""):empty("Nenhuma atividade atribuída à sua conta"))+'</section>';
}
function assignmentView(){
 const opts=[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","Pessoas"]];
 const users=(data.users||[]).filter(x=>["petiano","tutor","admin"].includes(x.role)),comms=data.committees||[];
 const choices=state.assignmentScope==="comissoes"?comms.map(x=>({key:x.id,name:x.name})):users.map(x=>({key:x.id,name:x.name,role:x.role}));
 const currentSelection=state.assignmentScope==="comissoes"?state.selectedCommissions:state.selectedUsers;
 return '<div class="register-assignment"><div class="task-form-help">'+
 '<span class="task-form-help-icon">'+ico("users")+'</span><div><h3>Responsáveis pela demanda <span class="task-form-required">*</span></h3>'+
 '<p>Escolha quem ficará responsável por realizar esta atividade. Ao selecionar uma <strong>comissão</strong>, a demanda aparece na página dessa equipe. Ao escolher <strong>pessoas</strong>, ela aparece em Minhas pendências de cada responsável. Em <strong>Todos(as)</strong>, todos os integrantes com permissão de concluir recebem a demanda. A exibição na Visão geral pode ser escolhida abaixo.</p></div></div><div class="segmented assignment-modes">'+opts.map(([s,n])=>'<button type="button" class="'+(state.assignmentScope===s?"active":"")+'" data-do="assignment-scope" data-value="'+s+'">'+n+'</button>').join("")+'</div>'+
 (state.assignmentScope==="todos"?'<p class="assignment-all">Todas as pessoas com permissão de concluir recebem a demanda em Minhas pendências.</p>':choices.map(x=>'<label class="assignment-option"><input type="checkbox" data-assign="'+state.assignmentScope+'" value="'+esc(x.key)+'" '+(currentSelection.has(x.key)?"checked":"")+'><span>'+esc(x.name)+'</span></label>').join(""))+
 '<p class="notice-line">Responsáveis individuais: '+(state.assignmentScope==="todos"?users.length:state.selectedUsers.size)+' · Comissões: '+state.selectedCommissions.size+'</p></div>';
}
// Sem pessoa cadastrada, a comissão NÃO é automaticamente tratada como responsável individual.
function syncVisibilityOptions(){
 const only=document.querySelector('input[name="overviewVisibility"][value="comissao"]');
 const general=document.querySelector('input[name="overviewVisibility"][value="geral"]');
 if(!only||!general)return;
 const allowed=state.assignmentScope!=="todos"&&state.selectedCommissions.size>0;
 only.disabled=!allowed;
 if(!allowed&&only.checked)general.checked=true;
}
function inheritedAssigneeLabel(){return "Não definido"}
function stageAssigneeField(selectedOwner=""){
 if(state.assignmentScope==="todos")
  return '<input type="text" class="select stage-assignee-all" data-stage="assignee" value="Todos(as)" aria-label="Responsável pela etapa: Todos(as)" readonly disabled>';
 return '<select class="select" data-stage="assignee"><option value="">'+inheritedAssigneeLabel()+'</option>'+
  data.users.map(u=>opt(u.id,u.name,selectedOwner)).join("")+'</select>';
}
function syncStageAssigneePlaceholder(){
 $$('.live-stage [data-stage="assignee"]').forEach(field=>{
  const label=field.closest("label");
  if(!label)return;
  // O nome escolhido permanece no formulário caso a pessoa volte de Todos(as) para Pessoas.
  if(field.tagName==="SELECT")label.dataset.previousOwner=field.value;
  // Trocar o rótulo sem alterar os demais controles da etapa.
  label.firstChild.textContent=state.assignmentScope==="todos"?"Responsável":"Responsável (opcional)";
  const selectedOwner=label.dataset.previousOwner||"";
  field.outerHTML=stageAssigneeField(selectedOwner);
 });
}
function stageRow(stage={},i=0){
 const owners=stage.assigneeIds||[],selectedOwner=owners[0]||"";
 return '<div class="register-deadline live-stage" data-stage-id="'+esc(stage.id||crypto.randomUUID())+'"><label>Etapa<select class="select" data-stage="label">'+["Prazo","Correção","Postagem"].map(v=>opt(v,v,stage.label||"Prazo")).join("")+'</select></label>'+
 '<label>Data<input type="date" data-stage="day" value="'+esc((stage.dueAt||"").slice(0,10))+'" min="'+current.getFullYear()+'-01-01"></label>'+
 '<label>Horário<input type="time" data-stage="hour" value="'+esc((stage.dueAt||"").slice(11,16)||"23:59")+'"></label>'+
 '<label data-previous-owner="'+esc(selectedOwner)+'">'+(state.assignmentScope==="todos"?"Responsável":"Responsável (opcional)")+stageAssigneeField(selectedOwner)+'</label>'+
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
   state.assignmentScope=cid?"comissoes":t?(t.assignmentScope||(
      isEveryoneAssigned(t)?"todos":t.commissionIds?.length&&!t.assigneeIds?.length?"comissoes":"usuarios"
    )):"usuarios";
 }
 return header("Cadastros",t?"Editar demanda":"Registrar demanda","Defina o prazo obrigatório e os responsáveis.",
 backButton()+
 (t?'<button type="submit" form="task-form" class="button primary task-form-header-save">'+ico("check")+' Salvar demanda</button>':""))+
 '<section class="card card-pad register-page"><form id="task-form" data-id="'+esc(t?.id||"")+'" class="register-form"><label>Título da demanda *<input name="title" maxlength="180" required value="'+esc(t?.title||"")+'"></label>'+
 '<label class="rich-label">Anotações da comissão<small class="field-hint">Registre ideias, lembretes, combinados e informações importantes para a demanda.</small></label>'+richEditor("description",t?.description||"")+
 '<div id="assignment-container">'+assignmentView()+'</div>'+
 '<fieldset class="task-visibility"><legend>Onde exibir a demanda?</legend><p class="field-hint">A demanda continua disponível em Demandas e nas pendências dos responsáveis.</p>'+
 '<label class="visibility-choice"><input type="radio" name="overviewVisibility" value="geral" '+(t?.overviewVisible!==false?'checked':"")+'><span><strong>Visão geral e comissões</strong><small>Visível na Visão geral e nas comissões vinculadas.</small></span></label>'+
 '<label class="visibility-choice"><input type="radio" name="overviewVisibility" value="comissao" '+(t?.overviewVisible===false?'checked':"")+' '+(state.assignmentScope!=="todos"&&state.selectedCommissions.size?"":"disabled")+'><span><strong>Somente nas comissões</strong><small>Sem card na Visão geral; permanece em Demandas e em Minhas pendências dos integrantes.</small></span></label></fieldset>'+
 '<div class="register-deadlines"><div class="section-head"><div class="task-form-deadlines-heading"><span class="task-form-help-icon">'+ico("calendar")+'</span><div><h3>Prazos por etapa</h3><p>Defina até quando os(as) PETianos(as) deverão concluir cada etapa da demanda. A etapa <strong>Prazo</strong> é obrigatória e indica a data de entrega. Se precisar, acrescente etapas para organizar a <strong>Correção</strong> pela tutoria ou a <strong>Postagem</strong>. Você pode escolher um responsável para cada etapa.</p></div></div><button class="button ghost" type="button" data-do="add-stage">+ Adicionar etapa</button></div><div id="stage-rows">'+(t?.deadlines?.length?t.deadlines:[{label:"Prazo",dueAt:""}]).map(stageRow).join("")+'</div></div>'+
 '<label class="rich-label">Texto para revisão (opcional)<small class="field-hint">Escreva ou cole aqui o conteúdo da demanda para revisão da tutoria.</small></label>'+richEditor("captionText",t?.captionText||"")+
 (t?"":'<div class="form-actions"><button type="submit" class="button primary">Salvar demanda</button></div>')+'</form></section>';
}
function historyFor(taskId){return(data.history||[]).filter(x=>x.task_id===taskId)}


function stageResponsibleNames(stage,t){
 if(isEveryoneAssigned(t))return "Todos(as)";
 const assigned=(stage.assigneeIds||[]).map(nameFor).filter(Boolean);
 if(assigned.length)return assigned.join(", ");
 if((stage.assigneeIds||[]).length)return "Responsável vinculado";
 // Se a etapa não tem pessoa selecionada, não atribuir automaticamente integrantes da comissão.
 return "Não definido";
}
function deadlineFacts(t){
 const ordered=stages(t);
 const postings=ordered.filter(x=>x.label==="Postagem");
 const primary=ordered.filter(x=>x.label!=="Postagem");
 const tile=stage=>{
  const icon=stage.label==="Prazo"?"clock":stage.label==="Correção"?"check":"calendar";
  return '<div class="stage-compact-item stage-compact-'+esc(stage.label.toLowerCase())+'">'+
   '<span class="stage-compact-icon" aria-hidden="true">'+ico(icon)+'</span>'+
   '<div class="stage-compact-info"><strong>'+esc(stage.label)+'</strong>'+
   '<time>'+textDate(stage.dueAt)+'</time>'+
   '<div class="stage-responsible">'+ico("user")+'<span>Responsável: <strong>'+esc(stageResponsibleNames(stage,t))+'</strong></span></div></div></div>';
 };
 return '<section class="card card-pad details-facts detail-accent-card">'+
  '<h2 class="detail-card-heading"><span class="detail-heading-icon" aria-hidden="true">'+ico("calendar")+'</span>Prazos e etapas</h2>'+
  (ordered.length?'<div class="stage-compact">'+
    (postings.length?'<div class="stage-posting-top">'+postings.map(tile).join("")+'</div>':"")+
    (primary.length?'<div class="stage-compact-main">'+primary.map(tile).join("")+'</div>':"")+
   '</div>':'<p>Sem etapas cadastradas.</p>')+'</section>';
}

function historySymbol(action){
 const a=String(action||"").toLowerCase();
 if(/conclu|finaliz|aprovad/.test(a))return ["check","complete"];
 if(/cri(o|ou|ad)|cadastr|registrou|nova demanda/.test(a))return ["plus","create"];
 if(/revis|correç|texto/.test(a))return ["list","review"];
 if(/email|e-mail|notific/.test(a))return ["mail","message"];
 if(/remov|exclu|apag/.test(a))return ["close","remove"];
 return ["clock","change"];
}
// "Todos" está guardado na lista de usuários elegíveis da época do cadastro.
// Apresentar o rótulo quando o conjunto corresponde a todos os usuários atuais,
// evitando confundir uma comissão vinculada com uma atribuição individual.
function isEveryoneAssigned(t){
 if(t.assignmentScope==="todos")return true;
 if(t.assignmentScope==="usuarios"||t.assignmentScope==="comissoes")return false;
 const everyone=(data.users||[]).filter(u=>["petiano","tutor","admin"].includes(u.role)).map(u=>String(u.id));
 const assigned=(t.assigneeIds||[]).map(String);
 return !(t.commissionIds||[]).length&&everyone.length>1&&
  new Set(assigned).size===everyone.length&&
  everyone.every(uid=>assigned.includes(uid));
}
function renderAssignees(t){
 const people=(t.assigneeIds||[]).map(id=>nameFor(id)||"Responsável vinculado");
 const teams=(t.commissionIds||[]).map(cid=>committee(cid)).filter(Boolean);
 const everyone=isEveryoneAssigned(t);
 const peoplePanel=people.length?'<div class="assignee-group assignee-people-panel">'+
  '<span class="assignee-column-heading">'+ico("user")+' Pessoas</span>'+
  (everyone?'<div class="assignee-everyone">'+ico("users")+' <strong>Todos</strong></div>':
   '<div class="assignee-chips">'+people.map(name=>'<span class="assignee-person">'+esc(name)+'</span>').join("")+'</div>')+
  '</div>':"";
 const teamsPanel=teams.length?'<div class="assignee-group assignee-commissions-panel">'+
  '<span class="assignee-column-heading">'+ico("users")+' Comissões</span>'+
  teams.map(c=>{
   const members=(c.memberIds||[]).map(nameFor).filter(Boolean);
   return '<div class="assignee-team"><strong>'+ico("users")+' '+esc(c.name)+'</strong>'+
    (members.length?'<small>Integrantes: '+esc(members.slice(0,4).join(", "))+
     (members.length>4?' e mais '+(members.length-4):"")+'</small>':"")+'</div>';
  }).join("")+'</div>':"";
 return '<section class="card card-pad assignee-card detail-accent-card"><h2 class="detail-card-heading">'+
  '<span class="detail-heading-icon" aria-hidden="true">'+ico("users")+'</span>Responsáveis</h2>'+
  ((people.length||teams.length)?
    '<div class="assignee-columns'+(!(people.length&&teams.length)?' assignee-columns-single':"")+'">'+
    peoplePanel+teamsPanel+'</div>':
    '<p class="assignee-empty">Nenhum responsável vinculado.</p>')+
  '</section>';
}
function renderHistory(t){
 const history=historyFor(t.id);
 return '<details class="card card-pad activity-history" '+(history.length?'open':"")+'><summary aria-label="Expandir ou recolher histórico de alterações">'+
 '<span class="activity-history-heading"><span class="history-title-icon" aria-hidden="true">'+ico("clock")+'</span><strong>Histórico de alterações</strong><span class="history-counter">'+history.length+'</span></span>'+
 '<span class="history-toggle"><span class="history-toggle-caption">Ver registros</span><svg class="history-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></summary>'+
 '<div class="revision-list">'+
 (history.length?history.map(h=>{
  const [iconName,kind]=historySymbol(h.action);
  const stamp=dt(h.created_at),time=stamp?stamp.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"";
  return '<div class="revision-entry"><span class="revision-symbol revision-symbol-'+kind+'" aria-hidden="true">'+ico(iconName)+'</span>'+
  '<div class="revision-copy"><strong>'+esc(h.action||"Alteração")+'</strong>'+
  '<span>'+esc(h.actor_name||"Responsável não identificado")+'</span><small>'+textDate(h.created_at)+(time?' · '+time:"")+'</small></div></div>';
 }).join(""):'<p class="history-empty">Nenhuma alteração registrada.</p>')+
 '</div></details>';
}
function detailStatusSelector(t,status){
 if(t.archivedAt)return '<span class="task-status task-status-concluida detail-status-final">Concluída</span>';
 return '<label class="detail-status-control detail-status-'+status+'"><span class="detail-status-caption">Status</span>'+
 '<select class="detail-status-select" data-detail-status data-id="'+esc(t.id)+'" aria-label="Status da demanda: '+statusLabel[status]+'">'+
 '<option value="'+status+'" selected>'+statusLabel[status]+'</option>'+
 '<option value="concluir">Concluído</option></select>'+
 '<svg class="detail-status-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></label>';
}
function activitySections(t,readOnly=false){
 const ids=t.commissionIds||[];
 const commissionProgress=ids.length>=2?'<section class="card card-pad detail-accent-card"><h2 class="detail-card-heading"><span class="detail-heading-icon">'+ico("users")+'</span>Andamento das comissões</h2>'+
 ids.map(cid=>'<div class="commission-progress-row"><strong>'+esc(committee(cid)?.name||"Comissão")+'</strong>'+
 '<span class="task-status task-status-'+taskStatus(t,cid)+'">'+statusLabel[taskStatus(t,cid)]+'</span></div>').join("")+'</section>':"";
 return '<div class="activity-detail-layout">'+
  '<div class="activity-detail-top"><div class="stack detail-left-column">'+deadlineFacts(t)+renderAssignees(t)+commissionProgress+'</div>'+
  '<div class="stack detail-history-column">'+renderHistory(t)+'</div></div>'+
  '<section class="card card-pad detail-accent-card detail-review-full">'+
   '<h2 class="detail-card-heading"><span class="detail-heading-icon" aria-hidden="true">'+ico("list")+'</span>Texto para revisão</h2>'+
   '<div class="saved-activity-text">'+safeRich(t.captionText||"Nenhum texto registrado.")+'</div>'+
  '</section></div>';
}
function detailVisualization(){
 return '<div class="detail-visualization">'+visualizationSelect("navigateDemands","todas")+'</div>';
}
function renderDetailReadOnly(t){
 return '<div class="activity-detail-page">'+header("Atividade",t.title,"Visualização da demanda",backButton())+detailVisualization()+activitySections(t,true)+'</div>';
}
function renderDetail(taskId,contextCid){
 if(!me)return authRequired();
 const t=data.tasks.find(t=>t.id===taskId);if(!t)return empty("Demanda não encontrada");
 if(!canWrite())return renderDetailReadOnly(t);
 const status=taskStatus(t,contextCid);
 const actions=(t.archivedAt?"":button("Editar demanda","registrar/"+id(t.id)))+
 detailStatusSelector(t,status)+
 (canDeleteTask(t)?'<button type="button" class="button danger-outline" data-do="delete-task" data-id="'+esc(t.id)+'">'+ico("close")+' Excluir</button>':"");
 return '<div class="activity-detail-page">'+header("Atividade",t.title,"",actions)+detailVisualization()+activitySections(t,false)+'</div>';
}

function closeFinishDialog(){
 const layer=$("#finish-dialog");if(layer){layer.hidden=true;layer.innerHTML="";}
}
function openFinishDialog(task){
 const layer=$("#finish-dialog");if(!layer||!task)return;
 const users=(task.assigneeIds||[]).filter(id=>!task.userDone?.[id]);
 const groups=(task.commissionIds||[]).filter(id=>!task.commissionDone?.[id]);
 if(!users.length&&!groups.length){setToast("Todas as participações já foram concluídas.");return;}
 const make=(items,type)=>items.map(key=>'<label class="joint-pick"><input type="checkbox" name="joint-target" value="'+esc(key)+'" data-kind="'+type+'" '+(key===me.id||users.length+groups.length===1?"checked":"")+'><span>'+esc(type==="user"?nameFor(key):committee(key)?.name||"Comissão")+'</span></label>').join("");
 layer.innerHTML='<div class="finish-backdrop" data-do="finish-close"></div><section class="finish-popup" role="dialog" aria-modal="true" aria-label="Concluir participações">'+
 '<h2>Concluir participações</h2><p>Selecione as pessoas e comissões que concluíram esta atividade.</p>'+
 (users.length?'<h3>Pessoas</h3>'+make(users,"user"):"")+
 (groups.length?'<h3>Comissões</h3>'+make(groups,"commission"):"")+
 '<div class="finish-actions"><button type="button" class="button ghost" data-do="finish-close">Cancelar</button>'+
 '<button type="button" class="button primary" data-do="finish-joint-confirm" data-id="'+esc(task.id)+'">Concluir selecionados</button></div></section>';
 layer.hidden=false;
 layer.querySelector("input:checked, input")?.focus();
}
async function completeJoint(task,layer){
 const picked=[...layer.querySelectorAll('input[name="joint-target"]:checked')];
 if(!picked.length){setToast("Selecione ao menos uma participação.");return;}
 const userIds=picked.filter(el=>el.dataset.kind==="user").map(el=>el.value);
 const commissionIds=picked.filter(el=>el.dataset.kind==="commission").map(el=>el.value);
 const future=stages(task).some(stage=>dt(stage.dueAt)>new Date());
 if(!await askConfirm(future?"Esta atividade possui prazos futuros. Confirmar conclusão antecipada?":"Confirmar a conclusão das participações selecionadas?",{title:future?"Conclusão antecipada":"Confirmar conclusão"}))return;
 const ok=await saveAndReload(()=>request("/tasks/"+id(task.id)+"/finish","PATCH",{userIds,commissionIds,early:future,notify:false}),"Conclusão registrada.");
 if(ok)closeFinishDialog();
}

function renderMeetings(){
 if(!me)return authRequired();
 const items=[...(data.meetings||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const showing=state.meetingView==="recentes"?items.slice(0,5):items;
 return header("Registros","Atas de Reunião","Registros organizados das reuniões da equipe.",canWrite()?button("+ Criar ata","reunioes/nova",true):"")+
 '<section class="card card-pad meeting-list">'+visualizationSelect("meetings",state.meetingView,[["todas","Todas as atas"],["recentes","Recentes"]])+
 (showing.length?showing.map(m=>'<article class="meeting-card"><a class="meeting-card-link" href="'+workspaceHash("reunioes/editar/"+id(m.id))+'"><span class="meeting-card-icon">'+ico("calendar")+'</span><span class="meeting-card-main"><strong>'+esc(m.title)+'</strong><small>'+textDate(m.date)+'</small><span class="meeting-card-preview">'+esc((m.rawNotes||"").replace(/<[^>]+>/g," ").slice(0,130))+'</span></span>'+ico("arrow")+'</a>'+
 (canWrite()?'<details class="meeting-menu"><summary title="Opções da ata" aria-label="Opções da ata">⋮</summary><div class="meeting-menu-options">'+button("Editar","reunioes/editar/"+id(m.id))+'<button type="button" class="button subtle-danger" data-do="delete-meeting" data-id="'+esc(m.id)+'">Excluir</button></div></details>':"")+'</article>').join(""):empty("Nenhuma ata registrada","Crie uma ata para registrar os encontros da equipe."))+
 '</section>';
}
function renderMemory(routeId){
 if(!routeId)return renderMeetings();
 if(!me)return authRequired();
 const editor=routeId==="nova"||routeId.startsWith("editar/");
 if(editor&&!canWrite())return authRequired();
 const mid=editor&&routeId.startsWith("editar/")?routeId.slice(7):routeId;
 const m=routeId==="nova"?null:data.meetings.find(x=>x.id===mid);
 if(!m&&routeId!=="nova")return empty("Ata não encontrada");
 return header("Atas de Reunião",m?"Editar ata":"Criar ata","",backButton())+
 '<section class="card card-pad register-page meeting-editor"><form id="meeting-form" data-id="'+esc(m?.id||"")+'" class="register-form">'+
 (m?'<div class="meeting-metadata"><strong>'+esc(m.title)+'</strong><span>'+textDate(m.date)+'</span></div><input type="hidden" name="title" value="'+esc(m.title)+'"><input type="hidden" name="date" value="'+esc(m.date)+'">':
 '<label>Título da reunião *<input name="title" required maxlength="180"></label><label>Data *<input name="date" type="date" required value="'+dateKey(current)+'"></label>')+
 '<label>Texto da ata<textarea name="rawNotes" rows="16" placeholder="Registre os assuntos e encaminhamentos da reunião.">'+esc(m?.rawNotes||"")+'</textarea></label>'+
 '<div class="form-actions"><button type="submit" class="button primary">Salvar ata</button></div></form></section>';
}

function authRequired(){return header("Acesso","Entre na sua conta","Esta funcionalidade exige autenticação.")+'<section class="card card-pad">'+button("Entrar","login",true)+'</section>'}
function renderLogin(){
 return header("Conta","Entrar","Acesse suas atividades e demandas.")+'<section class="card card-pad live-auth"><form id="login-form" class="register-form"><label>E-mail<input type="email" name="email" required autocomplete="email"></label><label>Senha<span class="password-control"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><label class="remember-login-option"><input type="checkbox" name="rememberMe" value="true"><span><strong>Manter-me conectado</strong><small>Continuar conectado neste dispositivo por até 30 dias.</small></span></label><button class="button primary" type="submit">Entrar</button></form><p>'+button("Criar conta","cadastro")+button("Esqueceu sua senha?","esqueci")+'</p><p class="admin-entry-link">'+button("Entrar na Administração","admin")+'</p></section>';
}
function renderRegisterAccount(){return header("Conta","Criar conta","Usuário, e-mail e senha.")+'<section class="card card-pad live-auth"><form id="register-account-form" class="register-form"><label>Usuário<input name="name" required minlength="2" maxlength="120"></label><label>E-mail<input name="email" type="email" required></label><label>Senha<span class="password-control"><input name="password" type="password" required minlength="10" autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button type="submit" class="button primary">Criar conta</button></form></section>'}
function renderForgot(){return header("Conta","Esqueceu sua senha?","Enviaremos um link para o e-mail cadastrado.")+'<section class="card card-pad live-auth"><form id="forgot-form" class="register-form"><label>E-mail<input type="email" name="email" required></label><button type="submit" class="button primary">Enviar link</button></form></section>'}
function renderReset(tokenPart){return header("Conta","Redefinir senha","O link é válido por 30 minutos e pode ser usado uma única vez.")+'<section class="card card-pad live-auth"><form id="reset-form" data-token="'+esc(tokenPart)+'" class="register-form"><label>Nova senha<span class="password-control"><input type="password" name="password" minlength="10" required><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button class="button primary" type="submit">Alterar senha</button></form></section>'}
function renderAccount(){
 if(!me)return authRequired();
 return header("Pessoal","Meu perfil","Seus dados e preferências de acesso.")+'<section class="card card-pad live-auth account-profile"><div class="account-profile-info"><h2>'+esc(me.name)+'</h2><p>'+esc(me.email)+'</p><p><strong>Status:</strong> '+esc(me.role==="tutor"?"Tutor(a)":me.role==="petiano"?"PETiano(a)":me.role==="usuario"?"Usuário":"Administração")+'</p></div>'+
 (me.mustChangePassword?'<p class="status-note">Sua senha é temporária. Altere-a para acessar o sistema.</p>':"")+
 (["tutor","admin"].includes(me.role)?'<label class="live-toggle"><input type="checkbox" id="account-notify" '+(me.notificationEnabled?"checked":"")+'> Perguntar se desejo notificar os(as) responsáveis por e-mail</label>':"")+
 '<button class="button ghost" type="button" data-do="change-password-toggle" aria-expanded="false">Alterar senha</button><form id="change-password-form" class="register-form" hidden><label>Senha atual<span class="password-control"><input type="password" name="password" required><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><label>Nova senha<span class="password-control"><input type="password" name="newPassword" required minlength="10"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button type="submit" class="button primary">Alterar senha</button></form><div class="account-profile-actions"><button class="button ghost account-logout-button" type="button" data-do="logout">'+ico("logout")+'<span>Sair da conta</span></button></div></section>';
}
const notificationKinds=[["create","Criação de demanda"],["review","Correção / revisão do texto"]];
function notificationTemplateFor(kind){
 const fallbacks={
  create:{subject:"PET Gestão — Nova demanda: {demanda}",body:"Olá!\n\n{autor} cadastrou uma nova demanda: {demanda}.\n\nAcesse o PET Gestão para consultar os prazos e os responsáveis.\n\nPET Educação"},
  review:{subject:"PET Gestão — Texto revisado: {demanda}",body:"Olá!\n\n{autor} atualizou o texto para revisão da demanda {demanda}.\n\nAcesse o PET Gestão para consultar as alterações.\n\nPET Educação"}
 };
 return state.templateDrafts?.[kind]||data.settings.notificationTemplates?.[kind]||
  data.settings.notificationTemplate||fallbacks[kind]||fallbacks.create;
}
function notificationTemplateFields(kind){
 const config=notificationTemplateFor(kind);
 return '<label>Assunto<input type="text" name="subject" maxlength="200" required value="'+esc(config.subject||"")+'"></label>'+
  '<label class="rich-label">Mensagem</label>'+
  richEditor("message",config.body||"");
}
function renderAdmin(){
 const adminPart=routeParts().parts;
 if(adminPart.length===1&&["painel","usuarios","comissoes","emails","configuracoes"].includes(adminPart[0]))state.adminTab=adminPart[0];
 if(!isAdmin())return header("Sistema","Administração","Acesso administrativo independente.")+
 '<section class="card card-pad live-auth admin-signin"><h2>Entrar como Admin</h2><p>Use as credenciais exclusivas da conta Administração. O acesso da Tutoria é separado.</p>'+
 '<form id="admin-login-form" class="register-form"><label>Admin ou e-mail<input name="identifier" type="text" value="Admin" required autocomplete="username" autocapitalize="none"></label><label>Senha<span class="password-control"><input name="password" type="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><label class="remember-login-option"><input type="checkbox" name="rememberMe" value="true"><span><strong>Manter-me conectado</strong><small>Continuar conectado neste dispositivo por até 30 dias.</small></span></label><button type="submit" class="button primary">Entrar na Administração</button></form>'+
 '<p>'+button("Voltar ao PET Gestão","inicio")+'</p></section>';
 if(me?.mustChangePassword)return header("Administração","Alterar senha temporária","Essa alteração é obrigatória antes de usar o painel.")+
 '<section class="card card-pad live-auth"><form id="admin-change-password-form" class="register-form"><label>Senha temporária<span class="password-control"><input name="password" type="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><label>Nova senha<span class="password-control"><input name="newPassword" type="password" minlength="10" required autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false">Mostrar</button></span></label><button type="submit" class="button primary">Alterar senha administrativa</button></form></section>';

 const adminPanels='<section class="card card-pad admin-panel" '+(state.adminTab==="usuarios"?"":'hidden')+'><h2>Usuários</h2><div class="live-admin-list" id="admin-users"><p>Carregando usuários...</p></div></section>'+
 '<section class="card card-pad admin-commissions admin-panel" '+(state.adminTab==="comissoes"?"":'hidden')+'><div class="admin-section-heading"><div><h2>Comissões</h2><p>Defina as vagas e organize a ordem de exibição.</p></div><span class="pill soft">'+data.committees.length+' comissões</span></div><div class="admin-commission-list">'+
 data.committees.map((c,i)=>'<div class="admin-commission-item"><div class="admin-commission-identity"><span class="admin-commission-avatar">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="">':commissionDefaultArt(c.name))+'</span><div class="admin-commission-title"><strong>'+esc(c.name)+'</strong><small>Posição '+(i+1)+'</small></div></div><div class="admin-commission-controls"><label class="admin-vacancy-field"><span>Vagas</span><input type="number" min="0" max="999" data-vagas="'+esc(c.id)+'" value="'+esc(c.maxMembers||0)+'" inputmode="numeric"></label><div class="admin-order-controls"><button class="button ghost admin-order-button" title="Subir" aria-label="Subir '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="-1" '+(i===0?"disabled":"")+'>↑</button><button class="button ghost admin-order-button" title="Descer" aria-label="Descer '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="1" '+(i===data.committees.length-1?"disabled":"")+'>↓</button></div><button class="button primary admin-save-button" data-do="save-vagas" data-id="'+esc(c.id)+'">Salvar</button></div></div>').join("")+'</div></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Navegação automática das demandas</h2><label class="live-toggle"><input type="checkbox" id="setting-month" '+(data.settings.autoMonth?"checked":"")+'> Atualizar o mês automaticamente</label><label class="live-toggle"><input type="checkbox" id="setting-week" '+(data.settings.autoWeek?"checked":"")+'> Atualizar a semana automaticamente</label><button class="button primary" data-do="save-settings">Salvar configurações</button></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><h2>E-mails manuais e agendados</h2><form id="mail-form" class="register-form"><label>Destinatários<select id="mail-audience" name="audience" class="select">'+[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","Usuários"]].map(([v,l])=>opt(v,l,state.mailAudience)).join("")+'</select></label><div id="mail-recipients"></div><label>Assunto<input name="subject" required maxlength="200"></label><label class="rich-label">Mensagem</label>'+richEditor("message","")+'<label><input type="checkbox" id="mail-scheduled"> Agendar envio</label><div id="mail-scheduling"></div><div id="mail-attachments"></div><button class="button primary" type="submit">Registrar envio</button></form></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><h2>Modelos de notificação da tutoria</h2><p class="field-hint">Escolha quando a mensagem será enviada e edite o assunto e o texto de cada situação. Campos automáticos: {autor}, {acao}, {demanda}, {tipo}.</p>'+
 '<form id="notification-template-form" class="register-form"><label>Tipo de mensagem<select name="kind" id="notification-template-kind" class="select">'+notificationKinds.map(([kind,label])=>opt(kind,label,state.templateKind)).join("")+'</select></label>'+
 '<div id="notification-template-fields">'+notificationTemplateFields(state.templateKind)+'</div>'+
 '<button class="button primary" type="submit">Salvar modelo</button></form></section>'+
 '<section class="card card-pad admin-mail-history admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><div class="section-head"><h2>Fila e histórico do Gmail</h2><button class="button primary" type="button" data-do="mail-monitor-open">Acompanhar envios</button></div><div id="mail-history"><p>Carregando status...</p></div><button type="button" class="button ghost" data-do="clear-mail">Limpar registros finalizados</button></section>';
 const tabs=[["painel","Painel","grid"],["usuarios","Usuários","user"],["comissoes","Comissões","users"],["emails","E-mails","mail"],["configuracoes","Configurações","settings"]];
 const nav=tab=>'<a href="#/admin/'+tab[0]+'" class="admin-menu-link '+(state.adminTab===tab[0]?"active":"")+'">'+ico(tab[2])+'<span>'+tab[1]+'</span></a>';
 const mailCount=Array.isArray(state.mailItems)?state.mailItems.length:0;
 const stats=[["Demandas",data.tasks.length,"list"],["Comissões",data.committees.length,"users"],["Usuários",data.users.length,"user"],["E-mails",mailCount,"mail"]];
 const metric=([name,value,iconName])=>'<div class="admin-metric"><span class="admin-metric-icon">'+ico(iconName)+'</span><strong '+(name==="E-mails"?'id="admin-mail-count"':"")+'>'+value+'</strong><span>'+name+'</span></div>';
 const recent=(data.history||[]).slice(0,4);
 const dashboard=state.adminTab==="painel"?'<div class="admin-metrics">'+stats.map(metric).join("")+'</div>'+
 '<section class="admin-box"><h2>Ações rápidas</h2><div class="admin-shortcuts">'+
 '<a href="#/admin/registrar">'+ico("plus")+'<span>Nova demanda</span></a>'+
 '<a href="#/admin/comissoes">'+ico("users")+'<span>Gerenciar comissões</span></a>'+
 '<a href="#/admin/usuarios">'+ico("user")+'<span>Gerenciar usuários</span></a>'+
 '<a href="#/admin/emails">'+ico("mail")+'<span>Enviar e-mail</span></a></div></section>'+
 '<section class="admin-box"><h2>Últimas alterações</h2>'+(recent.length?recent.map(x=>'<div class="admin-history-row"><span class="admin-history-icon">'+ico("list")+'</span><div><strong>'+esc(x.action||"Alteração")+'</strong><small>'+esc(x.actor_name||"")+'</small></div><time>'+textDate(x.created_at)+'</time></div>').join(""):'<p class="admin-muted">Nenhuma alteração registrada.</p>')+'</section>':"";
 const adminParts=routeParts().parts,tabNames=["painel","usuarios","comissoes","emails","configuracoes"];
 const tabRoute=adminParts.length===1&&tabNames.includes(adminParts[0])?adminParts[0]:null;
 if(tabRoute)state.adminTab=tabRoute;
 const subroute=tabRoute?[]:adminParts,embedded=subroute.length?adminEmbeddedView(subroute):"";
 const headings={painel:"Painel administrativo",usuarios:"Usuários",comissoes:"Comissões",emails:"E-mails",configuracoes:"Configurações"};
 return '<div class="admin-layout">'+
 '<aside class="admin-sidebar '+(state.adminMenuOpen?"open":"")+'" aria-label="Menu administrativo">'+
 '<div class="admin-brand">'+ico("checklist")+'<div><strong>PET Gestão</strong><small>'+esc(me?.name||"Administração")+'</small></div></div>'+
 '<nav class="admin-navigation">'+nav(tabs[0])+'<a href="#/admin/demandas" class="admin-menu-link '+(subroute[0]==="demandas"||["registrar","atividade"].includes(subroute[0])?"active":"")+'">'+ico("list")+'<span>Demandas</span></a><a href="#/admin/reunioes" class="admin-menu-link '+(subroute[0]==="reunioes"?"active":"")+'">'+ico("calendar")+'<span>Atas de Reunião</span></a>'+tabs.slice(1).map(nav).join("")+'</nav>'+
 '<div class="admin-sidebar-footer"><button type="button" data-do="admin-signout">'+ico("close")+' Sair do modo Admin</button></div></aside>'+
 (state.adminMenuOpen?'<button type="button" class="admin-screen-overlay" aria-label="Fechar menu" data-do="admin-menu"></button>':"")+
 '<div class="admin-workspace"><div class="admin-toolbar"><button type="button" class="admin-open-menu" data-do="admin-menu" aria-label="Abrir menu administrativo">'+ico("menu")+'</button><div class="admin-toolbar-account">'+ico("user")+'<span><strong>Administração</strong></span></div></div>'+
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
function statusSnapshot(){
 return (data.tasks||[]).map(t=>t.id+":"+taskStatus(t)).join("|");
}
function render(){
 nav();const {page,parts}=routeParts(),root=$("#screen");if(!root)return;
 document.body.classList.toggle("admin-ui-active",page==="admin"&&isAdmin()&&!me?.mustChangePassword);
 if(!allowPage(page)){location.hash=me?"#/inicio":"#/login";if(me)setToast("Seu perfil possui acesso somente para visualização.");return}
 if(me?.mustChangePassword&&page!=="conta"&&page!=="admin"){location.hash="#/conta";return}
 let html="";
 if(page==="inicio")html=renderHome();
 else if(page==="demandas")html=renderDemandas();
 else if(page==="cronograma")html=renderDemandas();
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
 lastStatusSnapshot=statusSnapshot();
 if(page==="admin"&&isAdmin()&&!me?.mustChangePassword&&(!parts.length||(parts.length===1&&["painel","usuarios","comissoes","emails","configuracoes"].includes(parts[0])))){
   if(state.adminTab==="usuarios")loadAdminUsers();
   if(state.adminTab==="emails"){renderMailRecipients();renderMailScheduling();loadMailHistory();}
   if(state.adminTab==="painel")loadMailHistory();
 }
}
async function askNotification(){return canNotify()?await askConfirm("Deseja notificar os(as) responsáveis por e-mail sobre esta alteração?",{title:"Enviar notificação por e-mail?"}):false}
async function saveAndReload(action,success="Alterações salvas."){
 try{await action();await reload();setToast(success);return true}catch(e){setToast(e.message);return false}
}
function userFields(form){return Object.fromEntries(new FormData(form).entries())}
async function saveTask(form){
 const f=collectRich(form,userFields(form)),stages=$$(".live-stage").map(row=>{
 const label=row.querySelector('[data-stage="label"]').value,day=row.querySelector('[data-stage="day"]').value,time=row.querySelector('[data-stage="hour"]').value,
  person=state.assignmentScope==="todos"?"":row.querySelector('[data-stage="assignee"]').value;
 return{id:row.dataset.stageId,label,dueAt:day?day+"T"+(time||"23:59")+":00":"",assigneeIds:person?[person]:[]}
 });
 if(!f.title.trim())return setToast("Informe o título.");
 if(!stages.some(x=>x.label==="Prazo"&&x.dueAt))return setToast("Uma etapa Prazo com data é obrigatória.");
 if(stages.some(x=>!x.dueAt))return setToast("Informe a data de todas as etapas inseridas.");
 if(stages.some(x=>+x.dueAt.slice(0,4)<current.getFullYear()))return setToast("Não cadastre datas de anos anteriores.");
 const users=state.assignmentScope==="todos"?data.users.filter(x=>["petiano","tutor","admin"].includes(x.role)).map(x=>x.id):[...state.selectedUsers],commissions=state.assignmentScope==="todos"?[]:[...state.selectedCommissions];
 if(!users.length&&!commissions.length)return setToast("Selecione ao menos uma pessoa ou comissão para direcionar a demanda.");
 const taskId=form.dataset.id;
 const previous=taskId?data.tasks.find(t=>t.id===taskId):null;
 const notify=(!previous||safeRich(previous.captionText||"")!==f.captionText)?await askNotification():false;
 const overviewVisible=f.overviewVisibility!=="comissao";
 if(!overviewVisible&&!commissions.length)return setToast("Selecione uma comissão para exibir somente nela.");
 const body={title:f.title,description:f.description,captionText:f.captionText,deadlines:stages,assigneeIds:users,commissionIds:commissions,assignmentScope:state.assignmentScope,overviewVisible,notify};
 await saveAndReload(async()=>{
   const r=await request(taskId?"/tasks/"+id(taskId):"/tasks",taskId?"PUT":"POST",body);
   state.taskFormId=null;location.hash=workspaceHash("demandas");return r;
 },"Demanda salva com sucesso.");
}
async function finishTask(t,cid){
 const future=stages(t).some(s=>dt(s.dueAt)>new Date());
 const remainingCommissions=(t.commissionIds||[]).filter(x=>x!==cid&&!t.commissionDone?.[x]);
 const remainingPeople=(t.assigneeIds||[]).filter(x=>cid||x!==me?.id).filter(x=>!t.userDone?.[x]);
 const remaining=remainingCommissions.length+remainingPeople.length;
 const message=(future?"Esta atividade possui prazos futuros. Confirmar conclusão antecipada?\n\n":"Deseja marcar sua participação como concluída?\n\n")+
 (remaining?"A demanda será arquivada quando as demais participações forem concluídas.":"Essa é a última participação; a demanda será arquivada.");
 if(!await askConfirm(message,{title:future?"Conclusão antecipada":"Concluir participação"}))return;
 const success=await saveAndReload(()=>request("/tasks/"+id(t.id)+"/finish","PATCH",{commissionId:cid,early:future,notify:false}),remaining?"Sua participação foi concluída. Outras pessoas ou comissões ainda precisam concluir.":"Demanda concluída e arquivada.");
 if(success)location.hash=cid?workspaceHash("comissoes/"+id(cid)):workspaceHash("minhas-pendencias");
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
 const f=collectRich(form,userFields(form)),ids=$$('input[name="mail-target"]:checked').map(el=>el.value),userIds=state.mailAudience==="usuarios"?ids:[],committeeIds=state.mailAudience==="comissoes"?ids:[];
 if(!String(f.message||"").replace(/<[^>]*>/g,"").trim())return setToast("Escreva a mensagem.");
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
 if(action==="notice-confirm"){closeNotice(true);return}
 if(action==="notice-cancel"){closeNotice(false);return}
 if(action==="notice-copy"){
   const field=$("#notice-secret-value");if(!field)return;
   try{await navigator.clipboard.writeText(field.value);b.textContent="Copiado!";}
   catch{field.focus();field.select();b.textContent="Selecione e copie";}
   return;
 }
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
  if(action==="meetings-view"){state.meetingView=b.dataset.value;render();return}
 if(action==="today"){state.year=current.getFullYear();state.month=current.getMonth();state.week=0;render();return}
 if(action==="assignment-scope"){
  if(b.dataset.value==="todos"){state.selectedUsers.clear();state.selectedCommissions.clear()}
  state.assignmentScope=b.dataset.value;
  $("#assignment-container").innerHTML=assignmentView();syncVisibilityOptions();syncStageAssigneePlaceholder();return;
 }
 if(action==="add-stage"){$("#stage-rows").insertAdjacentHTML("beforeend",stageRow());return}
 if(action==="remove-stage"){b.closest(".live-stage")?.remove();return}
 if(action==="reset-color"){$('input[name="backgroundColor"]').value="#f7f3ff";return}
 if(action==="finish-joint-open"){openFinishDialog(data.tasks.find(t=>t.id===tid));return;}
 if(action==="finish-close"){closeFinishDialog();return;}
 if(action==="finish-joint-confirm"){
   const t=data.tasks.find(x=>x.id===tid),layer=$("#finish-dialog");if(t&&layer)await completeJoint(t,layer);
   return;
 }
 if(action==="finish-mine"){
   const t=data.tasks.find(x=>x.id===tid);if(!t||!isMyPending(t))return;
   const pending=myPendingParts(t),total=Number(pending.personal)+pending.committees.length;
   if(total===1&&pending.personal)await finishTask(t,"");
   else if(total===1)await finishTask(t,pending.committees[0]);
   else openFinishDialog(t);
   return;
  }
  if(action==="finish-personal"){const t=data.tasks.find(x=>x.id===tid);if(t&&isTaskAssignedToMe(t)&&!isUserDone(t,me.id))await finishTask(t,"");return}
 if(action==="finish-commission"){const t=data.tasks.find(x=>x.id===tid);if(t)await finishTask(t,b.dataset.commission||"");return}
 if(action==="edit-notes"){$("#notes-editor").hidden=false;$("#notes-preview").hidden=true;return}
 if(action==="save-notes"){const content=$("#notes-content").value;const notify=await askNotification();await saveAndReload(()=>request("/tasks/"+id(tid)+"/notes","PATCH",{captionText:content,notify}),"Observações salvas.");return}
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
   if(!await askConfirm('Excluir definitivamente a comissão "'+c?.name+'"? Os registros vinculados impedem a exclusão.',{danger:true}))return;
   await saveAndReload(()=>request("/commissions/"+id(tid),"DELETE"),"Comissão excluída.");return;
 }
 if(action==="delete-meeting"){if(!await askConfirm("Excluir esta ata? As demandas não serão apagadas.",{danger:true}))return;const ok=await saveAndReload(()=>request("/meetings/"+id(tid),"DELETE"),"Ata excluída.");if(ok)location.hash=workspaceHash("reunioes");return}
 if(action==="delete-task"){
   const task=data.tasks.find(x=>x.id===tid);
   if(!canDeleteTask(task))return setToast("Você não tem permissão para excluir esta demanda.");
   if(!await askConfirm('Excluir definitivamente a demanda "'+task.title+'"? Esta ação apagará a demanda, os prazos, as participações e o histórico, sem possibilidade de recuperação.',{danger:true,title:"Excluir demanda?"}))return;
   const ok=await saveAndReload(()=>request("/tasks/"+id(tid),"DELETE"),"Demanda excluída definitivamente.");
   if(ok)location.hash=workspaceHash("demandas");
   return;
 }
 if(action==="admin-signout"){
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
   if(!await askConfirm("Gerar uma nova senha temporária? A senha anterior deixará de funcionar e a pessoa precisará alterá-la ao entrar.",{title:"Gerar senha temporária?"}))return;
   try{const v=await request("/admin/users/"+id(tid)+"/temporary-password","POST",{});showNotice("Copie a senha temporária agora. Ela não será exibida novamente.",{title:"Senha temporária gerada",kind:"success",secret:v.temporaryPassword});}catch(e){setToast(e.message)}return;
 }
 if(action==="clear-mail"){if(!await askConfirm("Limpar apenas registros de e-mails enviados ou com falha? Os pendentes e agendados serão preservados.",{title:"Limpar histórico de e-mails?"}))return;await saveAndReload(()=>request("/mail/clear","POST",{}),"Histórico finalizado limpo.");return}
 if(action==="retry-mail"){
   if(!state.mailConnection?.connected)return setToast("Corrija primeiro a integração Gmail antes de repetir o envio.");
   if(!await askConfirm("Tentar novamente este e-mail? Confirme que ele não foi enviado anteriormente.",{title:"Repetir tentativa de envio?"}))return;
   try{await request("/mail/retry","POST",{id:tid},"admin");await loadMailHistory();setToast("Nova tentativa registrada na fila.");}
   catch(err){setToast(err.message)}
   return;
 }
 if(action==="rich-format"){
   const editor=b.closest(".rich-editor")?.querySelector("[contenteditable]");
   if(editor){editor.focus();document.execCommand(b.dataset.format,false,null);}
   return;
 }
 if(action==="change-password-toggle"){
   const form=$("#change-password-form");
   if(form){form.hidden=!form.hidden;b.setAttribute("aria-expanded",String(!form.hidden));}
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
   if(r.user.role!=="admin"||r.user.adminSession!==true)throw Error("Esta conta não tem permissão administrativa.");
   adminToken=r.token;saveSessionToken(adminTokenKey,adminToken,rememberMe);
   await reload();setToast("Administração desbloqueada.");return;
 }
 if(form.id==="login-form"){
   const f=userFields(form),rememberMe=form.elements.rememberMe?.checked===true;
   const r=await request("/auth/login","POST",{...f,rememberMe},"guest");
   token=r.token;saveSessionToken(tokenKey,token,rememberMe);
   adminToken="";forgetSessionToken(adminTokenKey);
   const destination=r.user.mustChangePassword?"#/conta":"#/inicio";
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
 if(form.id==="meeting-form"){const f=userFields(form);const ok=await saveAndReload(()=>request("/meetings"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{title:f.title,date:f.date,rawNotes:f.rawNotes}),"Ata salva.");if(ok)location.hash=workspaceHash("reunioes");return}
 if(form.id==="notification-template-form"){
   const f=collectRich(form,userFields(form));
   if(!String(f.message||"").replace(/<[^>]*>/g,"").trim())return setToast("Escreva o modelo da mensagem.");
   const ok=await saveAndReload(()=>request("/admin/notification-template","PUT",{kind:f.kind,subject:f.subject,message:f.message},"admin"),"Modelo de notificação salvo.");
   if(ok)delete state.templateDrafts[f.kind];
   return;
 }
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
   if(t.checked)set.add(t.value);else set.delete(t.value);const el=$("#assignment-container");if(el)el.innerHTML=assignmentView();syncVisibilityOptions();syncStageAssigneePlaceholder();return;
 }
 if(t.matches?.("[data-detail-status]")){
   const task=data.tasks.find(x=>x.id===t.dataset.id);
   const choice=t.value;
   if(task)t.value=taskStatus(task);
   if(choice==="concluir"&&task&&!task.archivedAt)openFinishDialog(task);
   return;
  }
 if(t.dataset.filter==="navigateDemands"){
   state.statusFilter=t.value;
   if(t.value==="concluida")state.mode="arquivo";
   else if(state.mode==="arquivo")state.mode="mensal";
   location.hash=workspaceHash("demandas");return;
 }
 if(t.dataset.filter==="commissionStatus"){state.commissionStatusFilter=t.value;render();return}
 if(t.dataset.filter==="mineStatus"){state.mineStatusFilter=t.value;render();return}
 if(t.dataset.filter==="meetings"){state.meetingView=t.value;render();return}
 if(t.dataset.filter==="periodMode"){state.mode=t.value;render();return}
 if(t.dataset.filter){
   if(t.dataset.filter==="status"){
    state.statusFilter=t.value;
    if(t.value==="concluida")state.mode="arquivo";
    else if(state.mode==="arquivo")state.mode="mensal";
    render();return;
   }
    const val=Number(t.value);
   if(t.dataset.filter==="month"){state.month=val;state.week=0}
   if(t.dataset.filter==="year"){state.year=val;state.week=0}
   if(t.dataset.filter==="week")state.week=val;
   localStorage.setItem("pet-gestao:period",JSON.stringify({year:state.year,month:state.month,week:state.week}));render();return;
 }
 if(t.matches?.("[data-rich-color]")){
   const editor=t.closest(".rich-editor")?.querySelector("[contenteditable]");
   if(editor){
     editor.focus();
     const selection=window.getSelection();
     if(lastRichRange&&editor.contains(lastRichRange.commonAncestorContainer)){
       selection.removeAllRanges();selection.addRange(lastRichRange);
     }
     document.execCommand("foreColor",false,t.value);
     const symbol=t.closest(".rich-color-label")?.querySelector(".rich-color-symbol");
     if(symbol)symbol.style.setProperty("--selected-text-color",t.value);
   }
   return;
 }
 if(t.id==="notification-template-kind"){
   const form=t.closest("#notification-template-form");
   if(form){
     const previous=state.templateKind;
     state.templateDrafts[previous]={subject:form.elements.subject.value,body:safeRich(form.querySelector('[data-rich-input="message"]')?.innerHTML||"")};
     state.templateKind=t.value;
     const fields=form.querySelector("#notification-template-fields");
     if(fields)fields.innerHTML=notificationTemplateFields(state.templateKind);
   }
   return;
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
 
 
 $("#open-menu")?.addEventListener("click",()=>{$("#sidebar").classList.add("open");$("#overlay").hidden=false});
 $("#close-menu")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 $("#overlay")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 window.addEventListener("hashchange",()=>{onNavigation();$("#sidebar")?.classList.remove("open");$("#overlay").hidden=true;closeCommissionDialog();closeAuthMessage();closeNotice(false);closeFinishDialog()});
 window.addEventListener("keydown",e=>{if(e.key==="Escape"){
   if(!$("#notice-dialog")?.hidden){e.preventDefault();closeNotice(false)}
   else if(!$("#auth-message-dialog")?.hidden){e.preventDefault();closeAuthMessage()}
   else if(!$("#commission-dialog")?.hidden){e.preventDefault();closeCommissionDialog()}
    else if(!$("#finish-dialog")?.hidden){e.preventDefault();closeFinishDialog()}
 }});

 document.addEventListener("selectionchange",()=>{
   const selected=window.getSelection();
   if(!selected?.rangeCount)return;
   const anchor=selected.anchorNode?.nodeType===1?selected.anchorNode:selected.anchorNode?.parentElement;
   if(anchor?.closest?.("[data-rich-input]"))lastRichRange=selected.getRangeAt(0).cloneRange();
 });
 document.addEventListener("pointerdown",e=>{
   if(e.target.closest('[data-do="rich-format"]'))e.preventDefault();
 });
 document.addEventListener("click",e=>{
   const innerLink=e.target.closest(".admin-layout a[href^='#/']");
   if(innerLink&&isAdmin()&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){
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
 document.addEventListener("invalid",e=>{
   const field=e.target;
   if(!field?.closest?.("form"))return;
   e.preventDefault();
   if($("#notice-dialog")?.hidden)showNotice(invalidFieldMessage(field),{title:"Revise este campo",kind:"warning",focusAfter:field});
 },true);
 document.addEventListener("submit",e=>handleSubmit(e));
 document.addEventListener("change",e=>handleChange(e).catch(err=>setToast(err.message)));
 reload();
 // Identifica a virada do prazo em uma aba aberta sem exigir recarregar a tela.
 setInterval(()=>{
   if(document.hidden||!me)return;
   if(!["inicio","demandas","comissoes","atividade","minhas-pendencias"].includes(routeParts().page))return;
   if(statusSnapshot()!==lastStatusSnapshot)render();
 },30000);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
