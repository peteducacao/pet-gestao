/* PET Gestão: interface real com API autenticada, sem dados fictícios. */
(function frontModule(){
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const richRanges=new WeakMap(); // Cada editor conserva sua própria seleção ao tocar a barra de ferramentas.
// Endpoint PUBLICO de contingencia: evita tela bloqueada quando config.js nao e carregado pelo navegador.
// O arquivo config.js (gerado no deploy) continua tendo prioridade sobre este valor.
const API_FALLBACK="https://pet-gestao.pet-educacao.workers.dev";
const CONFIG=window.PET_GESTAO_CONFIG||{},API=String(CONFIG.apiBaseUrl||"").trim().replace(/\/+$/,"")||API_FALLBACK;
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const current=new Date(), tokenKey="pet-gestao:session-token",adminTokenKey="pet-gestao:admin-session-token";
const browserKey="pet-gestao:browser-id",sessionRevisionKey="pet-gestao:session-revision";
const freshClientId=()=>window.crypto?.randomUUID?.()||"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
 const r=window.crypto.getRandomValues(new Uint8Array(1))[0]&15;
 return (c==="x"?r:(r&3|8)).toString(16);
});
let browserId=localStorage.getItem(browserKey);
if(!/^[a-f0-9-]{36}$/i.test(browserId||"")){browserId=freshClientId();localStorage.setItem(browserKey,browserId)}
let localSessionRevision=localStorage.getItem(sessionRevisionKey)||"";
function publishSessionChange(){localSessionRevision=freshClientId();localStorage.setItem(sessionRevisionKey,localSessionRevision)}

// Sessão temporária compartilhada pelas abas do MESMO navegador via cookie de
// sessão (sem Max-Age/Expires). Persistência indefinida só quando marcada.
// Somente o token é compartilhado, nunca a senha. Cookie restrito ao app.
const cookiePath=location.pathname.replace(/[^/]*$/,"")||"/";
const cookieName="pet-gestao-active-session";
const sessionCookieOptions="; Path="+cookiePath+"; SameSite=Strict"+(location.protocol==="https:"?"; Secure":"");
function readSessionCookie(){
 const found=document.cookie.split("; ").find(item=>item.startsWith(cookieName+"="));
 if(!found)return "";
 try{return decodeURIComponent(found.slice(cookieName.length+1))}catch{return ""}
}
function writeSessionCookie(value){
 document.cookie=cookieName+"="+encodeURIComponent(value)+sessionCookieOptions;
}
function clearSessionCookie(){
 document.cookie=cookieName+"=; Max-Age=0"+sessionCookieOptions;
}
const readSessionToken=key=>localStorage.getItem(key)||(key===tokenKey?readSessionCookie():"")||sessionStorage.getItem(key)||"";
function saveSessionToken(key,value,remember){
 sessionStorage.removeItem(key);localStorage.removeItem(key);
 if(key===tokenKey)clearSessionCookie();
 if(remember)localStorage.setItem(key,value);
 else{
  sessionStorage.setItem(key,value);
  if(key===tokenKey)writeSessionCookie(value);
 }
}
function forgetSessionToken(key){
 sessionStorage.removeItem(key);localStorage.removeItem(key);
 if(key===tokenKey)clearSessionCookie();
}
// Migração transparente de uma sessão temporária anterior para novas abas.
if(!localStorage.getItem(tokenKey)&&sessionStorage.getItem(tokenKey)&&!readSessionCookie())
 writeSessionCookie(sessionStorage.getItem(tokenKey));
// Migração das sessões anteriores: a mesma sessão agora atende ao site inteiro.
const previousToken=readSessionToken(tokenKey),previousAdminToken=readSessionToken(adminTokenKey);
let token=previousToken||previousAdminToken,data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}},me=null,regularMe=null;
if(!previousToken&&previousAdminToken)saveSessionToken(tokenKey,previousAdminToken,Boolean(localStorage.getItem(adminTokenKey)));
forgetSessionToken(adminTokenKey);
const state={adminTab:"painel",adminMenuOpen:false,authTransition:false,commissionAction:null,mailItems:[],mailConnection:null,mailMonitorOpen:false,year:current.getFullYear(),month:current.getMonth(),week:0,mode:"mensal",committeeWeek:0,assignmentScope:"usuarios",selectedUsers:new Set(),selectedCommissions:new Set(),taskFormId:null,mailAudience:"todos",mailScheduled:false,selectedStatus:"pendente",mailFiles:[],taskFiles:[],statusFilter:"todas",commissionStatusFilter:"todas",mineStatusFilter:"todas",meetingView:"todas",templateKind:"create",deadlineTemplateKind:"due_soon",templateDrafts:{},previousRoute:"#/inicio",archiveDeleteMode:false,archiveSelectedIds:new Set()};
const routeNames={inicio:"Visão geral",demandas:"Demandas",cronograma:"Demandas",comissoes:"Comissões","minhas-pendencias":"Minhas pendências",atividade:"Atividade",registrar:"Registrar demanda",admin:"Administração",conta:"Meu perfil",login:"Entrar",cadastro:"Criar conta",esqueci:"Recuperar senha",redefinir:"Redefinir senha","confirmar-email":"Confirmar e-mail",reunioes:"Atas de Reunião",ajuda:"Ajuda"};
let toastTimer,lastHash=location.hash||"#/inicio",firstBootstrap=true,lastStatusSnapshot="";
let taskFormDraft=null;
const taskFormRoute=hash=>/^#\/(?:registrar(?:\/|$)|admin\/registrar(?:\/|$))/.test(String(hash||""));
function taskDraftSnapshot(){
 const form=$("#task-form");if(!form)return null;
 const controls=[...form.querySelectorAll("input,textarea,select,[contenteditable]")].map(el=>{
  if(el.tagName==="BUTTON"||el.type==="submit"||el.type==="button")return null;
  const key=el.name||el.dataset.stage||el.id||el.outerHTML.slice(0,55);
  const value=el.matches("[contenteditable]")?el.innerHTML:
    (el.type==="checkbox"||el.type==="radio")?el.checked:el.value;
  return [key,value,Boolean(el.disabled)];
 }).filter(Boolean);
 return JSON.stringify({controls,scope:state.assignmentScope,
  users:[...state.selectedUsers].sort(),commissions:[...state.selectedCommissions].sort(),taskFiles:(state.taskFiles||[]).map(f=>[f.name,f.size,f.lastModified])});
}
function hasUnsavedTaskChanges(){
 return Boolean(taskFormDraft&&taskFormRoute(lastHash)&&
  taskFormDraft.route===lastHash&&$("#task-form")&&taskDraftSnapshot()!==taskFormDraft.snapshot);
}
function resetTaskDraft(){taskFormDraft=null;state.taskFiles=[]}

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
    const style=[];
    if(/^(#[a-f0-9]{3,8}|rgb\([\d\s,.%]+\))$/i.test(c))style.push("color:"+esc(c));
    const weight=node.style?.fontWeight||"";
    if(/^(normal|bold|[1-9]00)$/.test(weight))style.push("font-weight:"+weight);
    const italic=node.style?.fontStyle||"";
    if(/^(normal|italic|oblique)$/.test(italic))style.push("font-style:"+italic);
    const decoration=node.style?.textDecorationLine||node.style?.textDecoration||"";
    if(/^(none|underline)$/.test(decoration))style.push("text-decoration:"+decoration);
    return "<span"+(style.length?' style="'+style.join(";")+'"':"")+">"+inside+"</span>";
  }
  const name=tag.toLowerCase();
  return "<"+name+">"+inside+"</"+name+">";
 };
 return [...fragment.content.childNodes].map(walk).join("");
}

const formatIcon={
 bold:"<strong>B</strong>",
 insertUnorderedList:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
 insertOrderedList:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 4h2v6M3 10h4M3 15c0-2 4-2 4 0s-4 2-4 5h4M11 6h10M11 12h10M11 18h10"/></svg>',
 justifyLeft:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
 justifyCenter:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
 justifyRight:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
 justifyFull:'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>'
};
function richEditor(name,value,placeholder="Escreva aqui..."){
 const action=(cmd,label)=>'<button type="button" class="rich-format-button" data-do="rich-format" data-format="'+cmd+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" aria-pressed="false">'+formatIcon[cmd]+'</button>';
 return '<div class="rich-editor" data-rich="'+esc(name)+'"><div class="rich-toolbar" role="toolbar" aria-label="Formatação do texto">'+
 '<div class="rich-toolbar-group" aria-label="Estilo">'+action("bold","Negrito")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<div class="rich-toolbar-group" aria-label="Listas">'+action("insertUnorderedList","Lista com marcadores")+action("insertOrderedList","Lista numerada")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<div class="rich-toolbar-group" aria-label="Alinhamento">'+action("justifyLeft","Alinhar à esquerda")+action("justifyCenter","Centralizar")+action("justifyRight","Alinhar à direita")+action("justifyFull","Justificar texto")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<label class="rich-color-label" title="Cor do texto" aria-label="Cor do texto"><span class="rich-color-symbol" aria-hidden="true">A</span><input type="color" data-rich-color value="#5b3bb5" aria-label="Escolher cor do texto"></label>'+
 '</div><div class="rich-content" contenteditable="true" role="textbox" aria-multiline="true" data-rich-input="'+esc(name)+'" data-placeholder="'+esc(placeholder)+'">'+safeRich(value||"")+'</div></div>';
}

// Formatação aplicada diretamente aos caracteres selecionados (nunca ao fundo).
// Não depende da implementação inconsistente de execCommand em navegadores móveis.

const richStates=new WeakMap();
function richState(editor){
 let state=richStates.get(editor);
 if(!state){state={bold:false,italic:false,underline:false,color:null,locked:false};richStates.set(editor,state)}
 return state;
}
function richStyleFromCursor(editor){
 const selection=window.getSelection();
 if(!selection?.rangeCount)return;
 const range=selection.getRangeAt(0);
 if(!editor.contains(range.commonAncestorContainer))return;
 const node=range.startContainer;
 let element=node.nodeType===1?node:node.parentElement;
 if(element===editor&&node.nodeType===1){
  const near=node.childNodes[Math.max(0,Math.min(range.startOffset-1,node.childNodes.length-1))];
  if(near)element=near.nodeType===1?near:near.parentElement;
 }
 element=element||editor;
 const css=window.getComputedStyle(element);
 const ancestor=tag=>Boolean(element.closest?.(tag)&&editor.contains(element.closest(tag)));
 const underline=ancestor("u")||[element,...[...function*(n){for(let p=n.parentElement;p&&p!==editor;p=p.parentElement)yield p;}(element)]]
  .some(el=>el.style?.textDecorationLine?.includes("underline")||el.style?.textDecoration?.includes("underline"));
 const color=css.color?.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
 const state=richState(editor);
 state.bold=/^(bold|[6-9]00)$/.test(css.fontWeight)||Number(css.fontWeight)>=600;
 state.italic=css.fontStyle==="italic"||css.fontStyle==="oblique";
 state.underline=underline;
 state.color=color?"#"+color.slice(1,4).map(v=>Number(v).toString(16).padStart(2,"0")).join(""):null;
 state.locked=false;
 updateRichToolbar(editor);
}
function updateRichToolbar(editor){
 const state=richState(editor),root=editor.closest(".rich-editor");
 if(!root)return;
 for(const name of ["bold","italic","underline"]){
  const button=root.querySelector('[data-format="'+name+'"]');
  if(button)button.setAttribute("aria-pressed",String(Boolean(state[name])));
 }
 const input=root.querySelector("[data-rich-color]"),letter=root.querySelector(".rich-color-symbol");
 if(input&&state.color&&/^#[\da-f]{6}$/i.test(state.color))input.value=state.color;
 if(letter)letter.style.setProperty("--selected-text-color",state.color||"#5b3bb5");
}
function getRichRange(editor){
 const selection=window.getSelection();
 const active=selection?.rangeCount?selection.getRangeAt(0):null;
 if(active&&editor.contains(active.commonAncestorContainer))return active.cloneRange();
 const saved=richRanges.get(editor);
 if(saved&&editor.isConnected&&editor.contains(saved.commonAncestorContainer))return saved.cloneRange();
 const end=document.createRange();
 end.selectNodeContents(editor);end.collapse(false);
 return end;
}
function saveRichRange(editor){
 const selection=window.getSelection();
 if(selection?.rangeCount&&editor.contains(selection.getRangeAt(0).commonAncestorContainer))
  richRanges.set(editor,selection.getRangeAt(0).cloneRange());
}
function setRichSelection(editor,range){
 const selection=window.getSelection();
 selection.removeAllRanges();selection.addRange(range);
 richRanges.set(editor,range.cloneRange());
}
function unwrapRichSelection(editor,range,tag){
 if(range.collapsed)return false;
 let node=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer;
 const selected=range.toString();
 while(node&&node!==editor){
  if(node.nodeType===1&&node.matches(tag)&&node.textContent===selected){
   const first=node.firstChild,last=node.lastChild,parent=node.parentNode;
   if(!first||!last||!parent)return false;
   const result=document.createRange();
   result.setStartBefore(first);result.setEndAfter(last);
   node.replaceWith(...[...node.childNodes]);
   setRichSelection(editor,result);
   return true;
  }
  node=node.parentElement;
 }
 return false;
}
function applyRichFormat(editor,format,color=""){
 if(!editor)return false;
 const allowed=new Set(["bold","italic","underline","insertUnorderedList","insertOrderedList","justifyLeft","justifyCenter","justifyRight","justifyFull","foreColor"]);
 if(!allowed.has(format))return false;
 const state=richState(editor),range=getRichRange(editor);
 editor.focus({preventScroll:true});
 setRichSelection(editor,range);
 if(["insertUnorderedList","insertOrderedList","justifyLeft","justifyCenter","justifyRight","justifyFull"].includes(format)){
  const result=document.execCommand(format,false,null);
  saveRichRange(editor);
  editor.dispatchEvent(new Event("input",{bubbles:true}));
  return result;
 }
 if(format==="foreColor"&&!/^#[a-f0-9]{6}$/i.test(color))return false;
 const next=format==="foreColor"?color:!state[format];
 if(range.collapsed){
  if(format==="foreColor")state.color=next;
  else state[format]=next;
  state.locked=true;
  updateRichToolbar(editor);
  return true;
 }
 // Em seleção, aplicar a formatação sem destruir outras marcas já combinadas.
 const tag={bold:"strong",italic:"em",underline:"u",foreColor:"span"}[format];
 const isTurningOff=format!=="foreColor"&&!next;
 if(!(isTurningOff&&unwrapRichSelection(editor,range,tag))){
  const wrapper=document.createElement(tag);
  if(format==="foreColor")wrapper.style.color=color;
  const contents=range.extractContents();
  if(format==="foreColor"){
   for(const node of [...contents.querySelectorAll("[style],font[color]")]){
    if(node.style)node.style.removeProperty("color");
    if(node.tagName==="FONT")node.removeAttribute("color");
   }
  }
  wrapper.append(contents);
  range.insertNode(wrapper);
  const nextRange=document.createRange();
  nextRange.selectNodeContents(wrapper);
  setRichSelection(editor,nextRange);
 }
 if(format==="foreColor")state.color=next;
 else state[format]=next;
 state.locked=true;
 updateRichToolbar(editor);
 editor.dispatchEvent(new Event("input",{bubbles:true}));
 return true;
}
// Uma combinação de B, I e U só é aplicada ao texto enquanto seus botões estão acesos.
function insertRichTypedText(event){
 const editor=event.target.closest?.("[data-rich-input]");
 if(!editor||event.isComposing||event.inputType!=="insertText"||!event.data)return;
 const state=richState(editor);
 if(!state.locked)return;
 const range=getRichRange(editor);
 event.preventDefault();
 const styleKey=[state.bold?1:0,state.italic?1:0,state.underline?1:0,state.color||""].join(":");
 // Anexa novos caracteres ao mesmo trecho, sem criar uma tag para cada tecla.
 if(range.collapsed&&range.startContainer.nodeType===3){
  const textNode=range.startContainer,holder=textNode.parentElement;
  if(holder?.dataset.richTyped===styleKey&&range.startOffset===textNode.length){
   textNode.appendData(event.data);
   const cursor=document.createRange();cursor.setStart(textNode,textNode.length);cursor.collapse(true);
   setRichSelection(editor,cursor);
   editor.dispatchEvent(new Event("input",{bubbles:true}));
   return;
  }
 }
 range.deleteContents();
 const span=document.createElement("span");
 span.dataset.richTyped=styleKey;
 span.style.fontWeight=state.bold?"700":"400";
 span.style.fontStyle=state.italic?"italic":"normal";
 span.style.textDecoration=state.underline?"underline":"none";
 if(state.color)span.style.color=state.color;
 const node=document.createTextNode(event.data);
 span.append(node);range.insertNode(span);
 const cursor=document.createRange();cursor.setStart(node,node.length);cursor.collapse(true);
 setRichSelection(editor,cursor);
 editor.dispatchEvent(new Event("input",{bubbles:true}));
}
const collectRich=(form,fields)=>{for(const e of form.querySelectorAll("[data-rich-input]"))fields[e.dataset.richInput]=safeRich(e.innerHTML);return fields};
function richPlainText(value){
 const template=document.createElement("template");
 // Remove a formatação apenas para a prévia curta da lista; preserva a ata original no editor.
 template.innerHTML=safeRich(value).replace(/<\/?(?:br|p|div|li|ul|ol)\b[^>]*>/gi," ");
 return String(template.content.textContent||"").replace(/\s+/g," ").trim();
}

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
// PETianos(as), Tutoria e Administração compartilham a área comum.
const canWrite=()=>Boolean(me&&!me.mustChangePassword&&["petiano","tutor","admin"].includes(me.role));
const canSeeTaskPhotos=()=>Boolean(me&&!me.mustChangePassword&&me.role==="petiano");
const hasAdminRole=u=>Boolean(u&&u.role==="admin");
// O Worker valida o cargo e a origem da sessão; a interface apenas apresenta permissões.
const adminRole=u=>Boolean(hasAdminRole(u)&&u.adminSession===true);
const isAdmin=()=>Boolean(routeParts().page==="admin"&&adminRole(me));
const roleLabel=role=>({usuario:"Usuário",petiano:"PETiano(a)",tutor:"Tutor(a)",admin:"Administração"}[role]||"Usuário");
const canNotify=()=>canWrite()&&["tutor","admin"].includes(me.role)&&me.notificationEnabled;
// PETianos(as), tutores(as) e Administração podem excluir demandas
// ativas ou concluídas; a API valida novamente a autorização.
const canDeleteTask=t=>Boolean(t&&canWrite());
const stageDueAt=value=>{
 const raw=String(value||"");
 const parsed=dt(/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+"T23:59:59.999":raw);
 return parsed&&Number.isFinite(parsed.getTime())?parsed:null;
};
const isLate=t=>t.publicStatus?active(t)&&t.publicStatus==="atrasada":active(t)&&t.assignmentScope!=="todos"&&stages(t).some(s=>{
 if(s.completedAt)return false;
 const due=stageDueAt(s.dueAt);
 return !!due&&due.getTime()<Date.now();
});
const taskStatus=(t,cid="")=>t.publicStatus||(t.archivedAt||(cid&&t.commissionDone?.[cid])?"concluida":isLate(t)?"atrasada":"pendente");
const statusLabel={pendente:"Pendente",atrasada:"Atrasada",concluida:"Concluída"};
const stateBadge=t=>'<span class="task-status task-status-'+taskStatus(t)+'">'+statusLabel[taskStatus(t)]+'</span>';
const completedCount=t=>Object.keys(t.commissionDone||{}).length;
const isUserDone=(task,uid)=>Boolean(task.userDone?.[uid]);
const isTaskAssignedToMe=task=>Boolean(me&&(task.assigneeIds||[]).includes(me.id));
const canCompleteCommission=cid=>Boolean(me&&(committee(cid)?.memberIds||[]).includes(me.id));
const myPendingParts=t=>{
 // Registrar uma correção encerra somente a pendência pessoal do(a) tutor(a).
 // Não altera status, nem userDone/commissionDone, nem as listas gerais.
 if(me?.role==="tutor"&&t.tutorReviewedByMe)return {personal:false,committees:[]};
 return {
  personal:Boolean(me&&(t.assigneeIds||[]).includes(me.id)&&!isUserDone(t,me.id)),
  committees:me?(t.commissionIds||[]).filter(cid=>canCompleteCommission(cid)&&!commissionFinished(t,cid)):[]
 };
};
const isMyPending=t=>Boolean(me&&active(t)&&(myPendingParts(t).personal||myPendingParts(t).committees.length));
const taskProgress=task=>({done:Object.keys(task.commissionDone||{}).length+Object.keys(task.userDone||{}).length,total:(task.commissionIds||[]).length+(task.assigneeIds||[]).length});
const pendingParticipationCount=task=>(task.assigneeIds||[]).filter(uid=>!task.userDone?.[uid]).length+
 (task.commissionIds||[]).filter(cid=>!task.commissionDone?.[cid]).length;
const commissionFinished=(t,cid)=>Boolean(t.commissionDone?.[cid]);
function setConnecting(show,label="Conectando ao PET Gestão..."){
 const modal=$("#connecting-popup");
 if(!modal)return;
 if(show){const message=modal.querySelector(".connecting-message");if(message)message.textContent=label;}
 else{
  modal.classList.remove("returning-to-gestao");
  const hint=modal.querySelector(".connecting-hint");
  if(hint)hint.textContent="Validando seu acesso";
 }
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
let noticePromiseResolve=null,noticeReturnFocus=null,noticeAutoCloseTimer=null;
function closeNotice(confirmed=false){
 if(noticeAutoCloseTimer){clearTimeout(noticeAutoCloseTimer);noticeAutoCloseTimer=null;}
 const layer=$("#notice-dialog");
 if(layer){layer.hidden=true;layer.innerHTML=""}
 document.body.classList.remove("notice-open");
 if(noticePromiseResolve){const resolve=noticePromiseResolve;noticePromiseResolve=null;resolve(Boolean(confirmed))}
 if(noticeReturnFocus?.isConnected)noticeReturnFocus.focus();
 noticeReturnFocus=null;
}
function showNotice(message,{title="",kind="info",confirm=false,danger=false,secret="",focusAfter=null,cancelLabel="Cancelar",confirmLabel=""}={}){
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
 (confirm?'<button class="button ghost" type="button" data-do="notice-cancel">'+esc(cancelLabel)+'</button><button class="button primary'+(danger?" notice-dialog-danger":"")+'" type="button" data-do="notice-confirm">'+esc(confirmLabel||(danger?"Excluir definitivamente":"Confirmar"))+'</button>':
 '<button class="button primary" type="button" data-do="notice-cancel">Fechar</button>')+
 '</div></section>';
 layer.hidden=false;document.body.classList.add("notice-open");
 layer.querySelector(confirm?'[data-do="notice-confirm"]':'.notice-dialog-actions [data-do="notice-cancel"]')?.focus();
 // Avisos sem escolha desaparecem sozinhos após três segundos, sem contador.
 // Senhas temporárias e decisões que exigem confirmação não fecham automaticamente.
 if(!confirm&&!secret)noticeAutoCloseTimer=setTimeout(()=>closeNotice(false),3000);
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
 // Qualquer mudança de identidade em outra aba invalida o token antigo.
 if(scope!=="guest"&&(localStorage.getItem(sessionRevisionKey)||"")!==localSessionRevision)
  throw Error("A sessão foi alterada em outra aba. Atualize a página para continuar.");
 const headers={"Accept":"application/json"};
 const activeToken=scope==="guest"?"":token;
 if(activeToken)headers.Authorization="Bearer "+activeToken;
 if(payload!==undefined)headers["Content-Type"]="application/json";
 const res=await fetch(API+"/api/v1"+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:"no-store"});
 const obj=await res.json().catch(()=>({error:"Resposta inválida do servidor."}));
 if(!res.ok)throw Error(obj.error||"Falha na operação.");
 return obj;
}
async function reload(){
 try{
   // Toda a aplicação compartilha o mesmo perfil e token de autenticação.
   const b=await request("/bootstrap","GET");
   data=b;me=b.session?.user||null;regularMe=me;
   if(token&&!me){token="";forgetSessionToken(tokenKey)}
   if(firstBootstrap){firstBootstrap=false;try{const saved=JSON.parse(localStorage.getItem("pet-gestao:period")||"{}");if(b.settings?.autoMonth===false){state.year=Number(saved.year)||state.year;state.month=Number.isInteger(saved.month)?saved.month:state.month}if(b.settings?.autoWeek===false)state.week=Number(saved.week)||0;else state.week=weekFor(current)}catch{state.week=weekFor(current)}}

 }catch(e){
   data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}};
   me=null;setToast(e.message);
 }
 try{render()}finally{document.documentElement.classList.remove("pet-booting")}
}
function allowPage(p){if(canWrite())return true;return ["inicio","demandas","cronograma","comissoes","ajuda","login","cadastro","esqueci","redefinir","confirmar-email","conta","admin"].includes(p)}
function nav(){
 const {page}=routeParts();const breadcrumb=$("#current-page");
 if(breadcrumb)breadcrumb.innerHTML='<button class="crumb" type="button" data-do="back" aria-label="Voltar">'+ico("chevron-left")+'</button><span class="breadcrumb-current">'+esc(routeNames[page]||"PET Gestão")+'</span>';
 const admin=$("#admin-link"),adminCaption=$("#admin-nav-caption"),adminGroup=$("#admin-nav-group");
 const adminVisible=hasAdminRole(me)&&!me.mustChangePassword;
 const pendingAdminActivation=adminVisible&&!adminRole(me);
 if(adminCaption)adminCaption.hidden=!adminVisible;
 if(adminGroup)adminGroup.hidden=!adminVisible;
 if(admin){
  admin.hidden=!adminVisible;admin.classList.remove("nav-locked");admin.href="#/admin/painel";
  admin.setAttribute("aria-label",pendingAdminActivation?"Ativar painel administrativo":"Abrir painel administrativo");
  admin.innerHTML=ico("settings")+'<span>'+(pendingAdminActivation?"Ativar Administração":"Painel administrativo")+'</span>';
  admin.title=pendingAdminActivation?"Confirme sua senha para ativar a nova permissão":"Painel administrativo";
 }
 // Os detalhes destacam a seção pela qual a pessoa entrou.
 if(["inicio","demandas","comissoes","minhas-pendencias"].includes(page))state.lastListSection=page;
 const selectedSection=["atividade","registrar"].includes(page)?(state.lastListSection||"demandas"):page;
 $$(".nav-link[data-route]").forEach(el=>{
   const profile=el.dataset.route==="conta";
   el.classList.toggle("active",profile?(page==="conta"||page==="login"):el.dataset.route===selectedSection);
   if(el.dataset.route==="minhas-pendencias"||el.dataset.route==="reunioes")el.hidden=!canWrite();
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
function taskDate(t){
 if(t.displayDate)return t.displayDate;
 if(t.assignmentScope==="todos")return stages(t).filter(x=>x.dueAt).map(x=>x.dueAt).sort().at(-1)||t.registeredAt;
 // Para publicações de uma comissão, o calendário acompanha a DATA DE POSTAGEM,
 // não o prazo anterior de produção/correção. Mantém as semanas corretas.
 const publication=(t.commissionIds||[]).length?
   stages(t).filter(x=>x.label==="Postagem"&&x.dueAt).map(x=>x.dueAt).sort().at(-1):null;
 if(publication)return publication;
 return stages(t).filter(x=>!x.completedAt&&x.dueAt).map(x=>x.dueAt).sort()[0]||t.registeredAt;
}
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
// Perfil Usuário recebe somente uma visualização estática da demanda.
function publicTaskCard(t){
 const status=taskStatus(t);
 return '<article class="placeholder-row task-list-row demand-activity-card demand-activity-card-readonly status-'+status+'" aria-label="Demanda: '+esc(t.title)+'">'+
  '<div class="demand-activity-identity"><span class="demand-activity-art" aria-hidden="true">'+ico("checklist")+'</span>'+
  '<div class="demand-activity-heading"><strong class="demand-activity-title">'+esc(t.title)+'</strong></div></div>'+
  '<span class="task-status task-status-'+status+'">'+statusLabel[status]+'</span>'+
  '<div class="demand-activity-fact demand-activity-date"><span class="demand-activity-fact-icon">'+ico("calendar")+'</span>'+
  '<div><span class="demand-activity-label">Data</span><strong>'+esc(textDate(taskDate(t)))+'</strong></div></div>'+
 '</article>';
}
function taskCard(t,commissionId,withFinishAction=false){
 if(!canWrite())return publicTaskCard(t);
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
 (withFinishAction&&!isEveryoneAssigned(t)&&(mine.personal||mine.committees.length)?'<button type="button" class="button demand-finish-action" data-do="finish-mine" data-id="'+esc(t.id)+'">'+ico("check")+' Concluir</button>':"")+'</div>':"")+
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
function renderViewerHome(){
 const all=data.tasks.filter(active),visible=all.filter(t=>t.overviewVisible!==false);
 const next=[...visible].sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b)))).slice(0,6);
 const late=visible.filter(isLate).length,complete=data.tasks.filter(t=>t.archivedAt).length;
 return header("Organização","Visão geral","Acompanhe as demandas da equipe em modo de visualização.")+
  '<div class="stat-grid">'+[[all.length,"Demandas ativas","list"],[visible.length,"Em acompanhamento","checklist"],[late,"Prazos vencidos","alert"],[complete,"Concluídas","check"]].map(x=>
   '<div class="card stat"><div class="stat-icon purple">'+ico(x[2])+'</div><div class="stat-copy"><span>'+x[1]+'</span><strong>'+x[0]+'</strong></div></div>').join("")+'</div>'+
  '<div class="dashboard-grid viewer-dashboard"><section class="card card-pad"><div class="section-head"><div><h2>Pendências semanais</h2><p>Próximas atividades cadastradas para acompanhamento.</p></div></div>'+
  (next.length?next.map(publicTaskCard).join(""):empty("Sem pendências neste momento"))+'</section></div>';
}
function renderHome(){
 if(!canWrite())return renderViewerHome();
 const all=data.tasks.filter(active),visible=all.filter(t=>t.overviewVisible!==false),next=[...visible].sort((a,b)=>(dt(taskDate(a))||Infinity)-(dt(taskDate(b))||Infinity)).slice(0,6),late=visible.filter(isLate).length;
 const recentEvents=(data.events||[]).filter(e=>!me?.activityClearedAt||e.createdAt>me.activityClearedAt).slice(0,4);
 return header("Organização","Visão geral","Demandas da equipe e prazos prioritários.")+
 '<div class="stat-grid">'+[[all.length,"Demandas ativas","list"],[data.tasks.filter(isMyPending).length,"Minhas atividades","checklist"],[late,"Prazos vencidos","alert"],[data.tasks.filter(t=>t.archivedAt).length,"Concluídas","check"]].map(x=>'<div class="card stat"><div class="stat-icon purple">'+ico(x[2])+'</div><div class="stat-copy"><span>'+x[1]+'</span><strong>'+x[0]+'</strong></div></div>').join("")+'</div>'+
 '<div class="dashboard-grid"><section class="card card-pad"><div class="section-head"><div><h2>Pendências semanais</h2><p>As próximas seis atividades em aberto</p></div>'+button("Ver todas as demandas","demandas")+'</div>'+ (next.length?next.map(t=>taskCard(t)).join(""):empty("Sem pendências neste momento"))+'</section>'+
 '<section class="card card-pad"><div class="section-head"><h2>Últimas atualizações</h2>'+
 (me&&recentEvents.length?'<button type="button" class="button ghost clear-updates-button" data-do="clear-activity">'+ico("trash")+' Limpar tudo</button>':ico("bell"))+
 '</div>'+(recentEvents.length?recentEvents.map(e=>'<div class="placeholder-row"><div><strong>'+esc(e.summary)+'</strong><small>'+esc(e.actorName)+' · '+textDate(e.createdAt)+'</small></div></div>').join(""):empty("Nenhuma atualização recente"))+'</section></div>';
}

const VISUALIZATIONS=[["todas","Todas as demandas"],["pendente","Pendentes"],["atrasada","Atrasadas"],["concluida","Concluídas"]];
function visualizationSelect(filter,value,options=VISUALIZATIONS){
 return '<label class="visualization-control"><span class="visualization-label">Visualização:</span>'+
 '<span class="visualization-select-wrap"><span class="visualization-symbol" aria-hidden="true">'+ico("list")+'</span>'+
 '<select class="visualization-select" data-filter="'+esc(filter)+'" aria-label="Visualização">'+options.map(([v,l])=>opt(v,l,value)).join("")+'</select>'+
 '<span class="visualization-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></span></label>';
}
function renderDemandas(){
 const done=state.statusFilter==="concluida"||state.mode==="arquivo";
 const displayMode=state.mode==="arquivo"?"mensal":state.mode;
 let list=data.tasks.filter(t=>done?Boolean(t.archivedAt):filtered(t,displayMode));
 if(done)list=list.filter(t=>{
  const date=dt(t.archivedAt);
  return date&&date.getFullYear()===state.year&&date.getMonth()===state.month&&(!state.week||displayMode!=="semanal"||weekFor(date)===state.week);
 });
 else if(state.statusFilter!=="todas")list=list.filter(t=>taskStatus(t)===state.statusFilter);
 list.sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 const periodSelect='<label class="filter-item period-mode-filter"><span>PERÍODO</span><select class="select" data-filter="periodMode" aria-label="Período">'+
 [["mensal","Mensal"],["semanal","Semanal"]].map(([v,l])=>opt(v,l,displayMode)).join("")+'</select></label>';
 const canBulkDelete=done&&canWrite();
 if(!canBulkDelete){state.archiveDeleteMode=false;state.archiveSelectedIds.clear();}
 // Seleções só podem incluir as demandas concluídas visíveis no período atual.
 const visibleIds=new Set(list.map(t=>t.id));
 for(const selected of state.archiveSelectedIds)if(!visibleIds.has(selected))state.archiveSelectedIds.delete(selected);
 const selectedCount=state.archiveSelectedIds.size;
 const picking=canBulkDelete&&state.archiveDeleteMode;
 const actions=canWrite()?'<div class="demand-header-actions">'+
   button("+ Registrar demanda","registrar",true)+
   (canBulkDelete?'<button type="button" class="button danger-outline demand-delete-trigger" data-do="'+
     (picking?"archive-selection-cancel":"archive-selection-open")+'">'+
     ico(picking?"close":"trash")+(picking?" Cancelar seleção":" Excluir demandas")+'</button>':"")+
   '</div>':"";
 const toolbar=picking?
  '<div class="archive-bulk-toolbar" aria-label="Selecionar demandas concluídas">'+
   '<div class="archive-bulk-intro"><strong>Selecione as demandas</strong>'+
   '<small>Marque as que deseja excluir. A confirmação será solicitada antes de apagar.</small></div>'+
   '<div class="archive-bulk-buttons">'+
     '<button type="button" class="button ghost" data-do="archive-select-all">'+
       ico("checklist")+(selectedCount===list.length&&list.length?" Desmarcar todas":" Selecionar todas")+'</button>'+
     '<button type="button" class="button archive-bulk-delete" data-do="archive-delete-selected" '+(!selectedCount?'disabled':'')+'>'+
       ico("trash")+' Excluir selecionadas ('+selectedCount+')</button>'+
   '</div></div>':"";
 return header("Acompanhamento","Demandas","",actions)+
 '<section class="card card-pad demand-management-panel">'+
 '<div class="demand-visual-toolbar">'+visualizationSelect("status",state.statusFilter)+periodSelect+'</div>'+
 '<div class="list-toolbar">'+period()+'</div><hr class="divider">'+
 toolbar+
 (list.length?list.map(t=>'<div class="live-task-card'+(picking?' archive-select-row':'')+'">'+
 (picking?'<label class="archive-task-selector"><input type="checkbox" data-archive-select value="'+esc(t.id)+'" '+(state.archiveSelectedIds.has(t.id)?"checked":"")+'><span>'+(state.archiveSelectedIds.has(t.id)?"Selecionada para excluir":"Marcar para excluir")+'</span></label>':"")+
 taskCard(t)+'</div>').join(""):empty("Nenhuma demanda encontrada","Selecione outro período ou registre uma demanda."))+'</section>';
}
function renderCronograma(){
 const all=data.tasks.filter(t=>active(t)&&filtered(t,"mensal")&&(!state.week||weekFor(taskDate(t))===state.week));
 const groups=new Map();for(const t of all){const w=weekFor(taskDate(t));if(!groups.has(w))groups.set(w,[]);groups.get(w).push(t)}
 return header("Planejamento","Cronograma","Acompanhe os prazos das comissões.")+'<section class="card card-pad">'+period()+
 (groups.size?[...groups].sort((a,b)=>a[0]-b[0]).map(([week,items])=>'<section class="committee-group"><h3 class="committee-group-label">Semana '+week+' · '+MONTHS[state.month]+'</h3>'+items.map(t=>taskCard(t)).join("")+'</section>').join(""):empty("Sem atividades neste período"))+'</section>';
}
const COMMISSION_PRESET_ARTS=[
 ["videos","Vídeos"],["cards","Cards"],["imaginacao","ImaginAÇÃO"],
 ["cinepet","CinePET"],["salinha","Salinha"],["financas","Finanças"],
 ["legendas","Legendas"],["site","Site"],["comemoracoes","Comemorações"],
 ["impressora3d","Impressora 3D"],["secretaria","Secretaria"],["default","Genérica"]
];
function commissionArtKey(name){
 const raw=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const simpler=raw.replace(/^(?:comissaode|comissaodo|comissaoda|comissao|equipede|equipe|setorde|setor)/,"");
 const key=simpler||raw;
 if(key==="legenda")return "legendas";
 return COMMISSION_PRESET_ARTS.some(([k])=>k===key)?key:"default";
}
function commissionDefaultArt(name){
 const n=commissionArtKey(name);
 const art={
  videos:["🎬","#e8dffc"],cards:["🎨","#fce5ed"],imaginacao:["✨","#fff0c9"],cinepet:["🎞️","#e2e9ff"],
  salinha:["🏡","#e3f4e6"],financas:["💰","#fff0d8"],legenda:["💬","#e1f3fa"],
  site:["💻","#e4e9ff"],secretaria:["📋","#e9e0fa"],comemoracoes:["🎉","#ffe4ed"],impressora3d:["🖨️","#e5f2f1"]
 };
 const [symbol,color]=art[n]||["📋","#ece7fa"];
 return '<span class="commission-default-art" style="--art-color:'+color+'" aria-hidden="true">'+commissionCardArt(name)+'</span>';
}
// Tons decorativos derivados da cor RGB salva na comissão (sem alterar o D1).
// Clarear ou escurecer aqui afeta somente a arte, nunca o valor escolhido.
function commissionCardTheme(value){
 const hex=/^#[0-9a-f]{6}$/i.test(String(value||""))?value:"#f7f3ff";
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const hi=Math.max(...rgb),lo=Math.min(...rgb),d=hi-lo;
 let h=0,s=0,l=(hi+lo)/2;
 if(d){
  s=d/(1-Math.abs(2*l-1));
  if(hi===rgb[0])h=((rgb[1]-rgb[2])/d)%6;
  else if(hi===rgb[1])h=(rgb[2]-rgb[0])/d+2;
  else h=(rgb[0]-rgb[1])/d+4;
  h=(h*60+360)%360;
 }
 const saturation=s<.08?0:Math.max(58,Math.round(s*100));
 return {
  color:hex,
  tone:"hsl("+Math.round(h)+" "+saturation+"% 65%)",
  ink:"hsl("+Math.round(h)+" "+Math.min(85,saturation)+"% 26%)"
 };
}
// Desenhos SVG internos: funcionam sem rede e servem de padrão para qualquer nova comissão.
// A imagem própria do cadastro tem prioridade absoluta sobre esses desenhos.
function commissionCardArt(name){
 const key=commissionArtKey(name);
 const motifs={
  videos:'<g filter="url(#petCardShadow)"><circle cx="65" cy="48" r="25" fill="url(#petCardDark)" stroke="#535b80" stroke-width="4"/><circle cx="117" cy="43" r="30" fill="url(#petCardDark)" stroke="#535b80" stroke-width="4"/><circle cx="65" cy="48" r="10" fill="#dce5ef"/><circle cx="117" cy="43" r="12" fill="#dce5ef"/><rect x="35" y="70" width="112" height="76" rx="21" fill="url(#petCardDark)" stroke="#697691" stroke-width="4"/><path d="M145 91 178 73q8-4 8 6v60q0 10-8 6l-33-18z" fill="#303954" stroke="#747d9a" stroke-width="3"/><path d="m82 89 38 22-38 22z" fill="url(#petCardGreen)" stroke="#8ffab0" stroke-width="3"/><path d="M48 82q46-10 83 0" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="4"/></g><path d="m189 82 13-11m-10 33h15m-15 18 11 9" stroke="#ffbd38" stroke-width="7" stroke-linecap="round"/>',
  cards:'<g filter="url(#petCardShadow)"><rect x="42" y="47" width="99" height="102" rx="16" transform="rotate(-9 92 98)" fill="url(#petCardPink)" stroke="#f79ac0" stroke-width="4"/><rect x="64" y="63" width="103" height="95" rx="14" fill="#fff" stroke="#ef94bd" stroke-width="5"/><rect x="72" y="72" width="87" height="68" rx="8" fill="url(#petCardBlue)"/><circle cx="142" cy="86" r="11" fill="#ffcf61"/><path d="m76 137 25-33 21 22 18-25 17 36z" fill="#3c8deb"/><path d="m159 147 20-56" stroke="#ba2b6c" stroke-width="12" stroke-linecap="round"/><path d="m179 92 9-17q5-8 9 3l-3 23z" fill="#f4af53"/></g><path d="m24 78-12-5m16-12-8-12m18 8 2-12" stroke="#f9bb25" stroke-width="6" stroke-linecap="round"/>',
  imaginacao:'<g filter="url(#petCardShadow)"><path d="M90 31c-34 0-56 23-56 52 0 21 11 32 28 46l7 17h42l7-17c18-14 29-26 29-46 0-30-22-52-57-52z" fill="url(#petCardGold)" stroke="#eba72d" stroke-width="4"/><path d="m72 92 19 20 20-20" stroke="#fff4bb" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M70 145h41v12H70z" fill="#655f7e"/><rect x="74" y="154" width="32" height="10" rx="5" fill="#37395f"/><ellipse cx="77" cy="57" rx="22" ry="12" transform="rotate(-35 77 57)" fill="#fff" opacity=".43"/></g><g stroke="#ffb317" stroke-width="7" stroke-linecap="round"><path d="M89 10V2M37 26 24 15M142 24l14-13M14 72H2M171 69h13M28 134l-13 11m143-9 14 10"/></g>',
  cinepet:'<g filter="url(#petCardShadow)"><rect x="36" y="71" width="134" height="90" rx="15" fill="url(#petCardPurple)" stroke="#4b3baf" stroke-width="4"/><path d="m85 93 42 24-42 24z" fill="#fff"/><path d="M37 67h130l-6-32H42z" fill="#f4f5ff" stroke="#5554aa" stroke-width="4"/><path d="m56 36 23 31m21-31 23 31m20-31 20 31" stroke="#4b428e" stroke-width="13"/><rect x="37" y="67" width="130" height="12" rx="5" fill="#362e85"/></g><g filter="url(#petCardShadow)"><path d="m158 124 45 0-8 49h-29z" fill="#fff2e6"/><path d="m165 123 8 49m17-49-7 49" stroke="#ef4b57" stroke-width="10"/><g fill="#fff1a1"><circle cx="163" cy="116" r="10"/><circle cx="181" cy="114" r="11"/><circle cx="198" cy="118" r="10"/><circle cx="176" cy="101" r="11"/><circle cx="193" cy="101" r="9"/></g></g>',
  salinha:'<g filter="url(#petCardShadow)"><path d="M53 92 114 41l63 51v71H53z" fill="url(#petCardGold)" stroke="#ed9b45" stroke-width="4"/><path d="m41 95 72-63 75 63" fill="none" stroke="#ef6959" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><rect x="91" y="115" width="32" height="48" rx="7" fill="#795c55"/><rect x="135" y="112" width="26" height="27" rx="5" fill="url(#petCardBlue)"/><circle cx="116" cy="136" r="3" fill="#ffe0a2"/><path d="M63 165h117" stroke="#5cc468" stroke-width="14" stroke-linecap="round"/><circle cx="34" cy="115" r="27" fill="url(#petCardGreen)"/><circle cx="55" cy="136" r="22" fill="#46b870"/></g><path d="M108 67q13-12 27 0m-22 8q8-7 17 0" stroke="#e77944" stroke-width="5" fill="none" stroke-linecap="round"/>',
  financas:'<g filter="url(#petCardShadow)"><ellipse cx="51" cy="146" rx="36" ry="10" fill="#c78300"/><rect x="16" y="105" width="72" height="37" rx="8" fill="url(#petCardGold)" stroke="#dc962b" stroke-width="3"/><path d="M18 116h70m-70 13h70" stroke="#f7ca59" stroke-width="5"/><rect x="100" y="43" width="83" height="122" rx="14" fill="url(#petCardBlue)" stroke="#525dba" stroke-width="5"/><rect x="111" y="54" width="61" height="32" rx="7" fill="#a4e0ff" stroke="#5970b3" stroke-width="3"/><g fill="#faf5f9"><rect x="111" y="98" width="16" height="15" rx="4"/><rect x="135" y="98" width="16" height="15" rx="4"/><rect x="159" y="98" width="15" height="15" rx="4"/><rect x="111" y="121" width="16" height="15" rx="4"/><rect x="135" y="121" width="16" height="15" rx="4"/><rect x="159" y="121" width="15" height="32" rx="4" fill="#3dca8d"/><rect x="111" y="144" width="40" height="11" rx="4"/></g></g>',
  legenda:'<g filter="url(#petCardShadow)"><path d="M35 49q0-16 16-16h110q16 0 16 16v69q0 16-16 16H75l-29 19v-19q-11-3-11-16z" fill="url(#petCardPurple)" stroke="#6955d0" stroke-width="5"/><rect x="50" y="55" width="112" height="60" rx="9" fill="#f5f1ff"/><text x="106" y="99" font-family="Arial,sans-serif" font-weight="900" font-size="42" text-anchor="middle" fill="#5340b0">CC</text><rect x="65" y="142" width="101" height="32" rx="11" fill="#987bf6"/><path d="M80 155h71m-71 9h52" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>',
  legendas:'<g filter="url(#petCardShadow)"><path d="M35 49q0-16 16-16h110q16 0 16 16v69q0 16-16 16H75l-29 19v-19q-11-3-11-16z" fill="url(#petCardPurple)" stroke="#6955d0" stroke-width="5"/><rect x="50" y="55" width="112" height="60" rx="9" fill="#f5f1ff"/><text x="106" y="99" font-family="Arial,sans-serif" font-weight="900" font-size="42" text-anchor="middle" fill="#5340b0">CC</text><rect x="65" y="142" width="101" height="32" rx="11" fill="#987bf6"/><path d="M80 155h71m-71 9h52" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>',
  secretaria:'<g filter="url(#petCardShadow)"><rect x="48" y="27" width="118" height="151" rx="15" fill="url(#petCardPurple)" stroke="#5342a9" stroke-width="5"/><rect x="58" y="38" width="98" height="129" rx="8" fill="#fffaf7"/><rect x="78" y="19" width="57" height="29" rx="9" fill="url(#petCardDark)" stroke="#7f7bb4" stroke-width="3"/><rect x="92" y="14" width="29" height="15" rx="8" fill="#c9d8f2"/><path d="m73 78 9 8 14-17m-23 44 9 8 14-17m-23 44 9 8 14-17" stroke="#35bca0" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M107 80h34m-34 35h34m-34 35h27" stroke="#9c9bb9" stroke-width="6" stroke-linecap="round"/><path d="m158 147 24-64q4-10 13-6t6 13l-24 64-15 17z" fill="url(#petCardGold)" stroke="#bd7e2e" stroke-width="3"/><path d="m161 165 16-11-15 17z" fill="#3d405e"/></g><path d="M26 49l-10-8m12 23-14-1m176-12 11-8m-4 25 14-1" stroke="#ffbd38" stroke-width="6" stroke-linecap="round"/>',
  site:'<g filter="url(#petCardShadow)"><rect x="35" y="37" width="147" height="114" rx="13" fill="url(#petCardDark)" stroke="#69749d" stroke-width="5"/><rect x="45" y="47" width="127" height="94" rx="5" fill="url(#petCardBlue)"/><path d="m89 76-19 17 19 17m38-34 19 17-19 17m-24 7 13-49" fill="none" stroke="#eaf6ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 152h172l-17 19H41z" fill="#d4d9ec" stroke="#8492b0" stroke-width="4"/><path d="m153 112 11 48 12-13 13 23 11-7-13-22 17-4z" fill="#fff" stroke="#3a497e" stroke-width="4"/></g>',
  comemoracoes:'<g filter="url(#petCardShadow)"><path d="m61 95 97 53-119 25z" fill="url(#petCardPink)" stroke="#de5173" stroke-width="4"/><path d="m63 95 31 17-25 50-29 10z" fill="url(#petCardGold)"/><path d="M100 116 82 161m44-34-12 28" stroke="#f6d05d" stroke-width="13"/><ellipse cx="64" cy="94" rx="22" ry="12" transform="rotate(30 64 94)" fill="#ffbd48"/></g><g stroke-linecap="round" fill="none" stroke-width="10"><path d="M77 60q-23-22 0-33" stroke="#f052a1"/><path d="M114 62q27-18 8-39" stroke="#35bdbb"/><path d="M146 94q27-16 18-34" stroke="#a05cf4"/><path d="M98 76q-7-29 10-40" stroke="#ef9c23"/></g><path d="m169 39 7 10 11-3-6 13 8 8-15-1-6 10-2-14-11-5 12-6z" fill="#f7b82e"/><circle cx="45" cy="49" r="5" fill="#a05cf4"/><circle cx="152" cy="24" r="5" fill="#ec5d88"/>',
  impressora3d:'<g filter="url(#petCardShadow)"><path d="M40 37h132v132H40z" fill="none" stroke="#454c81" stroke-width="12" stroke-linejoin="round"/><path d="M30 169h153" stroke="#6875ac" stroke-width="15" stroke-linecap="round"/><path d="M105 78 137 98l-31 20-31-20z" fill="#b4e8f4" stroke="#518aee" stroke-width="3"/><path d="m75 98 31 20v36l-31-21z" fill="#66b4ef"/><path d="m137 98-31 20v36l31-21z" fill="#446eda"/><rect x="76" y="41" width="60" height="18" rx="6" fill="#353a64"/><path d="m106 59v19" stroke="#667dc2" stroke-width="7"/><path d="M64 147h83" stroke="#777fae" stroke-width="8"/></g>',
  default:'<g filter="url(#petCardShadow)"><circle cx="72" cy="57" r="25" fill="url(#petCardGold)"/><circle cx="136" cy="57" r="25" fill="url(#petCardBlue)"/><path d="M26 153v-19q0-38 46-38t46 38v19z" fill="url(#petCardPurple)"/><path d="M90 153v-19q0-38 46-38t46 38v19z" fill="url(#petCardGreen)"/><path d="m86 111 17 18 28-31" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>'
 };
 return '<svg class="commission-card-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 218 194" aria-hidden="true" focusable="false">'+
 '<defs><filter id="petCardShadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#1f265b" flood-opacity=".22"/></filter>'+
 '<linearGradient id="petCardDark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#515c85"/><stop offset="1" stop-color="#222a45"/></linearGradient>'+
 '<linearGradient id="petCardPurple" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bda8ff"/><stop offset="1" stop-color="#5c4fc4"/></linearGradient>'+
 '<linearGradient id="petCardBlue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#86ddff"/><stop offset="1" stop-color="#4478ea"/></linearGradient>'+
 '<linearGradient id="petCardPink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe1ef"/><stop offset="1" stop-color="#f45f9c"/></linearGradient>'+
 '<linearGradient id="petCardGreen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a5ffad"/><stop offset="1" stop-color="#36c36d"/></linearGradient>'+
 '<linearGradient id="petCardGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff5a1"/><stop offset="1" stop-color="#ffad23"/></linearGradient></defs>'+
 (motifs[key]||motifs.default)+'</svg>';
}

function openCommissionPresetGallery(){
 const form=$("#commission-form");
 if(!form)return;
 closeCommissionPresetGallery();
 const layer=document.createElement("div");
 layer.id="commission-preset-gallery";layer.className="commission-preset-gallery";
 layer.innerHTML='<div class="commission-preset-backdrop" data-do="commission-preset-close"></div>'+
 '<section class="commission-preset-dialog" role="dialog" aria-modal="true" aria-labelledby="commission-preset-title">'+
 '<header><div><span>GALERIA DE ARTES</span><h2 id="commission-preset-title">Imagens padrões das comissões</h2>'+
 '<p>Escolha qualquer arte. Ela ficará vinculada à comissão mesmo que o nome seja alterado.</p></div>'+
 '<button type="button" class="button ghost" data-do="commission-preset-close" aria-label="Fechar galeria">✕ Fechar</button></header>'+
 '<div class="commission-preset-grid">'+COMMISSION_PRESET_ARTS.map(([key,label])=>
 '<button type="button" class="commission-preset-option" data-do="commission-preset-select" data-key="'+key+'" aria-label="Selecionar imagem padrão de '+esc(label)+'">'+
 '<span class="commission-preset-picture">'+commissionCardArt(key)+'</span>'+
 '<strong>'+esc(label)+'</strong></button>').join("")+'</div></section>';
 document.body.append(layer);
 layer.querySelector("[data-do='commission-preset-close']:not(.commission-preset-backdrop)")?.focus();
}
function closeCommissionPresetGallery(){document.querySelector("#commission-preset-gallery")?.remove()}
async function selectCommissionPreset(key){
 if(!COMMISSION_PRESET_ARTS.some(([k])=>k===key))throw Error("Imagem padrão inválida.");
 const hidden=$("#commission-form input[name='imageData']"),preview=$("#commission-image-preview");
 if(!hidden||!preview)return;
 const svg=commissionCardArt(key);
 const blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 try{
  const img=await new Promise((resolve,reject)=>{
   const element=new Image();
   element.onload=()=>resolve(element);
   element.onerror=()=>reject(new Error("Não foi possível preparar a imagem padrão."));
   element.src=url;
  });
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Não foi possível criar a imagem neste navegador.");
  const scale=Math.min(448/218,448/194);
  ctx.drawImage(img,(512-218*scale)/2,(512-194*scale)/2,218*scale,194*scale);
  const png=canvas.toDataURL("image/png");
  if(png.length>950000)throw Error("A imagem gerada ultrapassou o tamanho permitido.");
  hidden.value=png;
  preview.innerHTML='<img src="'+esc(png)+'" alt="Imagem padrão selecionada">';
  const hint=$("#commission-image-hint");
  if(hint)hint.textContent="Arte padrão escolhida. Ela será mantida mesmo que a comissão seja renomeada. Clique em Salvar comissão.";
  closeCommissionPresetGallery();
  setToast("Imagem padrão escolhida. Salve a comissão para manter a alteração.");
 }finally{URL.revokeObjectURL(url)}
}

function renderComissoes(){
 return header("Trabalho em equipe","Comissões","Organização das equipes.",canWrite()?button("+ Nova comissão","comissoes/nova",true):"")+
 '<section class="card card-pad"><div class="section-head"><h2>Comissões cadastradas</h2><span class="pill soft">'+data.committees.length+' comissões</span></div><div class="commission-cards-grid">'+data.committees.map(c=>{
  const members=c.memberCount??(c.memberIds||[]).length,cmax=c.maxMembers||0,joined=Boolean(me&&(c.memberIds||[]).includes(me.id));
  const theme=commissionCardTheme(c.backgroundColor);
  const linkTag=canWrite()?"a":"div",linkProps=canWrite()?' href="'+workspaceHash("comissoes/"+id(c.id))+'"':"";
  const art=c.imageData?'<img src="'+esc(c.imageData)+'" alt="" loading="lazy">':commissionCardArt(c.name);
  return '<article class="commission-tile commission-tile-v2" style="--commission-bg:'+theme.color+';--commission-tone:'+theme.tone+';--commission-ink:'+theme.ink+'">'+
   '<'+linkTag+linkProps+' class="commission-tile-link commission-tile-link-v2">'+
   '<span class="commission-v2-copy"><span class="commission-v2-marker" aria-hidden="true"></span><h3>'+esc(c.name)+'</h3>'+
   '<span class="commission-v2-members">'+ico("users")+' '+members+(cmax?" / "+cmax:"")+' integrantes'+(!cmax?' · Vagas a definir':"")+'</span>'+
   (canWrite()?'<span class="commission-v2-view">Ver atividades '+ico("arrow")+'</span>':"")+'</span>'+
   '<span class="commission-v2-art'+(c.imageData?' commission-v2-art-custom':'')+'">'+art+'</span></'+linkTag+'>'+
   (canWrite()?'<details class="commission-tile-menu"><summary title="Opções" aria-label="Opções da comissão '+esc(c.name)+'">⋮</summary><div class="commission-tile-menu-items">'+button("Editar","comissoes/editar/"+id(c.id))+
   (isAdmin()?'<button type="button" data-do="delete-commission" data-id="'+esc(c.id)+'">Excluir</button>':joined?'<button type="button" data-do="leave-commission" data-id="'+esc(c.id)+'">Sair da comissão</button>':'<button type="button" data-do="join-commission" data-id="'+esc(c.id)+'">Fazer parte</button>')+'</div></details>':"")+'</article>';
 }).join("")+'</div></section>';
}

function commissionHelp(){
 const topics=[
  ["Como participar de uma comissão?","Abra as opções (⋮) da equipe e escolha Fazer parte. Se as vagas estiverem limitadas, o sistema informa quando não for possível ingressar."],
  ["Onde encontro as demandas da minha comissão?","Toque no card da equipe para consultar as atividades vinculadas. O painel resume Demandas, Concluídas, Atrasadas e Pendentes."],
  ["Qual a diferença entre pessoa e comissão responsável?","Uma pessoa indicada individualmente tem sua própria participação. Uma comissão é uma participação coletiva, e seus integrantes podem acompanhar as pendências daquela equipe."],
  ["Concluir minha participação conclui a demanda inteira?","Não necessariamente. A demanda só é arquivada quando todas as pessoas e comissões responsáveis tiverem concluído suas participações."],
  ["Qual a diferença entre pendente e atrasada?","Pendente é uma participação ainda não concluída e sem prazo vencido; atrasada é uma participação ainda não concluída com prazo vencido."],
  ["Como sair de uma comissão?","Abra as opções da equipe e escolha Sair da comissão. Caso a saída seja bloqueada por regras de participação, o site mostrará uma explicação."]
 ];
 return '<section class="card card-pad commission-help" aria-labelledby="commission-help-title">'+
  '<div class="section-head"><div><h2 id="commission-help-title">'+ico("info")+' Ajuda sobre comissões</h2>'+
  '<p>Entenda os responsáveis, o andamento e as opções disponíveis.</p></div></div>'+
  '<div class="commission-help-list">'+topics.map(([q,a])=>
   '<details class="commission-help-item"><summary>'+esc(q)+'<span aria-hidden="true">⌄</span></summary>'+
   '<p>'+esc(a)+'</p></details>').join("")+'</div></section>';
}

// Ajuda geral no menu Organização; mantém Comissões sem um bloco de ajuda repetido.
function renderHelp(){
 const sections=[
 ["Primeiros passos",[
  ["O que encontro em Visão geral, Demandas e Minhas pendências?","Visão geral resume as próximas atividades. Demandas reúne todos os registros e seus filtros. Minhas pendências lista apenas as participações que ainda dependem de você."],
  ["Quem pode cadastrar ou editar demandas?","PETianos(as), Tutoria e Administração têm acesso às operações permitidas aos seus cargos. A conta somente de leitura acompanha as informações públicas."]
 ]],
 ["Demandas e conclusão",[
  ["Como criar uma demanda?","Abra Demandas > Registrar demanda, informe o título, escolha os responsáveis (Pessoas, Comissões ou Todos(as)) e defina datas ou etapas quando necessário."],
  ["O que significam Pendente, Atrasada e Concluída?","Pendente é a atividade que ainda aguarda finalização; atrasada tem prazo vencido; concluída não tem participações pendentes."],
  ["Como funciona Marcar todos?","Na confirmação de conclusão, Marcar todos seleciona todas as pessoas e comissões ainda pendentes. Você pode desmarcar qualquer uma antes de concluir."],
  ["Concluir minha participação conclui toda a demanda?","Somente se ninguém mais estiver pendente. Pessoas e comissões podem concluir separadamente."],
  ["Posso sair de uma edição sem salvar?","Se você modificou algum campo, o sistema pergunta se deseja continuar editando ou sair sem salvar."],
  ["Posso excluir demandas concluídas?","Perfis autorizados podem selecionar as demandas na visualização Concluídas, conferir a seleção e confirmar a exclusão definitiva."]
 ]],
 ["Atas e revisão",[
  ["Onde ficam as atas de reunião?","Acesse Atas de Reunião no menu Organização para consultar, criar e editar registros conforme suas permissões."],
  ["Como saber quem corrigiu o texto para revisão?","Perto da área de revisão aparece a última alteração registrada, com nome, cargo, data e horário."]
 ]],
 ["E-mails e conta",[
  ["Quando uma alteração dispara e-mail?","A Tutoria e a Administração podem escolher Salvar e enviar ou Salvar sem enviar. O remetente não recebe uma cópia para si mesmo."],
  ["E se a demanda for excluída ou seu prazo for alterado?","Mensagens pendentes vinculadas à demanda são verificadas e canceladas quando deixam de ser válidas; mensagens já enviadas não podem ser recolhidas."],
  ["O que faz Manter-me conectado?","Permite continuar usando sua conta no navegador até sair ou ter a sessão revogada. Abas do mesmo navegador compartilham a mesma identidade."],
  ["O que faz Limpar tudo?","Esconde suas últimas atualizações sem apagar o histórico de trabalho da equipe."]
 ]]
 ];
 const group=([heading,entries])=>'<section class="card card-pad help-section"><h2>'+esc(heading)+'</h2><div class="commission-help-list">'+
  entries.map(([q,a])=>'<details class="commission-help-item"><summary>'+esc(q)+'<span aria-hidden="true">⌄</span></summary><p>'+esc(a)+'</p></details>').join("")+'</div></section>';
 return header("Orientações","Ajuda","Encontre respostas sobre as funcionalidades do PET Gestão.")+
  '<div class="help-page">'+sections.map(group).join("")+commissionHelp()+
  (isAdmin()?'<section class="card card-pad help-section"><h2>Administração</h2><p>O Painel Admin é reservado à gestão de usuários, vagas das comissões, configurações e e-mails. Demandas e atas ficam na área Organização.</p></section>':"")+'</div>';
}

// O painel contabiliza a participação DESTA comissão, independentemente
// de haver outras pessoas/comissões ainda com entregas pendentes.
function commissionOverview(cid){
 const linked=data.tasks.filter(t=>(t.commissionIds||[]).includes(cid));
 const totals={demandas:linked.length,concluidas:0,atrasadas:0,pendentes:0};
 for(const task of linked){
  if(commissionFinished(task,cid)||Boolean(task.archivedAt))totals.concluidas++;
  else if(isLate(task))totals.atrasadas++;
  else totals.pendentes++;
 }
 const metrics=[
  ["Demandas",totals.demandas,"list","total"],
  ["Concluídas",totals.concluidas,"check","complete"],
  ["Atrasadas",totals.atrasadas,"alert","late"],
  ["Pendentes",totals.pendentes,"clock","pending"]
 ];
 return '<section class="commission-overview" aria-label="Resumo geral da comissão">'+
  metrics.map(([label,value,iconName,kind])=>'<div class="card commission-overview-card commission-overview-'+kind+'">'+
   '<span class="commission-overview-icon" aria-hidden="true">'+ico(iconName)+'</span>'+
   '<span class="commission-overview-info"><span class="commission-overview-label">'+label+'</span>'+
   '<strong class="commission-overview-value">'+value+'</strong></span></div>').join("")+
 '</section>';
}
function renderCommittee(cid){
 const c=committee(cid);if(!c)return empty("Comissão não encontrada");
 const all=data.tasks.filter(t=>active(t)&&(t.commissionIds||[]).includes(cid)&&!commissionFinished(t,cid))
 .filter(t=>state.commissionStatusFilter==="todas"||taskStatus(t,cid)===state.commissionStatusFilter)
 .sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 return header("Comissões",c.name,"","")+
 (c.description?'<section class="commission-description-rich" aria-label="Descrição da comissão">'+safeRich(c.description)+'</section>':"")+
 commissionOverview(cid)+
 '<section class="card card-pad"><div class="section-head"><div><h2>Pendências da comissão</h2><p>Atividades vinculadas a esta equipe em Demandas.</p></div><span class="pill soft">'+all.length+' pendente(s)</span></div>'+
 visualizationSelect("commissionStatus",state.commissionStatusFilter,[["todas","Todas as pendências"],["pendente","Pendentes"],["atrasada","Atrasadas"]])+
 (all.length?all.map(t=>taskCard(t,cid)).join(""):empty("Nenhuma pendência nesta comissão","As atividades atribuídas à comissão aparecerão aqui."))+'</section>';
}


function commissionRgbParts(hex){
 const safe=/^#[0-9a-f]{6}$/i.test(String(hex||""))?hex:"#f7f3ff";
 return [1,3,5].map(i=>parseInt(safe.slice(i,i+2),16));
}
function setCommissionRgbColor(hex){
 const form=$("#commission-form"),panel=$("#commission-rgb-panel");if(!form)return;
 const safe=/^#[0-9a-f]{6}$/i.test(String(hex||""))?hex.toLowerCase():"#f7f3ff";
 const hidden=form.elements.backgroundColor;if(hidden)hidden.value=safe;
 form.querySelectorAll("[data-commission-color-swatch]").forEach(el=>el.style.backgroundColor=safe);
 const text=form.querySelector("[data-commission-color-label]");if(text)text.textContent=safe.toUpperCase();
 const hexInput=form.querySelector("[data-commission-color-hex]");if(hexInput){hexInput.value=safe.toUpperCase();hexInput.removeAttribute("aria-invalid")}
 if(panel){
  const parts=commissionRgbParts(safe);
  for(const [i,key] of ["r","g","b"].entries()){
   panel.querySelector('[data-commission-rgb-range="'+key+'"]').value=parts[i];
   panel.querySelector('[data-commission-rgb-number="'+key+'"]').value=parts[i];
  }
 }
}
function setCommissionRgbFromChannel(input){
 const panel=$("#commission-rgb-panel");if(!panel||!input)return;
 const channel=input.dataset.commissionRgbRange||input.dataset.commissionRgbNumber;
 const which=input.hasAttribute("data-commission-rgb-number")?"number":"range";
 if(!["r","g","b"].includes(channel))return;
 const val=Math.max(0,Math.min(255,Math.round(Number(input.value)||0)));
 panel.querySelector('[data-commission-rgb-'+which+'="'+channel+'"]').value=val;
 panel.querySelector('[data-commission-rgb-'+(which==="number"?"range":"number")+'="'+channel+'"]').value=val;
 const vals=["r","g","b"].map(key=>Number(panel.querySelector('[data-commission-rgb-range="'+key+'"]').value));
 setCommissionRgbColor("#"+vals.map(n=>n.toString(16).padStart(2,"0")).join(""));
}

/* Editor de imagem local: a foto original nunca é enviada ao servidor. */
const COMMISSION_ORIGINAL_MAX=2*1024*1024,COMMISSION_FINAL_MAX=600*1024;
let commissionImageEditor=null;
function clampCommissionImagePosition(){
 const m=commissionImageEditor;if(!m)return;
 const side=360,rotW=m.rotation%2?m.bitmap.height:m.bitmap.width;
 const rotH=m.rotation%2?m.bitmap.width:m.bitmap.height;
 const scale=Math.max(side/rotW,side/rotH)*m.zoom;
 m.offsetX=Math.max(-Math.max(0,(rotW*scale-side)/2),Math.min(Math.max(0,(rotW*scale-side)/2),m.offsetX));
 m.offsetY=Math.max(-Math.max(0,(rotH*scale-side)/2),Math.min(Math.max(0,(rotH*scale-side)/2),m.offsetY));
}
function paintCommissionImage(canvas){
 const m=commissionImageEditor;if(!m||!canvas)return;
 const size=canvas.width,ctx=canvas.getContext("2d");
 if(!ctx)throw Error("O navegador não conseguiu abrir o editor de imagens.");
 const width=m.bitmap.width,height=m.bitmap.height;
 const rotatedWidth=m.rotation%2?height:width,rotatedHeight=m.rotation%2?width:height;
 const scale=Math.max(size/rotatedWidth,size/rotatedHeight)*m.zoom,relative=size/360;
 ctx.clearRect(0,0,size,size);
 ctx.save();
 ctx.translate(size/2+m.offsetX*relative,size/2+m.offsetY*relative);
 ctx.rotate(m.rotation*Math.PI/2);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
 ctx.drawImage(m.bitmap,-width*scale/2,-height*scale/2,width*scale,height*scale);
 ctx.restore();
}
function redrawCommissionImage(){
 if(!commissionImageEditor)return;
 clampCommissionImagePosition();
 paintCommissionImage($("#commission-editor-canvas"));
 const zoom=$("#commission-image-zoom-value");
 if(zoom)zoom.textContent=Math.round(commissionImageEditor.zoom*100)+"%";
}
function closeCommissionImageEditor(){
 const host=$("#commission-image-editor");
 if(host){host.hidden=true;host.innerHTML="";}
 commissionImageEditor?.bitmap?.close?.();
 commissionImageEditor=null;
 document.body.classList.remove("commission-image-editor-open");
}
async function openCommissionImageEditor(file){
 if(!file||!/^image\/(?:jpeg|png|webp)$/.test(file.type))throw Error("Escolha uma imagem JPG, PNG ou WebP.");
 if(file.size>COMMISSION_ORIGINAL_MAX)throw Error("A imagem original deve ter no máximo 2 MB.");
 if(!file.size)throw Error("A imagem está vazia.");
 let bitmap;
 try{
  if(typeof createImageBitmap==="function")bitmap=await createImageBitmap(file);
  else{
   const url=URL.createObjectURL(file);
   try{const img=new Image();img.src=url;await img.decode();bitmap=img;}
   finally{URL.revokeObjectURL(url);}
  }
 }catch{throw Error("Não foi possível abrir a imagem. Experimente JPG, PNG ou WebP.");}
 if(!bitmap.width||!bitmap.height){bitmap.close?.();throw Error("A imagem possui dimensões inválidas.");}
 closeCommissionImageEditor();
 const host=$("#commission-image-editor");
 if(!host){bitmap.close?.();throw Error("Editor de imagem indisponível.");}
 commissionImageEditor={bitmap,rotation:0,zoom:1,offsetX:0,offsetY:0,pointer:null};
 host.innerHTML='<div class="commission-editor-backdrop" data-do="commission-image-cancel"></div>'+
  '<section class="commission-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="commission-editor-heading">'+
  '<div class="commission-editor-header"><div><h2 id="commission-editor-heading">Ajustar imagem da comissão</h2><p>Arraste para enquadrar. Use o zoom para cortar e as setas para girar.</p></div>'+
  '<button type="button" class="commission-editor-close" data-do="commission-image-cancel" aria-label="Fechar editor">×</button></div>'+
  '<div class="commission-editor-body"><div class="commission-editor-crop"><canvas id="commission-editor-canvas" width="360" height="360" aria-label="Prévia do recorte quadrado da comissão"></canvas><span class="commission-editor-grid" aria-hidden="true"></span></div>'+
  '<div class="commission-editor-controls"><label class="commission-editor-zoom-label" for="commission-image-zoom">Zoom <strong id="commission-image-zoom-value">100%</strong></label>'+
  '<input id="commission-image-zoom" type="range" min="1" max="3" step=".05" value="1">'+
  '<div class="commission-editor-rotate"><button type="button" class="button ghost" data-do="commission-image-rotate" data-angle="-1">↶ Girar à esquerda</button>'+
  '<button type="button" class="button ghost" data-do="commission-image-rotate" data-angle="1">↷ Girar à direita</button></div>'+
  '<label for="commission-image-resolution">Resolução final</label><select id="commission-image-resolution" class="select"><option value="256">256 × 256</option><option value="512" selected>512 × 512</option><option value="768">768 × 768</option><option value="1024">1024 × 1024</option></select>'+
  '<p>Imagem otimizada automaticamente para até 600 KB ao salvar, sem perder o enquadramento escolhido.</p></div></div>'+
  '<div class="commission-editor-actions"><button type="button" class="button ghost" data-do="commission-image-cancel">Cancelar</button>'+
  '<button type="button" class="button primary" data-do="commission-image-apply">Aplicar imagem</button></div></section>';
 host.hidden=false;document.body.classList.add("commission-image-editor-open");
 redrawCommissionImage();
 host.querySelector('[data-do="commission-image-apply"]')?.focus();
}
function commissionImageDrag(e){
 const m=commissionImageEditor,canvas=$("#commission-editor-canvas");
 if(!m||!canvas||e.target!==canvas)return;
 if(e.type==="pointerdown"){
  if(e.button!==0)return;
  e.preventDefault();m.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  canvas.setPointerCapture?.(e.pointerId);return;
 }
 if(e.type==="pointermove"&&m.pointer?.id===e.pointerId){
  e.preventDefault();
  const rect=canvas.getBoundingClientRect(),factor=360/(rect.width||360);
  m.offsetX+=(e.clientX-m.pointer.x)*factor;m.offsetY+=(e.clientY-m.pointer.y)*factor;
  m.pointer.x=e.clientX;m.pointer.y=e.clientY;redrawCommissionImage();
 }else if(["pointerup","pointercancel"].includes(e.type)&&m.pointer?.id===e.pointerId)m.pointer=null;
}
async function encodeCommissionImage(){
 const m=commissionImageEditor;if(!m)throw Error("Escolha uma imagem primeiro.");
 let dimension=Number($("#commission-image-resolution")?.value)||512,quality=.88;
 for(let attempt=0;attempt<16;attempt++){
  const canvas=document.createElement("canvas");canvas.width=dimension;canvas.height=dimension;
  paintCommissionImage(canvas);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
  if(!blob)throw Error("Não foi possível preparar a imagem.");
  if(blob.type==="image/webp"&&blob.size<=COMMISSION_FINAL_MAX)return blob;
  if(blob.type!=="image/webp"){
   const ctx=canvas.getContext("2d");
   ctx.save();ctx.globalCompositeOperation="destination-over";ctx.fillStyle="#ffffff";ctx.fillRect(0,0,dimension,dimension);ctx.restore();
   const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
   if(jpeg&&jpeg.size<=COMMISSION_FINAL_MAX)return jpeg;
  }
  if(quality>.52)quality=Math.max(.52,quality-.08);
  else dimension=Math.max(192,Math.round(dimension*.8));
 }
 throw Error("Não foi possível otimizar essa imagem. Reduza a resolução final e tente novamente.");
}
async function applyCommissionImage(button){
 if(!commissionImageEditor)return;
 if(button)button.disabled=true;
 try{
  const blob=await encodeCommissionImage();
  const encoded=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(Error("Não foi possível ler a imagem editada."));
   reader.readAsDataURL(blob);
  });
  const hidden=$("#commission-form input[name='imageData']"),preview=$("#commission-image-preview");
  if(!hidden||!preview)throw Error("O formulário de comissão não está mais aberto.");
  hidden.value=encoded;
  preview.innerHTML='<img src="'+esc(encoded)+'" alt="Imagem ajustada da comissão">';
  const hint=$("#commission-image-hint");
  if(hint)hint.textContent="Imagem editada ("+fileSize(blob.size)+"). Clique em Salvar comissão para concluir.";
  closeCommissionImageEditor();
 }catch(err){setToast(err.message)}
 finally{if(button?.isConnected)button.disabled=false}
}
function renderCommitteeEdit(cid){
 if(!canWrite())return authRequired();
 const c=cid?committee(cid):null;if(cid&&!c)return empty("Comissão não encontrada");
 const currentColor=/^#[0-9a-f]{6}$/i.test(c?.backgroundColor||"")?c.backgroundColor:"#f7f3ff";
 const channels=[["r","Vermelho"],["g","Verde"],["b","Azul"]];
 const palette=["#f7f3ff","#e8dffc","#fee3ea","#e0f3ef","#deedff","#fff0ca","#f4e0ff","#e8e9ee"];
 const colorEditor='<div class="commission-color-field"><span class="commission-field-label">Fundo do card (opcional)</span>'+
  '<input type="hidden" name="backgroundColor" value="'+esc(currentColor)+'">'+
  '<div class="commission-color-top"><button type="button" class="commission-color-trigger" data-do="commission-color-toggle" aria-expanded="false" aria-controls="commission-rgb-panel">'+
  '<span class="commission-color-swatch" data-commission-color-swatch style="background:'+esc(currentColor)+'"></span>'+
  '<span class="commission-color-trigger-text"><strong>Escolher cor</strong><small data-commission-color-label>'+esc(currentColor.toUpperCase())+'</small></span>'+ico("chevron-down")+'</button>'+
  '<button type="button" class="button ghost" data-do="reset-color">Restaurar padrão</button></div>'+
  '<div class="commission-rgb-panel" id="commission-rgb-panel" hidden><div class="commission-rgb-heading"><strong>Personalizar cor RGB</strong><span class="commission-rgb-large-swatch" data-commission-color-swatch style="background:'+esc(currentColor)+'"></span></div>'+
  channels.map(([key,label])=>'<div class="commission-rgb-channel"><label for="commission-channel-'+key+'">'+label+'</label>'+
   '<input id="commission-channel-'+key+'" type="range" min="0" max="255" step="1" data-commission-rgb-range="'+key+'" aria-label="'+label+' de 0 a 255">'+
   '<input type="number" min="0" max="255" step="1" data-commission-rgb-number="'+key+'" aria-label="Valor '+label+'"></div>').join("")+
  '<label class="commission-hex-label">Código hexadecimal<input type="text" maxlength="7" data-commission-color-hex placeholder="#RRGGBB" inputmode="text" spellcheck="false" value="'+esc(currentColor.toUpperCase())+'"></label>'+
  '<span class="commission-palette-label">Cores sugeridas</span><div class="commission-palette">'+palette.map(hex=>
    '<button type="button" data-do="commission-color-preset" data-color="'+hex+'" class="commission-palette-option" style="--preset-color:'+hex+'" aria-label="Usar cor '+hex+'"></button>').join("")+'</div></div></div>';
 const imagePreview=c?.imageData?
  '<img src="'+esc(c.imageData)+'" alt="Imagem atual da comissão">':
  '<span class="commission-image-placeholder commission-image-default">'+commissionCardArt(c?.name||"")+'<small>Imagem padrão</small></span>';
 const imagePicker='<div class="commission-image-field"><span class="commission-field-label">Imagem da comissão (opcional)</span>'+
  '<div class="commission-image-picker-row"><div class="commission-image-preview" id="commission-image-preview">'+imagePreview+'</div>'+
  '<div class="commission-image-actions"><label class="button ghost commission-image-choose">Escolher imagem<input type="file" id="commission-upload" accept="image/png,image/jpeg,image/webp" aria-label="Escolher imagem da comissão"></label>'+
  '<button type="button" class="button ghost" data-do="commission-preset-gallery">Usar imagens padrões</button>'+
  '<small id="commission-image-hint">JPG, PNG ou WebP de até 2 MB. Edite, recorte e redimensione antes de salvar.</small></div></div>'+
  '<input type="hidden" name="imageData" value="'+esc(c?.imageData||"")+'"></div>';

 return header("Comissões",c?"Editar comissão":"Nova comissão","")+
 '<section class="card card-pad register-page"><form id="commission-form" data-id="'+esc(cid||"")+'" class="register-form">'+
 '<label>Nome da comissão *<input name="name" required maxlength="90" value="'+esc(c?.name||"")+'"></label>'+
 '<label class="rich-label">Descrição (opcional)</label>'+richEditor("description",c?.description||"","Apresente a comissão e suas atividades...")+
 colorEditor+imagePicker+
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
 (state.assignmentScope==="todos"?'<p class="assignment-all">Evento coletivo para PETianos(as), tutores(as) e Administração. Será concluído automaticamente após a data escolhida, sem precisar marcar a conclusão.</p>':choices.map(x=>'<label class="assignment-option"><input type="checkbox" data-assign="'+state.assignmentScope+'" value="'+esc(x.key)+'" '+(currentSelection.has(x.key)?"checked":"")+'><span>'+esc(x.name)+'</span></label>').join(""))+
 '<p class="notice-line">'+(state.assignmentScope==="todos"?'Participantes do evento: '+users.length:'Responsáveis individuais: '+state.selectedUsers.size+' · Comissões: '+state.selectedCommissions.size)+'</p></div>';
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
function stageEligibleAssignees(){
 const allowed=new Set([...state.selectedUsers].map(String));
 for(const cid of state.selectedCommissions){
  for(const uid of (committee(cid)?.memberIds||[]))allowed.add(String(uid));
 }
 // Administração e Tutoria são opções de responsabilidade em qualquer
 // combinação de pessoas e comissões, desde que estejam cadastradas.
 for(const u of data.users||[])if(["admin","tutor"].includes(u.role))allowed.add(String(u.id));
 return (data.users||[]).filter(u=>allowed.has(String(u.id))&&["petiano","tutor","admin"].includes(u.role));
}
function stageAssigneeField(selectedOwner=""){
 if(state.assignmentScope==="todos")
  return '<input type="text" class="select stage-assignee-all" data-stage="assignee" value="Todos(as)" aria-label="Responsável pela etapa: Todos(as)" readonly disabled>';
 return '<select class="select" data-stage="assignee"><option value="">'+inheritedAssigneeLabel()+'</option>'+
  stageEligibleAssignees().map(u=>opt(u.id,u.name,selectedOwner)).join("")+'</select>';
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
function stageDateFromRow(row){
 if(!row)return "";
 const native=row.querySelector('[data-stage="day"]');
 const day=row.querySelector('[data-stage-part="day"]');
 const month=row.querySelector('[data-stage-part="month"]');
 const year=row.querySelector('[data-stage-part="year"]');
 if(!day||!month||!year)return native?.value||"";
 const dd=day.value.trim(),mm=month.value.trim(),yy=year.value.trim();
 if(!dd&&!mm)return native?.value||""; // Compatibilidade com o calendário nativo.
 if(!/^\d{1,2}$/.test(dd)||!/^\d{1,2}$/.test(mm)||!/^\d{4}$/.test(yy))return "";
 const iso=yy+"-"+mm.padStart(2,"0")+"-"+dd.padStart(2,"0");
 const date=new Date(iso+"T12:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:"";
}
function syncStageDate(row){
 const picker=row?.querySelector('[data-stage="day"]');if(picker)picker.value=stageDateFromRow(row);
}
const STAGE_LABEL_CHOICES=["Prazo","Correção","Postagem"];
const CUSTOM_STAGE_OPTION="__custom__";
function stageLabelFromRow(row){
 const picker=row?.querySelector('[data-stage="label"]');
 return picker?.value===CUSTOM_STAGE_OPTION?
  (row.querySelector('[data-stage="custom-label"]')?.value||"").trim():
  (picker?.value||"Prazo");
}
function syncCustomStageField(row,focus=false){
 const picker=row?.querySelector('[data-stage="label"]');
 const custom=row?.querySelector('[data-stage="custom-label"]');
 const label=custom?.closest(".stage-custom-label");
 if(!picker||!custom||!label)return;
 const selected=picker.value===CUSTOM_STAGE_OPTION;
 label.hidden=!selected;
 custom.disabled=!selected;
 custom.required=selected;
 if(selected&&focus)custom.focus();
}
function stageRow(stage={},i=0){
 const owners=stage.assigneeIds||[],selectedOwner=owners[0]||"";
 const saved=(stage.dueAt||"").slice(0,10);
 const parts=/^\d{4}-\d{2}-\d{2}$/.test(saved)?saved.split("-"):[];
 const yy=parts[0]||String(new Date().getFullYear()),mm=parts[1]||"",dd=parts[2]||"";
 const label=stage.label||"Prazo",isCustom=!STAGE_LABEL_CHOICES.includes(label);
 const chosen=isCustom?CUSTOM_STAGE_OPTION:label;
 const name= isCustom?label:"";
 return '<div class="register-deadline live-stage" data-stage-id="'+esc(stage.id||crypto.randomUUID())+'"><div class="stage-label-field"><label>Etapa<select class="select" data-stage="label">'+STAGE_LABEL_CHOICES.map(v=>opt(v,v,chosen)).join("")+opt(CUSTOM_STAGE_OPTION,"Personalizar…",chosen)+'</select></label>'+
 '<label class="stage-custom-label" '+(isCustom?'':'hidden')+'>Nome da etapa<input type="text" data-stage="custom-label" maxlength="60" placeholder="Ex.: Revisão de roteiro" value="'+esc(name)+'" '+(isCustom?'required':'disabled')+' autocomplete="off"></label></div>'+
 '<fieldset class="stage-date-fields"><legend>Data</legend><div class="collective-date-parts stage-date-parts">'+
 '<label>Dia<input type="text" data-stage-part="day" inputmode="numeric" maxlength="2" placeholder="DD" autocomplete="off" value="'+esc(dd)+'"></label>'+
 '<label>Mês<input type="text" data-stage-part="month" inputmode="numeric" maxlength="2" placeholder="MM" autocomplete="off" value="'+esc(mm)+'"></label>'+
 '<label>Ano<input type="text" data-stage-part="year" inputmode="numeric" maxlength="4" placeholder="AAAA" autocomplete="off" value="'+esc(yy)+'"></label>'+
 '<button type="button" class="button ghost collective-calendar-button" data-do="stage-pick-date" title="Abrir calendário" aria-label="Abrir calendário da etapa">'+ico("calendar")+'</button></div>'+
 '<input type="date" data-stage="day" class="stage-native-date" tabindex="-1" aria-label="Selecionar data da etapa pelo calendário" value="'+esc(saved)+'"></fieldset>'+
 '<label class="stage-time-field">Horário<input type="time" data-stage="hour" value="'+esc((stage.dueAt||"").slice(11,16)||"23:59")+'"></label>'+
 '<label class="stage-owner-field" data-previous-owner="'+esc(selectedOwner)+'">'+(state.assignmentScope==="todos"?"Responsável":"Responsável (opcional)")+stageAssigneeField(selectedOwner)+'</label>'+
 '<button type="button" class="button ghost stage-remove-button" data-do="remove-stage">'+ico("close")+' Remover</button></div>';
}
function singlePersonDateMode(){return state.assignmentScope==="usuarios"&&state.selectedUsers.size===1&&state.selectedCommissions.size===0;}
function simpleDateMode(){return state.assignmentScope==="todos"||singlePersonDateMode();}
function collectiveEventDate(stage=null){
 // Os campos separados permitem deixar APENAS o ano atual preenchido.
 // <input type=date> não permite um ano sem dia/mês; permanece para o calendário nativo.
 const collective=state.assignmentScope==="todos";
 const label=collective?"Data do evento":"Data da atividade";
 const description=collective?
  "Evento coletivo para Todos(as). Será concluído e arquivado automaticamente ao terminar a data do evento (horário de Sergipe), sem confirmação manual.":
  "Atividade individual para a pessoa selecionada. A conclusão será marcada pela própria pessoa; a chegada da data não conclui a demanda automaticamente.";
 const saved=(stage?.dueAt||"").slice(0,10);
 const parts=/^\d{4}-\d{2}-\d{2}$/.test(saved)?saved.split("-"):[];
 const yy=parts[0]||String(new Date().getFullYear()),mm=parts[1]||"",dd=parts[2]||"";
 return '<div class="collective-event-date"><div class="collective-date-fields" role="group" aria-label="'+label+'">'+
  '<span class="collective-date-label-text">'+label+' <span class="task-form-required" aria-hidden="true">*</span></span>'+
  '<div class="collective-date-parts">'+
   '<label for="collective-date-day">Dia<input id="collective-date-day" type="text" inputmode="numeric" maxlength="2" placeholder="DD" autocomplete="off" value="'+esc(dd)+'" required></label>'+
   '<label for="collective-date-month">Mês<input id="collective-date-month" type="text" inputmode="numeric" maxlength="2" placeholder="MM" autocomplete="off" value="'+esc(mm)+'" required></label>'+
   '<label for="collective-date-year">Ano<input id="collective-date-year" type="text" inputmode="numeric" maxlength="4" placeholder="AAAA" autocomplete="off" value="'+esc(yy)+'" required></label>'+
   '<button type="button" class="button ghost collective-calendar-button" data-do="collective-pick-date" title="Abrir calendário" aria-label="Abrir calendário">'+ico("calendar")+'</button>'+
  '</div>'+
  '<input id="collective-event-day" class="collective-native-date" type="date" tabindex="-1" aria-label="Selecionar data pelo calendário" value="'+esc(saved)+'"></div>'+
  '<p>'+ico("calendar")+' '+description+'</p></div>';
}
function collectiveSelectedDay(){
 const dd=$("#collective-date-day")?.value.trim()||"",
  mm=$("#collective-date-month")?.value.trim()||"",
  yy=$("#collective-date-year")?.value.trim()||"";
 if(!/^\d{1,2}$/.test(dd)||!/^\d{1,2}$/.test(mm)||!/^\d{4}$/.test(yy))return "";
 const iso=yy+"-"+mm.padStart(2,"0")+"-"+dd.padStart(2,"0");
 const time=new Date(iso+"T12:00:00Z");
 return Number.isFinite(time.getTime())&&time.toISOString().slice(0,10)===iso?iso:"";
}
function updateCollectiveDateInputs(date){
 const p=String(date||"").split("-");
 if(p.length!==3)return;
 $("#collective-date-year").value=p[0];
 $("#collective-date-month").value=p[1];
 $("#collective-date-day").value=p[2];
}

function renderDeadlineSettings(stagesList=[]){
 if(simpleDateMode()){
  const collective=state.assignmentScope==="todos";
  const title=collective?"Data do evento":"Data da atividade";
  const help=collective?
   "Informe o dia do evento coletivo. Não é necessário definir Prazo, Correção, Postagem ou responsáveis por etapa.":
   "Para uma única pessoa responsável, basta informar a data da atividade. Não é preciso criar etapas de Prazo, Correção ou Postagem.";
  const saved=(stagesList||[]).find(x=>x.dueAt)||(stagesList||[])[0];
  return '<div class="register-deadlines collective-date-panel"><div class="task-form-deadlines-heading"><span class="task-form-help-icon">'+ico("calendar")+'</span><div><h3>'+title+'</h3><p>'+help+'</p></div></div>'+
   collectiveEventDate(saved)+'</div>';
 }
 return '<div class="register-deadlines"><div class="section-head"><div class="task-form-deadlines-heading"><span class="task-form-help-icon">'+ico("calendar")+'</span><div><h3>Prazos por etapa</h3><p>As etapas são <strong>opcionais</strong>. Você pode salvar a demanda sem prazo ou adicionar etapas como Prazo, Correção e Postagem, ou personalizar o nome de uma etapa.</p></div></div><button class="button ghost" type="button" data-do="add-stage">+ Adicionar etapa</button></div>'+
 '<div id="stage-rows">'+(stagesList||[]).filter(x=>x.label!=="Evento").map(stageRow).join("")+'</div></div>';
}
function refreshDeadlineMode(previousScope=null,previousSingle=null){
 const host=$("#deadline-settings");if(!host)return;
 const hadDateMode=previousScope==="todos"||Boolean(previousSingle);
 const nowDateMode=simpleDateMode();
 const selectedDate=hadDateMode?collectiveSelectedDay():"";
 const currentRows=$$(".live-stage").map(row=>({
   id:row.dataset.stageId,
   label:stageLabelFromRow(row),
   dueAt:stageDateFromRow(row)+
     (stageDateFromRow(row)?"T"+(row.querySelector('[data-stage="hour"]')?.value||"23:59")+":00":""),
   assigneeIds:row.querySelector('select[data-stage="assignee"]')?.value?[row.querySelector('select[data-stage="assignee"]').value]:[]
 }));
 if(!hadDateMode&&nowDateMode){
   // Preserva as etapas do modo de comissões ou múltiplas pessoas.
   state.standardStageDraft=currentRows;
   const oldTask=data.tasks.find(t=>t.id===state.taskFormId);
   const oldIsCollective=oldTask?.assignmentScope==="todos";
   const oldIsSingle=oldTask?.assignmentScope==="usuarios"&&oldTask?.assigneeIds?.length===1&&!(oldTask?.commissionIds||[]).length;
   const savedStage=state.assignmentScope==="todos"&&oldIsCollective?
     (oldTask.deadlines||[]).find(x=>x.label==="Evento"):
     singlePersonDateMode()&&oldIsSingle?(oldTask.deadlines||[]).find(x=>x.dueAt):null;
   // Ao escolher uma pessoa após configurar prazos, utiliza a primeira data já preenchida.
   const draft=savedStage||(singlePersonDateMode()?currentRows.find(x=>x.dueAt):null);
   host.innerHTML=renderDeadlineSettings(draft?[draft]:[]);
   return;
 }
 if(hadDateMode&&!nowDateMode){
   host.innerHTML=renderDeadlineSettings(state.standardStageDraft||[]);
   return;
 }
 if(hadDateMode&&nowDateMode){
   // Manter a data ao alternar entre individual e coletivo, sem autoarquivar o individual.
   host.innerHTML=renderDeadlineSettings(selectedDate?[{dueAt:selectedDate+"T23:59:59"}]:[]);
   return;
 }
 host.innerHTML=renderDeadlineSettings(currentRows);
}

const TASK_FILE_MAX=25*1024*1024,TASK_FILES_MAX=8,TASK_FILES_TOTAL_MAX=8*TASK_FILE_MAX;
const TASK_PHOTO_TARGET=350*1024; // Somente para transformações opcionais; anexos preservam o arquivo original.
const TASK_PHOTO_MIMES=new Set(["image/jpeg","image/png","image/webp"]);
const pendingPhotoUrls=new WeakMap();
function pendingPhotoUrl(file){
 if(!pendingPhotoUrls.has(file))pendingPhotoUrls.set(file,URL.createObjectURL(file));
 return pendingPhotoUrls.get(file);
}
function releasePendingPhoto(file){const url=pendingPhotoUrls.get(file);if(url){URL.revokeObjectURL(url);pendingPhotoUrls.delete(file)}}

async function shrinkPhoto(file,{edge=1440,maxBytes=TASK_PHOTO_TARGET,square=false}={}){
 if(!file||!file.type.startsWith("image/"))throw Error("Escolha somente fotos.");
 if(file.size>25*1024*1024)throw Error("Foto original muito grande: máximo de 25 MB.");
 let bitmap;
 try{bitmap=await createImageBitmap(file)}
 catch{throw Error("Não foi possível abrir essa imagem. Tente JPG ou PNG.");}
 try{
  let dimension=edge,quality=.78;
  for(let attempt=0;attempt<10;attempt++){
   const ratio=Math.min(1,dimension/Math.max(bitmap.width,bitmap.height));
   const width=square?Math.max(1,dimension):Math.max(1,Math.round(bitmap.width*ratio));
   const height=square?Math.max(1,dimension):Math.max(1,Math.round(bitmap.height*ratio));
   const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
   if(square){
    const crop=Math.min(bitmap.width,bitmap.height);
    ctx.drawImage(bitmap,(bitmap.width-crop)/2,(bitmap.height-crop)/2,crop,crop,0,0,width,height);
   }else ctx.drawImage(bitmap,0,0,width,height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
   if(!blob)throw Error("Não foi possível comprimir a foto.");
   if(blob.size<=maxBytes){
    const filename=(file.name.replace(/\.[^/.]+$/,"").slice(0,140)||"foto")+".jpg";
    return new File([blob],filename,{type:"image/jpeg",lastModified:file.lastModified||Date.now()});
   }
   if(quality>.60)quality-=.07;else dimension=Math.max(280,Math.round(dimension*.76));
  }
  throw Error("Não foi possível reduzir a foto. Tente outra imagem.");
 }finally{bitmap.close?.()}
}
const fileSize=n=>n>=1048576?(n/1048576).toFixed(2).replace(".",",")+" MB":Math.max(1,Math.ceil(n/1024))+" KB";
function taskFileList(t,remove=false){
 return (t?.attachments||[]).map(f=>'<div class="task-attachment-item">'+
 (f.mimeType?.startsWith("image/")?'<button type="button" class="task-file-art task-photo-thumb-btn" data-do="task-photo-view" data-id="'+esc(t.id)+'" data-file-id="'+esc(f.id)+'" data-name="'+esc(f.name)+'" title="Ver prévia da foto" aria-label="Ver prévia de '+esc(f.name)+'">🖼️</button>':'<span class="task-file-art">'+ico("folder")+'</span>')+
 '<span class="task-file-info"><strong>'+esc(f.name)+'</strong><small>'+fileSize(f.size)+'</small></span>'+
 (f.mimeType?.startsWith("image/")?'<button type="button" class="button ghost" data-do="task-photo-view" data-id="'+esc(t.id)+'" data-file-id="'+esc(f.id)+'" data-name="'+esc(f.name)+'">Ver foto</button>':"")+
 '<button type="button" class="button ghost" data-do="task-file-download" data-id="'+esc(t.id)+'" data-file-id="'+esc(f.id)+'" data-name="'+esc(f.name)+'">Baixar</button>'+
 (remove?'<button type="button" class="button subtle-danger" data-do="task-file-delete" data-id="'+esc(t.id)+'" data-file-id="'+esc(f.id)+'" data-name="'+esc(f.name)+'">Excluir</button>':"")+
 '</div>').join("");
}
function taskFilePendingList(){
 return state.taskFiles.length?state.taskFiles.map((file,i)=>'<div class="task-attachment-item">'+
 '<button type="button" class="task-file-art task-file-art-preview" data-do="task-photo-preview-local" data-index="'+i+'" aria-label="Pré-visualizar '+esc(file.name)+'" title="Clique para ampliar a foto"><img src="'+esc(pendingPhotoUrl(file))+'" alt=""></button>'+
 '<span class="task-file-info"><strong>'+esc(file.name)+'</strong><small>'+fileSize(file.size)+' · Enviar ao salvar</small></span>'+
 '<button type="button" class="button ghost" data-do="task-photo-preview-local" data-index="'+i+'">Ver prévia</button>'+
 '<button type="button" class="button ghost" data-do="task-file-unselect" data-index="'+i+'">Retirar</button></div>').join(""):
 '<p class="field-hint">Nenhum arquivo selecionado.</p>';
}
function taskFileForm(t){
 if(!canSeeTaskPhotos())return "";
 return '<section class="task-files-section"><h3>'+ico("folder")+' Fotos da demanda</h3>'+
 '<p class="field-hint">Anexe até 8 fotos (JPG, PNG ou WebP, até 25 MB cada). Os arquivos são guardados na qualidade original, sem recorte nem compactação, para baixar e publicar depois. Somente PETianos(as) podem acessar; as fotos não são enviadas por e-mail.</p>'+
 ((t?.attachments||[]).length?'<div class="task-stored-files"><h4>Fotos armazenadas</h4>'+taskFileList(t)+'</div>':"")+
 '<label class="task-file-picker">Selecionar fotos<input id="task-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>'+
 '<div id="task-file-selection">'+taskFilePendingList()+'</div>'+
 '<p class="field-hint task-file-progress" id="task-file-progress" role="status" aria-live="polite" hidden></p></section>';
}
function taskFileDetail(t){
 if(!canSeeTaskPhotos())return "";
 const count=(t.attachments||[]).length;
 return '<section class="card card-pad detail-accent-card task-detail-files"><h2 class="detail-card-heading">'+ico("folder")+' Fotos da demanda <span class="pill soft">'+count+'</span></h2>'+
 (count?taskFileList(t,true):'<p class="field-hint">Ainda não há arquivos armazenados.</p>')+
 (!t.archivedAt?'<p class="field-hint">Para acrescentar arquivos, selecione Editar demanda.</p>':"")+'</section>';
}
async function uploadTaskFile(taskId,file,progress){
 const path="/tasks/"+id(taskId)+"/attachments",meta=await request(path,"POST",{name:file.name,size:file.size,mimeType:file.type||"application/octet-stream"}),base=path+"/"+id(meta.id);
 try{
  for(let i=0;i<meta.chunkCount;i++){
   if((localStorage.getItem(sessionRevisionKey)||"")!==localSessionRevision)throw Error("Sua sessão mudou em outra aba.");
   const chunk=file.slice(i*meta.chunkSize,Math.min(file.size,(i+1)*meta.chunkSize));
   const response=await fetch(API+"/api/v1"+base+"/chunks/"+i,{
    method:"PUT",cache:"no-store",headers:{Authorization:"Bearer "+token,"Content-Type":"application/octet-stream"},
    body:await chunk.arrayBuffer()
   });
   if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||"Falha ao armazenar uma parte do arquivo.");
   progress?.(i+1,meta.chunkCount);
  }
  await request(base+"/complete","POST",{});
 }catch(e){await request(base,"DELETE").catch(()=>{});throw e}
}
async function downloadTaskFile(taskId,fileId,name){
 if((localStorage.getItem(sessionRevisionKey)||"")!==localSessionRevision)throw Error("Sua sessão mudou em outra aba.");
 const response=await fetch(API+"/api/v1/tasks/"+id(taskId)+"/attachments/"+id(fileId)+"/download",{
  headers:{Authorization:"Bearer "+token},cache:"no-store"
 });
 if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||"Download indisponível.");
 const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");
 link.href=url;link.download=name||"arquivo";document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
let personPhotoObjectUrl=null;
function closePersonPhotoPreview(){
 document.getElementById("person-photo-modal")?.remove();
 if(personPhotoObjectUrl){URL.revokeObjectURL(personPhotoObjectUrl);personPhotoObjectUrl=null;}
}
function openPersonPhotoPreview(source,name,ownsObjectUrl=false){
 closePersonPhotoPreview();
 if(!source)return;
 if(ownsObjectUrl)personPhotoObjectUrl=source;
 const dialog=document.createElement("div");
 dialog.id="person-photo-modal";
 dialog.className="person-photo-modal";
 dialog.innerHTML='<div class="person-photo-backdrop" data-do="person-photo-close"></div>'+
  '<section class="person-photo-dialog" role="dialog" aria-modal="true" aria-label="Pré-visualizar foto">'+
  '<header><strong>'+esc(name||"Foto")+'</strong>'+
  '<button type="button" class="button ghost" data-do="person-photo-close" aria-label="Fechar prévia">✕ Fechar</button></header>'+
  '<img alt="'+esc(name||"Foto")+'"></section>';
 dialog.querySelector("img").src=source;
 document.body.append(dialog);
 dialog.querySelector('[data-do="person-photo-close"]:not(.person-photo-backdrop)')?.focus();
}

let taskPhotoObjectUrl=null;
function closeTaskPhoto(){
 const modal=$("#task-photo-modal");modal?.remove();
 if(taskPhotoObjectUrl){URL.revokeObjectURL(taskPhotoObjectUrl);taskPhotoObjectUrl=null}
}
async function viewTaskPhoto(taskId,fileId,name){
 if(!canSeeTaskPhotos())throw Error("Somente PETianos(as) podem visualizar fotos das demandas.");
 if((localStorage.getItem(sessionRevisionKey)||"")!==localSessionRevision)throw Error("Sua sessão foi alterada em outra aba.");
 const response=await fetch(API+"/api/v1/tasks/"+id(taskId)+"/attachments/"+id(fileId)+"/download",{
  cache:"no-store",headers:{Authorization:"Bearer "+token}
 });
 if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||"Não foi possível abrir a foto.");
 closeTaskPhoto();
 taskPhotoObjectUrl=URL.createObjectURL(await response.blob());
 const modal=document.createElement("div");modal.id="task-photo-modal";modal.className="task-photo-modal";
 modal.innerHTML='<div class="task-photo-backdrop" data-do="task-photo-close"></div>'+
  '<section class="task-photo-card" role="dialog" aria-modal="true" aria-label="Visualizar foto da demanda">'+
  '<header><strong>'+esc(name||"Foto da demanda")+'</strong><button type="button" class="button ghost" data-do="task-photo-close">'+ico("close")+' Fechar</button></header>'+
  '<img alt="'+esc(name||"Foto da demanda")+'" class="task-photo-expanded"></section>';
 modal.querySelector("img").src=taskPhotoObjectUrl;document.body.append(modal);
 modal.querySelector('[data-do="task-photo-close"]')?.focus();
}
function renderTaskForm(routeId){
 if(!canWrite())return authRequired();
 let t=null,cid=null;
 if(routeId.startsWith("novo/"))cid=routeId.slice(5);
 else t=data.tasks.find(x=>x.id===routeId);
 if(routeId&&!cid&&!t)return empty("Demanda não encontrada");
 if(state.taskFormId!==routeId){
   state.taskFormId=routeId;
   state.taskFiles=[];
   state.selectedUsers=new Set(t?.assigneeIds||[]);
   state.selectedCommissions=new Set(t?.commissionIds||(cid?[cid]:[]));
   state.standardStageDraft=(t?.deadlines||[]).filter(x=>!["Evento","Atividade"].includes(x.label));
   state.assignmentScope=cid?"comissoes":t?(t.assignmentScope||(
      isEveryoneAssigned(t)?"todos":t.commissionIds?.length&&!t.assigneeIds?.length?"comissoes":"usuarios"
    )):"usuarios";
 }
 return header("Cadastros",t?"Editar demanda":"Registrar demanda","Defina os responsáveis e informe a data da atividade, ou etapas quando necessário.",
 ""+
 (t?'<button type="submit" form="task-form" class="button primary task-form-header-save">'+ico("check")+' Salvar demanda</button>':""))+
 '<section class="card card-pad register-page"><form id="task-form" data-id="'+esc(t?.id||"")+'" class="register-form"><label>Título da demanda *<input name="title" maxlength="180" required value="'+esc(t?.title||"")+'"></label>'+
 '<label class="rich-label">Anotações da comissão<small class="field-hint">Registre ideias, lembretes, combinados e informações importantes para a demanda.</small></label>'+richEditor("description",t?.description||"")+
 '<div id="assignment-container">'+assignmentView()+'</div>'+
 '<fieldset class="task-visibility"><legend>Onde exibir a demanda?</legend><p class="field-hint">Em qualquer opção, a demanda continua disponível em Demandas e nas pendências dos responsáveis. A escolha define apenas sua presença na Visão geral.</p>'+
 '<label class="visibility-choice"><input type="radio" name="overviewVisibility" value="geral" '+(t?.overviewVisible!==false?'checked':"")+'><span><strong>Visão geral, Demandas e comissões</strong><small>Visível na Visão geral, em Demandas e nas comissões vinculadas.</small></span></label>'+
 '<label class="visibility-choice"><input type="radio" name="overviewVisibility" value="comissao" '+(t?.overviewVisible===false?'checked':"")+' '+(state.assignmentScope!=="todos"&&state.selectedCommissions.size?"":"disabled")+'><span><strong>Somente nas comissões</strong><small>Sem card na Visão geral; permanece em Demandas e em Minhas pendências dos integrantes.</small></span></label></fieldset>'+
 '<div id="deadline-settings">'+renderDeadlineSettings(t?(t.deadlines||[]):state.assignmentScope==="todos"?[]:[{label:"Prazo",dueAt:""}])+'</div>'+ 
 '<label class="rich-label">Texto para revisão (opcional)<small class="field-hint">Escreva ou cole aqui o conteúdo da demanda para revisão da tutoria.</small></label>'+
  (t?lastReviewEdit(t):"")+richEditor("captionText",t?.captionText||"")+
 taskFileForm(t)+
 (t?"":'<div class="form-actions"><button type="submit" class="button primary">Salvar demanda</button></div>')+'</form></section>';
}
function historyFor(taskId){return(data.history||[]).filter(x=>x.task_id===taskId)}
function lastReviewEdit(t){
 if(!t)return "";
 const records=historyFor(t.id);
 // O histórico específico do texto tem preferência. Em cadastros antigos,
 // usa-se a última alteração registrada para manter a identificação.
 const change=records.find(h=>/texto|revis|observa|corrig/i.test(String(h.action||"")))||records[0];
 const stamp=change?.created_at||t.updatedAt||t.createdAt;
 if(!stamp)return '<p class="review-last-edit">Última alteração: não registrada</p>';
 const actor=change?.actor_name||nameFor(t.updatedBy)||nameFor(t.createdBy)||"Responsável não identificado";
 const role=change?.actor_role||data.users.find(u=>u.name===actor)?.role||
   data.users.find(u=>u.id===t.updatedBy)?.role||"";
 const when=dt(stamp);
 const dateLabel=when?new Intl.DateTimeFormat("pt-BR",{
  day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",
  timeZone:"America/Maceio"
 }).format(when):textDate(stamp);
 return '<p class="review-last-edit"><span>Última alteração:</span> <strong>'+esc(actor)+'</strong>'+
  (role?' <span class="review-last-edit-role">('+esc(roleLabel(role))+')</span>':"")+
  ' <time>'+esc(dateLabel)+'</time></p>';
}


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
 if(t.assignmentScope==="usuarios"&&(t.assigneeIds||[]).length===1&&!(t.commissionIds||[]).length&&
    ordered.some(x=>x.label==="Atividade")){
   const day=ordered.find(x=>x.label==="Atividade")?.dueAt;
   const responsible=nameFor(t.assigneeIds[0])||"Pessoa responsável";
   return '<section class="card card-pad details-facts detail-accent-card">'+
    '<h2 class="detail-card-heading"><span class="detail-heading-icon" aria-hidden="true">'+ico("calendar")+'</span>Data da atividade</h2>'+
    '<div class="collective-event-detail">'+
      '<span class="collective-event-day">'+ico("calendar")+' <strong>'+textDate(day)+'</strong></span>'+
      '<p>'+ico("user")+' Responsável: '+esc(responsible)+'</p>'+
      '<p>'+ico("check")+' '+(t.archivedAt?"Atividade concluída.":"A pessoa responsável marca a conclusão quando terminar a atividade.")+'</p>'+
    '</div></section>';
 }
 if(isEveryoneAssigned(t)){
   const day=ordered.filter(x=>x.dueAt).map(x=>x.dueAt).sort().at(-1);
   return '<section class="card card-pad details-facts detail-accent-card">'+
    '<h2 class="detail-card-heading"><span class="detail-heading-icon" aria-hidden="true">'+ico("calendar")+'</span>Data do evento</h2>'+
    (day?'<div class="collective-event-detail"><span class="collective-event-day">'+ico("calendar")+' <strong>'+textDate(day)+'</strong></span><p>'+ico("users")+' Todos(as) participam do evento coletivo.</p><p>'+ico("check")+' '+(t.archivedAt?"Evento concluído e arquivado automaticamente.":"A conclusão é automática após o término da data do evento.")+'</p></div>':'<p>Data do evento ainda não definida. Edite a demanda para informar a data e ativar a conclusão automática.</p>')+
    '</section>';
 }

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
// Dois cartões dos detalhes podem ser recolhidos sem perder informação ou alterar o banco.
function collapsibleDetailHeading(title,iconName){
 return '<summary class="detail-panel-summary" aria-label="Minimizar ou expandir '+esc(title)+'">'+
  '<span class="detail-card-heading"><span class="detail-heading-icon" aria-hidden="true">'+ico(iconName)+'</span>'+esc(title)+'</span>'+
  '<span class="detail-panel-toggle" aria-hidden="true"><span class="detail-toggle-expanded">Minimizar</span><span class="detail-toggle-collapsed">Expandir</span>'+
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>';
}
function renderAssignees(t){
 const people=(t.assigneeIds||[]).map(personId=>({id:personId,name:nameFor(personId)||"Responsável vinculado",
   photo:data.users.find(u=>u.id===personId)?.profilePhoto||null}));
 const teams=(t.commissionIds||[]).map(cid=>committee(cid)).filter(Boolean);
 const everyone=isEveryoneAssigned(t);
 const peoplePanel=people.length?'<div class="assignee-group assignee-people-panel">'+
  '<span class="assignee-column-heading">'+ico("user")+' Pessoas</span>'+
  (everyone?'<div class="assignee-everyone">'+ico("users")+' <strong>Todos</strong></div>':
   '<div class="assignee-chips">'+people.map(person=>'<span class="assignee-person">'+
    (person.photo?'<button type="button" class="person-photo-button" data-do="person-photo-open" data-person-id="'+esc(person.id)+'" aria-label="Ampliar foto de '+esc(person.name)+'" title="Clique para ampliar"><img src="'+esc(person.photo)+'" alt=""></button>':"")+
    esc(person.name)+'</span>').join("")+'</div>')+
  '</div>':"";
 const teamsPanel=teams.length?'<div class="assignee-group assignee-commissions-panel">'+
  '<span class="assignee-column-heading">'+ico("users")+' Comissões</span>'+
  teams.map(c=>{
   const members=(c.memberIds||[]).map(nameFor).filter(Boolean);
   return '<div class="assignee-team"><strong>'+ico("users")+' '+esc(c.name)+'</strong>'+
    (members.length?'<small>Integrantes: '+esc(members.slice(0,4).join(", "))+
     (members.length>4?' e mais '+(members.length-4):"")+'</small>':"")+'</div>';
  }).join("")+'</div>':"";
 return '<details class="card card-pad assignee-card detail-accent-card collapsible-detail-card" open>'+
  collapsibleDetailHeading("Responsáveis","users")+
  '<div class="detail-panel-content">'+((people.length||teams.length)?
    '<div class="assignee-columns'+(!(people.length&&teams.length)?' assignee-columns-single':"")+'">'+
    peoplePanel+teamsPanel+'</div>':
    '<p class="assignee-empty">Nenhum responsável vinculado.</p>')+
  '</div></details>';
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
 if(isEveryoneAssigned(t))return '<span class="task-status task-status-pendente detail-status-final" title="Concluído automaticamente após o dia do evento">Evento programado · Conclusão automática</span>';
 return '<label class="detail-status-control detail-status-'+status+'"><span class="detail-status-caption">Status</span>'+
 '<select class="detail-status-select" data-detail-status data-id="'+esc(t.id)+'" aria-label="Status da demanda: '+statusLabel[status]+'">'+
 '<option value="'+status+'" selected>'+statusLabel[status]+'</option>'+
 '<option value="concluir">Concluído</option></select>'+
 '<svg class="detail-status-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></label>';
}
function activitySections(t,readOnly=false){
 const ids=t.commissionIds||[];
 const commissionProgress=ids.length>=2?'<details class="card card-pad detail-accent-card collapsible-detail-card commission-progress-card" open>'+
 collapsibleDetailHeading("Andamento das comissões","users")+
 '<div class="detail-panel-content">'+ids.map(cid=>'<div class="commission-progress-row"><strong>'+esc(committee(cid)?.name||"Comissão")+'</strong>'+
 '<span class="task-status task-status-'+taskStatus(t,cid)+'">'+statusLabel[taskStatus(t,cid)]+'</span></div>').join("")+'</div></details>':"";
 return '<div class="activity-detail-layout">'+
  '<div class="activity-detail-top"><div class="stack detail-left-column">'+deadlineFacts(t)+renderAssignees(t)+commissionProgress+'</div>'+
  '<div class="stack detail-history-column">'+renderHistory(t)+'</div></div>'+taskFileDetail(t)+
  '<section class="card card-pad detail-accent-card detail-review-full">'+
   '<div class="detail-review-heading"><h2 class="detail-card-heading"><span class="detail-heading-icon" aria-hidden="true">'+ico("list")+'</span>Texto para revisão</h2>'+
   '<button type="button" class="button ghost detail-review-copy" data-do="copy-review-text">'+ico("copy")+' Copiar tudo</button></div>'+
   lastReviewEdit(t)+
   '<div class="saved-activity-text">'+safeRich(t.captionText||"Nenhum texto registrado.")+'</div>'+
  '</section></div>';
}
function detailVisualization(){
 return '<div class="detail-visualization">'+visualizationSelect("navigateDemands","todas")+'</div>';
}
function renderDetailReadOnly(){return header("Acesso restrito","Detalhes indisponíveis","O perfil Usuário pode consultar somente a lista de demandas.");}
function renderDetail(taskId,contextCid){
 if(!canWrite())return renderDetailReadOnly();
 if(!me)return authRequired();
 const t=data.tasks.find(t=>t.id===taskId);if(!t)return empty("Demanda não encontrada");
 if(!canWrite())return renderDetailReadOnly(t);
 const status=taskStatus(t,contextCid);
 const actions=(t.archivedAt?"":button("Editar demanda","registrar/"+id(t.id)))+
 detailStatusSelector(t,status)+
 (canDeleteTask(t)?'<button type="button" class="button danger-outline" data-do="delete-task" data-id="'+esc(t.id)+'">'+ico("close")+(t.archivedAt?' Excluir definitivamente':' Excluir')+'</button>':"");
 return '<div class="activity-detail-page">'+header("Atividade",t.title,"",actions)+detailVisualization()+activitySections(t,false)+'</div>';
}

function closeFinishDialog(){
 const layer=$("#finish-dialog");if(layer){layer.hidden=true;layer.innerHTML="";}
}
function openFinishDialog(task){
 const layer=$("#finish-dialog");if(!layer||!task)return;
 if(isEveryoneAssigned(task)){setToast("Eventos coletivos são concluídos automaticamente após a data do evento.");return;}
 const users=(task.assigneeIds||[]).filter(id=>!task.userDone?.[id]);
 const groups=(task.commissionIds||[]).filter(id=>!task.commissionDone?.[id]);
 if(!users.length&&!groups.length){setToast("Todas as participações já foram concluídas.");return;}
 const make=(items,type)=>items.map(key=>'<label class="joint-pick"><input type="checkbox" name="joint-target" value="'+esc(key)+'" data-kind="'+type+'" '+(key===me.id||users.length+groups.length===1?"checked":"")+'><span>'+esc(type==="user"?nameFor(key):committee(key)?.name||"Comissão")+'</span></label>').join("");
 const myGroups=groups.filter(cid=>canCompleteCommission(cid));
 const canFinishSelf=users.includes(me?.id)||myGroups.length>0;
 const moreThanOne=users.length+groups.length>1;
 const choices=moreThanOne?
  '<div class="finish-quick-actions">'+
    (canFinishSelf?'<button class="button ghost" type="button" data-do="finish-select-self" data-id="'+esc(task.id)+'">'+ico("user")+(users.includes(me.id)?" Só minha participação":" Só minha(s) comissão(ões)")+'</button>':"")+

   '</div>':"";
 layer.innerHTML='<div class="finish-backdrop" data-do="finish-close"></div><section class="finish-popup" role="dialog" aria-modal="true" aria-label="Concluir participações">'+
 '<h2>Concluir participações</h2><p>Se houver mais de um responsável, escolha concluir somente a sua participação ou todas as participações. Também é possível selecionar manualmente.</p>'+
 choices+
 '<label class="joint-select-all"><input type="checkbox" id="finish-select-all"><span><strong>Marcar todos</strong><small>Selecionar ou desmarcar todas as participações pendentes</small></span></label>'+
 (users.length?'<h3>Pessoas</h3>'+make(users,"user"):"")+
 (groups.length?'<h3>Comissões</h3>'+make(groups,"commission"):"")+
 '<div class="finish-actions"><button type="button" class="button ghost" data-do="finish-close">Cancelar</button>'+
 '<button type="button" class="button primary" data-do="finish-joint-confirm" data-id="'+esc(task.id)+'">Concluir selecionados</button></div></section>';
 layer.hidden=false;
 syncFinishSelectAll();
 layer.querySelector("input:checked, input")?.focus();
}
function syncFinishSelectAll(){
 const layer=$("#finish-dialog");
 const all=layer?[...layer.querySelectorAll('input[name="joint-target"]')]:[];
 const control=layer?.querySelector("#finish-select-all");
 if(!control)return;
 const count=all.filter(x=>x.checked).length;
 control.checked=all.length>0&&count===all.length;
 control.indeterminate=count>0&&count<all.length;
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
 if(!canWrite())return header("Acesso restrito","Atas de Reunião","Área exclusiva de PETianos(as), Tutoria e Administração.");
 if(!me)return authRequired();
 const items=[...(data.meetings||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const showing=state.meetingView==="recentes"?items.slice(0,5):items;
 return header("Registros","Atas de Reunião","Registros organizados das reuniões da equipe.",canWrite()?button("+ Criar ata","reunioes/nova",true):"")+
 '<section class="card card-pad meeting-list">'+visualizationSelect("meetings",state.meetingView,[["todas","Todas as atas"],["recentes","Recentes"]])+
 (showing.length?showing.map(m=>'<article class="meeting-card"><a class="meeting-card-link" href="'+workspaceHash("reunioes/editar/"+id(m.id))+'"><span class="meeting-card-icon">'+ico("calendar")+'</span><span class="meeting-card-main"><strong>'+esc(m.title)+'</strong><small>'+textDate(m.date)+'</small><span class="meeting-card-preview">'+esc(richPlainText(m.rawNotes||"").slice(0,130))+'</span></span>'+ico("arrow")+'</a>'+
 (canWrite()?'<details class="meeting-menu"><summary title="Opções da ata" aria-label="Opções da ata">⋮</summary><div class="meeting-menu-options">'+button("Editar","reunioes/editar/"+id(m.id))+'<button type="button" class="button subtle-danger" data-do="delete-meeting" data-id="'+esc(m.id)+'">Excluir</button></div></details>':"")+'</article>').join(""):empty("Nenhuma ata registrada","Crie uma ata para registrar os encontros da equipe."))+
 '</section>';
}
function renderMemory(routeId){
 if(!canWrite())return header("Acesso restrito","Atas de Reunião","Área exclusiva de PETianos(as), Tutoria e Administração.");
 if(!routeId)return renderMeetings();
 if(!me)return authRequired();
 const editor=routeId==="nova"||routeId.startsWith("editar/");
 if(editor&&!canWrite())return authRequired();
 const mid=editor&&routeId.startsWith("editar/")?routeId.slice(7):routeId;
 const m=routeId==="nova"?null:data.meetings.find(x=>x.id===mid);
 if(!m&&routeId!=="nova")return empty("Ata não encontrada");
 return header("Atas de Reunião",m?"Editar ata":"Criar ata","")+
 '<section class="card card-pad register-page meeting-editor"><form id="meeting-form" data-id="'+esc(m?.id||"")+'" class="register-form">'+
 '<label>Título da reunião *<input name="title" type="text" required maxlength="180" value="'+esc(m?.title||"")+'" placeholder="Ex.: Reunião ordinária do PET"></label>'+
 '<label>Data *<input name="date" type="date" required value="'+esc(m?.date||dateKey(current))+'"></label>'+
 '<label class="rich-label">Texto da ata</label>'+richEditor("rawNotes",m?.rawNotes||"","Registre os assuntos e encaminhamentos da reunião.")+
 '<div class="form-actions"><button type="submit" class="button primary">Salvar ata</button></div></form></section>';
}

function authRequired(){return header("Acesso","Entre na sua conta","Esta funcionalidade exige autenticação.")+'<section class="card card-pad">'+button("Entrar","login",true)+'</section>'}
function renderLogin(){
 return header("Conta","Entrar","Acesse suas atividades e demandas.")+'<section class="card card-pad live-auth"><form id="login-form" class="register-form"><label>E-mail<input type="text" name="email" required autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="Digite seu e-mail"></label><label>Senha<span class="password-control"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><label class="remember-login-option"><input type="checkbox" name="rememberMe" value="true"><span><strong>Manter-me conectado</strong><small>Continuar conectado neste dispositivo até você sair da conta.</small></span></label><button class="button primary" type="submit">Entrar</button></form><p>'+button("Criar conta","cadastro")+button("Esqueceu sua senha?","esqueci")+'</p></section>';
}
function passwordStrength(password){
 const value=String(password||"");
 if(!value)return {level:-1,label:"Aguardando",hint:"Digite uma senha para avaliar sua força."};
 const normalized=value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const categories=[/[a-z]/.test(value),/[A-Z]/.test(value),/[0-9]/.test(value),/[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
 const distinct=new Set(normalized).size;
 const repeating=/^(.)\1+$/.test(value);
 const common=/^(?:1234(?:567890?)?|12345|123456|1234567|12345678|123456789|0123456789|qwerty(?:123)?|asdf(?:123)?|password(?:123)?|senha(?:123)?|admin(?:123)?|usuario(?:123)?|0000+|1111+)$/i.test(normalized);
 const sequence=/(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|abcd|qwer|asdf)/i.test(normalized);
 let level;
 if(value.length<=5||repeating||common||(/^\d+$/.test(value)&&value.length<12))level=0;
 else if(value.length<8||categories<2||distinct<5||(sequence&&value.length<12))level=1;
 else if(value.length>=12&&categories>=3&&distinct>=8&&!sequence)level=3;
 else level=2;
 const labels=["Muito fraca","Fraca","Razoável","Forte"];
 const hints=[
  "Fácil de adivinhar. Evite sequências como 1234 e senhas conhecidas.",
  "Pode ser descoberta facilmente. Prefira uma senha maior e menos previsível.",
  "Uma boa escolha, mas uma senha mais longa e exclusiva é mais segura.",
  "Boa combinação estimada. Prefira sempre uma senha exclusiva para este site."
 ];
 return {level,label:labels[level],hint:hints[level]};
}
function passwordStrengthMarkup(){
 return '<div class="password-strength" data-password-strength data-level="-1">'+
 '<div class="password-strength-top"><span>Força da senha</span><strong data-strength-label aria-live="polite">Aguardando</strong></div>'+
 '<div class="password-strength-track" role="meter" aria-label="Força da senha" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0" aria-valuetext="Aguardando"><span></span></div>'+
 '<small data-strength-hint>Digite uma senha para avaliar sua força.</small></div>';
}
function refreshPasswordStrength(input){
 const area=input?.closest("label")?.querySelector("[data-password-strength]");
 if(!area)return;
 const result=passwordStrength(input.value),meter=area.querySelector('[role="meter"]');
 area.dataset.level=String(result.level);
 area.querySelector("[data-strength-label]").textContent=result.label;
 area.querySelector("[data-strength-hint]").textContent=result.hint;
 if(meter){
  meter.setAttribute("aria-valuenow",String(result.level+1));
  meter.setAttribute("aria-valuetext",result.label);
 }
}
function renderRegisterAccount(){
 return header("Conta","Criar conta","Usuário, e-mail e senha.")+
 '<section class="card card-pad live-auth"><form id="register-account-form" class="register-form">'+
 '<label>Usuário<input name="name" required minlength="2" maxlength="120" autocomplete="name"></label>'+
 '<label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false"></label>'+
 '<label>Senha<span class="password-control"><input name="password" type="password" required autocomplete="new-password" spellcheck="false"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span>'+
 passwordStrengthMarkup()+'</label>'+
 '<button type="submit" class="button primary">Criar conta</button></form></section>';
}

function renderForgot(){return header("Conta","Esqueceu sua senha?","Enviaremos um link para o e-mail cadastrado.")+'<section class="card card-pad live-auth"><form id="forgot-form" class="register-form"><label>E-mail<input type="email" name="email" required></label><button type="submit" class="button primary">Enviar link</button></form></section>'}
function renderReset(tokenPart){return header("Conta","Redefinir senha","O link é válido por 30 minutos e pode ser usado uma única vez.")+'<section class="card card-pad live-auth"><form id="reset-form" data-token="'+esc(tokenPart)+'" class="register-form"><label>Nova senha<span class="password-control"><input type="password" name="password"  required><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button class="button primary" type="submit">Alterar senha</button></form></section>'}

function renderConfirmEmail(tokenPart){
 const token=String(tokenPart||"");
 const valid=/^[A-Za-z0-9_-]{43}$/.test(token);
 return header("Conta","Confirmar novo e-mail","Conclua a alteração do e-mail de acesso.")+
  '<section class="card card-pad live-auth email-confirm-page"><span class="email-confirm-art">'+ico("mail")+'</span>'+
  '<h2>Confirmação de e-mail</h2>'+
  '<p>'+(valid?"Clique no botão para confirmar que este novo endereço pertence a você. Por segurança, após a alteração você precisará entrar novamente.":"Este link parece incompleto ou inválido. Solicite outro em Meu perfil.")+'</p>'+
  (valid?'<button type="button" class="button primary" data-do="confirm-account-email">Confirmar meu e-mail</button>':'<a href="#/login" class="button primary">Entrar</a>')+
  '</section>';
}
let pwaInstallPrompt=null,pwaInstalled=false;
function isPwaInstalled(){
 return pwaInstalled||Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches)||navigator.standalone===true;
}
// O WebAPK (aplicativo na gaveta do Android) é criado pelo Chrome/Google Play Services.
// Não é possível obrigar o navegador a produzir um WebAPK via JavaScript.
// Orientar a instalação pelo Chrome, sem confundir atalho de página com aplicativo.
function pwaInstallInstructions(){
 const agent=navigator.userAgent||"";
 if(/iPhone|iPad|iPod/i.test(agent))
  return "No iPhone/iPad, abra o PET Gestão no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.";
 if(/Android/i.test(agent))
  return "Para aparecer na lista de aplicativos do Android, abra https://peteducacao.github.io/pet-gestao/ diretamente no Google Chrome (fora do navegador interno de outros aplicativos). Toque em ⋮ → Instalar aplicativo e confirme Instalar. Se aparecer apenas Criar atalho, o Android criará somente um atalho; atualize o Chrome e tente novamente.";
 return "No computador, abra o PET Gestão no Chrome ou Microsoft Edge e use a opção Instalar aplicativo do menu ou da barra de endereços.";
}
function showPwaInstallHelp(message){
 const hint=$("#pet-install-help");
 if(hint){hint.textContent=message;hint.hidden=false;}
}
function renderAppInstall(){
 const installed=isPwaInstalled();
 return '<section class="account-app-install" aria-label="Instalar aplicativo PET Gestão">'+
  '<div class="account-app-install-head"><span class="account-app-install-icon">'+ico("download")+'</span><div>'+
  '<h3>Aplicativo PET Gestão</h3><p>Instale pelo Google Chrome para abrir o PET Gestão com seu próprio ícone. No Android compatível, o aplicativo aparece também na lista de apps. Os dados continuam sincronizados pela internet.</p></div></div>'+
  '<button type="button" class="button primary account-app-install-button" data-do="install-pet-app" '+(installed?'disabled aria-disabled="true"':'')+'>'+
  ico(installed?"check":"download")+(installed?" Aplicativo instalado":" Baixar aplicativo")+'</button>'+
  '<p id="pet-install-help" class="account-app-install-help" role="status" aria-live="polite" hidden></p></section>';
}
async function installPetApp(){
 if(isPwaInstalled()){setToast("O PET Gestão já está aberto como aplicativo.");return;}
 if(pwaInstallPrompt){
  const event=pwaInstallPrompt;pwaInstallPrompt=null;
  try{
   await event.prompt();
   const choice=await event.userChoice;
   if(choice?.outcome==="accepted"){
    showPwaInstallHelp("Instalação solicitada. O Chrome pode precisar concluir a instalação pelo sistema Android. Confira a lista de aplicativos.");
   }else showPwaInstallHelp(pwaInstallInstructions());
  }catch{
   showPwaInstallHelp(pwaInstallInstructions());
  }
  return;
 }
 showPwaInstallHelp(pwaInstallInstructions());
}
function renderAccount(){
 if(!me)return authRequired();
 const myCommissions=(data.committees||[]).filter(c=>(c.memberIds||[]).includes(me.id));
 const commissionCount=myCommissions.length;
 const commissionCountLabel=commissionCount===1?"comissão":"comissões";
 const commissionsHtml='<section class="profile-commissions" aria-label="Minhas comissões: '+commissionCount+' '+commissionCountLabel+'">'+
  '<div class="profile-commissions-heading"><div><span class="profile-section-eyebrow">PARTICIPAÇÃO</span><h3>Minhas comissões</h3></div>'+
  '<div class="profile-commission-counter" aria-live="polite"><strong>'+commissionCount+'</strong><span>'+commissionCountLabel+'</span></div></div>'+
  (myCommissions.length?'<div class="profile-commission-list">'+myCommissions.map(c=>
   '<a class="profile-commission-chip" href="'+workspaceHash("comissoes/"+c.id)+'">'+
    '<span class="profile-commission-avatar">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="">':commissionDefaultArt(c.name))+
    '</span><span>'+esc(c.name)+'</span>'+ico("chevron-right")+'</a>').join("")+'</div>':
   '<p class="field-hint">Você ainda não participa de nenhuma comissão.</p>')+'</section>';

 const pendingEmail=me.pendingEmailChange;
 const emailManagement='<section class="account-email-management"><div class="account-email-top"><div><h3>E-mail de acesso</h3>'+
  '<p>Endereço atual: <strong>'+esc(me.email)+'</strong></p></div>'+
  '<button type="button" class="button ghost" data-do="account-email-toggle" aria-controls="change-email-form" aria-expanded="false">Alterar e-mail</button></div>'+
  (pendingEmail?'<div class="account-email-pending"><strong>Confirmação pendente</strong><p>Enviamos um link para <b>'+esc(pendingEmail.newEmail)+'</b>. O e-mail atual continua ativo até a confirmação. O link expira em 60 minutos após o envio.</p><button type="button" class="button ghost" data-do="account-email-cancel">Cancelar solicitação</button></div>':'')+
  '<form id="change-email-form" class="register-form account-email-form" hidden>'+
  '<p class="field-hint">O novo endereço só será atualizado quando você abrir o link que receber nele.</p>'+
  '<label>Novo e-mail<input type="email" name="newEmail" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="seunovoemail@exemplo.com"></label>'+
  '<label>Senha atual<span class="password-control"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label>'+
  '<button type="submit" class="button primary">Enviar link de confirmação</button></form></section>';
 const profilePhoto='<div class="account-photo-editor">'+
  (me.profilePhoto?'<button type="button" class="account-photo-preview account-photo-preview-clickable" data-do="person-photo-open" data-person-id="'+esc(me.id)+'" aria-label="Ampliar minha foto de perfil" title="Clique para ampliar"><img src="'+esc(me.profilePhoto)+'" alt="Minha foto de perfil"></button>':
    '<div class="account-photo-preview"><span aria-label="Sem foto de perfil">'+esc((me.name||"P").trim().charAt(0).toUpperCase())+'</span></div>')+
  '<div class="account-photo-controls"><label class="button ghost account-photo-choose">Alterar foto'+
  '<input type="file" id="account-photo-input" accept="image/*" aria-label="Escolher foto de perfil"></label>'+
  (me.profilePhoto?'<button type="button" class="button ghost" data-do="account-photo-delete">Remover foto</button>':"")+
  '<small>Foto quadrada, reduzida automaticamente para até 100 KB.</small></div></div>';
 return header("Pessoal","Meu perfil","Seus dados e preferências de acesso.")+
 '<section class="card card-pad live-auth account-profile"><div class="profile-hero">'+
 '<div class="profile-hero-top"><span class="profile-section-eyebrow">IDENTIFICAÇÃO</span><span class="profile-hero-brand">PET EDUCAÇÃO · UFS</span></div>'+
 '<div class="account-profile-info">'+profilePhoto+
 '<div class="profile-identity"><h2>'+esc(me.name)+'</h2><p class="profile-email">'+esc(me.email)+'</p>'+
 '<span class="profile-role-badge">'+ico("user")+' '+esc(me.role==="tutor"?"Tutor(a)":me.role==="petiano"?"PETiano(a)":me.role==="usuario"?"Usuário":"Administração")+'</span></div></div></div>'+
 (me.mustChangePassword?'<p class="status-note">Sua senha é temporária. Altere-a para acessar o sistema.</p>':"")+
 (me.role==="admin"&&!me.adminSession&&!me.mustChangePassword?
 '<section class="account-admin-activation" role="status"><div><strong>Seu cargo Administração está disponível</strong><p>Confirme sua senha para liberar o painel administrativo nesta sessão.</p></div>'+
 '<a href="#/admin/painel" class="button primary">'+ico("settings")+' Ativar Administração</a></section>':"")+
 (["tutor","admin"].includes(me.role)?'<label class="live-toggle"><input type="checkbox" id="account-notify" '+(me.notificationEnabled?"checked":"")+'> Perguntar se desejo notificar os(as) responsáveis por e-mail</label>':"")+
 commissionsHtml+'<div class="profile-settings-heading"><h3>Configurações da conta</h3><p>Gerencie seus dados de acesso e a instalação do aplicativo.</p></div>'+
 '<div class="profile-settings-grid">'+emailManagement+renderAppInstall()+'</div>'+
 '<div class="profile-security-panel"><div><h3>Segurança da conta</h3><p>Atualize sua senha sempre que precisar.</p></div>'+
 '<button class="button ghost" type="button" data-do="change-password-toggle" aria-expanded="false">'+ico("lock")+' Alterar senha</button><form id="change-password-form" class="register-form" hidden><label>Senha atual<span class="password-control"><input type="password" name="password" required><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><label>Nova senha<span class="password-control"><input type="password" name="newPassword" required ><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label><button type="submit" class="button primary">Alterar senha</button></form></div><div class="account-profile-actions"><button class="button ghost account-logout-button" type="button" data-do="logout">'+ico("logout")+'<span>Sair da conta</span></button></div>'+
 '<section class="account-danger-zone"><div><h3>Excluir minha conta</h3><p>Apague definitivamente seu cadastro, senha, sessões e vínculos pessoais. As atividades e atas institucionais serão preservadas, com referências à sua conta anonimizadas. Esta ação não pode ser desfeita.</p></div>'+
 '<button class="button danger-outline" type="button" data-do="account-delete-open">'+ico("close")+' Excluir minha conta</button></section></section>'+
 '<div id="account-delete-dialog" class="account-delete-dialog" role="presentation" hidden>'+
  '<div class="account-delete-backdrop" data-do="account-delete-close"></div>'+
  '<section class="account-delete-card" role="dialog" aria-modal="true" aria-labelledby="account-delete-heading">'+
   '<h2 id="account-delete-heading">Excluir minha conta definitivamente?</h2>'+
   '<p>Seu cadastro e acesso serão apagados. Demandas e atas da equipe permanecem, sem vincular sua identidade. E-mails já enviados não podem ser recolhidos.</p>'+
   '<form id="delete-account-form" class="register-form" autocomplete="off">'+
    '<label>Senha atual<input type="password" name="password" autocomplete="current-password" required placeholder="Digite sua senha"></label>'+
    '<label>Digite <strong>EXCLUIR MINHA CONTA</strong> para confirmar<input type="text" name="confirmation" required spellcheck="false" autocapitalize="characters" placeholder="EXCLUIR MINHA CONTA"></label>'+
    '<div class="account-delete-actions"><button class="button ghost" type="button" data-do="account-delete-close">Cancelar</button>'+
    '<button class="button account-delete-confirm" type="submit">'+ico("close")+' Excluir definitivamente</button></div>'+
   '</form></section></div>';
}
const notificationKinds=[["create","Criação de demanda"],["review","Correção / revisão do texto"],["due_soon","Prazo vencendo"],["event_soon","Evento se aproximando"],["overdue","Prazo vencido"]];
function notificationTemplateFor(kind){
 const fallbacks={
  create:{subject:"PET Gestão — Nova demanda: {demanda}",body:"Olá!\n\n{autor} cadastrou uma nova demanda: {demanda}.\n\nAcesse o PET Gestão para consultar os prazos e os responsáveis.\n\nPET Educação"},
  review:{subject:"PET Gestão — Texto revisado: {demanda}",body:"Olá!\n\n{autor} atualizou o texto para revisão da demanda {demanda}.\n\nAcesse o PET Gestão para consultar as alterações.\n\nPET Educação"},
  due_soon:{subject:"PET Gestão — Prazo vencendo: {demanda}",body:"Olá!\n\nA etapa {etapa} da demanda {demanda} vence em {dias} dia(s), em {prazo}.\n\nConfira a atividade no PET Gestão: {link}\n\nPET Educação"},
  event_soon:{subject:"PET Gestão — Evento se aproximando: {demanda}",body:"Olá!\n\nLembrete: o evento {demanda} acontecerá em {prazo}, daqui a {dias} dia(s).\n\nConfira os detalhes no PET Gestão: {link}\n\nPET Educação"},
  overdue:{subject:"PET Gestão — Prazo vencido: {demanda}",body:"Olá!\n\nO prazo da etapa {etapa} da demanda {demanda} venceu em {prazo}.\n\nConfira a atividade no PET Gestão: {link}\n\nPET Educação"}
 };
 return state.templateDrafts?.[kind]||data.settings.notificationTemplates?.[kind]||
  (["create","review"].includes(kind)?data.settings.notificationTemplate:null)||fallbacks[kind]||fallbacks.create;
}

const templateVariableInfo={
 autor:"Nome de quem cadastrou ou revisou a demanda. Nos avisos de prazo, aparece PET Gestão.",
 acao:"Ação que gerou o e-mail, como cadastrou ou atualizou o texto.",
 demanda:"Título da demanda relacionada à notificação.",
 tipo:"Tipo da mensagem: Nova demanda, Texto para revisão, Prazo vencendo ou Evento se aproximando.",
 etapa:"Nome da etapa ou prazo vinculado à demanda.",
 prazo:"Data e horário do prazo ou data do evento.",
 dias:"Dias configurados para o aviso antecipado. Em Prazo vencido, não corresponde aos dias em atraso.",
 link:"Endereço para abrir a demanda no PET Gestão."
};
const templateVariables={
 create:["autor","acao","demanda","tipo"],review:["autor","acao","demanda","tipo"],
 due_soon:["autor","acao","tipo","demanda","etapa","prazo","dias","link"],
 event_soon:["autor","acao","tipo","demanda","prazo","dias","link"],
 overdue:["autor","acao","tipo","demanda","etapa","prazo","dias","link"]
};
function notificationVariableGuide(kind){
 const keys=templateVariables[kind]||templateVariables.create;
 return '<section class="mail-template-guide" aria-label="Chaves automáticas disponíveis">'+
  '<div class="mail-template-guide-heading"><span class="mail-template-guide-icon">'+ico("info")+'</span><div>'+
  '<h3>Chaves automáticas disponíveis</h3><p>Use estas chaves no assunto ou na mensagem, incluindo { e }. O PET Gestão as substitui automaticamente ao enviar.</p></div></div>'+
  '<div class="mail-template-guide-list">'+keys.map(key=>'<div class="mail-template-guide-item"><code>{'+key+'}</code><span>'+esc(templateVariableInfo[key])+'</span></div>').join("")+'</div>'+
  '<p class="mail-template-guide-example"><strong>Exemplo:</strong> <code>{autor}</code> cadastrou <code>{demanda}</code> → o e-mail mostrará o nome da pessoa e o título da demanda.'+
  (kind==="overdue"?' <strong>Atenção:</strong> <code>{dias}</code> não indica há quantos dias venceu.':'')+'</p></section>';
}
function notificationTemplateFields(kind){
 const config=notificationTemplateFor(kind);
 return '<label>Assunto<input type="text" name="subject" maxlength="200" required value="'+esc(config.subject||"")+'"></label>'+
  '<label class="rich-label">Mensagem</label>'+
  richEditor("message",config.body||"")+notificationVariableGuide(kind);
}
function closeAdminMenu(){
 if(!state.adminMenuOpen)return;
 state.adminMenuOpen=false;
 const sidebar=$(".admin-sidebar"),overlay=$(".admin-screen-overlay");
 sidebar?.classList.remove("open");
 if(overlay){
  overlay.classList.add("closing");
  overlay.disabled=true;
  setTimeout(()=>{if(overlay.isConnected)overlay.remove()},230);
 }
}
function renderAdmin(){
 const adminPart=routeParts().parts;
 if(adminPart.length===1&&["painel","usuarios","comissoes","emails","configuracoes"].includes(adminPart[0]))state.adminTab=adminPart[0];
 if(!isAdmin()&&hasAdminRole(me)&&!me.mustChangePassword)return header("Administração","Ativar painel administrativo","Seu cargo já é Administração. Confirme sua senha para ativar o acesso nesta sessão.")+
  '<section class="card card-pad live-auth admin-activation-panel"><h2>Ativar Administração</h2>'+
  '<p>O cargo foi concedido, mas sua sessão atual foi iniciada antes da promoção. Por segurança, confirme a senha da sua própria conta. Você não precisa trocar de usuário.</p>'+
  '<form id="admin-activation-form" class="register-form"><label>Senha da sua conta<span class="password-control">'+
  '<input type="password" name="password" autocomplete="current-password" required placeholder="Digite sua senha">'+
  '<button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button>'+
  '</span></label><button class="button primary" type="submit">'+ico("settings")+' Ativar e entrar no painel</button></form></section>';
 if(!isAdmin())return header("Sistema","Painel Admin","Acesso exclusivo da Administração.")+
  '<section class="card card-pad live-auth"><p>'+(me?"Seu perfil não possui acesso administrativo.":"Entre com sua conta Admin pela mesma tela de login.")+'</p>'+
  button(me?"Voltar à Visão geral":"Entrar",me?"inicio":"login",true)+'</section>';
  const reminderConfig=data.settings.reminderSettings||{dueSoonEnabled:false,overdueEnabled:false,daysBefore:3,overdueAudience:"pending"};
 const adminPanels='<section class="card card-pad admin-panel" '+(state.adminTab==="usuarios"?"":'hidden')+'><h2>Usuários</h2><p class="field-hint admin-role-guide">É possível ter mais de uma conta Administração. Somente um(a) administrador(a) pode conceder ou remover esse cargo, e o último administrador permanece protegido. Quem receber o cargo deve entrar novamente na conta para ativar o acesso administrativo.</p><p class="field-hint admin-notify-guide"><strong>Sobre as notificações por e-mail:</strong> esta opção define se a pessoa poderá utilizar o envio de avisos por e-mail ao salvar alterações. Quando ativada, a Tutoria ou Administração poderá escolher entre enviar ou não a notificação. Os destinatários são definidos conforme os responsáveis e as comissões da atividade; marcar esta opção não significa que a pessoa receberá todos os avisos por e-mail.</p><div class="live-admin-list" id="admin-users"><p>Carregando usuários...</p></div></section>'+
 '<section class="card card-pad admin-commissions admin-panel" '+(state.adminTab==="comissoes"?"":'hidden')+'><div class="admin-section-heading"><div><h2>Comissões</h2><p>Defina as vagas e organize a ordem de exibição. As alterações só serão aplicadas quando você salvar.</p></div><button type="button" class="button primary admin-save-all-button" data-do="save-all-commissions">'+ico("check")+' Salvar todas as alterações</button></div><div class="admin-commission-list">'+
 data.committees.map((c,i)=>'<div class="admin-commission-item" data-commission-id="'+esc(c.id)+'"><div class="admin-commission-identity"><span class="admin-commission-avatar">'+(c.imageData?'<img src="'+esc(c.imageData)+'" alt="">':commissionDefaultArt(c.name))+'</span><div class="admin-commission-title"><strong>'+esc(c.name)+'</strong><small data-commission-position>Posição '+(i+1)+'</small></div></div><div class="admin-commission-controls"><label class="admin-vacancy-field"><span>Vagas</span><input type="number" min="0" max="999" data-vagas="'+esc(c.id)+'" value="'+esc(c.maxMembers||0)+'" inputmode="numeric"></label><div class="admin-order-controls"><button class="button ghost admin-order-button" title="Subir" aria-label="Subir '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="-1" '+(i===0?"disabled":"")+'>↑</button><button class="button ghost admin-order-button" title="Descer" aria-label="Descer '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="1" '+(i===data.committees.length-1?"disabled":"")+'>↓</button></div></div></div>').join("")+'</div></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Navegação automática das demandas</h2><label class="live-toggle"><input type="checkbox" id="setting-month" '+(data.settings.autoMonth?"checked":"")+'> Atualizar o mês automaticamente</label><label class="live-toggle"><input type="checkbox" id="setting-week" '+(data.settings.autoWeek?"checked":"")+'> Atualizar a semana automaticamente</label><button class="button primary" data-do="save-settings">Salvar configurações</button></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><h2>E-mails manuais e agendados</h2><form id="mail-form" class="register-form"><label>Destinatários<select id="mail-audience" name="audience" class="select">'+[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","Usuários"]].map(([v,l])=>opt(v,l,state.mailAudience)).join("")+'</select></label><div id="mail-recipients"></div><label>Assunto<input name="subject" required maxlength="200"></label><label class="rich-label">Mensagem</label>'+richEditor("message","")+'<div class="mail-schedule-choice"><button type="button" class="button ghost mail-schedule-toggle" data-do="mail-toggle-schedule" aria-pressed="false">'+ico("calendar")+' Agendar envio</button><small>Escolha um horário somente se quiser enviar depois.</small></div><div id="mail-scheduling"></div><div id="mail-attachments"></div><div class="mail-compose-actions"><button class="button ghost" type="button" data-do="mail-preview-manual">Pré-visualizar e-mail</button><button class="button primary" type="submit">Enviar</button></div></form></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Avisos automáticos de prazo e eventos</h2><p class="field-hint">Defina a antecedência dos avisos. A opção de prazo vencendo também envia um lembrete aos participantes de demandas marcadas como Todos(as), usando a data do evento. Cada aviso é enviado uma única vez; demandas arquivadas não recebem alertas. Os avisos iniciam desativados para evitar envios inesperados.</p>'+
 '<div class="deadline-notice-settings"><label class="live-toggle"><input type="checkbox" id="reminder-soon" '+(reminderConfig.dueSoonEnabled?"checked":"")+'> E-mail de prazo vencendo e evento se aproximando</label><label class="deadline-days">Enviar aviso faltando <input type="number" id="reminder-days" min="1" max="30" step="1" value="'+esc(reminderConfig.daysBefore??3)+'"> dia(s) para o prazo</label><label class="live-toggle"><input type="checkbox" id="reminder-overdue" '+(reminderConfig.overdueEnabled?"checked":"")+'> E-mail de prazo vencido</label><label class="deadline-notice-audience">Destinatários do prazo vencido<select class="select" id="reminder-overdue-audience">'+[["pending","Somente participantes pendentes"],["all","Todos(as) que fazem parte da demanda"]].map(([v,label])=>opt(v,label,reminderConfig.overdueAudience||"pending")).join("")+'</select><small>Inclui pessoas designadas e integrantes das comissões vinculadas. Cada endereço recebe um único e-mail por etapa.</small></label><button class="button primary" type="button" data-do="save-reminder-settings">Salvar avisos de prazo</button></div></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Modelos de e-mails automáticos</h2><p class="field-hint">Edite e pré-visualize separadamente as mensagens de prazo vencendo, evento se aproximando e prazo vencido. Cada modelo possui assunto e mensagem próprios.</p>'+
 '<form id="deadline-template-form" class="register-form"><label>Tipo de aviso<select name="kind" id="deadline-template-kind" class="select">'+notificationKinds.filter(([kind])=>["due_soon","event_soon","overdue"].includes(kind)).map(([kind,label])=>opt(kind,label,state.deadlineTemplateKind)).join("")+'</select></label>'+
 '<div id="deadline-template-fields">'+notificationTemplateFields(state.deadlineTemplateKind)+'</div>'+
 '<div class="mail-compose-actions"><button class="button ghost" type="button" data-do="mail-preview-deadline">Pré-visualizar mensagem</button><button class="button primary" type="submit">Salvar modelo automático</button></div></form></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><h2>Modelos de criação e revisão</h2><p class="field-hint">Edite as mensagens de criação e revisão enviadas pela Tutoria. Os modelos de prazo vencendo, evento se aproximando e prazo vencido ficam em Configurações.</p>'+
 '<form id="notification-template-form" class="register-form"><label>Tipo de mensagem<select name="kind" id="notification-template-kind" class="select">'+notificationKinds.filter(([kind])=>["create","review"].includes(kind)).map(([kind,label])=>opt(kind,label,state.templateKind)).join("")+'</select></label>'+
 '<div id="notification-template-fields">'+notificationTemplateFields(state.templateKind)+'</div>'+
 '<div class="mail-compose-actions"><button class="button ghost" type="button" data-do="mail-preview-template">Pré-visualizar mensagem</button><button class="button primary" type="submit">Salvar modelo</button></div></form></section>'+
 '<section class="card card-pad admin-mail-history admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><div class="section-head"><h2>Fila e histórico do Gmail</h2><button class="button primary" type="button" data-do="mail-monitor-open">Acompanhar envios</button></div><div id="mail-history"><p>Carregando status...</p></div><button type="button" class="button ghost" data-do="clear-mail">Limpar registros finalizados</button></section>';
 const tabs=[["painel","Painel","grid"],["usuarios","Usuários","user"],["comissoes","Comissões","users"],["emails","E-mails","mail"],["configuracoes","Configurações","settings"]];
 const nav=tab=>'<a href="#/admin/'+tab[0]+'" class="admin-menu-link '+(state.adminTab===tab[0]?"active":"")+'">'+ico(tab[2])+'<span>'+tab[1]+'</span></a>';
 const mailCount=Array.isArray(state.mailItems)?state.mailItems.length:0;
 const stats=[["Comissões",data.committees.length,"users"],["Usuários",data.users.length,"user"],["E-mails",mailCount,"mail"]];
 const metric=([name,value,iconName])=>'<div class="admin-metric"><span class="admin-metric-icon">'+ico(iconName)+'</span><strong '+(name==="E-mails"?'id="admin-mail-count"':"")+'>'+value+'</strong><span>'+name+'</span></div>';
 const recent=(data.history||[]).filter(x=>!me?.activityClearedAt||x.created_at>me.activityClearedAt).slice(0,4);
 const dashboard=state.adminTab==="painel"?'<div class="admin-metrics">'+stats.map(metric).join("")+'</div>'+
 '<section class="admin-box"><h2>Ações rápidas</h2><div class="admin-shortcuts">'+
 
 '<a href="#/admin/comissoes">'+ico("users")+'<span>Gerenciar comissões</span></a>'+
 '<a href="#/admin/usuarios">'+ico("user")+'<span>Gerenciar usuários</span></a>'+
 '<a href="#/admin/emails">'+ico("mail")+'<span>Enviar e-mail</span></a></div></section>'+
 '<section class="admin-box"><div class="admin-history-head"><h2>Últimas alterações</h2>'+
 (recent.length?'<button type="button" class="button ghost clear-updates-button" data-do="clear-activity">'+ico("trash")+' Limpar tudo</button>':"")+
 '</div>'+(recent.length?recent.map(x=>'<div class="admin-history-row"><span class="admin-history-icon">'+ico("list")+'</span><div><strong>'+esc(x.action||"Alteração")+'</strong><small>'+esc(x.actor_name||"")+'</small></div><time>'+textDate(x.created_at)+'</time></div>').join(""):'<p class="admin-muted">Nenhuma alteração registrada.</p>')+'</section>':"";
 const adminParts=routeParts().parts,tabNames=["painel","usuarios","comissoes","emails","configuracoes"];
 const tabRoute=adminParts.length===1&&tabNames.includes(adminParts[0])?adminParts[0]:null;
 if(tabRoute)state.adminTab=tabRoute;
 const subroute=tabRoute?[]:adminParts,embedded=subroute.length?adminEmbeddedView(subroute):"";
 const headings={painel:"Painel administrativo",usuarios:"Usuários",comissoes:"Comissões",emails:"E-mails",configuracoes:"Configurações"};
 return '<div class="admin-layout">'+
 '<aside class="admin-sidebar '+(state.adminMenuOpen?"open":"")+'" aria-label="Menu administrativo">'+
 '<div class="admin-brand">'+ico("checklist")+'<div><strong>PET Gestão</strong><small>'+esc(me?.name||"Administração")+'</small></div></div>'+
 '<nav class="admin-navigation">'+tabs.map(nav).join("")+'</nav>'+
 '<div class="admin-sidebar-footer"><button type="button" data-do="admin-signout">'+ico("chevron-left")+' Voltar ao PET Gestão</button></div></aside>'+
 (state.adminMenuOpen?'<button type="button" class="admin-screen-overlay" aria-label="Fechar menu" data-do="admin-menu"></button>':"")+
 '<div class="admin-workspace"><div class="admin-toolbar"><button type="button" class="admin-open-menu" data-do="admin-menu" aria-label="Abrir menu administrativo">'+ico("menu")+'</button><div class="admin-toolbar-account">'+ico("user")+'<span><strong>Administração</strong></span></div></div>'+
 '<div class="admin-page">'+(subroute.length?'<div class="admin-embedded-view">'+embedded+'</div>':'<div class="admin-page-kicker">ADMINISTRAÇÃO</div><h1>'+esc(headings[state.adminTab]||headings.painel)+'</h1><p class="admin-page-description">Gerencie demandas, comissões, usuários e envios de e-mails.</p>'+
 dashboard+adminPanels)+'</div></div><div id="mail-monitor-container">'+(state.mailMonitorOpen?renderMailMonitorModal():"")+'</div></div>';
}

let mailPreviewReturnFocus=null;
function closeMailPreview(){
 const layer=$("#mail-preview-dialog");if(!layer)return;
 layer.hidden=true;layer.innerHTML="";
 document.body.classList.remove("mail-preview-open");
 if(mailPreviewReturnFocus?.isConnected)mailPreviewReturnFocus.focus();
 mailPreviewReturnFocus=null;
}
function showMailPreview(mode){
 const form=$(mode==="template"?"#notification-template-form":mode==="deadline-template"?"#deadline-template-form":"#mail-form");
 if(!form)return;
 const f=collectRich(form,userFields(form));
 const title=String(f.subject||"").trim(),message=String(f.message||"");
 if(!title||!message.replace(/<[^>]*>/g,"").trim())return setToast("Preencha o assunto e a mensagem para visualizar.");
 const days=Number($("#reminder-days")?.value||data.settings.reminderSettings?.daysBefore||3);
 const exampleDate=new Intl.DateTimeFormat("pt-BR",{
   timeZone:"America/Maceio",day:"2-digit",month:"2-digit",year:"numeric"
 }).format(new Date(Date.now()+(Number.isFinite(days)?days:3)*86400000));
 const sample={
   autor:"Equipe PET Educação",acao:"registrou uma atualização",demanda:"Exemplo de demanda",
   tipo:"Notificação",etapa:"Prazo",prazo:exampleDate+" às 17:00",
   dias:String(days),link:"https://peteducacao.github.io/pet-gestao/#/atividade/exemplo"
 };
 if(mode!=="manual"){
   if(f.kind==="due_soon"){sample.tipo="Prazo vencendo";sample.acao="avisa que o prazo está vencendo"}
   if(f.kind==="event_soon"){sample.tipo="Evento se aproximando";sample.acao="lembra que o evento está se aproximando";sample.etapa="Evento"}
   if(f.kind==="overdue"){sample.tipo="Prazo vencido";sample.acao="avisa que o prazo venceu"}
   if(f.kind==="create")sample.tipo="Nova demanda";
   if(f.kind==="review")sample.tipo="Texto para revisão";
 }
 const hydrate=(value,escapeValue=false)=>String(value).replace(/\{(autor|acao|demanda|tipo|etapa|prazo|dias|link)\}/g,(_,key)=>escapeValue?esc(sample[key]):sample[key]);
 const subject=mode!=="manual"?hydrate(title):title;
 const html=mode!=="manual"?hydrate(safeRich(message),true):safeRich(message);
 let audience="Responsáveis vinculados à demanda";
 if(mode==="manual"){
   const ids=$('input[name="mail-target"]:checked');
   if(state.mailAudience==="todos")audience="Todos(as) os usuários cadastrados";
   else if(state.mailAudience==="comissoes")audience=ids.length?ids.map(x=>committee(x.value)?.name||"Comissão").join(", "):"Nenhuma comissão selecionada";
   else audience=ids.length?ids.map(x=>nameFor(x.value)||"Pessoa selecionada").join(", "):"Nenhuma pessoa selecionada";
 }
 const layer=$("#mail-preview-dialog");if(!layer)return;
 mailPreviewReturnFocus=document.activeElement;
 layer.innerHTML='<div class="mail-preview-shade" data-do="mail-preview-close"></div>'+
  '<section class="mail-preview-card" role="dialog" aria-modal="true" aria-labelledby="mail-preview-title">'+
  '<div class="mail-preview-heading"><div><h2 id="mail-preview-title">Pré-visualização do e-mail</h2><p>Confira como a mensagem será apresentada antes de salvar ou enviar.</p></div><button type="button" class="button ghost" data-do="mail-preview-close" aria-label="Fechar prévia">Fechar</button></div>'+
  (mode!=="manual"?'<p class="mail-preview-sample-note">Prévia ilustrativa: os campos automáticos aparecem com dados de exemplo, sem disparar nenhum e-mail.</p>':"")+
  '<div class="mail-preview-envelope"><div class="mail-preview-meta"><span>De: <strong>PET Educação</strong></span><span>Para: '+esc(audience)+'</span><span>Assunto: <strong>'+esc(subject)+'</strong></span></div>'+
  '<div class="mail-preview-message">'+html+'</div></div>'+
  '<div class="mail-preview-actions"><button type="button" class="button primary" data-do="mail-preview-close">Voltar à edição</button></div></section>';
 layer.hidden=false;document.body.classList.add("mail-preview-open");
 layer.querySelector(".mail-preview-heading [data-do]")?.focus();
}

function renderMailRecipients(){
 const el=$("#mail-recipients");if(!el)return;
 const list=state.mailAudience==="comissoes"?data.committees:state.mailAudience==="usuarios"?data.users:[];
 el.innerHTML=list.map(x=>'<label class="assignment-option"><input type="checkbox" name="mail-target" value="'+esc(x.id)+'"><span>'+esc(x.name)+'</span></label>').join("");
}
function updateMailScheduleButton(){
 const toggle=$('[data-do="mail-toggle-schedule"]');
 if(toggle){
  toggle.setAttribute("aria-pressed",String(state.mailScheduled));
  toggle.innerHTML=ico(state.mailScheduled?"close":"calendar")+(state.mailScheduled?" Cancelar agendamento":" Agendar envio");
 }
 const submit=$("#mail-form button[type='submit']");
 if(submit)submit.textContent=state.mailScheduled?"Agendar envio":"Enviar";
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
 if(me?.mustChangePassword&&page!=="conta"&&page!=="confirmar-email"){location.hash="#/conta";return}
 let html="";
 if(page==="inicio")html=renderHome();
 else if(page==="demandas")html=renderDemandas();
 else if(page==="cronograma")html=renderDemandas();
 else if(page==="comissoes")html=!parts.length?renderComissoes():parts[0]==="nova"?renderCommitteeEdit(""):parts[0]==="editar"?renderCommitteeEdit(parts.slice(1).join("/")):renderCommittee(parts.join("/"));
 else if(page==="ajuda")html=renderHelp();
 else if(page==="registrar")html=renderTaskForm(parts.join("/"));
 else if(page==="atividade")html=renderDetail(parts[0],parts[1]||"");
 else if(page==="reunioes")html=renderMemory(parts.join("/"));
 else if(page==="minhas-pendencias")html=renderMine();
 else if(page==="login")html=renderLogin();
 else if(page==="cadastro")html=renderRegisterAccount();
 else if(page==="esqueci")html=renderForgot();
 else if(page==="redefinir")html=renderReset(parts[0]||"");
 else if(page==="confirmar-email")html=renderConfirmEmail(parts[0]||"");
 else if(page==="conta")html=renderAccount();
 else if(page==="admin")html=renderAdmin();
 else html=renderHome();
 root.innerHTML=html;
 if(taskFormRoute(location.hash)&&$("#task-form")&&taskFormDraft?.route!==location.hash)
  taskFormDraft={route:location.hash,snapshot:taskDraftSnapshot()};
 else if(!taskFormRoute(location.hash))resetTaskDraft();
 lastStatusSnapshot=statusSnapshot();
 if(page==="admin"&&isAdmin()&&!me?.mustChangePassword&&(!parts.length||(parts.length===1&&["painel","usuarios","comissoes","emails","configuracoes"].includes(parts[0])))){
   if(state.adminTab==="usuarios")loadAdminUsers();
   if(state.adminTab==="emails"){renderMailRecipients();renderMailScheduling();updateMailScheduleButton();loadMailHistory();}
   if(state.adminTab==="painel")loadMailHistory();
 }
}
async function askNotification(participants=null){
 if(!canNotify())return false;
 if(participants&&participants.users.length===1&&participants.users[0]===me.id&&!participants.commissions.length)return false;
 return Boolean(await askConfirm("Deseja avisar os(as) responsáveis sobre esta alteração? Seu próprio e-mail não receberá cópia.",{
  title:"Notificar os(as) responsáveis?",
  cancelLabel:"Salvar sem enviar",
  confirmLabel:"Salvar e enviar"
 }));
}
async function saveAndReload(action,success="Alterações salvas."){
 try{await action();await reload();setToast(success);return true}catch(e){setToast(e.message);return false}
}
function userFields(form){return Object.fromEntries(new FormData(form).entries())}
async function saveTask(form){
 const f=collectRich(form,userFields(form));
 const isCollective=state.assignmentScope==="todos",isSingle=singlePersonDateMode();
 const eventDay=(isCollective||isSingle)?collectiveSelectedDay():"";
 if((isCollective||isSingle)&&!eventDay)return setToast("Informe dia, mês e ano válidos para a data da atividade.");
 const stages=isCollective||isSingle?
  [{id:isCollective?"evento-data":"atividade-data",label:isCollective?"Evento":"Atividade",dueAt:eventDay+"T23:59:59",assigneeIds:[]}]:
  $$(".live-stage").map(row=>{
    const label=stageLabelFromRow(row),
      day=stageDateFromRow(row),
      time=row.querySelector('[data-stage="hour"]')?.value||"23:59",
      person=row.querySelector('[data-stage="assignee"]')?.value||"";
    return {id:row.dataset.stageId,label,dueAt:day?day+"T"+time+":00":"",assigneeIds:person?[person]:[]};
  });
 if(!f.title.trim())return setToast("Informe o título.");
 if(stages.some(x=>!x.label||x.label.length>60))return setToast("Escreva o nome da etapa personalizada (até 60 caracteres).");
 if(stages.some(x=>!x.dueAt))return setToast("Informe a data de todas as etapas inseridas.");
 const users=state.assignmentScope==="todos"?data.users.filter(x=>["petiano","tutor","admin"].includes(x.role)).map(x=>x.id):[...state.selectedUsers],commissions=state.assignmentScope==="todos"?[]:[...state.selectedCommissions];
 if(!users.length&&!commissions.length)return setToast("Selecione ao menos uma pessoa ou comissão para direcionar a demanda.");
 const taskId=form.dataset.id;
 const previous=taskId?data.tasks.find(t=>t.id===taskId):null;
 const overviewVisible=f.overviewVisibility!=="comissao";
 if(!overviewVisible&&!commissions.length)return setToast("Selecione uma comissão para exibir somente nela.");
 const picked=canSeeTaskPhotos()?[...(state.taskFiles||[])]:[];
 const existing=previous?.attachments||[];
 if(picked.some(x=>!x.size||x.size>TASK_FILE_MAX||!TASK_PHOTO_MIMES.has(x.type)))return setToast("Use fotos originais JPG, PNG ou WebP com até 25 MB cada.");
 if(existing.length+picked.length>TASK_FILES_MAX||
    picked.reduce((total,x)=>total+x.size,existing.reduce((total,x)=>total+x.size,0))>TASK_FILES_TOTAL_MAX)
   return setToast("A demanda aceita até 8 fotos de 25 MB cada.");
 const notify=(!previous||safeRich(previous.captionText||"")!==f.captionText)?
  await askNotification({users,commissions}):false;
 const body={title:f.title,description:f.description,captionText:f.captionText,deadlines:stages,assigneeIds:users,commissionIds:commissions,assignmentScope:state.assignmentScope,overviewVisible,notify};
 let savedId=taskId||"";
 try{
   const r=await request(taskId?"/tasks/"+id(taskId):"/tasks",taskId?"PUT":"POST",body);
   savedId=taskId||r.id;
   const failures=[];
   for(let index=0;index<picked.length;index++){
     const file=picked[index],progress=$("#task-file-progress");
     if(progress){progress.hidden=false;progress.textContent="Armazenando "+(index+1)+" de "+picked.length+": "+file.name;}
     try{
       await uploadTaskFile(savedId,file,(part,total)=>{
         if(progress?.isConnected)progress.textContent="Armazenando "+file.name+" · parte "+part+" de "+total;
       });
     }catch(e){failures.push(file.name+" ("+e.message+")");}
   }
   for(const pending of state.taskFiles)releasePendingPhoto(pending);
   state.taskFiles=[];resetTaskDraft();state.taskFormId=null;
   location.hash=workspaceHash("demandas");await reload();
   if(failures.length)showNotice("A demanda foi salva, mas alguns arquivos não puderam ser armazenados: "+failures.join("; ")+". Abra Editar demanda para tentar novamente.",{
     title:"Demanda salva com anexos pendentes",kind:"warning"});
   else setToast(picked.length?"Demanda e "+picked.length+" arquivo(s) salvos.":"Demanda salva com sucesso.");
 }catch(e){setToast(e.message);}

}
async function finishTask(t,cid){
 if(isEveryoneAssigned(t))return setToast("O evento será concluído automaticamente após a data informada.");
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
 const values=collectRich(form,userFields(form));const ok=await saveAndReload(()=>request("/commissions"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{name:values.name,description:values.description,backgroundColor:values.backgroundColor,imageData:values.imageData}),"Comissão salva.");if(ok)location.hash=workspaceHash("comissoes");
}
async function loadAdminUsers(){
 try{
 const {users}=await request("/admin/users"),target=$("#admin-users");if(!target)return;
 state.adminUsers=users;
 target.innerHTML=users.map(u=>'<div class="live-admin-row"><div class="admin-user-identity">'+
 (u.profilePhoto?'<button type="button" class="person-photo-button" data-do="person-photo-open" data-person-id="'+esc(u.id)+'" aria-label="Ampliar foto de '+esc(u.name)+'"><img src="'+esc(u.profilePhoto)+'" alt=""></button>':"")+
 '<span><strong>'+esc(u.name)+'</strong><small>'+esc(u.email)+'</small></span></div><select class="select" data-role="'+esc(u.id)+'">'+[["usuario","Usuário"],["petiano","PETiano(a)"],["tutor","Tutor(a)"],["admin","Administração"]].map(([v,l])=>opt(v,l,u.role)).join("")+'</select><label><input type="checkbox" data-notify="'+esc(u.id)+'" '+(u.notificationEnabled?"checked":"")+'> Permitir envio de notificações por e-mail</label><button class="button ghost small-action" data-do="save-user" data-id="'+esc(u.id)+'">Salvar</button><button class="button ghost small-action" data-do="temp-pass" data-id="'+esc(u.id)+'">Senha temporária</button></div>').join("");
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
  renderMailRecipients();renderMailScheduling();updateMailScheduleButton();
  await loadMailHistory();
  setToast(result.status==="enviado"?"E-mail enviado.":result.status==="agendado"?"E-mail agendado.":"E-mail registrado na fila de envio.");
 }catch(e){setToast("Não foi possível registrar o envio: "+e.message)}
 finally{if(button?.isConnected)button.disabled=false}
}
async function handleClick(e){
 const b=e.target.closest("[data-do]");if(!b||b.disabled)return;
 e.preventDefault();
 const action=b.dataset.do,tid=b.dataset.id;
 if(action==="install-pet-app"){await installPetApp();return}
 if(action==="collective-pick-date"||action==="stage-pick-date"){
   const picker=action==="stage-pick-date"?b.closest(".live-stage")?.querySelector('[data-stage="day"]'):$("#collective-event-day");
   if(!picker)return;
   try{picker.showPicker()}catch{picker.focus();picker.click()}
   return;
 }
 if(action==="clear-activity"){
   if(!me)return;
   if(!await askConfirm("Limpar todas as atualizações exibidas para sua conta? Os históricos das demandas continuarão preservados.",{
     title:"Limpar últimas atualizações?",confirmLabel:"Limpar atualizações",cancelLabel:"Manter atualizações"
   }))return;
   await saveAndReload(()=>request("/activity/clear","POST",{}),"Últimas atualizações limpas.");
   return;
  }
  if(action==="auth-message-close"){closeAuthMessage();return}
 if(action==="notice-confirm"){closeNotice(true);return}
 if(action==="notice-cancel"){closeNotice(false);return}
 if(action==="copy-review-text"){
   const content=b.closest(".detail-review-full")?.querySelector(".saved-activity-text");
   if(!content)return;
   const plain=content.innerText||content.textContent||"";
   try{
    if(navigator.clipboard?.write&&window.ClipboardItem){
     const htmlBlob=new Blob([content.innerHTML],{type:"text/html"});
     const textBlob=new Blob([plain],{type:"text/plain"});
     await navigator.clipboard.write([new ClipboardItem({"text/html":htmlBlob,"text/plain":textBlob})]);
    }else if(navigator.clipboard?.writeText){
     await navigator.clipboard.writeText(plain);
    }else throw new Error("Clipboard indisponível");
    setToast("Texto completo copiado!");
   }catch{
    const field=document.createElement("textarea");
    field.value=plain;field.style.position="fixed";field.style.opacity="0";
    document.body.appendChild(field);field.select();
    const copied=document.execCommand("copy");field.remove();
    setToast(copied?"Texto completo copiado!":"Não foi possível copiar. Selecione o texto manualmente.");
   }
   return;
  }
 if(action==="notice-copy"){
   const field=$("#notice-secret-value");if(!field)return;
   try{await navigator.clipboard.writeText(field.value);b.textContent="Copiado!";}
   catch{field.focus();field.select();b.textContent="Selecione e copie";}
   return;
 }
 if(action==="mail-toggle-schedule"){
  state.mailScheduled=!state.mailScheduled;
  if(state.mailScheduled)state.mailFiles=[];
  renderMailScheduling();updateMailScheduleButton();return;
 }
 if(action==="mail-preview-close"){closeMailPreview();return}
 if(action==="mail-preview-template"){showMailPreview("template");return}
 if(action==="mail-preview-deadline"){showMailPreview("deadline-template");return}
 if(action==="mail-preview-manual"){showMailPreview("manual");return}
 if(action==="save-reminder-settings"){
   const days=Number($("#reminder-days")?.value);
   if(!Number.isInteger(days)||days<1||days>30)return setToast("Informe uma antecedência entre 1 e 30 dias.");
   await saveAndReload(()=>request("/admin/reminder-settings","PUT",{
     dueSoonEnabled:$("#reminder-soon").checked,
     overdueEnabled:$("#reminder-overdue").checked,daysBefore:days,
     overdueAudience:$("#reminder-overdue-audience").value
   },"admin"),"Configurações dos avisos de prazo salvas.");
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
 if(action==="admin-menu"){
   if(state.adminMenuOpen)closeAdminMenu();
   else{state.adminMenuOpen=true;render()}
   return;
  }
 if(action==="mail-monitor-open"){state.mailMonitorOpen=true;render();return}
 if(action==="mail-monitor-close"){state.mailMonitorOpen=false;render();return}
 if(action==="mail-monitor-refresh"){await loadMailHistory();return}
 if(action==="back"){
   if(routeParts().page==="admin"){
     const previous=state.navStack?.at(-2);
     if(previous?.startsWith("#/admin")){state.navStack.pop();state.goingBack=true;location.hash=previous;}
     else location.hash="#/admin/painel";
   }else if(state.navStack?.length>1){state.navStack.pop();state.goingBack=true;location.hash=state.navStack.at(-1)}
   else location.hash="#/inicio";
   return;
 }
 if(action==="mode"){state.mode=b.dataset.value;render();return}
  if(action==="meetings-view"){state.meetingView=b.dataset.value;render();return}
 if(action==="today"){state.year=current.getFullYear();state.month=current.getMonth();state.week=0;render();return}
 if(action==="assignment-scope"){
  const previousScope=state.assignmentScope;
  const previousSingle=singlePersonDateMode();
  if(b.dataset.value==="todos"){state.selectedUsers.clear();state.selectedCommissions.clear()}
  state.assignmentScope=b.dataset.value;
  $("#assignment-container").innerHTML=assignmentView();syncVisibilityOptions();refreshDeadlineMode(previousScope,previousSingle);syncStageAssigneePlaceholder();return;
 }
 if(action==="add-stage"){$("#stage-rows").insertAdjacentHTML("beforeend",stageRow());return}
 if(action==="remove-stage"){b.closest(".live-stage")?.remove();return}
 if(action==="commission-color-toggle"){
   const panel=$("#commission-rgb-panel");if(!panel)return;
   panel.hidden=!panel.hidden;b.setAttribute("aria-expanded",String(!panel.hidden));
   if(!panel.hidden)setCommissionRgbColor($("#commission-form")?.elements.backgroundColor?.value);
   return;
 }
 if(action==="commission-color-preset"){setCommissionRgbColor(b.dataset.color);return}
 if(action==="reset-color"){setCommissionRgbColor("#f7f3ff");return}
 if(action==="commission-image-rotate"){
   if(!commissionImageEditor)return;
   commissionImageEditor.rotation=(commissionImageEditor.rotation+Number(b.dataset.angle)+4)%4;
   commissionImageEditor.offsetX=0;commissionImageEditor.offsetY=0;
   redrawCommissionImage();return;
 }
 if(action==="commission-image-cancel"){closeCommissionImageEditor();return}
 if(action==="commission-image-apply"){await applyCommissionImage(b);return}
 if(action==="commission-preset-gallery"){openCommissionPresetGallery();return}
 if(action==="commission-preset-close"){closeCommissionPresetGallery();return}
 if(action==="commission-preset-select"){await selectCommissionPreset(b.dataset.key);return}
 if(action==="finish-joint-open"){openFinishDialog(data.tasks.find(t=>t.id===tid));return;}
 if(action==="finish-select-self"){
   const task=data.tasks.find(x=>x.id===tid),layer=$("#finish-dialog");if(!task||!layer)return;
   const all=layer.querySelectorAll('input[name="joint-target"]');
   const myPersonal=(task.assigneeIds||[]).includes(me?.id)&&!task.userDone?.[me.id];
   const myCommissions=(task.commissionIds||[]).filter(cid=>canCompleteCommission(cid)&&!task.commissionDone?.[cid]);
   all.forEach(input=>{
     input.checked=
       (myPersonal?input.dataset.kind==="user"&&input.value===me.id:
        input.dataset.kind==="commission"&&myCommissions.includes(input.value));
   });
   syncFinishSelectAll();return;
 }
 if(action==="finish-close"){closeFinishDialog();return;}
 if(action==="finish-joint-confirm"){
   const t=data.tasks.find(x=>x.id===tid),layer=$("#finish-dialog");if(t&&layer)await completeJoint(t,layer);
   return;
 }
 if(action==="finish-mine"){
   const t=data.tasks.find(x=>x.id===tid);if(!t||!isMyPending(t))return;
   const pending=myPendingParts(t),total=Number(pending.personal)+pending.committees.length;
   // Considerar TODOS os vínculos da demanda, não somente os da pessoa logada.
   // Ex.: Admin e Tutor(a) + Finanças -> escolha entre só a sua, todos ou seleção manual.
   if(pendingParticipationCount(t)>1){openFinishDialog(t);return;}
   if(total===1&&pending.personal)await finishTask(t,"");
   else if(total===1)await finishTask(t,pending.committees[0]);
   else openFinishDialog(t);
   return;
  }
  if(action==="finish-personal"){
   const t=data.tasks.find(x=>x.id===tid);
   if(t&&isTaskAssignedToMe(t)&&!isUserDone(t,me.id)){
     if(pendingParticipationCount(t)>1)openFinishDialog(t);else await finishTask(t,"");
   }
   return;
  }
  if(action==="finish-commission"){
   const t=data.tasks.find(x=>x.id===tid),cid=b.dataset.commission||"";
   if(t){
     if(pendingParticipationCount(t)>1)openFinishDialog(t);else await finishTask(t,cid);
   }
   return;
  }
 if(action==="edit-notes"){$("#notes-editor").hidden=false;$("#notes-preview").hidden=true;return}
 if(action==="save-notes"){const content=$("#notes-content").value;
   const target=data.tasks.find(t=>t.id===tid);
   const notify=await askNotification({users:target?.assigneeIds||[],commissions:target?.commissionIds||[]});await saveAndReload(()=>request("/tasks/"+id(tid)+"/notes","PATCH",{captionText:content,notify}),"Observações salvas.");return}
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
 if(action==="archive-selection-open"){
   if(!canWrite())return setToast("Entre como PETiano(a), Tutor(a) ou Administração para excluir demandas concluídas.");
   state.archiveDeleteMode=true;state.archiveSelectedIds.clear();render();return;
 }
 if(action==="archive-selection-cancel"){
   state.archiveDeleteMode=false;state.archiveSelectedIds.clear();render();return;
 }
 if(action==="archive-select-all"){
   if(!canWrite()||!state.archiveDeleteMode)return;
   const visible=$$('[data-archive-select]');
   const allChecked=visible.length>0&&visible.every(x=>x.checked);
   state.archiveSelectedIds=allChecked?new Set():new Set(visible.map(x=>x.value));
   render();return;
 }
 if(action==="archive-delete-selected"){
   if(!canWrite()||!state.archiveDeleteMode)return setToast("É necessário estar conectado como PETiano(a), Tutor(a) ou Administração.");
   const visible=new Set($$('[data-archive-select]').map(x=>x.value));
   const chosen=[...state.archiveSelectedIds].filter(x=>visible.has(x)&&data.tasks.some(t=>t.id===x&&t.archivedAt));
   if(!chosen.length)return setToast("Selecione pelo menos uma demanda concluída.");
   const confirmation=chosen.length===1?'Excluir definitivamente a demanda selecionada?':
     'Excluir definitivamente as '+chosen.length+' demandas selecionadas?';
   if(!await askConfirm(confirmation+' Os prazos, participações e históricos dessas demandas serão apagados sem possibilidade de recuperação.',{
     title:"Confirmar exclusão definitiva",danger:true
   }))return;
   b.disabled=true;
   try{
     const response=await request("/tasks/bulk-delete","POST",{taskIds:chosen});
     state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
     await reload();
     setToast((response.deletedCount||chosen.length)+" demanda(s) excluída(s) definitivamente.");
   }catch(error){setToast(error.message)}finally{if(b.isConnected)b.disabled=false}
   return;
 }
 if(action==="delete-task"){
   const task=data.tasks.find(x=>x.id===tid);
   if(!canDeleteTask(task))return setToast("Você não tem permissão para excluir esta demanda.");
   if(!await askConfirm('Excluir definitivamente a demanda "'+task.title+'"? Esta ação apagará a demanda, os prazos, as participações e o histórico, sem possibilidade de recuperação.',{danger:true,title:"Excluir demanda?"}))return;
   const ok=await saveAndReload(()=>request("/tasks/"+id(tid),"DELETE"),"Demanda excluída definitivamente.");
   if(ok)location.hash=workspaceHash("demandas");
   return;
 }
 if(action==="admin-signout"){
  // A transição é visual: continua na MESMA sessão, sem nova autenticação.
  state.adminTab="painel";closeAdminMenu();
  const modal=$("#connecting-popup");
  modal?.classList.add("returning-to-gestao");
  const hint=modal?.querySelector(".connecting-hint");
  if(hint)hint.textContent="Preparando sua área de trabalho";
  setConnecting(true,"Voltando ao PET Gestão...");
  setTimeout(()=>{location.hash="#/inicio"},480);
  return;
 }
 if(action==="account-delete-open"){
   const layer=$("#account-delete-dialog");if(!layer)return;
   layer.hidden=false;
   layer.querySelector('input[name="password"]')?.focus();return;
 }
 if(action==="account-delete-close"){
   const layer=$("#account-delete-dialog");if(layer)layer.hidden=true;return;
 }
 if(action==="logout"){
  if(!await askConfirm("Deseja realmente sair da sua conta neste navegador?",{
   title:"Sair da conta?",
   cancelLabel:"Continuar conectado",
   confirmLabel:"Sim, sair da conta"
  }))return;
  try{await request("/auth/logout","POST",{},"user")}catch{}
  token="";me=null;regularMe=null;
  forgetSessionToken(tokenKey);forgetSessionToken(adminTokenKey);publishSessionChange();
  await reload();location.hash="#/inicio";return;
 }
 if(action==="move-commission"){
   if(!isAdmin())return;
   const item=b.closest(".admin-commission-item"),list=item?.parentElement;
   const direction=Number(b.dataset.direction);
   if(!list||!item||![1,-1].includes(direction))return;
   const neighbor=direction<0?item.previousElementSibling:item.nextElementSibling;
   if(!neighbor)return;
   if(direction<0)list.insertBefore(item,neighbor);
   else list.insertBefore(neighbor,item);
   [...list.children].forEach((row,i)=>{
     const label=row.querySelector("[data-commission-position]");
     if(label)label.textContent="Posição "+(i+1);
     const up=row.querySelector('[data-direction="-1"]'),down=row.querySelector('[data-direction="1"]');
     if(up)up.disabled=i===0;
     if(down)down.disabled=i===list.children.length-1;
   });
   return;
 }
 if(action==="save-all-commissions"){
   if(!isAdmin())return;
   const rows=[...document.querySelectorAll(".admin-commission-list .admin-commission-item")];
   if(!rows.length)return setToast("Nenhuma comissão disponível para salvar.");
   const commissions=[];
   for(const row of rows){
     const input=row.querySelector("[data-vagas]");
     const maxMembers=Number(input?.value);
     if(!input||String(input.value).trim()===""||!Number.isInteger(maxMembers)||maxMembers<0||maxMembers>999){
       if(input)input.focus();
       return setToast("Confira as vagas: informe um número inteiro entre 0 e 999.");
     }
     commissions.push({id:row.dataset.commissionId,maxMembers});
   }
   await saveAndReload(()=>request("/admin/commissions-batch","PUT",{commissions},"admin"),
     "Todas as alterações das comissões foram salvas.");
   return;
 }
 if(action==="save-settings"){await saveAndReload(()=>request("/admin/settings","PUT",{autoMonth:$("#setting-month").checked,autoWeek:$("#setting-week").checked}),"Preferências atualizadas.");return}
 if(action==="save-user"){
   const role=$('[data-role="'+CSS.escape(tid)+'"]').value,notificationEnabled=$('[data-notify="'+CSS.escape(tid)+'"]').checked;
   const person=(state.adminUsers||[]).find(u=>u.id===tid);
   if(person&&person.role!==role&&(person.role==="admin"||role==="admin")){
     const granting=role==="admin";
     const confirmed=await askConfirm(
       granting?"Conceder acesso completo à Administração para "+person.name+"? A pessoa deverá entrar novamente para ativar esse acesso.":
       "Remover o acesso administrativo de "+person.name+"? O último administrador não pode ser rebaixado.",
       {title:granting?"Conceder cargo Administração?":"Remover cargo Administração?",
        confirmLabel:granting?"Conceder acesso":"Remover acesso",cancelLabel:"Cancelar",danger:!granting});
     if(!confirmed)return;
   }
   await saveAndReload(()=>request("/admin/users/"+id(tid),"PATCH",{role,notificationEnabled}),
     role==="admin"&&person?.role!=="admin"?"Cargo Administração concedido. A pessoa precisa entrar novamente.":"Perfil atualizado.");
   return;
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
   const editor=b.closest(".rich-editor")?.querySelector("[data-rich-input]");
   if(editor)applyRichFormat(editor,b.dataset.format);
   return;
 }

 if(action==="account-email-toggle"){
   const form=$("#change-email-form");
   if(form){form.hidden=!form.hidden;b.setAttribute("aria-expanded",String(!form.hidden));if(!form.hidden)form.elements.newEmail?.focus();}
   return;
 }
 if(action==="account-email-cancel"){
   if(!await askConfirm("Deseja cancelar a solicitação de alteração de e-mail? O endereço atual permanecerá o mesmo.",{title:"Cancelar troca de e-mail?",confirmLabel:"Cancelar solicitação",cancelLabel:"Voltar"}))return;
   await saveAndReload(()=>request("/account/email-change","DELETE",{}),"Solicitação cancelada. O e-mail atual continua ativo.");
   return;
 }
 if(action==="confirm-account-email"){
   const part=routeParts().parts[0]||"";
   if(!/^[A-Za-z0-9_-]{43}$/.test(part))return showNotice("O link de confirmação está incompleto.",{kind:"warning"});
   const submit=b;b.disabled=true;
   try{
     const response=await request("/auth/confirm-email-change","POST",{token:part},"guest");
     token="";me=null;regularMe=null;forgetSessionToken(tokenKey);forgetSessionToken(adminTokenKey);publishSessionChange();
     location.hash="#/login";
     await reload();
     showNotice("Seu e-mail foi atualizado para "+response.newEmail+". Entre novamente usando o novo endereço.",{title:"E-mail confirmado!",kind:"success"});
   }catch(err){showNotice(err.message,{title:"Não foi possível confirmar",kind:"warning"});}
   finally{if(submit.isConnected)submit.disabled=false;}
   return;
 }
 if(action==="change-password-toggle"){
   const form=$("#change-password-form");
   if(form){form.hidden=!form.hidden;b.setAttribute("aria-expanded",String(!form.hidden));}
   return;
 }
 if(action==="person-photo-open"){
   const person=[...(state.adminUsers||[]),...data.users,me].find(u=>u?.id===b.dataset.personId);
   if(person?.profilePhoto)openPersonPhotoPreview(person.profilePhoto,person.name||"Foto de perfil");
   return;
 }
 if(action==="person-photo-close"){closePersonPhotoPreview();return}
 if(action==="account-photo-delete"){
   if(!await askConfirm("Remover sua foto de perfil?",{title:"Remover foto?"}))return;
   await saveAndReload(()=>request("/account/photo","DELETE"),"Foto de perfil removida.");
   return;
 }
 if(action==="task-file-unselect"){
   const [removed]=state.taskFiles.splice(Number(b.dataset.index),1);
   if(removed)releasePendingPhoto(removed);
   const host=$("#task-file-selection");if(host)host.innerHTML=taskFilePendingList();
   return;
 }
 if(action==="task-photo-preview-local"){
   const file=state.taskFiles[Number(b.dataset.index)];
   if(file)openPersonPhotoPreview(URL.createObjectURL(file),file.name,true);
   return;
 }
 if(action==="task-photo-view"){
   try{await viewTaskPhoto(tid,b.dataset.fileId,b.dataset.name)}
   catch(e){setToast(e.message)}
   return;
 }
 if(action==="task-photo-close"){closeTaskPhoto();return;}
 if(action==="task-file-download"){
   try{await downloadTaskFile(tid,b.dataset.fileId,b.dataset.name);}
   catch(e){setToast(e.message)}
   return;
 }
 if(action==="task-file-delete"){
   if(!await askConfirm("Excluir o arquivo "+b.dataset.name+" desta demanda? Ele não poderá ser recuperado.",{
      title:"Excluir anexo?",danger:true
   }))return;
   await saveAndReload(()=>request("/tasks/"+id(tid)+"/attachments/"+id(b.dataset.fileId),"DELETE"),"Anexo excluído.");
   return;
 }
 if(action==="remove-mail-file"){state.mailFiles.splice(Number(b.dataset.index),1);renderMailScheduling();return}
}
async function handleSubmit(e){
 const form=e.target;if(!form.id)return;e.preventDefault();
 const isLogin=form.id==="login-form";
 if(isLogin)setConnecting(true,"Conectando ao PET Gestão...");
 try{
 if(form.id==="admin-activation-form"){
   // A promoção NÃO eleva automaticamente sessões antigas. A senha é exigida novamente.
   const rememberMe=Boolean(localStorage.getItem(tokenKey));
   const password=userFields(form).password;
   const activated=await request("/auth/login","POST",{email:me.email,password,rememberMe,browserId},"guest");
   if(activated.user?.role!=="admin"||activated.user?.adminSession!==true)
     return setToast("Seu acesso administrativo ainda não está ativo. Solicite a confirmação do cargo.");
   token=activated.token;
   saveSessionToken(tokenKey,token,rememberMe);publishSessionChange();forgetSessionToken(adminTokenKey);
   await reload();
   location.hash="#/admin/painel";
   setToast("Administração ativada com segurança.");return;
 }
 if(form.id==="login-form"){
   const f=userFields(form),rememberMe=form.elements.rememberMe?.checked===true;
   const r=await request("/auth/login","POST",{...f,rememberMe,browserId},"guest");
   token=r.token;saveSessionToken(tokenKey,token,rememberMe);publishSessionChange();
   forgetSessionToken(adminTokenKey);
   const destination=r.user.mustChangePassword?"#/conta":"#/inicio";
   state.authTransition=true;
   location.hash=destination;
   try{await reload();}finally{state.authTransition=false;}
   setToast("Acesso autorizado.");return;
 }
 if(form.id==="register-account-form"){
   const fields=userFields(form);
   fields.email=String(fields.email||"").trim().toLowerCase();
   const strength=passwordStrength(fields.password);
   if(strength.level<=1){
     const proceed=await askConfirm("Esta senha foi avaliada como "+strength.label.toLowerCase()+". Ela pode ser descoberta facilmente e colocar sua conta em risco. Deseja continuar com essa senha?",{
       title:"Senha fraca",kind:"warning",cancelLabel:"Escolher outra senha",confirmLabel:"Continuar mesmo assim"
     });
     if(!proceed)return;
   }
   await request("/auth/register","POST",fields,"guest");
   location.hash="#/login";setToast("Conta criada. Faça login.");return;
 }
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

 if(form.id==="change-email-form"){
   const fields=userFields(form);
   fields.newEmail=String(fields.newEmail||"").trim().toLowerCase();
   const submit=form.querySelector('button[type="submit"]');
   if(submit?.disabled)return;
   if(submit)submit.disabled=true;
   try{
     const result=await request("/account/email-change","POST",fields);
     await reload();
     showNotice(result.message,{title:"Confirme seu novo e-mail",kind:"success"});
   }finally{if(submit?.isConnected)submit.disabled=false;}
   return;
 }
 if(form.id==="change-password-form"){await request("/auth/change-password","POST",userFields(form));token="";forgetSessionToken(tokenKey);publishSessionChange();await reload();location.hash="#/login";setToast("Senha atualizada. Entre novamente.");return}
 if(form.id==="delete-account-form"){
   const fields=userFields(form);
   if(String(fields.confirmation||"").trim()!=="EXCLUIR MINHA CONTA")
     return setToast("Digite exatamente EXCLUIR MINHA CONTA para confirmar.");
   if(!await askConfirm("Sua conta e suas credenciais serão excluídas definitivamente. As demandas e atas permanecerão no PET Gestão, com referências à sua identidade anonimizadas. Tem certeza?",{title:"Exclusão definitiva da conta",danger:true}))return;
   const submit=form.querySelector('button[type="submit"]');
   if(submit)submit.disabled=true;
   try{
     await request("/account","DELETE",{password:fields.password,confirmation:fields.confirmation},token?"user":"admin");
     token="";me=null;regularMe=null;
     forgetSessionToken(tokenKey);forgetSessionToken(adminTokenKey);publishSessionChange();
     location.hash="#/login";
     await reload();
     setToast("Sua conta foi excluída definitivamente.");
   }finally{if(submit?.isConnected)submit.disabled=false}
   return;
 }
 if(form.id==="task-form"){await saveTask(form);return}
 if(form.id==="commission-form"){await saveCommission(form);return}
 if(form.id==="meeting-form"){const f=collectRich(form,userFields(form));const ok=await saveAndReload(()=>request("/meetings"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{title:f.title,date:f.date,rawNotes:f.rawNotes}),"Ata salva.");if(ok)location.hash=workspaceHash("reunioes");return}
 if(form.id==="notification-template-form"||form.id==="deadline-template-form"){
   const f=collectRich(form,userFields(form));
   if(!String(f.message||"").replace(/<[^>]*>/g,"").trim())return setToast("Escreva o modelo da mensagem.");
   const ok=await saveAndReload(()=>request("/admin/notification-template","PUT",{kind:f.kind,subject:f.subject,message:f.message},"admin"),"Modelo de notificação salvo.");
   if(ok)delete state.templateDrafts[f.kind];
   return;
 }
 if(form.id==="mail-form"){await sendMail(form);return}
 }catch(err){state.authTransition=false;setToast(err.message,/E-mail já cadastrado/i.test(err.message)?"warning":"auto")}
 finally{if(isLogin)setConnecting(false)}
}
async function handleChange(e){
 const t=e.target;if(!t)return;
 if(t.matches?.("[data-archive-select]")){
   if(!canWrite()||!state.archiveDeleteMode)return;
   if(t.checked)state.archiveSelectedIds.add(t.value);
   else state.archiveSelectedIds.delete(t.value);
   render();return;
 }
 if(t.dataset.stage==="day"&&t.closest(".live-stage")){
   if(t.value){
     const row=t.closest(".live-stage"),parts=t.value.split("-");
     const year=row.querySelector('[data-stage-part="year"]'),month=row.querySelector('[data-stage-part="month"]'),day=row.querySelector('[data-stage-part="day"]');
     if(year)year.value=parts[0];if(month)month.value=parts[1];if(day)day.value=parts[2];
   }
   return;
 }
 if(t.hasAttribute("data-stage-part")){syncStageDate(t.closest(".live-stage"));return;}
 if(t.id==="collective-event-day"&&t.value){updateCollectiveDateInputs(t.value);return;}
 if(["collective-date-day","collective-date-month","collective-date-year"].includes(t.id)){
   const native=$("#collective-event-day");
   if(native)native.value=collectiveSelectedDay();
   return;
 }
 if(t.id==="finish-select-all"){
   document.querySelectorAll('#finish-dialog input[name="joint-target"]').forEach(input=>{input.checked=t.checked});
   syncFinishSelectAll();return;
 }
 if(t.name==="joint-target"){syncFinishSelectAll();return;}
 // A etapa de Correção não deve atribuir tutor automaticamente sem confirmação explícita.
 if(t.dataset.stage==="label"){syncCustomStageField(t.closest(".live-stage"),true);return;}
 if(t.dataset.assign){
   const previousScope=state.assignmentScope,previousSingle=singlePersonDateMode();
   const set=t.dataset.assign==="comissoes"?state.selectedCommissions:state.selectedUsers;
   if(t.checked)set.add(t.value);else set.delete(t.value);
   const el=$("#assignment-container");if(el)el.innerHTML=assignmentView();
   syncVisibilityOptions();refreshDeadlineMode(previousScope,previousSingle);syncStageAssigneePlaceholder();return;
 }
 if(t.matches?.("[data-detail-status]")){
   const task=data.tasks.find(x=>x.id===t.dataset.id);
   const choice=t.value;
   if(task)t.value=taskStatus(task);
   if(choice==="concluir"&&task&&!task.archivedAt)openFinishDialog(task);
   return;
  }
 if(t.dataset.filter==="navigateDemands"){
   state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
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
   state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
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
   const editor=t.closest(".rich-editor")?.querySelector("[data-rich-input]");
   if(editor&&applyRichFormat(editor,"foreColor",t.value)){
     const symbol=t.closest(".rich-color-label")?.querySelector(".rich-color-symbol");
     if(symbol)symbol.style.setProperty("--selected-text-color",t.value);
   }
   return;
 }
 if(t.id==="notification-template-kind"||t.id==="deadline-template-kind"){
   const deadline=t.id==="deadline-template-kind";
   const form=t.closest(deadline?"#deadline-template-form":"#notification-template-form");
   if(form){
     const previous=deadline?state.deadlineTemplateKind:state.templateKind;
     state.templateDrafts[previous]={subject:form.elements.subject.value,body:safeRich(form.querySelector('[data-rich-input="message"]')?.innerHTML||"")};
     if(deadline)state.deadlineTemplateKind=t.value;
     else state.templateKind=t.value;
     const fields=form.querySelector(deadline?"#deadline-template-fields":"#notification-template-fields");
     if(fields)fields.innerHTML=notificationTemplateFields(t.value);
   }
   return;
  }
  if(t.id==="account-notify"){await saveAndReload(()=>request("/account","PATCH",{notificationEnabled:t.checked}),"Preferência de notificações salva.");return}
 if(t.id==="mail-audience"){state.mailAudience=t.value;renderMailRecipients();return}
 if(t.id==="account-photo-input"){
   const original=t.files?.[0];t.value="";
   if(!original)return;
   try{
     const optimized=await shrinkPhoto(original,{edge:320,maxBytes:100*1024,square:true});
     const photo=await new Promise((resolve,reject)=>{
       const reader=new FileReader();
       reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("Não foi possível ler a foto."));
       reader.readAsDataURL(optimized);
     });
     await saveAndReload(()=>request("/account/photo","PUT",{photo}),"Foto de perfil atualizada.");
   }catch(e){setToast(e.message)}
   return;
 }
 if(t.id==="task-file-input"){
   if(!canSeeTaskPhotos())return setToast("Somente PETianos(as) podem anexar fotos às demandas.");
   const images=Array.from(t.files||[]);t.value="";
   const saved=data.tasks.find(x=>x.id===state.taskFormId)?.attachments||[];
   for(const image of images){
     if(saved.length+state.taskFiles.length>=TASK_FILES_MAX){setToast("Limite de 8 fotos por demanda.");break}
     try{
       if(!TASK_PHOTO_MIMES.has(image.type)||!(/\.(jpe?g|png|webp)$/i.test(image.name)))throw Error("Use JPG, PNG ou WebP.");
       if(!image.size||image.size>TASK_FILE_MAX)throw Error("A foto original deve ter até 25 MB.");
       const total=[...saved,...state.taskFiles].reduce((n,f)=>n+(f.size||0),0);
       if(total+image.size>TASK_FILES_TOTAL_MAX){setToast("Limite de 8 fotos de até 25 MB por demanda.");break}
       if(state.taskFiles.some(f=>f.name===image.name&&f.size===image.size&&f.lastModified===image.lastModified))continue;
       state.taskFiles.push(image);
     }catch(e){setToast(image.name+": "+e.message)}
   }
   const host=$("#task-file-selection");if(host)host.innerHTML=taskFilePendingList();
   return;
 }
 if(t.id==="mail-file-input"){for(const file of t.files){if(file.size>10*1024*1024){setToast("O arquivo "+file.name+" excede 10 MB.");continue}state.mailFiles.push(file)}renderMailScheduling();return}
 if(t.id==="commission-upload"){
   const file=t.files?.[0];t.value="";if(!file)return;
   try{await openCommissionImageEditor(file)}catch(err){setToast(err.message)}return;
 }
}
function onNavigation(){
 closeTaskPhoto();closeCommissionImageEditor();
 const wasAdmin=lastHash.startsWith("#/admin"),nowAdmin=location.hash.startsWith("#/admin");
 if(lastHash!==location.hash)state.adminMenuOpen=false;
 if(lastHash!==location.hash){if(!state.goingBack)state.navStack.push(location.hash);else state.goingBack=false;state.previousRoute=lastHash;lastHash=location.hash}
 if(state.authTransition){window.scrollTo({top:0});return}
 if(wasAdmin!==nowAdmin){
   state.adminMenuOpen=false;
   if(nowAdmin)setConnecting(true,"Carregando painel administrativo...");
   reload().finally(()=>setConnecting(false));
  }else render();
 window.scrollTo({top:0});
}
let hasStarted=false;
function syncBrowserSession(){
 const latest=localStorage.getItem(sessionRevisionKey)||"";
 if(latest===localSessionRevision)return;
 localSessionRevision=latest;
 sessionStorage.removeItem(tokenKey);
 token=readSessionToken(tokenKey);
 me=null;regularMe=null;resetTaskDraft();
 state.adminMenuOpen=false;state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
 location.hash="#/inicio";
 reload();
}
function start(){
 if(hasStarted)return;
 hasStarted=true;
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Não foi possível ativar a instalação do aplicativo:",err));
 window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();pwaInstallPrompt=event;});
 window.addEventListener("appinstalled",()=>{
   pwaInstalled=true;pwaInstallPrompt=null;
    const help=$("#pet-install-help");
    if(help){help.hidden=false;help.textContent="Aplicativo instalado. Ele pode aparecer na lista de aplicativos do Android.";}
   const btn=$('[data-do="install-pet-app"]');
   if(btn){btn.disabled=true;btn.setAttribute("aria-disabled","true");btn.innerHTML=ico("check")+" Aplicativo já instalado";}
   const hint=$("#pet-install-help");if(hint)hint.hidden=true;
 });
 state.navStack=[lastHash];
 if(!location.hash)location.replace(location.pathname+location.search+"#/inicio");
 
 
 $("#open-menu")?.addEventListener("click",()=>{$("#sidebar").classList.add("open");$("#overlay").hidden=false});
 $("#close-menu")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 $("#overlay")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 window.addEventListener("hashchange",()=>{
   // Eventos duplicados para a mesma rota não devem fechar uma confirmação aberta.
   if(location.hash===lastHash)return;
   $("#sidebar")?.classList.remove("open");$("#overlay").hidden=true;
   closeCommissionDialog();closeAuthMessage();closeNotice(false);closeFinishDialog();closeMailPreview();
   const destination=location.hash;
   if(destination!==lastHash&&hasUnsavedTaskChanges()){
     // Restaura a URL sem apagar os campos; confirmação só prossegue se aceita.
     history.replaceState(history.state,"",lastHash);
     askConfirm("Deseja sair sem salvar as alterações? As informações não salvas serão perdidas.",{
       title:"Alterações não salvas",kind:"warning",
       cancelLabel:"Continuar editando",confirmLabel:"Sair sem salvar"
     }).then(proceed=>{
       if(!proceed){
         // O botão Voltar pode ter alterado a pilha interna antes do popup.
         // Ao cancelar, a edição continua sendo a página ativa.
         if(state.navStack?.at(-1)!==lastHash)state.navStack.push(lastHash);
         state.goingBack=false;
         return;
       }
       resetTaskDraft();state.taskFormId=null;
       location.hash=destination;
     });
     return;
   }
   onNavigation();
 });
 window.addEventListener("storage",e=>{
  if(e.key===sessionRevisionKey||e.key===null)syncBrowserSession();
 });
 // Ao voltar de outra aba, o perfil pode ter sido promovido por outro Admin.
 // Atualiza apenas quando o cargo/escopo mudou, preservando formulários em edição.
 async function refreshPermissionOnFocus(){
  if(!token||hasUnsavedTaskChanges())return;
  try{
   const response=await request("/auth/me");
   if(response.user?.role!==me?.role||response.user?.adminSession!==me?.adminSession||
      response.user?.mustChangePassword!==me?.mustChangePassword)await reload();
  }catch{/* Sessões inválidas serão verificadas na próxima navegação ou recarga. */}
 }
 window.addEventListener("focus",()=>{syncBrowserSession();void refreshPermissionOnFocus()});
 window.addEventListener("beforeunload",e=>{
   if(hasUnsavedTaskChanges()){e.preventDefault();e.returnValue="";}
 });
 window.addEventListener("keydown",e=>{if(e.key==="Escape"){
   if($("#commission-preset-gallery")){e.preventDefault();closeCommissionPresetGallery();return}
   if(commissionImageEditor){e.preventDefault();closeCommissionImageEditor();return}
   if($("#task-photo-modal")){e.preventDefault();closeTaskPhoto();return}
   if($("#person-photo-modal")){e.preventDefault();closePersonPhotoPreview();return}
   if(!$("#mail-preview-dialog")?.hidden){e.preventDefault();closeMailPreview()}
   else if(!$("#notice-dialog")?.hidden){e.preventDefault();closeNotice(false)}
   else if(!$("#account-delete-dialog")?.hidden){e.preventDefault();$("#account-delete-dialog").hidden=true}
   else if(!$("#auth-message-dialog")?.hidden){e.preventDefault();closeAuthMessage()}
   else if(!$("#commission-dialog")?.hidden){e.preventDefault();closeCommissionDialog()}
    else if(!$("#finish-dialog")?.hidden){e.preventDefault();closeFinishDialog()}
 }});

 document.addEventListener("selectionchange",()=>{
   const selected=window.getSelection();
   if(!selected?.rangeCount)return;
   const anchor=selected.anchorNode?.nodeType===1?selected.anchorNode:selected.anchorNode?.parentElement;
   const editor=anchor?.closest?.("[data-rich-input]");
   if(editor){
    saveRichRange(editor);
    if(!richState(editor).locked)richStyleFromCursor(editor);
   }
 });
 document.addEventListener("beforeinput",insertRichTypedText);
 document.addEventListener("pointerup",e=>{
   const editor=e.target.closest?.("[data-rich-input]");
   if(editor)richStyleFromCursor(editor);
 });
 document.addEventListener("keydown",e=>{
   const editor=e.target.closest?.("[data-rich-input]");
   if(editor&&/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(e.key))
    richState(editor).locked=false;
 });
 document.addEventListener("pointerdown",e=>{
   const toolbar=e.target.closest(".rich-toolbar");
   if(toolbar){
     const editor=toolbar.closest(".rich-editor")?.querySelector("[data-rich-input]");
     if(editor)saveRichRange(editor);
   }
   if(e.target.closest('[data-do="rich-format"]'))e.preventDefault();
 });
 document.addEventListener("click",e=>{
   const adminLink=e.target.closest("#admin-link");
   if(adminLink&&adminRole(me)&&e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey)setConnecting(true,"Carregando painel administrativo...");
   const menuLink=e.target.closest(".admin-sidebar a[href^='#/']");
   if(menuLink&&state.adminMenuOpen&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){
     e.preventDefault();
     const href=menuLink.getAttribute("href");
     closeAdminMenu();
     setTimeout(()=>{if(location.hash===href)render();else location.hash=href},180);
     return;
   }
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
 document.addEventListener("pointerdown",commissionImageDrag);
 document.addEventListener("pointermove",commissionImageDrag);
 document.addEventListener("pointerup",commissionImageDrag);
 document.addEventListener("pointercancel",commissionImageDrag);
 document.addEventListener("submit",e=>handleSubmit(e));
 document.addEventListener("input",e=>{
   const el=e.target;
   if(el?.matches?.('#commission-form input[name="name"]')){
     const image=$("#commission-form input[name='imageData']"),preview=$("#commission-image-preview");
     if(image&&!image.value&&preview)preview.innerHTML='<span class="commission-image-placeholder commission-image-default">'+commissionCardArt(el.value)+'<small>Imagem padrão</small></span>';
   }
   if(el?.matches?.("[data-commission-rgb-range],[data-commission-rgb-number]"))setCommissionRgbFromChannel(el);
   if(el?.matches?.("[data-commission-color-hex]")){
     const normalized=String(el.value||"").trim();
     if(/^#[0-9a-f]{6}$/i.test(normalized))setCommissionRgbColor(normalized);
     else el.setAttribute("aria-invalid","true");
   }
   if(el?.id==="commission-image-zoom"&&commissionImageEditor){
     commissionImageEditor.zoom=Number(el.value)||1;redrawCommissionImage();
   }
   if(e.target?.matches?.('#register-account-form input[name="password"]'))refreshPasswordStrength(e.target);
   if(["collective-date-day","collective-date-month","collective-date-year"].includes(e.target?.id)){
     const native=$("#collective-event-day");
     if(native)native.value=collectiveSelectedDay();
   }
   if(el?.hasAttribute?.("data-stage-part"))syncStageDate(el.closest(".live-stage"));
 });
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
