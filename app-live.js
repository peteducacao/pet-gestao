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
const state={pushData:null,webPushData:null,webPushHere:false,noticePrefs:null,noticeDraft:null,noticeDirty:false,reminderItems:[],reminderLoadedFor:null,cronItems:[],cronLoadedYear:null,cronLoading:false,cronYear:current.getFullYear(),cronMonth:current.getMonth(),cronFilter:'cronograma',cronView:'lista',cronCalendarMode:'mes',cronSelectedDay:null,cronEditing:null,cronReminder:null,cronDetails:null,quickNavPrefs:null,quickNavDraft:null,adminReportView:'cronograma',adminReportYear:current.getFullYear(),adminReportCommission:'todos',adminReportUser:'todos',adminReportData:null,adminReportLoadedYear:null,adminReportLoading:false,adminOverviewData:null,adminOverviewLoadedYear:null,adminOverviewLoading:false,adminOverviewError:'',reminderLoading:false,reminderEditing:false,reminderRecurrence:"once",reminderSchedules:[],reminderDraft:null,templateChannel:"email",accountTab:"perfil",adminTab:"painel",adminMenuOpen:false,authTransition:false,commissionAction:null,mailItems:[],mailConnection:null,mailMonitorOpen:false,year:current.getFullYear(),month:current.getMonth(),week:0,mode:"mensal",committeeWeek:0,assignmentScope:"usuarios",selectedUsers:new Set(),selectedCommissions:new Set(),taskFormId:null,mailAudience:"todos",mailScheduled:false,selectedStatus:"pendente",mailFiles:[],taskFiles:[],statusFilter:"todas",conclusionKind:"todas",commissionStatusFilter:"todas",mineStatusFilter:"todas",meetingView:"todas",templateKind:"create",deadlineTemplateKind:"due_soon",templateDrafts:{},previousRoute:"#/inicio",archiveDeleteMode:false,archiveSelectedIds:new Set()};
const routeNames={inicio:"Visão geral",demandas:"Demandas",cronograma:"Cronograma PET",comissoes:"Comissões","minhas-pendencias":"Minhas pendências","meus-lembretes":"Meus lembretes",atividade:"Atividade",registrar:"Registrar demanda",admin:"Administração",conta:"Meu perfil",login:"Entrar",cadastro:"Criar conta",esqueci:"Recuperar senha",redefinir:"Redefinir senha","confirmar-email":"Confirmar e-mail",reunioes:"Atas de Reunião",ajuda:"Ajuda"};
let toastTimer,lastHash=location.hash||"#/inicio",firstBootstrap=true,lastStatusSnapshot="";
let desktopInstallPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();desktopInstallPrompt=event;});
window.addEventListener("appinstalled",()=>{desktopInstallPrompt=null;if(routeParts().page==="conta"&&state.accountTab==="aplicativos")render();});
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
// Protege atas novas ou editadas, incluindo conteúdo HTML do editor formatado.
let meetingFormDraft=null;
const meetingDraftRoute=hash=>/^#\/(?:admin\/)?reunioes\/(?:nova|editar\/[^/?#]+)$/.test(String(hash||""));
function meetingDraftSnapshot(){
 const form=$("#meeting-form");
 if(!form)return null;
 return JSON.stringify({
  title:form.elements.title?.value??"",
  date:form.elements.date?.value??"",
  rawNotes:form.querySelector('[data-rich-input="rawNotes"]')?.innerHTML??""
 });
}
function hasUnsavedMeetingChanges(){
 return Boolean(meetingFormDraft&&meetingDraftRoute(lastHash)&&
  meetingFormDraft.route===lastHash&&$("#meeting-form")&&
  meetingDraftSnapshot()!==meetingFormDraft.snapshot);
}
function resetMeetingDraft(){meetingFormDraft=null}

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const richTags=new Set(["B","STRONG","I","EM","U","P","DIV","BR","UL","OL","LI","SPAN","FONT"]);
function safeRich(value){
 const raw=String(value??"").replace(/\u200B/g,"");
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
    if(!inside)return "";
    const c=node.style?.color||node.getAttribute("color")||"";
    const style=[];
    if(/^(#[a-f0-9]{3,8}|rgb\([\d\s,.%]+\))$/i.test(c))style.push("color:"+esc(c));
    const weight=node.style?.fontWeight||"";
    if(/^(normal|bold|[1-9]00)$/.test(weight))style.push("font-weight:"+weight);
    const italic=node.style?.fontStyle||"";
    if(/^(normal|italic|oblique)$/.test(italic))style.push("font-style:"+italic);
    const decoration=node.style?.textDecorationLine||node.style?.textDecoration||"";
    if(/^(none|underline)$/.test(decoration))style.push("text-decoration:"+decoration);
    const background=node.style?.backgroundColor||"";
    if(/^(#[a-f0-9]{3,8}|rgba?\([\d\s,.%]+\))$/i.test(background))style.push("background-color:"+esc(background));
    return "<span"+(style.length?' style="'+style.join(";")+'"':"")+">"+inside+"</span>";
  }
  const name=tag.toLowerCase();
  return "<"+name+">"+inside+"</"+name+">";
 };
 return [...fragment.content.childNodes].map(walk).join("");
}

const formatIcon={
 bold:"<strong>B</strong>",
 underline:"<u>U</u>",
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
 '<div class="rich-toolbar-group" aria-label="Estilo">'+action("bold","Negrito")+action("underline","Sublinhado")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<div class="rich-toolbar-group" aria-label="Listas">'+action("insertUnorderedList","Lista com marcadores")+action("insertOrderedList","Lista numerada")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<div class="rich-toolbar-group" aria-label="Alinhamento">'+action("justifyLeft","Alinhar à esquerda")+action("justifyCenter","Centralizar")+action("justifyRight","Alinhar à direita")+action("justifyFull","Justificar texto")+'</div>'+
 '<span class="rich-toolbar-divider" aria-hidden="true"></span>'+
 '<label class="rich-color-label" title="Cor do texto" aria-label="Cor do texto"><span class="rich-color-symbol" aria-hidden="true">A</span><input type="color" data-rich-color value="#5b3bb5" aria-label="Escolher cor do texto"></label>'+
 '<label class="rich-highlight-label" title="Marca-texto: destacar palavras" aria-label="Marca-texto"><span class="rich-highlight-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m14 3 7 7-9 9-7-7 9-9Z"/><path d="m11 6 7 7"/><path d="M3 21h18"/></svg></span><input type="color" data-rich-highlight value="#fff176" aria-label="Escolher cor do marca-texto"></label>'+
 '</div><div class="rich-content" contenteditable="true" role="textbox" aria-multiline="true" data-rich-input="'+esc(name)+'" data-placeholder="'+esc(placeholder)+'">'+safeRich(value||"")+'</div></div>';
}

// Formatação aplicada diretamente aos caracteres selecionados (nunca ao fundo).
// Não depende da implementação inconsistente de execCommand em navegadores móveis.

const richStates=new WeakMap();
const richNativeSnapshots=new WeakMap();
const richCompositionPreviews=new WeakMap();
// Enquanto o Gboard compõe uma palavra, mudar a árvore de texto pode
// interromper a digitação. Uma prévia de estilo (reversível) no elemento que
// contém o cursor permite ver o itálico/sublinhado imediatamente; na conclusão
// o texto novo recebe um span permanente, sem alterar o texto anterior.
function clearRichCompositionPreview(editor){
 const preview=richCompositionPreviews.get(editor);
 if(!preview)return;
 for(const [name,value,priority] of preview.original){
  if(value)preview.target.style.setProperty(name,value,priority);
  else preview.target.style.removeProperty(name);
 }
 richCompositionPreviews.delete(editor);
}
function previewRichNativeComposition(editor){
 const state=richState(editor);
 if(!state.locked)return;
 const selection=window.getSelection(),node=selection?.anchorNode;
 const element=node?.nodeType===3?node.parentElement:node;
 const target=element?.nodeType===1&&editor.contains(element)?element:editor;
 const previous=richCompositionPreviews.get(editor);
 if(previous?.target!==target)clearRichCompositionPreview(editor);
 if(!richCompositionPreviews.has(editor)){
  const props=["font-weight","font-style","text-decoration","color","background-color"];
  richCompositionPreviews.set(editor,{target,original:props.map(name=>[
   name,target.style.getPropertyValue(name),target.style.getPropertyPriority(name)
  ])});
 }
 target.style.fontWeight=state.bold?"700":"400";
 target.style.fontStyle=state.italic?"italic":"normal";
 target.style.textDecoration=state.underline?"underline":"none";
 if(state.color)target.style.color=state.color;
 if(state.highlight)target.style.backgroundColor=state.highlight;
}

function richVisibleText(editor){return editor.textContent.replace(/\u200B/g,"")}
function snapshotRichInput(editor){richNativeSnapshots.set(editor,richVisibleText(editor))}

function richState(editor){
 let state=richStates.get(editor);
 if(!state){state={bold:false,italic:false,underline:false,color:null,highlight:null,locked:false};richStates.set(editor,state)}
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
  // Uma seleção de texto já formatado pode começar no editor raiz.
  // Descer até o caractere efetivo para refletir B, I e U simultaneamente.
  let leaf=near;
  while(leaf?.nodeType===1&&leaf.firstChild)leaf=leaf.firstChild;
  if(leaf)element=leaf.nodeType===1?leaf:leaf.parentElement;
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
 const marked=element.closest?.('span[style*="background-color"]');
 const markerColor=marked&&editor.contains(marked)?window.getComputedStyle(marked).backgroundColor:"";
 const markerRgb=markerColor.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
 state.highlight=markerRgb?"#"+markerRgb.slice(1,4).map(v=>Number(v).toString(16).padStart(2,"0")).join(""):null;
 state.locked=false;
 updateRichToolbar(editor);
}
function updateRichToolbar(editor){
 const state=richState(editor),root=editor.closest(".rich-editor");
 if(!root)return;
 for(const name of ["bold","underline"]){
  const button=root.querySelector('[data-format="'+name+'"]');
  if(button)button.setAttribute("aria-pressed",String(Boolean(state[name])));
 }
 const input=root.querySelector("[data-rich-color]"),letter=root.querySelector(".rich-color-symbol");
 if(input&&state.color&&/^#[\da-f]{6}$/i.test(state.color))input.value=state.color;
 if(letter)letter.style.setProperty("--selected-text-color",state.color||"#5b3bb5");
 const highlightInput=root.querySelector("[data-rich-highlight]"),marker=root.querySelector(".rich-highlight-symbol");
 if(highlightInput&&state.highlight&&/^#[\da-f]{6}$/i.test(state.highlight))highlightInput.value=state.highlight;
 if(marker)marker.style.setProperty("--selected-highlight-color",state.highlight||"#fff176");
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
 const selected=range.toString();
 let node=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer;
 const choices=[];
 while(node&&node!==editor){if(node.nodeType===1&&node.matches(tag))choices.push(node);node=node.parentElement}
 // Quando a seleção começa na raiz ou abraça uma combinação de estilos,
 // também procurar a tag interna exata selecionada.
 for(const match of editor.querySelectorAll(tag))if(range.intersectsNode(match))choices.push(match);
 for(const match of new Set(choices)){
  if(match.textContent!==selected||!match.firstChild||!match.lastChild)continue;
  const first=match.firstChild,last=match.lastChild;
  match.replaceWith(...[...match.childNodes]);
  const result=document.createRange();
  result.setStartBefore(first);result.setEndAfter(last);
  setRichSelection(editor,result);
  return true;
 }
 return false;
}
// O Android/Gboard digita por composição: antes da primeira tecla o cursor
// precisa estar DENTRO de um elemento já formatado. O beforeinput sozinho
// ignora insertCompositionText e deixava o I roxo com letras normais.
function richTypingStyle(node,state){
 node.dataset.richTyped=[state.bold?1:0,state.italic?1:0,state.underline?1:0,state.color||"",state.highlight||""].join(":");
 node.style.fontWeight=state.bold?"700":"400";
 node.style.fontStyle=state.italic?"italic":"normal";
 node.style.textDecoration=state.underline?"underline":"none";
 if(state.color)node.style.color=state.color;else node.style.removeProperty("color");
 if(state.highlight)node.style.backgroundColor=state.highlight;else node.style.removeProperty("background-color");
}
function placeRichTypingAnchor(editor,state,range){
 const start=range.startContainer;
 const element=start.nodeType===3?start.parentElement:start;
 const existing=element?.closest?.("[data-rich-typing]");
 // Antes de digitar, alternar B/I/U reaproveita o mesmo cursor, sem lixo extra.
 if(existing&&editor.contains(existing)&&existing.textContent==="\u200B"){
  richTypingStyle(existing,state);
  const textNode=existing.firstChild;
  const caret=document.createRange();caret.setStart(textNode,textNode.length);caret.collapse(true);
  setRichSelection(editor,caret);
  return;
 }
 const anchor=document.createElement("span");
 anchor.dataset.richTyping="true";
 richTypingStyle(anchor,state);
 const caretText=document.createTextNode("\u200B");
 anchor.append(caretText);
 range.insertNode(anchor);
 const caret=document.createRange();caret.setStart(caretText,caretText.length);caret.collapse(true);
 setRichSelection(editor,caret);
}
// Teclados Android (Gboard, Samsung e outros IMEs) podem inserir o texto
// FORA do span em que o cursor foi colocado, inclusive após substituições
// de palavras. Recuperar a faixa de texto alterada após a composição evita
// que B/I/U fiquem ativos só no botão, sem efeito visual no conteúdo.
function richTextPosition(editor,logicalOffset){
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
 let seen=0,last=null,node;
 while((node=walker.nextNode())){
  for(let i=0;i<node.length;i++){
   if(node.data[i]==="\u200B")continue;
   if(seen===logicalOffset)return {node,offset:i};
   seen++;
   last={node,offset:i+1};
  }
 }
 return last||{node:editor,offset:editor.childNodes.length};
}
function richCaretOffset(editor,range){
 try{
  const prefix=document.createRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer,range.startOffset);
  return prefix.toString().replace(/\u200B/g,"").length;
 }catch{return null}
}
function richNativeTextAlreadyStyled(editor,node,state){
 const element=node.nodeType===3?node.parentElement:node;
 if(!element||element===editor)return false;
 const css=window.getComputedStyle(element);
 const bold=Number(css.fontWeight)>=600||css.fontWeight==="bold";
 const italic=["italic","oblique"].includes(css.fontStyle);
 let underline=false,highlight=null;
 for(let parent=element;parent&&parent!==editor;parent=parent.parentElement){
  if(parent.style?.textDecorationLine?.includes("underline")||parent.tagName==="U")underline=true;
  if(!highlight&&parent.style?.backgroundColor)highlight=window.getComputedStyle(parent).backgroundColor;
 }
 const color=css.color?.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
 const hex=color?"#"+color.slice(1,4).map(v=>Number(v).toString(16).padStart(2,"0")).join(""):null;
 const highlightRgb=highlight?.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
 const highlightHex=highlightRgb?"#"+highlightRgb.slice(1,4).map(v=>Number(v).toString(16).padStart(2,"0")).join(""):null;
 return bold===Boolean(state.bold)&&italic===Boolean(state.italic)&&underline===Boolean(state.underline)
  &&(!state.color||state.color.toLowerCase()===hex)
  &&(!state.highlight||state.highlight.toLowerCase()===highlightHex);
}
function reconcileRichNativeInput(editor){
 const after=richVisibleText(editor),before=richNativeSnapshots.get(editor);
 const state=richState(editor);
 if(typeof before!=="string"||!state.locked||before===after){
  snapshotRichInput(editor);return;
 }
 let start=0;
 while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let tail=0;
 while(tail<before.length-start&&tail<after.length-start&&
   before[before.length-1-tail]===after[after.length-1-tail])tail++;
 const end=after.length-tail;
 if(end<=start){snapshotRichInput(editor);return}
 const first=richTextPosition(editor,start),last=richTextPosition(editor,end);
 if(first.node===last.node&&first.offset===last.offset){snapshotRichInput(editor);return}
 if(richNativeTextAlreadyStyled(editor,first.node,state)){
  snapshotRichInput(editor);return;
 }
 const current=window.getSelection();
 const currentRange=current?.rangeCount?current.getRangeAt(0):null;
 const caret=currentRange&&editor.contains(currentRange.commonAncestorContainer)?
  richCaretOffset(editor,currentRange):null;
 const selection=document.createRange();
 selection.setStart(first.node,first.offset);
 selection.setEnd(last.node,last.offset);
 const span=document.createElement("span");
 richTypingStyle(span,state);
 span.removeAttribute("data-rich-typed");
 span.removeAttribute("data-rich-typing");
 span.append(selection.extractContents());
 selection.insertNode(span);
 if(caret!==null){
  const pos=richTextPosition(editor,caret),next=document.createRange();
  next.setStart(pos.node,pos.offset);next.collapse(true);
  setRichSelection(editor,next);
 }
 snapshotRichInput(editor);
}
function applyRichFormat(editor,format,color=""){
 if(!editor)return false;
 const allowed=new Set(["bold","underline","insertUnorderedList","insertOrderedList","justifyLeft","justifyCenter","justifyRight","justifyFull","foreColor","hiliteColor"]);
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
 const isColorFormat=format==="foreColor"||format==="hiliteColor";
 if(isColorFormat&&!/^#[a-f0-9]{6}$/i.test(color))return false;
 const next=isColorFormat?color:!state[format];
 if(range.collapsed){
  if(format==="foreColor")state.color=next;
  else if(format==="hiliteColor")state.highlight=next;
  else state[format]=next;
  state.locked=true;
  placeRichTypingAnchor(editor,state,range);
  snapshotRichInput(editor);
  updateRichToolbar(editor);
  return true;
 }
 // Em seleção, aplicar a formatação sem destruir outras marcas já combinadas.
 const tag={bold:"strong",italic:"em",underline:"u",foreColor:"span",hiliteColor:"span"}[format];
 const isTurningOff=!isColorFormat&&!next;
 if(!(isTurningOff&&unwrapRichSelection(editor,range,tag))){
  const wrapper=document.createElement(tag);
  if(format==="foreColor")wrapper.style.color=color;
  if(format==="hiliteColor")wrapper.style.backgroundColor=color;
  const contents=range.extractContents();
  if(format==="foreColor"){
   for(const node of [...contents.querySelectorAll("[style],font[color]")]){
    if(node.style)node.style.removeProperty("color");
    if(node.tagName==="FONT")node.removeAttribute("color");
   }
  }
  if(format==="hiliteColor"){
   // Reaplicar marca-texto muda apenas o fundo, sem apagar estilos das letras.
   for(const node of [...contents.querySelectorAll("[style]")])node.style.removeProperty("background-color");
  }
  wrapper.append(contents);
  range.insertNode(wrapper);
  const nextRange=document.createRange();
  nextRange.selectNodeContents(wrapper);
  setRichSelection(editor,nextRange);
 }
 if(format==="foreColor")state.color=next;
 else if(format==="hiliteColor")state.highlight=next;
 else state[format]=next;
 state.locked=true;
 snapshotRichInput(editor);
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
 const start=range.startContainer.nodeType===3?range.startContainer.parentElement:range.startContainer;
 // O IME nativo do celular insere e compõe dentro da marca tipográfica;
 // bloquear o beforeinput aqui faria as letras saírem sem itálico.
 if(start?.closest?.("[data-rich-typing]"))return;
 event.preventDefault();
 const styleKey=[state.bold?1:0,state.italic?1:0,state.underline?1:0,state.color||"",state.highlight||""].join(":");
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
 if(state.highlight)span.style.backgroundColor=state.highlight;
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
const canNotify=()=>canWrite()&&["tutor","admin"].includes(me.role);
// PETianos(as), tutores(as) e Administração podem excluir demandas
// ativas ou concluídas; a API valida novamente a autorização.
const canDeleteTask=t=>Boolean(t&&canWrite()&&t.closureOutcome!=="nao_concluida");
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
const taskStatus=(t,cid="")=>t.archivedAt?((t.closureOutcome==="nao_concluida"||t.publicStatus==="nao_concluida")?"nao_concluida":"concluida"):
 (t.publicStatus||(cid&&t.commissionDone?.[cid]?"concluida":isLate(t)?"atrasada":"pendente"));
const statusLabel={pendente:"Pendente",atrasada:"Atrasada",concluida:"Concluída",nao_concluida:"Não concluída"};
const taskWasLate=t=>{
 if(!t.archivedAt||t.closureOutcome==="nao_concluida")return false;
 if(t.completedLate!==null&&t.completedLate!==undefined)return Boolean(t.completedLate);
 return stages(t).some(stage=>stage.label!=="Evento"&&stage.dueAt&&
   stageDueAt(stage.dueAt)&&stageDueAt(stage.dueAt)<dt(stage.completedAt||t.archivedAt));
};
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

function renderAdminCommissionSummary(cid){
 if(!isAdmin())return empty("Acesso restrito","Somente a Administração consulta este resumo.");
 const c=committee(cid);if(!c)return empty("Comissão não encontrada");
 const from=state.summaryFrom||current.getFullYear()+"-01-01",to=state.summaryTo||dateKey(current);
 return header("Administração","Resumo · "+c.name,"Consulta privada de participações e atividades.")+
 '<section class="card card-pad admin-summary">'+
 '<div class="admin-summary-navigation"><a href="#/admin/relatorios" class="button ghost">Voltar aos relatórios</a><button type="button" class="button primary" data-do="admin-commission-pdf">'+ico("download")+' Exportar PDF</button></div>'+
 '<form id="admin-summary-form" class="admin-summary-filters" data-commission-id="'+esc(cid)+'">'+
 '<label>De<input type="date" name="from" value="'+esc(from)+'" required></label>'+
 '<label>Até<input type="date" name="to" value="'+esc(to)+'" required></label>'+
 '<button type="submit" class="button primary">Consultar período</button></form>'+
 '<div id="admin-summary-results" aria-live="polite">Carregando integrantes e demandas da comissão...</div></section>';
}
function renderAdminSummaryResults(result){
 const metrics=[["Cadastradas",result.registered],["Concluídas",result.concluded],
 ["Com atraso",result.concludedLate],["Não concluídas",result.notConcluded],
 ["Entradas",result.entered],["Saídas",result.exited]];
 const members=result.members||[];
 const chosen=members.find(p=>p.id===state.summaryPerson);
 const memberList=members.length?members.map(p=>'<button type="button" data-do="admin-summary-person" data-person-id="'+esc(p.id)+'" class="admin-summary-person'+(chosen?.id===p.id?' active':'')+'">'+
 '<strong>'+esc(p.name)+'</strong><small>'+p.periods.map(x=>textDate(x.joinedAt)+' a '+(x.leftAt?textDate(x.leftAt):'atualmente')).join('; ')+'</small></button>').join(""):
 '<p class="admin-muted">Nenhum vínculo registrado neste período.</p>';
 const personInfo=chosen?'<h3>'+esc(chosen.name)+'</h3><div class="admin-summary-mini">'+
 [['Atribuídas',chosen.assigned],['Realizadas',chosen.completed],['Não realizadas',chosen.notCompleted],['Atrasos individuais identificáveis',chosen.completedLate]]
 .map(([label,n])=>'<span>'+label+': <strong>'+n+'</strong></span>').join("")+'</div>'+
 (chosen.items.length?chosen.items.map(t=>'<div class="admin-summary-task"><div><strong>'+esc(t.title)+'</strong><small>'+
 (t.completedAt?'Realizada em '+textDate(t.completedAt):t.notCompleted?'Não realizada':'Pendente')+
 (t.late?' · Atraso individual':'')+'</small></div><a class="button ghost" href="#/admin/atividade/'+id(t.id)+'">Ver detalhes</a></div>').join(""):
 '<p class="admin-muted">Nenhuma responsabilidade individual no período.</p>'):
 '<p class="admin-muted">Selecione um integrante para conferir suas responsabilidades.</p>';
 return '<div class="admin-summary-metrics">'+metrics.map(([label,n])=>
 '<div class="admin-summary-metric"><strong>'+Number(n||0)+'</strong><span>'+label+'</span></div>').join("")+'</div>'+
 '<p class="admin-summary-note">Resumo exclusivo do Admin. As entradas e saídas anteriores ao registro histórico não podem ser reconstruídas automaticamente.</p>'+
 '<h2>Participação dos integrantes</h2><div class="admin-summary-split"><div class="admin-summary-members">'+memberList+'</div>'+
 '<div class="admin-summary-detail">'+personInfo+'</div></div>';
}
async function loadAdminCommissionSummary(cid){
 if(!isAdmin())return;
 const target=$("#admin-summary-results");if(!target)return;
 target.textContent="Consultando registros reais...";
 try{
  const from=state.summaryFrom||current.getFullYear()+"-01-01",to=state.summaryTo||dateKey(current);
  const result=await request("/admin/commission-summary/"+id(cid)+"?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
  if(target.isConnected&&routeParts().parts[0]==="resumo"&&routeParts().parts[1]===cid){
   state.summaryData=result;target.innerHTML=renderAdminSummaryResults(result);
  }
 }catch(e){if(target.isConnected)target.textContent=e.message;}
}
function adminEmbeddedView(parts){
 const [page,...args]=parts,route=args.join("/");
 if(page==="resumo")return renderAdminCommissionSummary(args[0]||"");
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
 // Falhas de rede do fetch não devem aparecer em inglês no aplicativo.
 // A mesma mensagem também cobre indisponibilidade temporária do servidor,
 // sem afirmar que o usuário certamente está sem internet.
 if(/\b(?:failed to fetch|network request failed|networkerror when attempting to fetch a resource|load failed)\b/i.test(text))
  return showNotice("Não foi possível conectar ao PET Gestão. Verifique sua conexão com a internet e tente novamente.",{
   title:"Problema de conexão",kind:"warning"
  });
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

/* Ponte segura do APK Android: token temporário em memória, registro só com login. */
let androidPush=null,registeredPushFor="",pushRegisterPromise=null;
window.petGestaoPushToken=function(deviceToken,deviceId){
 if(typeof deviceToken!=="string"||typeof deviceId!=="string")return;
 if(!/^[A-Za-z0-9:_-]{40,4096}$/.test(deviceToken)||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(deviceId))return;
 androidPush={token:deviceToken,deviceId};
 void registerNativePush();
};
async function registerNativePush(){
 if(!androidPush||!token||!me||me.mustChangePassword)return;
 const userId=me.id,identity=userId+"|"+androidPush.deviceId+"|"+androidPush.token;
 if(identity===registeredPushFor||pushRegisterPromise)return pushRegisterPromise;
 pushRegisterPromise=(async()=>{
  await request("/push/register","POST",androidPush);
  registeredPushFor=identity;
  const result=await request("/push/preferences");
  if(me?.id!==userId)return;
  state.pushData=result;
  if(routeParts().page==="conta")render();
 })().catch(err=>console.warn("PET Gestão: dispositivo Android não cadastrado:",err.message))
 .finally(()=>{pushRegisterPromise=null});
 return pushRegisterPromise;
}
async function loadPushPreferencesForActiveUser(){
 const userId=me?.id;
 if(!userId||me.mustChangePassword){state.pushData=null;state.webPushData=null;state.webPushHere=false;return}
 try{
  const result=await request("/push/preferences");
  if(me?.id!==userId)return;
  state.pushData=result;
  if(routeParts().page==="conta")render();
 }catch(error){console.warn("PET Gestão: preferências de notificações indisponíveis:",error.message)}
 void registerNativePush();
 void loadWebPushState();
 void loadNotificationPreferences();
}
function renderPushPreferences(){
 const count=Number(state.pushData?.registeredDevices||0);
 const connected=!!androidPush&&registeredPushFor.startsWith(String(me?.id||"")+"|");
 const status=connected?"Este celular está conectado e pronto para receber avisos.":
  count>0?count+" celular(es) vinculado(s) à sua conta. Abra o aplicativo para ativar neste aparelho.":
  "Para receber no celular, instale o APK e permita as notificações.";
 return '<section class="account-push-panel account-channel-card"><div class="account-push-heading"><span class="account-push-icon">'+ico("bell")+'</span><div><h3 id="profile-push-title">Celular Android</h3><p>'+esc(status)+'</p></div></div></section>';
}
const NOTICE_KINDS_UI=[["create","Nova demanda","Quando uma demanda é cadastrada"],
 ["review","Revisão de texto","Quando há revisão ou correção"],
 ["due_soon","Prazo vencendo","Aviso antecipado de uma etapa"],
 ["overdue","Prazo vencido","Uma etapa ultrapassou seu prazo"],
 ["event_soon","Evento se aproximando","Aviso antecipado de evento"],
 ["event_today","Evento hoje","Lembrete no próprio dia do evento"]];
async function loadNotificationPreferences(){
 const userId=me?.id;if(!userId||me?.mustChangePassword)return;
 try{
  const result=await request("/notification-preferences");
  if(me?.id!==userId)return;
  state.noticePrefs=result.preferences;
  if(!state.noticeDirty)state.noticeDraft=JSON.parse(JSON.stringify(result.preferences));
  if(routeParts().page==="conta"&&state.accountTab==="notificacoes")render();
 }catch(error){console.warn("PET Gestão: central de notificações indisponível:",error.message)}
}
function renderNotificationMatrix(){
 const prefs=state.noticeDraft||state.noticePrefs;
 if(!prefs)return '<section class="card card-pad">Carregando suas preferências de avisos...</section>';
 const names=[["email","E-mail","mail"],["android","Celular","bell"],["pc","PC","monitor"]];
 return '<section class="card card-pad account-notification-matrix"><div class="section-head"><div><h3>Quais avisos quero receber?</h3><p>Marque os tipos e os canais que deseja. Você pode desligar todos.</p></div></div>'+
  '<p class="field-hint notice-optin-hint">Os avisos começam desativados. Ative os que deseja receber e clique em Salvar todas as preferências.</p><div class="notice-matrix-scroller"><table class="notice-matrix"><thead><tr><th scope="col">Tipo de aviso</th>'+
  names.map(([,label,iconName])=>'<th scope="col">'+ico(iconName)+'<span>'+label+'</span></th>').join("")+'</tr></thead><tbody>'+
  NOTICE_KINDS_UI.map(([kind,label,desc])=>'<tr><th scope="row"><strong>'+label+'</strong><small>'+desc+'</small></th>'+
   names.map(([channel,label])=>'<td><label class="notice-cell-switch" aria-label="'+label+' por '+channel+'"><input type="checkbox" data-notice-kind="'+kind+'" data-notice-channel="'+channel+'" '+(prefs?.[kind]?.[channel]?"checked":"")+'><span aria-hidden="true"></span></label></td>').join("")+'</tr>').join("")+
  '</tbody></table></div><p class="field-hint">Os três canais são independentes. Se o Gmail atingir a cota diária, celular e PC continuam funcionando.</p>'+
  '<div class="notice-matrix-actions"><button type="button" class="button primary" data-do="save-notice-matrix">'+ico("check")+' Salvar todas as preferências</button></div></section>';
}
async function desktopSubscription(){
 if(!("serviceWorker" in navigator)||!("PushManager" in window))return null;
 const registration=await navigator.serviceWorker.getRegistration("./sw.js");
 return registration?.pushManager?.getSubscription()||null;
}
async function loadWebPushState(){
 const userId=me?.id;
 if(!userId||me.mustChangePassword){state.webPushData=null;state.webPushHere=false;return}
 try{
  const status=await request("/web-push/status");
  if(me?.id!==userId)return;
  state.webPushData=status;
  const subscription=await desktopSubscription();
  const own=subscription?await request("/web-push/check","POST",{endpoint:subscription.endpoint}):{connected:false};
  if(me?.id!==userId)return;
  state.webPushHere=!!own.connected&&window.Notification?.permission==="granted";
  if(routeParts().page==="conta"&&state.accountTab==="notificacoes")render();
 }catch(error){console.warn("PET Gestão: notificações do computador indisponíveis:",error.message)}
}
function iosDevice(){return /iPhone|iPad|iPod/i.test(navigator.userAgent||"")||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function installedAsApp(){return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true)}
function webPushSupported(){
 return window.isSecureContext&&"Notification" in window&&"serviceWorker" in navigator&&"PushManager" in window;
}
function renderWebPushPreferences(){
 const ios=iosDevice(),installed=installedAsApp();
 const count=Number(ios?state.webPushData?.registeredIphones:state.webPushData?.registeredComputers)||0;
 const connected=!!state.webPushHere,supported=webPushSupported();
 const blocked=supported&&Notification.permission==="denied";
 const title=ios?"iPhone / iPad":"Computador (PC)";
 const device=ios?"iPhone/iPad":"PC";
 const status=ios&&!installed?"Para receber notificações, adicione o PET Gestão à Tela de Início e abra pelo ícone instalado.":
  !supported?"Notificações indisponíveis neste navegador. No iPhone, use o app salvo na Tela de Início (iOS 16.4 ou superior).":
  blocked?"Permita as notificações nas configurações do dispositivo.":
  connected?"Este "+device+" está conectado e pronto para receber avisos.":
  count>0?count+" dispositivo(s) deste tipo vinculado(s) à sua conta.":
  "Ative para receber aqui os mesmos avisos de demandas, prazos e lembretes.";
 return '<section class="account-web-push-panel account-channel-card">'+
  '<div class="account-push-heading"><span class="account-push-icon">'+ico("bell")+'</span><div><h3 id="profile-web-push-title">'+title+'</h3><p>'+esc(status)+'</p></div></div>'+
  '<div class="account-push-actions">'+
  (connected?'<button type="button" class="button ghost" data-do="disable-web-push">Desativar neste '+device+'</button>':
    '<button type="button" class="button primary" data-do="enable-web-push" '+(!supported||blocked||(ios&&!installed)?"disabled":"")+'>'+ico("bell")+' Ativar neste '+device+'</button>')+
  '</div></section>';
}
function renderDesktopInstall(){
 const installed=window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
 return '<section class="account-app-install account-desktop-install" aria-label="Instalar PET Gestão no computador">'+
  '<div class="account-app-install-head"><span class="account-app-install-icon">'+ico("download")+'</span><div>'+
  '<h3>Aplicativo PET Gestão para computador</h3>'+
  '<p>Instale no Windows, macOS ou Linux como um aplicativo independente, com ícone próprio e atualizações automáticas do site.</p></div></div>'+
  '<button type="button" class="button primary account-app-install-button" data-do="install-desktop-app" '+(installed?"disabled":"")+'>'+
  ico("download")+' '+(installed?"Já instalado neste computador":"Instalar aplicativo no PC")+'</button>'+
  '<p class="account-app-install-help">No Chrome ou Edge, a instalação pode ser feita diretamente pelo botão acima. Se o navegador não oferecer instalação automática, use o menu do navegador → Instalar PET Gestão. Não é necessário baixar um arquivo .exe.</p>'+
  '</section>';
}

async function reload(){
 try{
   // Toda a aplicação compartilha o mesmo perfil e token de autenticação.
   const b=await request("/bootstrap","GET");
   const beforeUser=me?.id||"";
   data=b;me=b.session?.user||null;regularMe=me;
   if(beforeUser!==(me?.id||"")){
    state.noticePrefs=null;state.noticeDraft=null;state.noticeDirty=false;
    state.reminderItems=[];state.reminderLoadedFor=null;state.reminderEditing=false;
    state.cronItems=[];state.cronLoadedYear=null;state.cronEditing=null;state.quickNavPrefs=null;state.quickNavDraft=null;
   }
   if(token&&!me){token="";forgetSessionToken(tokenKey)}
   if(firstBootstrap){firstBootstrap=false;try{const saved=JSON.parse(localStorage.getItem("pet-gestao:period")||"{}");if(b.settings?.autoMonth===false){state.year=Number(saved.year)||state.year;state.month=Number.isInteger(saved.month)?saved.month:state.month}if(b.settings?.autoWeek===false)state.week=Number(saved.week)||0;else state.week=weekFor(current)}catch{state.week=weekFor(current)}}

 }catch(e){
   data={tasks:[],users:[],committees:[],meetings:[],events:[],history:[],settings:{}};
   me=null;setToast(e.message);
 }
 try{render()}finally{document.documentElement.classList.remove("pet-booting")}
 void loadPushPreferencesForActiveUser();
 void loadQuickNavPrefs();
}
function allowPage(p){if(canWrite())return true;return ["inicio","demandas","comissoes","ajuda","login","cadastro","esqueci","redefinir","confirmar-email","conta","admin"].includes(p)}
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
   if(["minhas-pendencias","meus-lembretes","reunioes","cronograma"].includes(el.dataset.route))el.hidden=!canWrite();
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
  '<span class="task-status task-status-'+status+'">'+statusLabel[status]+
 (status==="concluida"&&taskWasLate(t)?' · Com atraso':"")+'</span>'+
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
 '<span class="task-status task-status-'+status+'">'+statusLabel[status]+
 (status==="concluida"&&taskWasLate(t)?' · Com atraso':"")+'</span>'+
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
 const all=data.tasks.filter(t=>active(t)),visible=all.filter(t=>t.overviewVisible!==false);
 const next=[...visible].sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b)))).slice(0,6);
 const late=visible.filter(isLate).length,complete=data.tasks.filter(t=>t.archivedAt).length;
 return header("Organização","Visão geral","Acompanhe as demandas da equipe em modo de visualização.")+
  '<div class="stat-grid viewer-stat-grid">'+[[all.length,"Demandas ativas","list"],[late,"Prazos vencidos","alert"],[complete,"Concluídas","check"]].map(x=>
   '<div class="card stat"><div class="stat-icon purple">'+ico(x[2])+'</div><div class="stat-copy"><span>'+x[1]+'</span><strong>'+x[0]+'</strong></div></div>').join("")+'</div>'+
  '<div class="dashboard-grid viewer-dashboard"><section class="card card-pad"><div class="section-head"><div><h2>Pendências semanais</h2><p>Próximas atividades cadastradas para acompanhamento.</p></div></div>'+
  (next.length?next.map(publicTaskCard).join(""):empty("Sem pendências neste momento"))+'</section></div>';
}
function renderHome(){
 if(!canWrite())return renderViewerHome();
 const all=data.tasks.filter(t=>active(t)),visible=all.filter(t=>t.overviewVisible!==false),next=[...visible].sort((a,b)=>(dt(taskDate(a))||Infinity)-(dt(taskDate(b))||Infinity)).slice(0,6),late=visible.filter(isLate).length;
 const recentEvents=(data.events||[]).filter(e=>!me?.activityClearedAt||e.createdAt>me.activityClearedAt).slice(0,4);
 return header("Organização","Visão geral","Demandas da equipe e prazos prioritários.")+
 '<div class="stat-grid">'+[[all.length,"Demandas ativas","list"],[data.tasks.filter(isMyPending).length,"Minhas atividades","checklist"],[late,"Prazos vencidos","alert"],[data.tasks.filter(t=>t.archivedAt).length,"Concluídas","check"]].map(x=>'<div class="card stat"><div class="stat-icon purple">'+ico(x[2])+'</div><div class="stat-copy"><span>'+x[1]+'</span><strong>'+x[0]+'</strong></div></div>').join("")+'</div>'+
 '<div class="dashboard-grid"><section class="card card-pad dashboard-weekly-card"><div class="section-head"><div><h2>Pendências semanais</h2><p>As próximas seis atividades em aberto</p></div>'+button("Ver todas as demandas","demandas")+'</div>'+ (next.length?next.map(t=>taskCard(t)).join(""):empty("Sem pendências neste momento"))+'</section>'+
 '<section class="card card-pad"><div class="section-head"><h2>Últimas atualizações</h2>'+
 (me&&recentEvents.length?'<button type="button" class="button ghost clear-updates-button" data-do="clear-activity">'+ico("trash")+' Limpar tudo</button>':ico("bell"))+
 '</div>'+(recentEvents.length?recentEvents.map(e=>'<div class="placeholder-row"><div><strong>'+esc(e.summary)+'</strong><small>'+esc(e.actorName)+' · '+textDate(e.createdAt)+'</small></div></div>').join(""):empty("Nenhuma atualização recente"))+'</section></div>';
}

const VISUALIZATIONS=[["todas","Todas as demandas"],["pendente","Pendentes"],["atrasada","Atrasadas"],["concluida","Concluídas"],["nao_concluida","Não concluídas"]];
function visualizationSelect(filter,value,options=VISUALIZATIONS){
 return '<label class="visualization-control"><span class="visualization-label">Visualização:</span>'+
 '<span class="visualization-select-wrap"><span class="visualization-symbol" aria-hidden="true">'+ico("list")+'</span>'+
 '<select class="visualization-select" data-filter="'+esc(filter)+'" aria-label="Visualização">'+options.map(([v,l])=>opt(v,l,value)).join("")+'</select>'+
 '<span class="visualization-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></span></label>';
}
function renderDemandas(){
 const done=["concluida","nao_concluida"].includes(state.statusFilter)||state.mode==="arquivo";
 const displayMode=state.mode==="arquivo"?"mensal":state.mode;
 let list=data.tasks.filter(t=>done?Boolean(t.archivedAt)&&
  (state.statusFilter==="nao_concluida"?taskStatus(t)==="nao_concluida":taskStatus(t)==="concluida"):
  filtered(t,displayMode));
 if(done)list=list.filter(t=>{
  const date=dt(t.archivedAt);
  return date&&date.getFullYear()===state.year&&date.getMonth()===state.month&&(!state.week||displayMode!=="semanal"||weekFor(date)===state.week);
 });
 else if(state.statusFilter!=="todas")list=list.filter(t=>taskStatus(t)===state.statusFilter);
 if(done&&state.statusFilter==="concluida"&&state.conclusionKind!=="todas")
   list=list.filter(t=>state.conclusionKind==="atraso"?taskWasLate(t):!taskWasLate(t));
 list.sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 const periodSelect='<label class="filter-item period-mode-filter"><span>PERÍODO</span><select class="select" data-filter="periodMode" aria-label="Período">'+
 [["mensal","Mensal"],["semanal","Semanal"]].map(([v,l])=>opt(v,l,displayMode)).join("")+'</select></label>';
 const canBulkDelete=done&&state.statusFilter!=="nao_concluida"&&canWrite();
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
 '<div class="demand-visual-toolbar">'+visualizationSelect("status",state.statusFilter)+
 (state.statusFilter==="concluida"?'<label class="filter-item period-mode-filter"><span>CONCLUSÃO</span><select class="select" data-filter="conclusionKind" aria-label="Tipo de conclusão">'+
 [["todas","Todas as concluídas"],["prazo","No prazo"],["atraso","Com atraso"]].map(([v,l])=>opt(v,l,state.conclusionKind)).join("")+'</select></label>':"")+periodSelect+'</div>'+
 '<div class="list-toolbar">'+period()+'</div><hr class="divider">'+
 toolbar+
 (list.length?list.map(t=>'<div class="live-task-card'+(picking?' archive-select-row':'')+'">'+
 (picking?'<label class="archive-task-selector"><input type="checkbox" data-archive-select value="'+esc(t.id)+'" '+(state.archiveSelectedIds.has(t.id)?"checked":"")+'><span>'+(state.archiveSelectedIds.has(t.id)?"Selecionada para excluir":"Marcar para excluir")+'</span></label>':"")+
 taskCard(t)+'</div>').join(""):empty("Nenhuma demanda encontrada","Selecione outro período ou registre uma demanda."))+'</section>';
}
// Agenda institucional. Demandas só entram como projeções de leitura, nunca são duplicadas.
const cronIso=(year,month,day)=>year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
const cronHours=item=>item.startTime&&item.endTime?item.startTime+" às "+item.endTime:
 item.timeNote||item.startTime||"Horário a definir";
// A atividade institucional conclui ao terminar a data/horário, sem ação humana.
// Horário local do PET Educação: Sergipe, UTC-3.
const cronEndInstant=entry=>{
 const end=String(entry.endDate||entry.finish||entry.date||"").slice(0,10);
 const time=String(entry.endTime||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(end))return NaN;
 return Date.parse(end+"T"+(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)?time+":00":"23:59:59")+"-03:00");
};
const cronHasEnded=entry=>{
 const at=cronEndInstant(entry);
 return Number.isFinite(at)&&at<=Date.now();
};
function cronSources(){
 const all=[];
 for(const e of state.cronItems||[])all.push({...e,kind:"cronograma",date:e.startDate,finish:e.endDate,done:cronHasEnded(e)});
 for(const t of data.tasks||[]){
  const due=stages(t).filter(x=>x?.dueAt);
  const slots=due.length?due:[{id:"registro",label:"Data da demanda",dueAt:taskDate(t)}];
  const status=taskStatus(t); // Respeita exatamente o sistema de Demandas.
  for(const slot of slots){
   if(!slot.dueAt)continue;
   const date=String(slot.dueAt).slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
   all.push({id:t.id,slotId:slot.id||date,kind:"demandas",title:t.title,description:"",
    date,finish:date,startTime:String(slot.dueAt).includes("T")?String(slot.dueAt).slice(11,16):null,
    endTime:null,timeNote:null,location:"",stageName:slot.label||"Prazo",
    status,done:status==="concluida"});
  }
 }
 return all;
}
function cronVisible(){
 const first=cronIso(state.cronYear,state.cronMonth,1),last=cronIso(state.cronYear,state.cronMonth,new Date(state.cronYear,state.cronMonth+1,0).getDate());
 return cronSources().filter(x=>(state.cronFilter==="todos"||x.kind===state.cronFilter)&&x.date<=last&&x.finish>=first)
  .sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||"99:99").localeCompare(String(b.startTime||"99:99"))||a.title.localeCompare(b.title,"pt-BR"));
}
async function loadCronYear(year){
 if(!canWrite()||state.cronLoading)return;
 state.cronLoading=true;state.cronError="";
 const owner=me?.id;
 try{
  const result=await request("/schedule?year="+encodeURIComponent(year));
  if(owner===me?.id){state.cronItems=result.items||[];state.cronLoadedYear=year;}
 }catch(error){
  if(owner===me?.id){state.cronError=error.message;state.cronLoadedYear=year;}
 }finally{
  state.cronLoading=false;
  if(routeParts().page==="cronograma")render();
 }
}
function cronCard(entry){
 const date=entry.date,day=Number(date.slice(8,10)),month=MONTHS[Number(date.slice(5,7))-1]?.slice(0,3)||"";
 const isTask=entry.kind==="demandas",finish=entry.finish!==date?" · até "+textDate(entry.finish):"";
 const status=isTask?(entry.status||"pendente"):(entry.done?"concluida":"pendente");
 const visualStatus=status==="concluida"?"done":status==="atrasada"?"late":status==="nao_concluida"?"unfinished":"pending";
 const canRemind=isTask?["pendente","atrasada"].includes(status):!entry.done;
 const actions=isTask?"":'<button type="button" class="chron-icon-action" data-do="cron-delete" data-id="'+esc(entry.id)+'" aria-label="Excluir '+esc(entry.title)+'" title="Excluir">'+ico("trash")+'</button>';
 const open=isTask?
  '<a class="chron-card-open" href="#/atividade/'+id(entry.id)+'" aria-label="Abrir detalhes da demanda '+esc(entry.title)+'"></a>':
  '<button type="button" class="chron-card-open" data-do="cron-details" data-id="'+esc(entry.id)+'" aria-label="Ver detalhes de '+esc(entry.title)+'"></button>';
 const hour=isTask?(entry.startTime?entry.startTime+" · ":"")+entry.stageName:cronHours(entry);
 return '<article class="chron-card '+(isTask?"chron-card--demand chron-card--"+status:"")+'">'+
  '<div class="chron-date chron-date--'+visualStatus+'" aria-label="'+esc(statusLabel[status]||"Pendente")+' em '+textDate(date)+'"><strong>'+day+'</strong><small>'+esc(month)+'</small></div>'+
  '<div class="chron-card-content"><div class="chron-card-top"><strong>'+esc(entry.title)+'</strong>'+
  (isTask?'<span class="chron-demand-mark" title="Demanda">Demanda</span>':"")+'</div>'+
  '<div class="chron-meta">'+ico("clock")+' '+esc(hour)+esc(finish)+'</div>'+
  (entry.location&&entry.location!=="—"?'<div class="chron-meta">'+ico("folder")+' '+esc(entry.location)+'</div>':"")+
  (entry.description?'<p class="chron-desc">'+esc(entry.description)+'</p>':"")+
  ((canRemind||actions)?'<div class="chron-actions">'+
   (canRemind?'<button type="button" class="chron-remind" data-do="cron-remind" data-kind="'+esc(entry.kind)+'" data-id="'+esc(entry.id)+'" data-title="'+esc(entry.title)+'" aria-label="Adicionar lembrete para '+esc(entry.title)+'" title="Adicionar lembrete">'+ico("bell")+' <span>Lembrar</span></button>':"")+
   actions+'</div>':"")+'</div>'+open+'</article>';
}
function closeCronDetails(){
 if(!state.cronDetails)return;
 if(history.state?.petCronDetails&&location.hash===lastHash){
  // Consome a entrada adicionada ao abrir a janela, sem abandonar o Cronograma.
  history.back();
  return;
 }
 state.cronDetails=null;
 render();
}
function openCronDetails(entryId){
 if(!(state.cronItems||[]).some(x=>x.id===entryId))return setToast("Atividade não encontrada.");
 state.cronDetails=entryId;state.cronReminder=null;
 history.pushState({...history.state,petCronDetails:entryId},"",location.href);
 render();
 $('[data-do="cron-details-close"]')?.focus();
}
function cronDetailsDialog(){
 const entry=(state.cronItems||[]).find(x=>x.id===state.cronDetails);
 if(!entry)return "";
 const dates=entry.startDate===entry.endDate?textDate(entry.startDate):textDate(entry.startDate)+" até "+textDate(entry.endDate);
 const completed=cronHasEnded(entry);
 return '<div class="chron-reminder-overlay chron-detail-overlay" role="presentation"><section class="chron-reminder-panel chron-detail-panel" role="dialog" aria-modal="true" aria-labelledby="cron-detail-title">'+
  '<div class="chron-editor-head"><div><span class="chron-kicker">ATIVIDADE DO CRONOGRAMA</span><h2 id="cron-detail-title">'+esc(entry.title)+'</h2></div>'+
  '<button type="button" class="chron-icon-action" data-do="cron-details-close" aria-label="Fechar detalhes">'+ico("close")+'</button></div>'+
  '<span class="chron-detail-status '+(completed?"is-done":"is-upcoming")+'">'+(completed?"Concluída automaticamente":"Programada")+'</span>'+
  '<dl class="chron-detail-info"><div><dt>Data</dt><dd>'+esc(dates)+'</dd></div>'+
  '<div><dt>Horário</dt><dd>'+esc(cronHours(entry))+'</dd></div>'+
  '<div><dt>Local</dt><dd>'+esc(entry.location||"Não informado")+'</dd></div>'+
  '<div><dt>Descrição / observações</dt><dd class="chron-detail-description">'+esc(entry.description||"Nenhuma observação.")+'</dd></div></dl>'+
  '<div class="chron-detail-actions"><button type="button" class="button ghost" data-do="cron-edit" data-id="'+esc(entry.id)+'">'+ico("edit")+' Editar atividade</button>'+
  '<button type="button" class="button ghost chron-delete-detail" data-do="cron-delete" data-id="'+esc(entry.id)+'">'+ico("trash")+' Excluir</button></div></section></div>';
}
function cronEditor(){
 const editing=state.cronEditing;
 if(!editing)return "";
 const old=editing==="new"?null:(state.cronItems||[]).find(x=>x.id===editing);
 if(!old&&editing!=="new")return "";
 const first=old?.startDate||dateKey(current),last=old?.endDate||first;
 const imported=old?.source==="word-2026";
 return '<section class="card card-pad chron-editor"><div class="chron-editor-head"><h2>'+(old?"Editar atividade":"Nova atividade")+'</h2><button class="chron-icon-action" type="button" data-do="cron-close" aria-label="Fechar">'+ico("close")+'</button></div>'+
 '<form id="cron-form" class="register-form" data-id="'+esc(old?.id||"")+'">'+
 '<label>Nome da atividade *<input name="title" maxlength="180" required placeholder="Ex.: Oficina de Fotografia" value="'+esc(old?.title||"")+'"></label>'+
 '<div class="chron-form-grid"><label>Data de início *<input type="date" name="startDate" value="'+esc(first)+'" required></label>'+
 '<label>Data de término *<input type="date" name="endDate" value="'+esc(last)+'" required></label></div>'+
 '<div class="chron-form-grid"><label>Horário de início'+(imported?"":" *")+'<input type="time" name="startTime" value="'+esc(old?.startTime||"")+'" '+(imported?"":"required")+'></label>'+
 '<label>Horário de término'+(imported?"":" *")+'<input type="time" name="endTime" value="'+esc(old?.endTime||"")+'" '+(imported?"":"required")+'></label></div>'+
 (imported&&old?.timeNote?'<p class="chron-legacy">Horário registrado no Word: '+esc(old.timeNote)+'. Se houver horário exato, preencha início e término.</p>':"")+
 '<input type="hidden" name="timeNote" value="'+esc(old?.timeNote||"")+'">'+
 '<label>Local<input name="location" maxlength="240" value="'+esc(old?.location||"")+'" placeholder="Ex.: Sala do PET"></label>'+
 '<label>Descrição / observações<textarea name="description" maxlength="1800" rows="3" placeholder="Texto complementar (opcional)">'+esc(old?.description||"")+'</textarea></label>'+
 '<div class="chron-form-actions"><button class="button ghost" type="button" data-do="cron-close">Cancelar</button><button class="button primary" type="submit">'+ico("check")+' Salvar atividade</button></div></form></section>';
}
function cronReminderDialog(){
 const item=state.cronReminder;if(!item)return "";
 return '<div class="chron-reminder-overlay" role="presentation"><section class="chron-reminder-panel" role="dialog" aria-modal="true" aria-labelledby="cron-reminder-title">'+
 '<div class="chron-editor-head"><div><span class="chron-kicker">AVISO PESSOAL</span><h2 id="cron-reminder-title">Lembrar: '+esc(item.title)+'</h2></div>'+
 '<button type="button" class="chron-icon-action" data-do="cron-remind-close" aria-label="Fechar">'+ico("close")+'</button></div>'+
 '<form id="cron-reminder-form"><label>Quando deseja ser lembrado?<input type="datetime-local" name="at" value="'+esc(reminderLocalValue(3600000))+'" required></label>'+
 '<p class="chron-legacy">Será enviado ao celular ou PC conectado. Depois do envio, o lembrete é excluído de Meus lembretes.</p>'+
 '<button class="button primary" type="submit">'+ico("bell")+' Salvar lembrete</button></form></section></div>';
}
function cronCalendar(items){
 const y=state.cronYear,m=state.cronMonth;
 if(state.cronCalendarMode==="ano"){
  return '<section class="chron-year-grid" aria-label="Calendário anual">'+MONTHS.map((label,index)=>{
   const n=cronSources().filter(x=>(state.cronFilter==="todos"||x.kind===state.cronFilter)&&x.date<=cronIso(y,index,new Date(y,index+1,0).getDate())&&x.finish>=cronIso(y,index,1)).length;
   return '<button type="button" class="chron-year-month" data-do="cron-year-month" data-month="'+index+'"><strong>'+esc(label)+'</strong><span>'+n+' '+(n===1?"atividade":"atividades")+'</span></button>';
  }).join("")+'</section>';
 }
 const firstDay=(new Date(y,m,1).getDay()+6)%7,lastDay=new Date(y,m+1,0).getDate();
 const chosen=state.cronSelectedDay||dateKey(current),isCurrentMonth=chosen.slice(0,7)===cronIso(y,m,1).slice(0,7);
 const selected=isCurrentMonth?chosen:cronIso(y,m,1);
 const week=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
 const cells=Array.from({length:firstDay},()=>'<span class="chron-blank"></span>');
 for(let day=1;day<=lastDay;day++){
  const date=cronIso(y,m,day);
  const matching=items.filter(x=>x.date<=date&&x.finish>=date);
  const kinds=[...new Set(matching.map(x=>x.kind))],hasCompleted=matching.some(x=>x.done),hasPending=matching.some(x=>!x.done);
  cells.push('<button type="button" data-do="cron-day" data-date="'+date+'" class="chron-calendar-day '+(selected===date?"active":"")+'" '+(date===dateKey(current)?'aria-current="date"':"")+' aria-label="'+textDate(date)+'; '+matching.length+' registros"><span>'+day+'</span><i>'+
    (hasPending?'<b class="pending"></b>':"")+(hasCompleted?'<b class="done"></b>':"")+(kinds.includes("demandas")?'<b class="demand"></b>':"")+'</i></button>');
 }
 const picked=items.filter(x=>x.date<=selected&&x.finish>=selected);
 return '<section class="chron-calendar card card-pad"><div class="chron-weekdays">'+week.map(v=>'<span>'+v+'</span>').join("")+'</div>'+
 '<div class="chron-days">'+cells.join("")+'</div></section>'+
 '<div class="chron-day-caption">Dia '+textDate(selected)+'</div>'+
 (picked.length?'<div class="chron-cards">'+picked.map(cronCard).join("")+'</div>':'<div class="chron-empty">Nenhuma atividade neste dia.</div>');
}
const QUICK_NAV_ITEMS=[["inicio","Início","grid"],["cronograma","Cronograma","calendar"],["demandas","Demandas","list"],["meus-lembretes","Lembretes","bell"],["conta","Perfil","user"],["minhas-pendencias","Pendências","checklist"],["comissoes","Comissões","users"],["reunioes","Atas","calendar"],["admin","Administração","settings"]];
const quickAvailable=()=>{
 const role=me?.role;
 return QUICK_NAV_ITEMS.filter(([v])=>(role!=="usuario"||!["cronograma","meus-lembretes","minhas-pendencias","reunioes"].includes(v))&&(v!=="admin"||role==="admin"));
};
function renderQuickNav(){
 const bar=$("#pet-quickbar");if(!bar)return;
 const prefs=state.quickNavPrefs;
 if(!me||me.mustChangePassword||!prefs?.enabled||routeParts().page==="login"){
  bar.hidden=true;bar.innerHTML="";return;
 }
 const available=new Map(quickAvailable().map(x=>[x[0],x]));
 const list=(prefs.items||[]).filter(v=>available.has(v)).slice(0,5);
 bar.innerHTML=list.map(v=>{
  const [,label,symbol]=available.get(v),active=routeParts().page===v||(v==="admin"&&routeParts().page==="admin");
  return '<a href="#/'+(v==="admin"?"admin/painel":v)+'" class="pet-quicknav-link '+(active?"active":"")+'" '+(active?'aria-current="page"':'')+'>'+ico(symbol)+'<span>'+esc(label)+'</span></a>';
 }).join("");
 bar.hidden=!list.length;
}
async function loadQuickNavPrefs(){
 if(!me||me.mustChangePassword){state.quickNavPrefs=null;renderQuickNav();return}
 const account=me.id;
 try{
  const result=await request("/quick-nav");
  if(me?.id!==account)return;
  state.quickNavPrefs=result;state.quickNavDraft={enabled:result.enabled,items:[...result.items]};
  renderQuickNav();
  if(routeParts().page==="conta"&&state.accountTab==="atalhos")render();
 }catch(error){console.warn("PET Gestão: atalhos indisponíveis:",error.message);renderQuickNav()}
}
function renderQuickNavSettings(){
 const available=quickAvailable(),prefs=state.quickNavDraft||state.quickNavPrefs||{enabled:true,items:["inicio","cronograma","demandas","meus-lembretes","conta"]};
 const selected=prefs.items||[];
 return '<div class="account-pane-intro"><span class="profile-section-eyebrow">SEU CELULAR</span><h2>Navegação rápida</h2><p>Personalize a barra inferior e escolha até cinco atalhos. A seleção é salva na sua conta.</p></div>'+
 '<section class="card card-pad chron-quicknav-settings"><label class="chron-switch"><input id="quicknav-enabled" type="checkbox" '+(prefs.enabled?"checked":"")+'> Ativar barra rápida no celular</label>'+
 '<p class="chron-legacy">O menu lateral continua disponível. Os atalhos respeitam suas permissões.</p>'+
 '<div class="chron-shortcut-grid">'+available.map(([key,label,icon])=>
  '<label class="chron-shortcut-option"><input type="checkbox" data-quicknav-choice="'+esc(key)+'" '+(selected.includes(key)?"checked":"")+' '+(!selected.includes(key)&&selected.length>=5?"disabled":"")+'> '+ico(icon)+' '+esc(label)+'</label>').join("")+'</div>'+
 '<h3>Ordem da barra</h3><div class="chron-shortcut-order">'+selected.map((key,i)=>{
  const found=available.find(x=>x[0]===key);if(!found)return "";
  return '<div class="chron-shortcut-selected">'+ico(found[2])+' <span>'+esc(found[1])+'</span>'+
   '<button type="button" data-do="quicknav-move" data-index="'+i+'" data-direction="-1" aria-label="Mover '+esc(found[1])+' para cima" '+(i===0?"disabled":"")+'>↑</button>'+
   '<button type="button" data-do="quicknav-move" data-index="'+i+'" data-direction="1" aria-label="Mover '+esc(found[1])+' para baixo" '+(i===selected.length-1?"disabled":"")+'>↓</button></div>';
 }).join("")+'</div>'+
 '<button type="button" class="button primary" data-do="quicknav-save">'+ico("check")+' Salvar meus atalhos</button></section>';
}
function renderCronograma(){
 if(!canWrite())return header("Acesso restrito","Cronograma PET","Área exclusiva de PETianos(as), Tutoria e Administração.");
 const y=state.cronYear,m=state.cronMonth,items=cronVisible();
 const loaded=state.cronLoadedYear===y;
 const monthActions='<div class="chron-month-nav"><button type="button" data-do="cron-prev" aria-label="Mês anterior">'+ico("chevron-left")+'</button>'+
 '<strong>'+MONTHS[m]+' de '+y+'</strong><button type="button" data-do="cron-next" aria-label="Próximo mês">'+ico("chevron-right")+'</button></div>';
 const toggle='<div class="chron-view-actions"><button class="button ghost" type="button" data-do="cron-view" data-view="'+(state.cronView==="lista"?"calendario":"lista")+'">'+ico("calendar")+' '+(state.cronView==="lista"?"Ver calendário":"Ver lista")+'</button>'+
 (state.cronView==="calendario"?'<button class="button ghost" type="button" data-do="cron-calendar-mode">'+(state.cronCalendarMode==="ano"?"Ver mês":"Ver ano inteiro")+'</button>':"")+'</div>';
 const filters='<div class="chron-toolbar"><label class="chron-origin-picker">Exibir<select class="select" id="cron-source">'+
 [["cronograma","Cronograma"],["demandas","Demandas"],["todos","Todos"]].map(([v,l])=>opt(v,l,state.cronFilter)).join("")+'</select></label>'+
 '<label class="chron-year-picker">Ano<select class="select" id="cron-year">'+Array.from({length:12},(_,i)=>current.getFullYear()-4+i).map(v=>opt(v,v,y)).join("")+'</select></label>'+
 toggle+'</div>';
 let content=!loaded?'<div class="chron-empty">Carregando atividades…</div>':
 state.cronError?'<div class="chron-empty">'+esc(state.cronError)+'</div>':
 state.cronView==="calendario"?cronCalendar(items):
 items.length?'<div class="chron-cards">'+items.map(cronCard).join("")+'</div>':
 '<div class="chron-empty">Nenhum registro neste mês para o filtro escolhido.</div>';
 return header("Organização","Cronograma PET","Atividades do PET organizadas por data, horário e local.",
 '<button type="button" class="button primary" data-do="cron-new">'+ico("plus")+' Nova atividade</button>')+
 '<div class="chron-page">'+filters+cronEditor()+monthActions+content+cronReminderDialog()+cronDetailsDialog()+'</div>';
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
  imaginacao:'<g filter="url(#petCardShadow)"><path d="M109 32C76 32 53 54 53 84c0 22 12 35 26 47l6 15h48l6-15c14-12 26-25 26-47 0-30-23-52-56-52z" fill="url(#petCardGold)" stroke="#eba72d" stroke-width="4" stroke-linejoin="round"/><path d="m93 96 16 17 16-17" stroke="#fff6c4" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M82 67q9-22 33-22" fill="none" stroke="#fff" stroke-opacity=".49" stroke-width="9" stroke-linecap="round"/><rect x="84" y="145" width="50" height="13" rx="4" fill="#625b80"/><rect x="90" y="157" width="38" height="10" rx="5" fill="#393852"/></g><g stroke="#ffb317" stroke-width="7" stroke-linecap="round" fill="none"><path d="M109 17V4M55 36 44 25M163 36l11-11M39 85H25M179 85h14M57 129l-11 10M161 129l11 10"/></g>',
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
// Lembretes do próprio usuário, separados da criação rápida de demandas.
const reminderLocalValue=(offset=3600000)=>{
 return new Date(Date.now()+offset-3*3600000).toISOString().slice(0,16);
};
// O prazo é apenas uma sugestão inicial. O usuário pode editar livremente a data e a mensagem.
// Mesmas etapas exibidas em "Prazos e etapas" nos detalhes da demanda.
// Não oferecer ao usuário as etapas atribuídas explicitamente a outra pessoa.
function reminderEligibleStages(task){
 if(!task||!me)return [];
 return stages(task).filter(stage=>{
  if(!stage?.id||!stage.dueAt||stage.completedAt)return false;
  const owners=Array.isArray(stage.assigneeIds)?stage.assigneeIds:[];
  return !owners.length||owners.some(uid=>String(uid)===String(me.id));
 });
}
function reminderStageFor(task,stageId){
 return reminderEligibleStages(task).find(stage=>String(stage.id)===String(stageId||""))||null;
}
function reminderSuggestedAt(t,onlyStage=null){
 const nowMs=Date.now();
 const rawDates=(onlyStage?[onlyStage.dueAt]:
  [...reminderEligibleStages(t).map(stage=>stage.dueAt),t?.displayDate]).filter(Boolean);
 const next=rawDates.map(raw=>{
  const value=String(raw),date=value.slice(0,10);
  const hasTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const local=hasTime?value.slice(0,16):date+"T09:00";
  const instant=Date.parse(local+":00-03:00");
  return Number.isFinite(instant)&&instant>nowMs?{local,instant}:null;
 }).filter(Boolean).sort((a,b)=>a.instant-b.instant)[0];
 return next?.local||reminderLocalValue();
}
const reminderDefaultSlot=(mode,task=null,stage=null)=>mode==="once"?{at:task?reminderSuggestedAt(task,stage):reminderLocalValue()}:
 mode==="daily"?{time:"09:00"}:{weekday:1,time:"09:00"};
async function loadPersonalReminders(){
 const id=me?.id;
 if(!id||state.reminderLoading)return;
 state.reminderLoading=true;
 try{
  const data=await request("/personal-reminders");
  if(me?.id!==id)return;
  state.reminderItems=data.items||[];
  state.reminderLoadedFor=id;
  if(routeParts().page==="meus-lembretes")render();
 }catch(error){setToast("Não foi possível carregar os lembretes: "+error.message)}
 finally{state.reminderLoading=false}
}
function readReminderSlots(form){
 return [...form.querySelectorAll(".reminder-slot-row")].map(row=>({
  at:row.querySelector('[data-reminder-field="at"]')?.value||"",
  time:row.querySelector('[data-reminder-field="time"]')?.value||"",
  weekday:Number(row.querySelector('[data-reminder-field="weekday"]')?.value||0)
 }));
}
function captureReminderEditor(){
 const form=$("#personal-reminder-form");if(!form)return;
 state.reminderDraft={
  reminderType:form.elements.reminderType?.value||"task",
  taskId:form.elements.taskId?.value||"",
  taskStageId:form.elements.taskStageId?.value||"",
  title:form.elements.title?.value||"",
  message:form.elements.message?.value||"",
  channels:{email:false,android:form.elements.android?.checked===true,pc:form.elements.pc?.checked===true},
  autoDelete:form.elements.autoDelete?.checked===true,
  repeatUntil:form.elements.repeatUntil?.value||""
 };
 state.reminderRecurrence=form.elements.recurrence?.value||"once";
 state.reminderSchedules=readReminderSlots(form);
}
function openReminderEditor(item=null){
 state.reminderEditing=item?.id||"new";
 state.reminderRecurrence=item?.recurrence||"once";
 state.reminderDraft={reminderType:item?(item.taskId?"task":"custom"):"task",
  taskId:item?.taskId||"",taskStageId:item?.taskStageId||"",title:item?.title||"",message:item?.message||"",
  channels:item?.channels||{email:false,android:true,pc:true},
  autoDelete:item?.autoDelete??true,repeatUntil:item?.repeatUntil||""};
 state.reminderSchedules=item?.schedules?.map(x=>item.recurrence==="once"?{at:x.at}:{time:x.at,weekday:x.weekday})||
  [reminderDefaultSlot(state.reminderRecurrence)];
 render();
 $("#personal-reminder-form")?.scrollIntoView({behavior:"smooth",block:"start"});
}
function renderReminderSlots(){
 const mode=state.reminderRecurrence||"once",days=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
 return '<div class="reminder-slots">'+(state.reminderSchedules||[]).map((slot,i)=>
  '<div class="reminder-slot-row" data-index="'+i+'">'+
  (mode==="once"?'<label>Data e horário <input type="datetime-local" data-reminder-field="at" required value="'+esc(slot.at||reminderLocalValue())+'"></label>':
   (mode==="weekly"?'<label>Dia da semana<select class="select" data-reminder-field="weekday">'+days.map((d,n)=>opt(String(n),d,String(slot.weekday??1))).join("")+'</select></label>':"")+
   '<label>Horário <input type="time" data-reminder-field="time" value="'+esc(slot.time||"09:00")+'" required></label>')+
  '<button type="button" class="button ghost reminder-slot-remove" data-do="reminder-remove-time" data-index="'+i+'" aria-label="Remover horário" '+(state.reminderSchedules.length===1?"disabled":"")+'>'+ico("trash")+'</button></div>').join("")+
  '</div><button type="button" class="button ghost" data-do="reminder-add-time" '+(state.reminderSchedules.length>=20?"disabled":"")+'>'+ico("plus")+' Adicionar outro horário</button>';
}
function renderPersonalReminders(){
 if(!canWrite())return authRequired();
 const pending=data.tasks.filter(isMyPending).sort((a,b)=>String(taskDate(a)).localeCompare(String(taskDate(b))));
 const draft=state.reminderDraft||{},editing=state.reminderEditing!==false;
 const custom=draft.reminderType==="custom",mode=state.reminderRecurrence;
 const selectedTask=pending.find(task=>String(task.id)===String(draft.taskId||""));
 const selectableStages=reminderEligibleStages(selectedTask);
 const chosenStage=reminderStageFor(selectedTask,draft.taskStageId);
 const headerHtml=header("Pessoal","Meus lembretes","Seus alarmes pessoais, sem alterar o cadastro das demandas.");
 const formHtml=!editing?"":'<section class="card card-pad reminder-editor">'+
  '<div class="section-head"><div><h2>'+(state.reminderEditing==="new"?"Novo lembrete":"Editar lembrete")+'</h2><p>Escolha vários dias e horários para ser avisado (horário de Sergipe).</p></div>'+
  '<button type="button" class="button ghost" data-do="reminder-close">Fechar</button></div>'+
  '<form id="personal-reminder-form" class="register-form">'+
  '<label>Tipo de lembrete<select class="select" name="reminderType" id="reminder-type">'+
  opt("task","Uma das minhas pendências",custom?"custom":"task")+opt("custom","Personalizado (assunto pessoal)",custom?"custom":"task")+'</select></label>'+
  (custom?'<label>Título do lembrete<input name="title" maxlength="120" required placeholder="Ex.: Ligar para alguém" value="'+esc(draft.title||"")+'"></label>':
   '<label>Minha demanda<select class="select" name="taskId" id="reminder-task" required><option value="">Selecione a demanda</option>'+
   pending.map(t=>opt(t.id,t.title,draft.taskId||"")).join("")+'</select></label>'+
   (selectedTask?'<label>Minha parte da demanda (Prazos e etapas)<select class="select" name="taskStageId" id="reminder-stage">'+
    '<option value="">Lembrete geral da demanda</option>'+
    selectableStages.map(stage=>opt(stage.id,(stage.label||"Etapa")+" · "+textDate(stage.dueAt),draft.taskStageId||"")).join("")+
    '</select></label>'+
    (chosenStage?'<div class="reminder-stage-preview">'+ico("calendar")+
     '<div><strong>'+esc(chosenStage.label||"Etapa selecionada")+'</strong><span>Data cadastrada: '+textDate(chosenStage.dueAt)+
     (chosenStage.assigneeIds?.length?' · Responsável: '+esc(stageResponsibleNames(chosenStage,selectedTask)):' · Sem responsável individual definido')+
     '</span></div></div>':"")+
    '<p class="reminder-stage-hint">Escolha a etapa em que vai atuar. O horário abaixo é apenas uma sugestão: você pode escolher o dia 28, por exemplo, e receber somente nesse dia, sem avisos deste lembrete nos dias anteriores.</p>':"")+
   (!pending.length?'<p class="field-hint">Você não possui pendências ativas. Use Personalizado para criar um aviso pessoal.</p>':""))+
  '<label>Repetir<select class="select" name="recurrence" id="reminder-recurrence">'+
  [["once","Uma vez (um ou vários dias)"],["daily","Todos os dias"],["weekly","Semanalmente"]].map(([v,l])=>opt(v,l,mode)).join("")+'</select></label>'+
  renderReminderSlots()+
  (mode==="once"?"":'<label>Repetir até (opcional)<input type="date" name="repeatUntil" value="'+esc(draft.repeatUntil||"")+'"></label>')+
  '<label>Mensagem (opcional)<textarea name="message" maxlength="200" rows="2" placeholder="Se ficar vazio, o PET Gestão usa a mensagem padrão.">'+esc(draft.message||"")+'</textarea></label>'+
  '<fieldset class="reminder-channels"><legend>Receber por</legend>'+
  [["android","Celular"],["pc","PC"]].map(([key,label])=>
   '<label><input type="checkbox" name="'+key+'" '+(draft.channels?.[key]?"checked":"")+'> '+label+'</label>').join("")+'</fieldset>'+
  '<div class="reminder-auto-card"><label class="reminder-auto-toggle"><input type="checkbox" name="autoDelete" '+(draft.autoDelete?"checked":"")+'><span>Excluir automaticamente após notificar</span></label>'+
  '<p class="field-hint">Ativado: remove os horários após avisar e apaga o lembrete quando terminar. Desativado: mantém o histórico para você excluir manualmente.</p></div>'+
  '<div class="reminder-form-actions"><button type="button" class="button ghost" data-do="reminder-close">Cancelar</button><button class="button primary" type="submit">'+ico("check")+' Salvar lembrete</button></div>'+
  '</form></section>';
 const items=state.reminderItems||[];
 const list='<section class="card card-pad reminder-list"><div class="section-head"><div><h2>Lembretes cadastrados</h2><p>Somente você pode visualizar ou modificar seus alarmes.</p></div></div>'+
 (state.reminderLoadedFor!==me?.id?'<p class="field-hint">Carregando lembretes...</p>':
  items.length?items.map(item=>{
   const times=item.schedules||[],active=times.filter(x=>x.status!=="disparado");
   const dates=times.slice(0,3).map(x=>item.recurrence==="once"?x.at.replace("T"," às "):
    item.recurrence==="daily"?"Diariamente às "+x.at:
    ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][x.weekday]+" às "+x.at).join(" · ");
   return '<article class="reminder-list-row"><div class="reminder-list-icon">'+ico(item.taskId?"calendar":"bell")+'</div>'+
    '<div class="reminder-list-info"><strong>'+esc(item.title)+'</strong><p>'+esc(dates)+'</p>'+
    '<small>'+(item.taskId?(item.taskStageId?"Etapa: "+esc(stages(data.tasks.find(t=>t.id===item.taskId)||{}).find(stage=>String(stage.id)===String(item.taskStageId))?.label||"Etapa da demanda"):"Vinculado à minha demanda"):"Personalizado")+' · '+active.length+' horário(s) ativo(s)'+(item.autoDelete?" · Exclusão automática":"")+'</small></div>'+
    '<div class="reminder-list-actions"><button type="button" class="button ghost" data-do="reminder-edit" data-id="'+esc(item.id)+'">'+ico("edit")+' Editar</button>'+
    '<button type="button" class="button ghost" data-do="reminder-delete" data-id="'+esc(item.id)+'">'+ico("trash")+' Excluir</button></div></article>';
  }).join(""):'<p class="field-hint">Nenhum lembrete cadastrado. Crie seu primeiro aviso acima.</p>')+'</section>';
 return headerHtml+'<div class="reminder-page"><div class="reminder-page-actions"><button type="button" class="button primary" data-do="reminder-new">'+ico("plus")+' Novo lembrete</button>'+
 '<span class="field-hint">Se a demanda for excluída ou sua pendência terminar, o lembrete vinculado será removido.</span></div>'+formHtml+list+'</div>';
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
 '<p class="task-form-help-short">Selecione quem realizará a atividade.</p>'+
 '<details class="task-form-explanation"><summary>Como funciona?</summary><p>Escolha quem ficará responsável por realizar esta atividade. Ao selecionar uma <strong>comissão</strong>, a demanda aparece na página dessa equipe. Ao escolher <strong>pessoas</strong>, ela aparece em Minhas pendências de cada responsável. Em <strong>Todos(as)</strong>, todos os integrantes com permissão de concluir recebem a demanda. A exibição na Visão geral pode ser escolhida abaixo.</p></details></div></div><div class="segmented assignment-modes">'+opts.map(([s,n])=>'<button type="button" class="'+(state.assignmentScope===s?"active":"")+'" data-do="assignment-scope" data-value="'+s+'">'+n+'</button>').join("")+'</div>'+
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
  return '<div class="register-deadlines collective-date-panel"><div class="task-form-deadlines-heading"><span class="task-form-help-icon">'+ico("calendar")+'</span><div><h3>'+title+'</h3><p>Escolha o dia, mês e ano da atividade.</p>'+
   '<details class="task-form-explanation"><summary>Entenda esta data</summary><p>'+help+'</p></details></div></div>'+
   collectiveEventDate(saved)+'</div>';
 }
 return '<div class="register-deadlines"><div class="section-head"><div class="task-form-deadlines-heading"><span class="task-form-help-icon">'+ico("calendar")+'</span><div><h3>Prazos por etapa</h3><p>Adicione datas e etapas quando precisar. São opcionais.</p>'+
 '<details class="task-form-explanation"><summary>Entenda os prazos</summary><p>As etapas são <strong>opcionais</strong>. Você pode salvar a demanda sem prazo ou adicionar Prazo, Correção, Postagem ou uma etapa personalizada.</p></details></div></div><button class="button ghost" type="button" data-do="add-stage">+ Adicionar etapa</button></div>'+
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
 '<p class="field-hint task-file-help">Anexe até 8 fotos (JPG, PNG ou WebP, até 25 MB cada). Mantemos a qualidade original, sem recortes ou compactação. Somente PETianos(as) podem acessar; as fotos não são enviadas por e-mail.</p>'+
 ((t?.attachments||[]).length?'<div class="task-stored-files"><h4>Fotos armazenadas</h4>'+taskFileList(t)+'</div>':"")+
 '<label class="task-file-picker"><span class="task-file-picker-label">Selecionar fotos</span><span class="task-file-picker-button" aria-hidden="true">Escolher arquivos</span><input id="task-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Escolher fotos da demanda"></label>'+
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
 return header("Cadastros",t?"Editar demanda":"Registrar demanda",
 "Defina o título, os responsáveis, a visibilidade e os prazos da atividade.",
 (t?'<button type="submit" form="task-form" class="button primary task-form-header-save">'+ico("check")+' Salvar demanda</button>':""))+
 '<section class="card card-pad register-page task-form-v2"><form id="task-form" data-id="'+esc(t?.id||"")+'" class="register-form task-form-refined">'+
 '<section class="task-form-section task-form-main" aria-labelledby="task-form-info-title">'+
 '<div class="task-form-section-heading"><span class="task-form-section-icon" aria-hidden="true">'+ico("list")+'</span><h2 id="task-form-info-title">Informações da demanda</h2></div>'+
 '<label class="task-form-title-field">Título da demanda <span class="task-form-required">*</span><input name="title" maxlength="180" required placeholder="Ex.: Organizar evento de integração" value="'+esc(t?.title||"")+'"></label></section>'+
 '<section class="task-form-section task-form-notes" aria-label="Anotações da comissão">'+
 '<div class="task-form-section-heading"><span class="task-form-section-icon" aria-hidden="true">'+ico("list")+'</span><h2>Anotações da comissão</h2></div>'+
 '<p class="task-form-section-intro">Registre detalhes e observações importantes.</p>'+
 richEditor("description",t?.description||"","Descreva a demanda...")+'</section>'+
 '<section class="task-form-section task-form-assignees" aria-label="Responsáveis">'+
 '<div id="assignment-container">'+assignmentView()+'</div></section>'+
 '<section class="task-form-section task-form-visibility-section" aria-label="Visibilidade da demanda">'+
 '<fieldset class="task-visibility"><legend>Onde exibir a demanda?</legend>'+
 '<p class="task-form-section-intro">Escolha em quais áreas a demanda ficará em destaque.</p>'+
 '<details class="task-form-explanation"><summary>Entenda a visibilidade</summary>'+
 '<p>Em qualquer opção, a demanda continua disponível em Demandas e nas pendências dos responsáveis. A escolha define apenas sua presença na Visão geral.</p></details>'+
 '<div class="task-visibility-choices">'+
 '<label class="visibility-choice"><input type="radio" name="overviewVisibility" value="geral" '+(t?.overviewVisible!==false?'checked':"")+'><span><strong>Visão geral, Demandas e comissões</strong><small>Visível na Visão geral, em Demandas e nas comissões vinculadas.</small></span></label>'+
 '<label class="visibility-choice"><input type="radio" name="overviewVisibility" value="comissao" '+(t?.overviewVisible===false?'checked':"")+' '+(state.assignmentScope!=="todos"&&state.selectedCommissions.size?"":"disabled")+'><span><strong>Somente nas comissões</strong><small>Sem card na Visão geral; permanece em Demandas e em Minhas pendências dos integrantes.</small></span></label>'+
 '</div></fieldset></section>'+
 '<section class="task-form-section task-form-deadlines-section" aria-label="Datas e prazos">'+
 '<div id="deadline-settings">'+renderDeadlineSettings(t?(t.deadlines||[]):state.assignmentScope==="todos"?[]:[{label:"Prazo",dueAt:""}])+'</div></section>'+
 '<details class="task-form-section task-form-review-section" '+(t?'open':'')+'>'+
 '<summary class="task-form-review-summary"><span class="task-form-section-icon" aria-hidden="true">'+ico("list")+'</span>'+
 '<span class="task-form-review-summary-copy"><strong>Texto para revisão (opcional)</strong><small>Adicione um texto para revisão da tutoria.</small></span>'+
 '<span class="task-form-review-chevron" aria-hidden="true">⌄</span></summary>'+
 '<div class="task-form-review-content">'+(t?lastReviewEdit(t):"")+richEditor("captionText",t?.captionText||"")+'</div></details>'+
 taskFileForm(t)+
 (t?"":'<div class="form-actions task-form-save-actions"><button type="submit" class="button primary">'+ico("check")+' Salvar demanda</button></div>')+
 '</form></section>';
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
 if(t.archivedAt)return '<span class="task-status task-status-'+taskStatus(t)+' detail-status-final">'+
 (t.closureOutcome==="nao_concluida"?"Não concluída":taskWasLate(t)?"Concluída com atraso":"Concluída")+'</span>';
 if(isEveryoneAssigned(t))return '<span class="task-status task-status-pendente detail-status-final" title="Concluído automaticamente após o dia do evento">Evento programado · Conclusão automática</span>';
 return '<label class="detail-status-control detail-status-'+status+'"><span class="detail-status-caption">Status</span>'+
 '<select class="detail-status-select" data-detail-status data-id="'+esc(t.id)+'" aria-label="Status da demanda: '+statusLabel[status]+'">'+
 '<option value="'+status+'" selected>'+statusLabel[status]+'</option>'+
 '<option value="concluir">Concluído</option>'+
 (isLate(t)&&taskProgress(t).done>0&&pendingParticipationCount(t)>0?
 '<option value="encerrar-incompleta">Encerrar como não concluída</option>':"")+'</select>'+
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
// Link principal: arquivo da versão Android publicada, sem abrir a página de Releases.
// Mantemos uma segunda origem no GitHub Pages caso a rede bloqueie downloads do GitHub.
function renderIOSInstall(){
 const installed=iosDevice()&&installedAsApp();
 return '<section class="account-app-install account-ios-install" aria-label="Instalar PET Gestão no iPhone ou iPad">'+
  '<div class="account-app-install-head"><span class="account-app-install-icon">'+ico("download")+'</span><div>'+
  '<h3>Aplicativo PET Gestão para iPhone e iPad</h3>'+
  '<p>Instale pela Tela de Início do iOS, com ícone próprio e notificações de demandas, prazos e lembretes (iOS 16.4 ou superior).</p></div></div>'+
  '<button type="button" class="button primary account-app-install-button" data-do="install-ios-app">'+ico("download")+' '+(installed?"Ver como ativar notificações no iPhone":"Instalar no iPhone / iPad")+'</button>'+
  '<p class="account-app-install-help">No Safari, abra o PET Gestão, toque em Compartilhar e escolha Adicionar à Tela de Início. Depois abra o ícone instalado, entre na conta, acesse Notificações e permita o recebimento. Não é preciso baixar arquivo .ipa.</p>'+
  '</section>';
}
function renderAppInstall(){
 const apkRelease="https://github.com/peteducacao/pet-gestao/releases/download/android-apk/PET-Gestao.apk";
 return '<section class="account-app-install" aria-label="Baixar APK do PET Gestão">'+
  '<div class="account-app-install-head"><span class="account-app-install-icon">'+ico("download")+'</span><div>'+
  '<h3>Aplicativo PET Gestão para Android</h3>'+
  '<p>Instale o aplicativo no celular, sem depender da Play Store. Ele acompanha as atualizações do site e acessa as mesmas contas e dados do PET.</p></div></div>'+
  '<a class="button primary account-app-install-button" href="'+apkRelease+'" target="_blank" rel="noopener noreferrer" aria-label="Baixar APK do PET Gestão para Android">'+
  ico("download")+' Baixar APK para Android</a>'+
  '<p class="account-app-install-help">Se não iniciar o download, <a href="./downloads/PET-Gestao.apk" download="PET-Gestao.apk">baixe pelo servidor do site</a> ou abra este endereço no Chrome. Android 8 ou superior. Após baixar, abra o arquivo e autorize a instalação, se solicitado. O aplicativo utiliza a internet para sincronizar dados.</p>'+
  '</section>';
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
 const tab=me.mustChangePassword?"seguranca":(["perfil","seguranca","notificacoes","aplicativos","atalhos"].includes(state.accountTab)?state.accountTab:"perfil");
 const tabButton=(key,name,description,iconName)=>
  '<button type="button" class="account-hub-nav-btn '+(tab===key?"is-active":"")+'" data-do="account-tab" data-tab="'+key+'" role="tab" aria-selected="'+(tab===key)+'" aria-controls="account-pane-'+key+'" id="account-tab-'+key+'" tabindex="0">'+
  '<span class="account-hub-nav-icon">'+ico(iconName)+'</span><span class="account-hub-nav-text"><strong>'+name+'</strong><small>'+description+'</small></span></button>';
 const panel=(key,content)=>
  '<section class="account-hub-pane '+(key==="perfil"?"account-profile":"")+'" id="account-pane-'+key+'" role="tabpanel" aria-labelledby="account-tab-'+key+'" '+(tab!==key?"hidden":"")+'>'+content+'</section>';
 const profileContent=
  '<div class="profile-hero"><div class="profile-hero-top"><span class="profile-section-eyebrow">IDENTIFICAÇÃO</span><span class="profile-hero-brand">PET EDUCAÇÃO · UFS</span></div>'+
  '<div class="account-profile-info">'+profilePhoto+
  '<div class="profile-identity"><h2>'+esc(me.name)+'</h2><p class="profile-email">'+esc(me.email)+'</p>'+
  '<span class="profile-role-badge">'+ico("user")+' '+esc(me.role==="tutor"?"Tutor(a)":me.role==="petiano"?"PETiano(a)":me.role==="usuario"?"Usuário":"Administração")+'</span></div></div></div>'+
  (me.role==="admin"&&!me.adminSession&&!me.mustChangePassword?
    '<section class="account-admin-activation" role="status"><div><strong>Seu cargo Administração está disponível</strong><p>Confirme sua senha para liberar o painel administrativo nesta sessão.</p></div>'+
    '<a href="#/admin/painel" class="button primary">'+ico("settings")+' Ativar Administração</a></section>':"")+
  commissionsHtml;
 const passwordManagement=
  '<section class="profile-security-panel account-setting-card"><div><h3>Senha de acesso</h3><p>Altere sua senha com segurança sempre que precisar.</p></div>'+
  '<button class="button ghost" type="button" data-do="change-password-toggle" aria-expanded="false">'+ico("lock")+' Alterar senha</button>'+
  '<form id="change-password-form" class="register-form" hidden>'+
  '<label>Senha atual<span class="password-control"><input type="password" name="password" required autocomplete="current-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label>'+
  '<label>Nova senha<span class="password-control"><input type="password" name="newPassword" required autocomplete="new-password"><button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha" aria-pressed="false" title="Mostrar senha">Mostrar</button></span></label>'+
  '<button type="submit" class="button primary">Alterar senha</button></form></section>';
 const securityContent=
  '<div class="account-pane-intro"><span class="profile-section-eyebrow">PROTEÇÃO DA CONTA</span><h2>Segurança e acesso</h2><p>Gerencie suas credenciais sem misturar com notificações.</p></div>'+
  (me.mustChangePassword?'<p class="status-note">Sua senha é temporária. Altere-a para acessar o sistema.</p>':"")+
  '<div class="account-settings-two-col"><div class="account-setting-card">'+emailManagement+'</div>'+passwordManagement+'</div>'+
  '<section class="account-danger-zone"><div><h3>Excluir minha conta</h3><p>Apague definitivamente seu cadastro, senha, sessões e vínculos pessoais. As atividades e atas institucionais serão preservadas, com referências à sua conta anonimizadas. Esta ação não pode ser desfeita.</p></div>'+
  '<button class="button danger-outline" type="button" data-do="account-delete-open">'+ico("close")+' Excluir minha conta</button></section>'+
  '<div class="account-profile-actions"><button class="button ghost account-logout-button" type="button" data-do="logout">'+ico("logout")+'<span>Sair da conta</span></button></div>';
 const emailNotifications=
  '<section class="account-channel-card account-channel-email" aria-labelledby="account-email-notifications"><div class="account-push-heading">'+
  '<span class="account-push-icon">'+ico("mail")+'</span><div><h3 id="account-email-notifications">Notificações por e-mail</h3>'+
  '<p>Mensagens enviadas para o seu e-mail cadastrado.</p></div></div>'+
  (["tutor","admin"].includes(me.role)?
    '<p class="account-push-status">Ao criar ou revisar uma demanda, você pode escolher <strong>Salvar e enviar</strong>. O sistema respeita os canais que cada responsável ativou, inclusive os seus.</p>':
    '<p class="account-push-status">Os avisos destinados ao seu e-mail são enviados conforme suas preferências.</p>')+
  '<p class="field-hint">E-mails essenciais, como confirmação de endereço e recuperação de senha, permanecem ativos por segurança.</p></section>';
 const notificationContent=
  '<div class="account-pane-intro"><span class="profile-section-eyebrow">SEUS AVISOS</span><h2>Central de notificações</h2>'+
  '<p>Escolha quais dos seis avisos recebe por e-mail, Android ou PC. Salve todas as opções de uma só vez.</p></div>'+
  renderNotificationMatrix()+'<div class="account-channel-grid">'+emailNotifications+renderWebPushPreferences()+renderPushPreferences()+'</div>';
 const appContent=
  '<div class="account-pane-intro"><span class="profile-section-eyebrow">INSTALAÇÃO</span><h2>Aplicativos PET Gestão</h2>'+
  '<p>Escolha onde deseja usar o PET Gestão. O acesso e seus dados continuam sincronizados.</p></div>'+
  '<div class="account-download-grid">'+renderDesktopInstall()+renderAppInstall()+renderIOSInstall()+'</div>';
 return header("Pessoal","Minha conta","Seu espaço pessoal, organizado por categoria.")+
  '<div class="account-hub"><nav class="account-hub-sidebar" role="tablist" aria-label="Configurações da conta">'+
  '<div class="account-hub-side-title">CONFIGURAÇÕES</div>'+
  tabButton("perfil","Meu perfil","Dados e comissões","user")+
  tabButton("seguranca","Segurança","E-mail, senha e exclusão","lock")+
  tabButton("notificacoes","Notificações","E-mail, PC e celular","bell")+
  tabButton("aplicativos","Aplicativos","Instalar no PC, Android ou iOS","download")+
  tabButton("atalhos","Navegação rápida","Atalhos do celular","grid")+
  '</nav><div class="account-hub-main">'+
  panel("perfil",profileContent)+panel("seguranca",securityContent)+
  panel("notificacoes",notificationContent)+panel("aplicativos",appContent)+
  panel("atalhos",renderQuickNavSettings())+
  '</div></div>'+
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
const notificationKinds=[["create","Criação de demanda"],["review","Correção / revisão do texto"],["due_soon","Prazo vencendo"],["event_soon","Evento se aproximando"],["event_today","No dia do evento"],["overdue","Prazo vencido"]];
function notificationTemplateFor(kind){
 const fallbacks={
  create:{subject:"PET Gestão — Nova demanda: {demanda}",body:"Olá!\n\n{autor} cadastrou uma nova demanda: {demanda}.\n\nAcesse o PET Gestão para consultar os prazos e os responsáveis.\n\nPET Educação"},
  review:{subject:"PET Gestão — Texto revisado: {demanda}",body:"Olá!\n\n{autor} atualizou o texto para revisão da demanda {demanda}.\n\nAcesse o PET Gestão para consultar as alterações.\n\nPET Educação"},
  due_soon:{subject:"PET Gestão — Prazo vencendo: {demanda}",body:"Olá!\n\nA etapa {etapa} da demanda {demanda} vence em {dias} dia(s), em {prazo}.\n\nConfira a atividade no PET Gestão: {link}\n\nPET Educação"},
  event_soon:{subject:"PET Gestão — Evento se aproximando: {demanda}",body:"Olá!\n\nLembrete: o evento {demanda} acontecerá em {prazo}, daqui a {dias} dia(s).\n\nConfira os detalhes no PET Gestão: {link}\n\nPET Educação"},
  overdue:{subject:"PET Gestão — Prazo vencido: {demanda}",body:"Olá!\n\nO prazo da etapa {etapa} da demanda {demanda} venceu em {prazo}.\n\nConfira a atividade no PET Gestão: {link}\n\nPET Educação"},
  event_today:{subject:"PET Gestão — É hoje: {demanda}",body:"Olá!\n\nO evento {demanda} acontece hoje, {prazo}.\n\nConfira os detalhes no PET Gestão: {link}\n\nPET Educação"}
 };
 return state.templateDrafts?.["email:"+kind]||data.settings.notificationTemplates?.[kind]||
  (["create","review"].includes(kind)?data.settings.notificationTemplate:null)||fallbacks[kind]||fallbacks.create;
}

const templateVariableInfo={
 autor:"Nome de quem cadastrou ou revisou a demanda. Nos avisos de prazo, aparece PET Gestão.",
 acao:"Ação que gerou o e-mail, como cadastrou ou atualizou o texto.",
 demanda:"Título da demanda relacionada à notificação.",
 tipo:"Tipo da mensagem: Nova demanda, Texto para revisão, Prazo vencendo, Evento se aproximando, Prazo vencido ou Evento hoje.",
 etapa:"Nome da etapa ou prazo vinculado à demanda.",
 prazo:"Data e horário do prazo ou data do evento.",
 dias:"Antecedência configurada, disponível apenas nos avisos de prazo vencendo e evento se aproximando.",
 link:"Endereço para abrir a demanda no PET Gestão."
};
const templateVariables={
 create:["autor","acao","demanda","tipo"],review:["autor","acao","demanda","tipo"],
 due_soon:["autor","acao","tipo","demanda","etapa","prazo","dias","link"],
 event_soon:["autor","acao","tipo","demanda","prazo","dias","link"],
 event_today:["autor","acao","tipo","demanda","prazo","link"],
 overdue:["autor","acao","tipo","demanda","etapa","prazo","link"]
};
function notificationVariableGuide(kind){
 const keys=templateVariables[kind]||templateVariables.create;
 return '<section class="mail-template-guide" aria-label="Chaves automáticas disponíveis">'+
  '<div class="mail-template-guide-heading"><span class="mail-template-guide-icon">'+ico("info")+'</span><div>'+
  '<h3>Chaves automáticas disponíveis</h3><p>Use estas chaves no assunto ou na mensagem, incluindo { e }. O PET Gestão as substitui automaticamente ao enviar.</p></div></div>'+
  '<div class="mail-template-guide-list">'+keys.map(key=>'<div class="mail-template-guide-item"><code>{'+key+'}</code><span>'+esc(templateVariableInfo[key])+'</span></div>').join("")+'</div>'+
  '<p class="mail-template-guide-example"><strong>Exemplo:</strong> <code>{autor}</code> cadastrou <code>{demanda}</code> → o e-mail mostrará o nome da pessoa e o título da demanda.'+
  '</p></section>';
}
const pushTemplateFallbacks={
 create:{title:"Nova demanda atribuída",body:"{demanda}"},
 review:{title:"Texto para revisão",body:"{demanda} foi atualizado para revisão."},
 due_soon:{title:"Prazo vencendo",body:"{demanda} · {etapa} · {prazo}"},
 overdue:{title:"Prazo vencido",body:"{demanda} · {etapa} · {prazo}"},
 event_soon:{title:"Evento se aproximando",body:"{demanda} · {prazo}"},
 event_today:{title:"Evento hoje",body:"{demanda}"}
};
function notificationPushTemplateFor(kind){
 return state.templateDrafts?.["app:"+kind]||data.settings.notificationPushTemplates?.[kind]||pushTemplateFallbacks[kind]||pushTemplateFallbacks.create;
}
function notificationTemplateFields(kind,channel=state.templateChannel){
 if(channel==="app"){
  const item=notificationPushTemplateFor(kind);
  return '<p class="field-hint">Esta mensagem será usada no Android e no PC. Título até 90 caracteres, corpo até 220. Os campos entre chaves são preenchidos ao enviar.</p>'+
   '<label>Título da notificação<input type="text" name="title" maxlength="90" required value="'+esc(item.title||"")+'"></label>'+
   '<label>Mensagem curta<textarea name="message" maxlength="220" rows="3" required>'+esc(item.body||"")+'</textarea></label>'+notificationVariableGuide(kind);
 }
 const config=notificationTemplateFor(kind);
 return '<label>Assunto<input type="text" name="subject" maxlength="200" required value="'+esc(config.subject||"")+'"></label>'+
  '<label class="rich-label">Mensagem do e-mail</label>'+
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

function reportPdf(filename,title,lines){
 // PDF local, sem serviços externos: fonte WinAnsi para caracteres em português.
 const cp={"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};
 const encode=v=>Array.from(String(v)).map(c=>{
  if("()\\".includes(c))return "\\"+c;
  const n=cp[c]??c.charCodeAt(0);
  if(n<32||n>255)return "?";
  return n>126?"\\"+n.toString(8).padStart(3,"0"):c;
 }).join("");
 const chunks=[];for(let i=0;i<lines.length;i+=43)chunks.push(lines.slice(i,i+43));
 if(!chunks.length)chunks.push([]);
 const objects=[],n=chunks.length,fontId=3+n*2;
 objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
 objects[2]="<< /Type /Pages /Count "+n+" /Kids ["+chunks.map((_,i)=>(3+i*2)+" 0 R").join(" ")+"] >>";
 objects[fontId]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
 chunks.forEach((lines,i)=>{
  const pageId=3+i*2,contentId=pageId+1;
  objects[pageId]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "+fontId+" 0 R >> >> /Contents "+contentId+" 0 R >>";
  const cmds=["0.44 0.25 0.72 rg","40 792 515 5 re f",
   "0.22 0.14 0.36 rg","BT /F1 17 Tf 42 753 Td ("+encode(title)+") Tj ET",
   "0.44 0.39 0.52 rg","BT /F1 9 Tf 42 730 Td ("+encode("PET Educação · Universidade Federal de Sergipe")+") Tj ET",
   "0.27 0.22 0.34 rg"];
  lines.forEach((line,j)=>cmds.push("BT /F1 10 Tf 44 "+(700-j*15)+" Td ("+encode(line)+") Tj ET"));
  cmds.push("0.55 0.5 0.6 rg","BT /F1 9 Tf 44 39 Td ("+encode("Página "+(i+1)+" / "+n)+") Tj ET");
  const stream=cmds.join("\n")+"\n";
  objects[contentId]="<< /Length "+stream.length+" >>\nstream\n"+stream+"endstream";
 });
 let output="%PDF-1.4\n",pos=[0];
 for(let i=1;i<objects.length;i++){pos[i]=output.length;output+=i+" 0 obj\n"+objects[i]+"\nendobj\n"}
 const xref=output.length;
 output+="xref\n0 "+objects.length+"\n0000000000 65535 f \n";
 for(let i=1;i<objects.length;i++)output+=String(pos[i]).padStart(10,"0")+" 00000 n \n";
 output+="trailer\n<< /Size "+objects.length+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
 const bytes=Uint8Array.from(output,c=>c.charCodeAt(0)&255);
 const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
 const a=document.createElement("a");a.href=url;a.download=filename;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function loadAdminAnnualReport(){
 if(!isAdmin()||state.adminReportLoading||state.adminReportView!=="cronograma")return;
 const year=state.adminReportYear,owner=me?.id;
 state.adminReportLoading=true;
 try{
  const result=await request("/admin/annual-report?year="+encodeURIComponent(year),"GET",undefined,"admin");
  if(!Array.isArray(result?.months)||result.months.length!==12)throw Error("Resposta do relatório inválida.");
  if(me?.id===owner){state.adminReportData=result;state.adminReportLoadedYear=year;state.adminReportError="";}
 }catch(e){state.adminReportData=null;state.adminReportLoadedYear=year;state.adminReportError=e.message;}
 finally{state.adminReportLoading=false;if(routeParts().page==="admin"&&state.adminTab==="relatorios")render()}
}
async function loadAdminOverview(){
 if(!isAdmin()||state.adminOverviewLoading||!["todos","comissoes","usuarios"].includes(state.adminReportView))return;
 const year=state.adminReportYear,owner=me?.id;
 state.adminOverviewLoading=true;
 try{
  const result=await request("/admin/overview?year="+encodeURIComponent(year),"GET",undefined,"admin");
  if(!Array.isArray(result?.commissions)||!Array.isArray(result?.users)||result.year!==year)throw Error("Resposta do resumo geral inválida.");
  if(me?.id===owner){state.adminOverviewData=result;state.adminOverviewLoadedYear=year;state.adminOverviewError="";}
 }catch(e){if(me?.id===owner){state.adminOverviewData=null;state.adminOverviewLoadedYear=year;state.adminOverviewError=e.message;}}
 finally{
  state.adminOverviewLoading=false;
  if(routeParts().page==="admin"&&state.adminTab==="relatorios")render();
 }
}
const adminReportNumber=v=>Number(v||0).toLocaleString("pt-BR");
function adminOverviewMetrics(data){
 const metrics=[["Comissões",data.commissionCount],["Usuários",data.userCount],["Demandas cadastradas",data.totals?.registered],
  ["Concluídas",data.totals?.concluded],["Concluídas com atraso",data.totals?.concludedLate],
  ["Não concluídas",data.totals?.notConcluded],["Atividades no cronograma",data.activities]];
 return '<div class="chron-report-metrics admin-overview-metrics">'+metrics.map(([label,n])=>
  '<div><strong>'+adminReportNumber(n)+'</strong><span>'+esc(label)+'</span></div>').join("")+'</div>';
}
function adminCommissionOverviewTable(rows){
 return '<h3>Todas as comissões</h3>'+
  '<div class="chron-report-table-wrap"><table class="chron-report-table admin-overview-table"><thead><tr>'+
  '<th>Comissão</th><th>Integrantes</th><th>Cadastradas</th><th>Concluídas</th><th>Com atraso</th><th>Não concluídas</th><th>Detalhes</th></tr></thead><tbody>'+
  (rows.length?rows.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+adminReportNumber(c.members)+'</td>'+
   '<td>'+adminReportNumber(c.registered)+'</td><td>'+adminReportNumber(c.concluded)+'</td>'+
   '<td>'+adminReportNumber(c.concludedLate)+'</td><td>'+adminReportNumber(c.notConcluded)+'</td>'+
   '<td><a href="#/admin/resumo/'+id(c.id)+'">Consultar</a></td></tr>').join(""):
   '<tr><td colspan="7">Nenhuma comissão cadastrada.</td></tr>')+
  '</tbody></table></div>';
}
function adminUserOverviewTable(rows){
 const roleNames={admin:"Administração",tutor:"Tutoria",petiano:"PETiano(a)",usuario:"Usuário(a)"};
 return '<h3>Visão dos usuários</h3>'+
  '<div class="chron-report-table-wrap"><table class="chron-report-table admin-overview-table"><thead><tr>'+
  '<th>Usuário</th><th>Perfil</th><th>Comissões atuais</th><th>Atribuídas</th><th>Realizadas</th><th>Não realizadas</th></tr></thead><tbody>'+
  (rows.length?rows.map(u=>'<tr><td>'+esc(u.name)+'</td><td>'+esc(roleNames[u.role]||u.role)+'</td>'+
   '<td>'+adminReportNumber(u.commissions)+'</td><td>'+adminReportNumber(u.assigned)+'</td>'+
   '<td>'+adminReportNumber(u.completed)+'</td><td>'+adminReportNumber(u.notCompleted)+'</td></tr>').join(""):
   '<tr><td colspan="6">Nenhum usuário cadastrado.</td></tr>')+
  '</tbody></table></div>';
}
function renderAdminReports(){
 const view=state.adminReportView,year=state.adminReportYear;
 const controls='<div class="chron-report-controls"><label>Visualizar relatório<select class="select" id="admin-report-kind">'+
  [["todos","Todos"],["cronograma","Cronograma"],["comissoes","Comissões"],["usuarios","Usuários"]].map(([v,l])=>opt(v,l,view)).join("")+'</select></label>'+
  '<label>Ano<select class="select" id="admin-report-year">'+Array.from({length:12},(_,i)=>current.getFullYear()-5+i).map(y=>opt(y,y,year)).join("")+'</select></label></div>';
 if(view==="cronograma"){
  const r=state.adminReportLoadedYear===year?state.adminReportData:null;
  return '<section class="card card-pad chron-report">'+controls+
   '<div class="chron-report-head"><h2>Resumo anual · '+year+'</h2>'+
   (r?'<button class="button primary" type="button" data-do="admin-report-pdf">'+ico("download")+' Exportar PDF</button>':"")+'</div>'+
   (!r?'<p class="chron-report-note">'+esc(state.adminReportError||"Carregando dados reais…")+'</p>':
    '<div class="chron-report-metrics"><div><strong>'+r.demands+'</strong><span>Demandas no ano</span></div>'+
    '<div><strong>'+r.activities+'</strong><span>Atividades do cronograma</span></div></div>'+
    '<h3>Quantidade em cada mês</h3><div class="chron-report-table-wrap"><table class="chron-report-table">'+
    '<thead><tr><th>Mês</th><th>Demandas</th><th>Cronograma</th></tr></thead><tbody>'+
    r.months.map(x=>'<tr><td>'+MONTHS[x.month-1]+'</td><td>'+x.demands+'</td><td>'+x.activities+'</td></tr>').join("")+
    '</tbody></table></div>')+'</section>';
 }
 const r=state.adminOverviewLoadedYear===year?state.adminOverviewData:null;
 const loading=!r?'<p class="chron-report-note" role="status">'+esc(state.adminOverviewError||"Carregando visão geral…")+'</p>':"";
 const note='<p class="chron-report-note">Demandas e atividades referentes a '+year+'. Integrantes e contas representam os cadastros atuais. No total do PET, cada demanda é contada uma única vez, mesmo quando vinculada a várias comissões.</p>';
 if(view==="comissoes"){
  const cid=state.adminReportCommission||"todos",c=r?.commissions.find(x=>x.id===cid);
  return '<section class="card card-pad chron-report">'+controls+
   '<h2>Relatório das comissões</h2><p class="chron-report-note">Escolha Todas as comissões para visualizar o conjunto ou consulte individualmente.</p>'+
   '<label>Comissão<select class="select" id="admin-report-commission">'+
   '<option value="todos" '+(cid==="todos"?"selected":"")+'>Todas as comissões</option>'+
   data.committees.map(x=>opt(x.id,x.name,cid)).join("")+'</select></label>'+
   loading+(r?(cid==="todos"?adminCommissionOverviewTable(r.commissions):
    (c?'<div class="chron-report-metrics"><div><strong>'+adminReportNumber(c.members)+'</strong><span>Integrantes atuais</span></div>'+
     '<div><strong>'+adminReportNumber(c.registered)+'</strong><span>Demandas cadastradas</span></div>'+
     '<div><strong>'+adminReportNumber(c.concluded)+'</strong><span>Concluídas</span></div>'+
     '<div><strong>'+adminReportNumber(c.concludedLate)+'</strong><span>Com atraso</span></div></div>':'')+
    '<a class="button primary" href="#/admin/resumo/'+id(cid)+'">Consultar comissão</a>'): "")+
   (r?note:"")+'</section>';
 }
 if(view==="usuarios"){
  const uid=state.adminReportUser||"todos";
  return '<section class="card card-pad chron-report">'+controls+
   '<h2>Relatório dos usuários</h2><p class="chron-report-note">Consulte todos os usuários ou escolha uma pessoa específica.</p>'+
   '<label>Usuário<select class="select" id="admin-report-user">'+
   '<option value="todos" '+(uid==="todos"?"selected":"")+'>Todos os usuários</option>'+
   (r?.users||[]).map(u=>opt(u.id,u.name,uid)).join("")+'</select></label>'+
   loading+(r?adminUserOverviewTable(uid==="todos"?r.users:r.users.filter(u=>u.id===uid))+note:"")+'</section>';
 }
 return '<section class="card card-pad chron-report">'+controls+
  '<div class="chron-report-head"><h2>Visão geral · '+year+'</h2>'+
  (r?'<button class="button primary" type="button" data-do="admin-overview-pdf">'+ico("download")+' Exportar PDF geral</button>':"")+'</div>'+
  loading+(r?adminOverviewMetrics(r)+adminCommissionOverviewTable(r.commissions)+adminUserOverviewTable(r.users)+note:"")+'</section>';
}
function renderAdmin(){
 const adminPart=routeParts().parts;
 if(adminPart.length===1&&["painel","usuarios","comissoes","relatorios","emails","configuracoes"].includes(adminPart[0]))state.adminTab=adminPart[0];
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
  const reminderConfig=data.settings.reminderSettings||{dueSoonEnabled:false,overdueEnabled:false,daysBefore:3,overdueAudience:"pending",eventTodayEnabled:false};
 const adminPanels='<section class="admin-panel admin-users-panel" '+(state.adminTab==="usuarios"?"":'hidden')+'><div class="live-admin-list" id="admin-users"><p>Carregando usuários...</p></div><details class="admin-users-guides"><summary>Orientações sobre cargos e notificações</summary><div class="admin-users-guides-content"><p class="field-hint admin-role-guide">É possível ter mais de uma conta Administração. Somente um(a) administrador(a) pode conceder ou remover esse cargo, e o último administrador permanece protegido. Quem receber o cargo deve entrar novamente na conta para ativar o acesso administrativo.</p><p class="field-hint admin-role-guide admin-notify-guide"><strong>Sobre as notificações por e-mail:</strong> esta opção define se a pessoa poderá utilizar o envio de avisos por e-mail ao salvar alterações. Quando ativada, a Tutoria ou Administração poderá escolher entre enviar ou não a notificação. Os destinatários são definidos conforme os responsáveis e as comissões da atividade; marcar esta opção não significa que a pessoa receberá todos os avisos por e-mail.</p></div></details></section>'+
 '<section class="card card-pad admin-commissions admin-panel" '+(state.adminTab==="comissoes"?"":'hidden')+'><div class="admin-section-heading"><div><h2>Comissões</h2><p>Defina as vagas e organize a ordem de exibição. As alterações só serão aplicadas quando você salvar.</p></div><button type="button" class="button primary admin-save-all-button" data-do="save-all-commissions">'+ico("check")+' Salvar todas as alterações</button></div>'+
 '<div class="admin-commission-list">'+
 data.committees.map((c,i)=>'<div class="admin-commission-item" data-commission-id="'+esc(c.id)+'">'+
 '<div class="admin-commission-item-top"><div class="admin-commission-identity"><span class="admin-commission-avatar">'+
 (c.imageData?'<img src="'+esc(c.imageData)+'" alt="">':commissionDefaultArt(c.name))+
 '</span><div class="admin-commission-title"><strong>'+esc(c.name)+'</strong><small data-commission-position>Posição '+(i+1)+'</small></div></div>'+
 '</div>'+
 '<div class="admin-commission-controls"><label class="admin-vacancy-field"><span>Vagas</span>'+
 '<input type="number" min="0" max="999" data-vagas="'+esc(c.id)+'" value="'+esc(c.maxMembers||0)+'" inputmode="numeric"></label>'+
 '<div class="admin-order-controls"><button class="button ghost admin-order-button" title="Subir" aria-label="Subir '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="-1" '+(i===0?"disabled":"")+'>↑</button>'+
 '<button class="button ghost admin-order-button" title="Descer" aria-label="Descer '+esc(c.name)+'" data-do="move-commission" data-id="'+esc(c.id)+'" data-direction="1" '+(i===data.committees.length-1?"disabled":"")+'>↓</button></div></div></div>').join("")+'</div></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Navegação automática das demandas</h2><label class="live-toggle"><input type="checkbox" id="setting-month" '+(data.settings.autoMonth?"checked":"")+'> Atualizar o mês automaticamente</label><label class="live-toggle"><input type="checkbox" id="setting-week" '+(data.settings.autoWeek?"checked":"")+'> Atualizar a semana automaticamente</label><button class="button primary" data-do="save-settings">Salvar configurações</button></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><h2>E-mails manuais e agendados</h2><form id="mail-form" class="register-form"><label>Destinatários<select id="mail-audience" name="audience" class="select">'+[["todos","Todos(as)"],["comissoes","Comissões"],["usuarios","Usuários"]].map(([v,l])=>opt(v,l,state.mailAudience)).join("")+'</select></label><div id="mail-recipients"></div><label>Assunto<input name="subject" required maxlength="200"></label><label class="rich-label">Mensagem</label>'+richEditor("message","")+'<div class="mail-schedule-choice"><button type="button" class="button ghost mail-schedule-toggle" data-do="mail-toggle-schedule" aria-pressed="false">'+ico("calendar")+' Agendar envio</button><small>Escolha um horário somente se quiser enviar depois.</small></div><div id="mail-scheduling"></div><div id="mail-attachments"></div><div class="mail-compose-actions"><button class="button ghost" type="button" data-do="mail-preview-manual">Pré-visualizar e-mail</button><button class="button primary" type="submit">Enviar</button></div></form></section>'+


 '<section class="card card-pad admin-panel admin-reminder-panel" data-reminder-card="before" '+(state.adminTab==="configuracoes"?"":'hidden')+'><div class="reminder-panel-heading"><span class="reminder-panel-icon" aria-hidden="true">'+ico("calendar")+'</span><h2>Avisos antes da data</h2></div><p class="field-hint reminder-panel-intro">Configure os lembretes enviados com antecedência. Esta opção vale para etapas com prazo e para eventos de Todos(as).</p>'+
 '<div class="deadline-notice-settings"><label class="live-toggle"><input type="checkbox" id="reminder-soon" '+(reminderConfig.dueSoonEnabled?"checked":"")+'> Enviar lembrete antes do prazo ou evento</label><label class="deadline-days"><span>Quantos dias antes enviar?</span><input type="number" id="reminder-days" min="1" max="30" step="1" value="'+esc(reminderConfig.daysBefore??3)+'" aria-label="Quantidade de dias de antecedência"><span>dia(s)</span></label><button class="button primary" type="button" data-do="save-reminder-soon">Salvar avisos antecipados</button></div></section>'+
 '<section class="card card-pad admin-panel admin-reminder-panel" data-reminder-card="today" '+(state.adminTab==="configuracoes"?"":'hidden')+'><div class="reminder-panel-heading"><span class="reminder-panel-icon" aria-hidden="true">'+ico("calendar")+'</span><h2>Aviso no dia do evento</h2></div><p class="field-hint reminder-panel-intro">Envie um aviso automático no próprio dia para os participantes de eventos de Todos(as). Esse envio é independente dos lembretes antecipados.</p>'+
 '<div class="deadline-notice-settings"><label class="live-toggle"><input type="checkbox" id="reminder-event-today" '+(reminderConfig.eventTodayEnabled?"checked":"")+'> Enviar aviso no dia do evento</label><button type="button" class="button primary" data-do="save-reminder-event-today">Salvar aviso do dia do evento</button></div></section>'+
 '<section class="card card-pad admin-panel admin-reminder-panel" data-reminder-card="after" '+(state.adminTab==="configuracoes"?"":'hidden')+'><div class="reminder-panel-heading"><span class="reminder-panel-icon" aria-hidden="true">'+ico("clock")+'</span><h2>Aviso após o vencimento do prazo</h2></div><p class="field-hint reminder-panel-intro">Envie um aviso automático quando uma etapa vencer e a demanda ainda estiver ativa. Esse envio acontece depois do vencimento, sem antecedência.</p>'+
 '<div class="deadline-notice-settings"><label class="live-toggle"><input type="checkbox" id="reminder-overdue" '+(reminderConfig.overdueEnabled?"checked":"")+'> Enviar aviso quando o prazo vencer</label><label class="deadline-notice-audience">Destinatários do prazo vencido<select class="select" id="reminder-overdue-audience">'+[["pending","Somente participantes pendentes"],["all","Todos(as) que fazem parte da demanda"]].map(([v,label])=>opt(v,label,reminderConfig.overdueAudience||"pending")).join("")+'</select><small>Inclui pessoas designadas e integrantes das comissões vinculadas, conforme o público selecionado. Endereços repetidos são unificados por etapa.</small></label><button class="button primary" type="button" data-do="save-reminder-overdue">Salvar aviso de prazo vencido</button></div></section>'+
 '<section class="card card-pad admin-panel" '+(state.adminTab==="configuracoes"?"":'hidden')+'><h2>Modelos de notificações</h2><p class="field-hint">Edite os seis tipos de avisos por e-mail ou por notificação do aplicativo (celular e PC). Os e-mails de segurança permanecem protegidos.</p>'+
 '<form id="notification-template-form" class="register-form"><label>Tipo de aviso<select name="kind" id="notification-template-kind" class="select">'+notificationKinds.map(([kind,label])=>opt(kind,label,state.templateKind)).join("")+'</select></label>'+
 '<label>Canal<select name="channel" id="notification-template-channel" class="select">'+[["email","E-mail"],["app","Aplicativo (celular e PC)"]].map(([v,l])=>opt(v,l,state.templateChannel)).join("")+'</select></label>'+
 '<div id="notification-template-fields">'+notificationTemplateFields(state.templateKind)+'</div>'+
 '<div class="mail-compose-actions"><button class="button ghost" type="button" data-do="mail-preview-template">Pré-visualizar mensagem</button><button class="button primary" type="submit">Salvar modelo</button></div></form></section>'+
 '<section class="card card-pad admin-mail-history admin-panel" '+(state.adminTab==="emails"?"":'hidden')+'><div class="section-head"><h2>Fila e histórico do Gmail</h2><button class="button primary" type="button" data-do="mail-monitor-open">Acompanhar envios</button></div><div id="mail-history"><p>Carregando status...</p></div><button type="button" class="button ghost" data-do="clear-mail">Limpar registros finalizados</button></section>'+
 '<section class="admin-panel" '+(state.adminTab==="relatorios"?"":'hidden')+'>'+renderAdminReports()+'</section>';
 const tabs=[["painel","Painel","grid"],["usuarios","Usuários","user"],["comissoes","Comissões","users"],["relatorios","Relatórios","list"],["emails","E-mails","mail"],["configuracoes","Configurações","settings"]];
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
 const adminParts=routeParts().parts,tabNames=["painel","usuarios","comissoes","relatorios","emails","configuracoes"];
 const tabRoute=adminParts.length===1&&tabNames.includes(adminParts[0])?adminParts[0]:null;
 if(tabRoute)state.adminTab=tabRoute;
 const subroute=tabRoute?[]:adminParts,embedded=subroute.length?adminEmbeddedView(subroute):"";
 const headings={painel:"Painel administrativo",usuarios:"Usuários",comissoes:"Comissões",emails:"E-mails",relatorios:"Relatórios",configuracoes:"Configurações"};
 return '<div class="admin-layout">'+
 '<aside class="admin-sidebar '+(state.adminMenuOpen?"open":"")+'" aria-label="Menu administrativo">'+
 '<div class="admin-brand">'+ico("checklist")+'<div><strong>PET Gestão</strong><small>'+esc(me?.name||"Administração")+'</small></div></div>'+
 '<nav class="admin-navigation">'+tabs.map(nav).join("")+'</nav>'+
 '<div class="admin-sidebar-footer"><button type="button" data-do="admin-signout">'+ico("chevron-left")+' Voltar ao PET Gestão</button></div></aside>'+
 (state.adminMenuOpen?'<button type="button" class="admin-screen-overlay" aria-label="Fechar menu" data-do="admin-menu"></button>':"")+
 '<div class="admin-workspace"><div class="admin-toolbar"><button type="button" class="admin-open-menu" data-do="admin-menu" aria-label="Abrir menu administrativo">'+ico("menu")+'</button><div class="admin-toolbar-account">'+ico("user")+'<span><strong>Administração</strong></span></div></div>'+
 '<div class="admin-page">'+(subroute.length?'<div class="admin-embedded-view">'+embedded+'</div>':'<div class="admin-page-kicker">ADMINISTRAÇÃO</div><h1>'+esc(headings[state.adminTab]||headings.painel)+'</h1><p class="admin-page-description">'+esc(state.adminTab==="usuarios"?"Localize integrantes e gerencie cargos e permissões.":"Gerencie demandas, comissões, usuários e envios de e-mails.")+'</p>'+
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
 const form=$(mode==="template"?"#notification-template-form":"#mail-form");
 if(!form)return;
 const f=collectRich(form,userFields(form));
 const title=String(f.subject||"").trim(),message=String(f.message||"");
 if(!title||!message.replace(/<[^>]*>/g,"").trim())return setToast("Preencha o assunto e a mensagem para visualizar.");
 const days=Number($("#reminder-days")?.value||data.settings.reminderSettings?.daysBefore||3);
 const exampleDate=new Intl.DateTimeFormat("pt-BR",{
   timeZone:"America/Maceio",day:"2-digit",month:"2-digit",year:"numeric"
 }).format(new Date(Date.now()+(f.kind==="overdue"?-1:f.kind==="event_today"?0:(Number.isFinite(days)?days:3))*86400000));
 const sample={
   autor:"Equipe PET Educação",acao:"registrou uma atualização",demanda:"Exemplo de demanda",
   tipo:"Notificação",etapa:"Prazo",prazo:exampleDate+" às 17:00",
   dias:String(days),link:"https://peteducacao.github.io/pet-gestao/#/atividade/exemplo"
 };
 if(mode!=="manual"){
   if(f.kind==="due_soon"){sample.tipo="Prazo vencendo";sample.acao="avisa que o prazo está vencendo"}
   if(f.kind==="event_soon"){sample.tipo="Evento se aproximando";sample.acao="lembra que o evento está se aproximando";sample.etapa="Evento"}
   if(f.kind==="event_today"){sample.tipo="Evento hoje";sample.acao="lembra que o evento acontece hoje";sample.etapa="Evento"}
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

/* Converte somente explicações gerais em ajuda contextual; não altera avisos críticos. */
function compactContextHelp(root){
 const attach=(title,nodes,placement="inline")=>{
  if(!title)return;
  const info=nodes.filter(p=>p&&p.isConnected&&p.textContent.trim());
  if(!info.length)return;
  const wrap=document.createElement("div");
  wrap.className="pet-context-title";
  title.before(wrap);wrap.append(title);
  const help=document.createElement("details");
  help.className="pet-context-help"+(placement==="page"?" pet-context-help--page":"");
  const trigger=document.createElement("summary");
  trigger.className="pet-context-trigger";
  trigger.title="Ver ajuda";
  trigger.setAttribute("aria-label","Ver ajuda sobre "+title.textContent.trim());
  const symbol=document.createElement("span");
  symbol.className="pet-context-trigger-symbol";
  symbol.textContent="?";
  symbol.setAttribute("aria-hidden","true");
  const label=document.createElement("span");
  label.className="pet-context-trigger-label";
  label.textContent="Ajuda";
  trigger.append(symbol,label);
  const popup=document.createElement("div");
  popup.className="pet-context-popup";
  popup.setAttribute("role","note");
  const popupHead=document.createElement("div");
  popupHead.className="pet-context-popup-head";
  const popupHeading=document.createElement("div");
  const popupEyebrow=document.createElement("span");
  popupEyebrow.className="pet-context-popup-eyebrow";
  popupEyebrow.textContent="AJUDA RÁPIDA";
  const popupTitle=document.createElement("strong");
  popupTitle.className="pet-context-popup-title";
  popupTitle.textContent=title.textContent.trim();
  popupHeading.append(popupEyebrow,popupTitle);
  const close=document.createElement("button");
  close.type="button";
  close.className="pet-context-popup-close";
  close.setAttribute("aria-label","Fechar ajuda");
  close.textContent="×";
  close.addEventListener("click",event=>{event.stopPropagation();help.open=false;trigger.focus()});
  popupHead.append(popupHeading,close);
  const body=document.createElement("div");
  body.className="pet-context-popup-body";
  info.forEach(p=>{p.classList.add("pet-context-paragraph");body.append(p)});
  popup.append(popupHead,body);
  help.append(trigger,popup);
  if(placement==="page"){
   const eyebrow=wrap.parentElement?.querySelector(":scope > .eyebrow");
   if(eyebrow){
    const kicker=document.createElement("div");
    kicker.className="pet-context-kicker";
    eyebrow.before(kicker);
    kicker.append(eyebrow,help);
   }else wrap.append(help);
  }else wrap.append(help);
  help.addEventListener("toggle",()=>{
   if(!help.open)return;
   const rect=trigger.getBoundingClientRect();
   const maximum=Math.min(popup.scrollHeight||270,Math.round(window.innerHeight*.48),340);
   const below=window.innerHeight-rect.bottom-14;
   const top=below>=Math.min(maximum,180)?rect.bottom+9:Math.max(12,rect.top-maximum-9);
   help.style.setProperty("--pet-help-top",Math.round(top)+"px");
  });
 };
 const matrix=root.querySelector(".account-notification-matrix");
 if(matrix)attach(matrix.querySelector(".section-head h3"),[
  matrix.querySelector(".section-head p"),matrix.querySelector(".notice-optin-hint"),
  matrix.querySelector(".notice-matrix-scroller + .field-hint")
 ]);
 root.querySelectorAll(".page-header").forEach(el=>{
  const eye=el.querySelector(".eyebrow")?.textContent.trim().toLowerCase()||"";
  if(eye==="acesso restrito"||eye==="acesso")return;
  attach(el.querySelector(".page-title"),[el.querySelector(".page-subtitle")],"page");
 });
 root.querySelectorAll(".section-head > div").forEach(el=>{
  if(el.closest(".account-notification-matrix"))return;
  attach(el.querySelector(":scope > h2, :scope > h3"),[el.querySelector(":scope > p")]);
 });
 root.querySelectorAll(".account-pane-intro,.admin-section-heading > div").forEach(el=>
  attach(el.querySelector(":scope > h2"),[el.querySelector(":scope > p")])
 );
 root.querySelectorAll(".admin-reminder-panel").forEach(el=>
  attach(el.querySelector(".reminder-panel-heading > h2"),[el.querySelector(".reminder-panel-intro")])
 );
 root.querySelectorAll(".admin-panel > h2").forEach(title=>{
  const note=title.nextElementSibling;
  if(note?.matches("p.field-hint")&&!/privacidade|senha|exclu|consentimento/i.test(note.textContent))
   attach(title,[note]);
 });
}

function render(){
 nav();const {page,parts}=routeParts(),root=$("#screen");if(!root)return;
 document.body.classList.toggle("admin-ui-active",page==="admin"&&isAdmin()&&!me?.mustChangePassword);
 if(!allowPage(page)){location.hash=me?"#/inicio":"#/login";if(me)setToast("Seu perfil possui acesso somente para visualização.");return}
 if(me?.mustChangePassword&&page!=="conta"&&page!=="confirmar-email"){location.hash="#/conta";return}
 let html="";
 if(page==="inicio")html=renderHome();
 else if(page==="demandas")html=renderDemandas();
 else if(page==="cronograma")html=renderCronograma();
 else if(page==="comissoes")html=!parts.length?renderComissoes():parts[0]==="nova"?renderCommitteeEdit(""):parts[0]==="editar"?renderCommitteeEdit(parts.slice(1).join("/")):renderCommittee(parts.join("/"));
 else if(page==="ajuda")html=renderHelp();
 else if(page==="registrar")html=renderTaskForm(parts.join("/"));
 else if(page==="atividade")html=renderDetail(parts[0],parts[1]||"");
 else if(page==="reunioes")html=renderMemory(parts.join("/"));
 else if(page==="minhas-pendencias")html=renderMine();
 else if(page==="meus-lembretes")html=renderPersonalReminders();
 else if(page==="login")html=renderLogin();
 else if(page==="cadastro")html=renderRegisterAccount();
 else if(page==="esqueci")html=renderForgot();
 else if(page==="redefinir")html=renderReset(parts[0]||"");
 else if(page==="confirmar-email")html=renderConfirmEmail(parts[0]||"");
 else if(page==="conta")html=renderAccount();
 else if(page==="admin")html=renderAdmin();
 else html=renderHome();
 root.innerHTML=html;
 compactContextHelp(root);
 renderQuickNav();
 if(page==="cronograma"&&canWrite()&&state.cronLoadedYear!==state.cronYear&&!state.cronLoading)void loadCronYear(state.cronYear);
 if(page==="meus-lembretes"&&state.reminderLoadedFor!==me?.id&&!state.reminderLoading)void loadPersonalReminders();
 if(page==="admin"&&isAdmin()&&parts[0]==="resumo"&&parts[1])
   loadAdminCommissionSummary(parts[1]);
 if(taskFormRoute(location.hash)&&$("#task-form")&&taskFormDraft?.route!==location.hash)
  taskFormDraft={route:location.hash,snapshot:taskDraftSnapshot()};
 else if(!taskFormRoute(location.hash))resetTaskDraft();
 if(meetingDraftRoute(location.hash)&&$("#meeting-form")&&meetingFormDraft?.route!==location.hash)
  meetingFormDraft={route:location.hash,snapshot:meetingDraftSnapshot()};
 else if(!meetingDraftRoute(location.hash))resetMeetingDraft();
 lastStatusSnapshot=statusSnapshot();
 if(page==="admin"&&isAdmin()&&!me?.mustChangePassword&&(!parts.length||(parts.length===1&&["painel","usuarios","comissoes","relatorios","emails","configuracoes"].includes(parts[0])))){
   if(state.adminTab==="usuarios")loadAdminUsers();
   if(state.adminTab==="emails"){renderMailRecipients();renderMailScheduling();updateMailScheduleButton();loadMailHistory();}
   if(state.adminTab==="painel")loadMailHistory();
   if(state.adminTab==="relatorios"){
     if(state.adminReportView==="cronograma"&&state.adminReportLoadedYear!==state.adminReportYear&&!state.adminReportLoading)void loadAdminAnnualReport();
     if(["todos","comissoes","usuarios"].includes(state.adminReportView)&&state.adminOverviewLoadedYear!==state.adminReportYear&&!state.adminOverviewLoading)void loadAdminOverview();
    }
 }
}
async function askNotification(participants=null){
 if(!canNotify())return false;
 return Boolean(await askConfirm("Deseja enviar avisos desta demanda aos responsáveis (inclusive você, se estiver vinculado)? Cada pessoa recebe somente os canais ativados em sua conta.",{
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

function adminInitials(value){
 const pieces=String(value||"").trim().split(/\s+/).filter(Boolean);
 return pieces.length>1?(pieces[0][0]+pieces.at(-1)[0]).toLocaleUpperCase("pt-BR"):
   (pieces[0]?.slice(0,2)||"?").toLocaleUpperCase("pt-BR");
}
function filterAdminUsers(){
 const filter=String($("#admin-user-search")?.value||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 let count=0;
 for(const row of $$("#admin-users .live-admin-row")){
  const text=(row.dataset.search||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  row.hidden=Boolean(filter&&!text.includes(filter));
  if(!row.hidden)count++;
 }
 const empty=$("#admin-user-search-empty");
 if(empty)empty.hidden=count!==0;
 const result=$("#admin-user-count");
 if(result){const total=(state.adminUsers||[]).length;result.textContent=filter?count+" de "+total+" "+(total===1?"pessoa":"pessoas"):total+" "+(total===1?"pessoa":"pessoas");}
}
async function loadAdminUsers(){
 try{
 const {users}=await request("/admin/users"),target=$("#admin-users");if(!target)return;
 state.adminUsers=users;
 const query=String($("#admin-user-search")?.value||"");
 const userCards=users.map(u=>'<article class="live-admin-row admin-user-card" data-search="'+esc([u.name,u.email].join(" "))+'">'+
 '<div class="admin-user-identity">'+
 (u.profilePhoto?'<button type="button" class="person-photo-button" data-do="person-photo-open" data-person-id="'+esc(u.id)+'" aria-label="Ampliar foto de '+esc(u.name)+'"><img src="'+esc(u.profilePhoto)+'" alt=""></button>':
 '<span class="admin-user-avatar-fallback" aria-hidden="true">'+esc(adminInitials(u.name))+'</span>')+
 '<span class="admin-user-name"><strong>'+esc(u.name)+'</strong>'+
 
 '<small>'+esc(u.email)+'</small></span></div>'+
 '<label class="admin-user-role"><span class="admin-user-field-label">Cargo</span><select class="select" data-role="'+esc(u.id)+'" aria-label="Cargo de '+esc(u.name)+'">'+
 [["usuario","Usuário"],["petiano","PETiano(a)"],["tutor","Tutor(a)"],["admin","Administração"]].map(([v,l])=>opt(v,l,u.role)).join("")+'</select></label>'+
  '<div class="admin-user-actions"><button class="button primary small-action" data-do="save-user" data-id="'+esc(u.id)+'">'+ico("check")+' Salvar</button>'+
 '<button class="button ghost small-action" data-do="temp-pass" data-id="'+esc(u.id)+'">'+ico("lock")+' Senha temporária</button></div>'+
 '</article>').join("");
 target.innerHTML='<div class="admin-user-list-top" role="search" aria-label="Pesquisar integrantes"><label class="admin-user-search-box"><span class="admin-user-field-label">Buscar integrante</span><input id="admin-user-search" type="search" autocomplete="off" placeholder="Digite nome ou e-mail" value="'+esc(query)+'" aria-label="Buscar integrante por nome ou e-mail" aria-controls="admin-user-cards"></label></div>'+
 '<div class="admin-user-results-heading"><h2>Integrantes cadastrados</h2><p id="admin-user-count" class="admin-user-total-plain" style="margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:#746b80;font-size:13px;line-height:1.55;font-weight:500" aria-live="polite">'+users.length+(users.length===1?' pessoa':' pessoas')+'</p></div>'+
 '<div class="admin-user-cards" id="admin-user-cards">'+userCards+'</div><p id="admin-user-search-empty" class="admin-user-search-empty" hidden>Nenhum integrante encontrado com esse nome ou e-mail.</p>';
 filterAdminUsers();
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
 if(action==="admin-overview-pdf"){
   const r=state.adminOverviewData;
   if(!isAdmin()||!r||r.year!==state.adminReportYear)return setToast("Relatório geral indisponível.");
   const t=r.totals||{};
   reportPdf("PET-Gestao-Visao-Geral-"+r.year+".pdf","Visão geral PET "+r.year,
    ["Comissões: "+r.commissionCount,"Usuários: "+r.userCount,
     "Demandas cadastradas: "+(t.registered||0),"Concluídas: "+(t.concluded||0),
     "Com atraso: "+(t.concludedLate||0),"Não concluídas: "+(t.notConcluded||0),
     "Atividades no cronograma: "+r.activities,"",
     "COMISSÕES",...r.commissions.map(c=>c.name+": "+c.registered+" cadastradas; "+c.concluded+" concluídas; "+c.concludedLate+" com atraso"),
     "","USUÁRIOS",...r.users.map(u=>u.name+": "+u.assigned+" atribuídas; "+u.completed+" realizadas")]);
   return;
  }
  if(action==="admin-report-pdf"){
  const r=state.adminReportData;
  if(!isAdmin()||!r||r.year!==state.adminReportYear)return setToast("Relatório ainda indisponível.");
  const lines=["Ano: "+r.year,"Demandas no ano: "+r.demands,"Atividades do cronograma: "+r.activities,"",
   "MÊS                          DEMANDAS       CRONOGRAMA",
   ...r.months.map(x=>MONTHS[x.month-1].padEnd(28," ")+"   "+String(x.demands).padStart(5," ")+"              "+String(x.activities).padStart(5," "))];
  reportPdf("PET-Gestao-Relatorio-"+r.year+".pdf","Relatório anual PET "+r.year,lines);return;
 }
 if(action==="admin-commission-pdf"){
  const r=state.summaryData;
  if(!isAdmin()||!r)return setToast("Consulte primeiro o resumo da comissão.");
  const lines=["Período: "+textDate(r.from)+" a "+textDate(r.to),
   "Cadastradas: "+r.registered,"Concluídas: "+r.concluded,"Com atraso: "+r.concludedLate,
   "Não concluídas: "+r.notConcluded,"Entradas: "+r.entered,"Saídas: "+r.exited,"",
   "PARTICIPAÇÃO DOS INTEGRANTES",
   ...(r.members||[]).map(m=>m.name+" - Atribuídas: "+m.assigned+" - Realizadas: "+m.completed+" - Não realizadas: "+m.notCompleted)];
  reportPdf("PET-Gestao-Comissao.pdf","Comissão: "+(r.commission?.name||""),lines);return;
 }
 if(action==="quicknav-move"){
  const index=Number(b.dataset.index),other=index+Number(b.dataset.direction);
  const list=state.quickNavDraft?.items;
  if(!list||index<0||other<0||other>=list.length)return;
  [list[index],list[other]]=[list[other],list[index]];render();return;
 }
 if(action==="quicknav-save"){
  if(!state.quickNavDraft)return setToast("Atalhos ainda não carregados.");
  const prefs={enabled:state.quickNavDraft.enabled,items:state.quickNavDraft.items};
  if(prefs.items.length<1)return setToast("Selecione ao menos um atalho.");
  b.disabled=true;
  try{
   const saved=await request("/quick-nav","PUT",prefs);
   state.quickNavPrefs=saved;state.quickNavDraft={enabled:saved.enabled,items:[...saved.items]};
   render();setToast("Barra rápida configurada!");
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="cron-new"){state.cronEditing="new";state.cronReminder=null;state.cronDetails=null;render();$("#cron-form")?.scrollIntoView({block:"start",behavior:"smooth"});return}
 if(action==="cron-close"){state.cronEditing=null;render();return}
 if(action==="cron-edit"){
  if(!(state.cronItems||[]).some(x=>x.id===tid))return setToast("Atividade não encontrada.");
  if(state.cronDetails&&history.state?.petCronDetails)history.back();
  state.cronEditing=tid;state.cronReminder=null;state.cronDetails=null;render();
  $("#cron-form")?.scrollIntoView({block:"start",behavior:"smooth"});return;
 }
 if(action==="cron-details"){openCronDetails(tid);return;}
 if(action==="cron-details-close"){closeCronDetails();return;}
 if(action==="cron-delete"){
  const item=(state.cronItems||[]).find(x=>x.id===tid);
  if(!item)return setToast("Atividade não encontrada.");
  if(!await askConfirm('Excluir "'+item.title+'"? Os lembretes vinculados a ela também serão cancelados.',{title:"Excluir atividade?",danger:true,confirmLabel:"Excluir atividade"}))return;
  b.disabled=true;
  try{await request("/schedule/"+id(tid),"DELETE");state.cronEditing=null;state.cronLoadedYear=null;
   await loadCronYear(state.cronYear);if(state.cronDetails&&history.state?.petCronDetails)history.back();state.cronDetails=null;setToast("Atividade excluída.");
  }catch(error){setToast(error.message)}finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="cron-remind"){
  const entry=b.dataset.kind==="cronograma"?(state.cronItems||[]).find(x=>x.id===tid):null;
  const task=b.dataset.kind==="demandas"?(data.tasks||[]).find(x=>x.id===tid):null;
  if(!entry&&!task)return setToast("Registro não encontrado.");
  if((entry&&cronHasEnded(entry))||(task&&["concluida","nao_concluida"].includes(taskStatus(task))))return setToast("O registro já foi concluído.");
  state.cronReminder={entryId:entry?.id||null,title:entry?.title||task?.title||""};state.cronDetails=null;
  state.cronEditing=null;render();$("#cron-reminder-form input[name='at']")?.focus();return;
 }
 if(action==="cron-remind-close"){state.cronReminder=null;render();return}
 if(action==="cron-prev"||action==="cron-next"){
  const d=new Date(state.cronYear,state.cronMonth+(action==="cron-next"?1:-1),1);
  state.cronYear=d.getFullYear();state.cronMonth=d.getMonth();state.cronSelectedDay=cronIso(state.cronYear,state.cronMonth,1);render();return;
 }
 if(action==="cron-view"){state.cronView=b.dataset.view==="calendario"?"calendario":"lista";state.cronCalendarMode="mes";render();return}
 if(action==="cron-calendar-mode"){state.cronCalendarMode=state.cronCalendarMode==="mes"?"ano":"mes";render();return}
 if(action==="cron-year-month"){const month=Number(b.dataset.month);if(!Number.isInteger(month)||month<0||month>11)return;
  state.cronMonth=month;state.cronCalendarMode="mes";state.cronSelectedDay=cronIso(state.cronYear,month,1);render();return}
 if(action==="cron-day"){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.dataset.date||""))return;
  state.cronSelectedDay=b.dataset.date;render();return}
 if(action==="save-notice-matrix"){
  if(!state.noticeDraft)return setToast("Aguarde o carregamento das suas preferências.");
  const settings=JSON.parse(JSON.stringify(state.noticeDraft));
  for(const input of $$(".account-notification-matrix [data-notice-kind]")){
   if(!settings[input.dataset.noticeKind])return setToast("Preferência inválida.");
   settings[input.dataset.noticeKind][input.dataset.noticeChannel]=input.checked;
  }
  b.disabled=true;
  try{
   const result=await request("/notification-preferences","PUT",settings);
   state.noticePrefs=result.preferences;
   state.noticeDraft=JSON.parse(JSON.stringify(result.preferences));
   state.noticeDirty=false;
   setToast("Todas as preferências de notificação foram salvas.");
   render();
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="reminder-new"){openReminderEditor();return}
 if(action==="reminder-close"){
  state.reminderEditing=false;state.reminderDraft=null;state.reminderSchedules=[];render();return;
 }
 if(action==="reminder-add-time"){
  captureReminderEditor();
  if(state.reminderSchedules.length>=20)return setToast("O máximo é 20 horários por lembrete.");
  const mode=state.reminderRecurrence,slot=reminderDefaultSlot(mode);
  const count=state.reminderSchedules.length;
  if(mode==="once"){
   const last=state.reminderSchedules.at(-1)?.at;
   const previous=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(last||"")?Date.parse(last+":00-03:00"):NaN;
   slot.at=Number.isFinite(previous)?
    new Date(previous+3600000-3*3600000).toISOString().slice(0,16):
    reminderLocalValue((count+1)*3600000);
  }
  if(mode==="daily")slot.time=String(9+count%14).padStart(2,"0")+":00";
  if(mode==="weekly"){slot.weekday=count%7;slot.time=String(9+Math.floor(count/7)).padStart(2,"0")+":00";}
  state.reminderSchedules.push(slot);
  render();return;
 }
 if(action==="reminder-remove-time"){
  captureReminderEditor();
  if(state.reminderSchedules.length<=1)return;
  const idx=Number(b.dataset.index);
  state.reminderSchedules=state.reminderSchedules.filter((_,i)=>i!==idx);
  render();return;
 }
 if(action==="reminder-edit"){
  const item=state.reminderItems.find(x=>x.id===tid);
  if(!item)return setToast("Este lembrete não está mais disponível.");
  openReminderEditor(item);return;
 }
 if(action==="reminder-delete"){
  if(!await askConfirm("Excluir este lembrete e seus horários? Os avisos futuros serão cancelados.",{
   title:"Excluir lembrete?",confirmLabel:"Excluir lembrete",cancelLabel:"Manter lembrete"}))return;
  b.disabled=true;
  try{
   await request("/personal-reminders/"+id(tid),"DELETE");
   if(state.reminderEditing===tid){state.reminderEditing=false;state.reminderDraft=null;}
   state.reminderLoadedFor=null;await loadPersonalReminders();
   setToast("Lembrete excluído.");
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="mail-preview-template"&&state.templateChannel==="app"){
  const f=$("#notification-template-form");
  if(!f)return;
  const title=f.elements.title?.value||"",message=f.elements.message?.value||"";
  showNotice(esc(title)+"\n"+esc(message),{title:"Prévia da notificação do aplicativo"});
  return;
 }
 if(action==="admin-summary-person"){
   state.summaryPerson=b.dataset.personId||"";
   const el=$("#admin-summary-results");
   if(el&&state.summaryData)el.innerHTML=renderAdminSummaryResults(state.summaryData);
   return;
 }
 if(action==="collective-pick-date"||action==="stage-pick-date"){
   const picker=action==="stage-pick-date"?b.closest(".live-stage")?.querySelector('[data-stage="day"]'):$("#collective-event-day");
   if(!picker)return;
   try{picker.showPicker()}catch{picker.focus();picker.click()}
   return;
 }
 if(action==="account-tab"){
  const name=b.dataset.tab;
  if(!["perfil","seguranca","notificacoes","aplicativos","atalhos"].includes(name))return;
  if(me?.mustChangePassword&&name!=="seguranca")return setToast("Altere a senha temporária antes de continuar.");
  state.accountTab=name;
  document.querySelectorAll(".account-hub-nav-btn").forEach(button=>{
   const active=button.dataset.tab===name;
   button.classList.toggle("is-active",active);
   button.setAttribute("aria-selected",String(active));
   button.tabIndex=0;
  });
  document.querySelectorAll(".account-hub-pane").forEach(pane=>{pane.hidden=pane.id!=="account-pane-"+name;});
  if(name==="notificacoes")void loadWebPushState();
  return;
 }
 if(action==="install-ios-app"){
   showNotice("No iPhone/iPad com iOS 16.4 ou superior: 1. Abra o PET Gestão no Safari. 2. Toque em Compartilhar e escolha Adicionar à Tela de Início. 3. Abra o PET Gestão pelo ícone criado. 4. Entre na conta, vá até Meu perfil → Notificações, ative o iPhone e marque os avisos desejados na coluna Celular. O iOS solicitará sua permissão.",{title:"Instalar e ativar notificações no iPhone",kind:"info"});
   return;
  }
  if(action==="install-desktop-app"){
  if(window.matchMedia?.("(display-mode: standalone)")?.matches)
   return setToast("O PET Gestão já está aberto como aplicativo instalado.");
  if(desktopInstallPrompt){
   const prompt=desktopInstallPrompt;desktopInstallPrompt=null;
   await prompt.prompt();
   const choice=await prompt.userChoice;
   if(choice?.outcome==="accepted")setToast("Instalação solicitada. Confira os aplicativos do seu computador.");
   else setToast("Instalação cancelada. Você pode tentar novamente pelo menu do navegador.");
  }else{
   showNotice("No Google Chrome, abra o menu ⋮ e escolha Transmitir, salvar e compartilhar → Instalar página como app. No Microsoft Edge, abra ⋯ → Aplicativos → Instalar este site como aplicativo. A instalação cria um aplicativo para o PC, sem precisar de arquivo .exe.",{
    title:"Instalar PET Gestão no computador",kind:"info"});
  }
  return;
 }
 if(action==="enable-web-push"){
  if(!webPushSupported())return setToast("Este navegador não oferece notificações Push compatíveis.");
  if(Notification.permission==="denied")return setToast("Permita as notificações nas configurações do navegador.");
  // Solicita a permissão durante o clique, antes de chamadas à rede.
  const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(permission!=="granted")return setToast("Ative a permissão de notificações para receber avisos.");
  b.disabled=true;
  try{
   const response=await request("/web-push/key");
   const raw=response.publicKey.replace(/-/g,"+").replace(/_/g,"/");
   const decoded=atob(raw+"=".repeat((4-raw.length%4)%4));
   const vapidKey=Uint8Array.from(decoded,c=>c.charCodeAt(0));
   const reg=await navigator.serviceWorker.ready;
   let sub=await reg.pushManager.getSubscription();
   if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidKey});
   await request("/web-push/subscribe","POST",{...sub.toJSON(),platform:iosDevice()?"ios":"pc"});
   state.webPushHere=true;
   state.webPushData=await request("/web-push/status");
   setToast(iosDevice()?"Notificações do iPhone/iPad ativadas. Você receberá os avisos escolhidos para Celular.":"Notificações do computador ativadas.");
   render();
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="disable-web-push"){
  if(!await askConfirm("Desativar os avisos neste computador? As notificações dos demais aparelhos continuarão funcionando.",{
   title:"Desativar notificações neste PC?",confirmLabel:"Desativar neste PC",cancelLabel:"Manter ativadas"}))return;
  b.disabled=true;
  try{
   const sub=await desktopSubscription();
   if(sub){
    await request("/web-push/unsubscribe","POST",{endpoint:sub.endpoint});
    await sub.unsubscribe();
   }
   state.webPushHere=false;
   state.webPushData=await request("/web-push/status");
   setToast("Notificações desativadas neste dispositivo.");
   render();
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="test-web-push"){
  const sub=await desktopSubscription();
  if(!sub||!state.webPushHere)return setToast("Ative as notificações neste computador antes de testar.");
  b.disabled=true;
  try{
   const result=await request("/web-push/test","POST",{endpoint:sub.endpoint});
   if(result.acceptedByService)setToast("Teste aceito pelo serviço do navegador. Confira as notificações do computador.");
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="save-web-push-settings"){
  const card=b.closest(".account-web-push-panel");if(!card)return;
  const settings={};
  for(const name of ["newDemands","deadlines","overdue"]){
   const check=card.querySelector('[data-web-push-setting="'+name+'"]');
   if(!check)return setToast("Preferência do computador indisponível.");
   settings[name]=check.checked;
  }
  b.disabled=true;
  try{
   state.webPushData=await request("/web-push/preferences","PUT",settings);
   setToast("Preferências do computador salvas.");
   render();
  }finally{if(b.isConnected)b.disabled=false}
  return;
 }
 if(action==="test-push"){
   if(!androidPush||!me||!registeredPushFor.startsWith(me.id+"|"))
     return setToast("Abra o APK atualizado, entre na conta e permita notificações.");
   b.disabled=true;
   try{
     const result=await request("/push/test","POST",{deviceId:androidPush.deviceId});
     if(result.acceptedByFirebase)
       setToast("Teste aceito pelo Firebase! Confira a barra de notificações do celular.");
   }finally{if(b.isConnected)b.disabled=false}
   return;
 }
 if(action==="save-push-settings"){
   if(!me)return setToast("Entre na conta para alterar suas notificações.");
   const card=b.closest(".account-push-panel");if(!card)return;
   const settings={};
   for(const name of ["newDemands","deadlines","overdue"]){
     const check=card.querySelector('[data-push-setting="'+name+'"]');
     if(!check)return setToast("Opção de notificação indisponível.");
     settings[name]=check.checked;
   }
   b.disabled=true;
   try{
     const result=await request("/push/preferences","PUT",settings);
     state.pushData=result;
     setToast("Preferências de notificações salvas.");
     render();
   }finally{if(b.isConnected)b.disabled=false}
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
 if(action==="mail-preview-manual"){showMailPreview("manual");return}
 if(action==="save-reminder-soon"){
   const days=Number($("#reminder-days")?.value);
   if(!Number.isInteger(days)||days<1||days>30)return setToast("Informe uma antecedência entre 1 e 30 dias.");
   await saveAndReload(()=>request("/admin/reminder-settings","PATCH",{
     dueSoonEnabled:$("#reminder-soon").checked,daysBefore:days
   },"admin"),"Avisos antecipados salvos.");
   return;
 }
 if(action==="save-reminder-event-today"){
   await saveAndReload(()=>request("/admin/reminder-settings","PATCH",{
     eventTodayEnabled:$("#reminder-event-today").checked
   },"admin"),"Aviso no dia do evento salvo.");
   return;
 }
 if(action==="save-reminder-overdue"){
   await saveAndReload(()=>request("/admin/reminder-settings","PATCH",{
     overdueEnabled:$("#reminder-overdue").checked,
     overdueAudience:$("#reminder-overdue-audience").value
   },"admin"),"Aviso de prazo vencido salvo.");
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
  if(state.cronDetails){closeCronDetails();return}
  if(state.cronReminder){state.cronReminder=null;render();return}
  // Usa o histórico real, igual ao gesto/botão Voltar do celular.
  // Se a página foi aberta diretamente, permanece dentro do PET Gestão.
  if(state.navStack?.length>1)history.back();
  else location.hash=routeParts().page==="admin"?"#/admin/painel":"#/inicio";
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
  // Desvincular este dispositivo ANTES de revogar a sessão, sem afetar outros aparelhos.
  if(androidPush)try{await request("/push/unregister","POST",{deviceId:androidPush.deviceId})}catch{}
  // Remover apenas a inscrição deste navegador antes de encerrar a sessão.
  const browserSubscription=await desktopSubscription().catch(()=>null);
  if(browserSubscription){
   try{await request("/web-push/unsubscribe","POST",{endpoint:browserSubscription.endpoint})}catch{}
   try{await browserSubscription.unsubscribe()}catch{}
  }
  state.webPushHere=false;state.webPushData=null;
  registeredPushFor="";state.pushData=null;
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
   const role=$('[data-role="'+CSS.escape(tid)+'"]').value;
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
   await saveAndReload(()=>request("/admin/users/"+id(tid),"PATCH",{role}),
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
 if(form.id==="admin-summary-form"){
   const cid=form.dataset.commissionId;
   state.summaryFrom=form.elements.from.value;
   state.summaryTo=form.elements.to.value;
   if(state.summaryFrom>state.summaryTo)return setToast("A data inicial deve ser anterior à final.");
   state.summaryPerson="";state.summaryData=null;
   await loadAdminCommissionSummary(cid);
   return;
 }
 if(form.id==="cron-form"){
  if(!canWrite())return setToast("Acesso não autorizado.");
  const fields=userFields(form),eventId=form.dataset.id;
  const payload={title:fields.title,description:fields.description||"",startDate:fields.startDate,endDate:fields.endDate,
   startTime:fields.startTime||null,endTime:fields.endTime||null,timeNote:fields.timeNote||null,location:fields.location||""};
  const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
  try{
   await request("/schedule"+(eventId?"/"+id(eventId):""),eventId?"PUT":"POST",payload);
   state.cronEditing=null;state.cronDetails=null;state.cronLoadedYear=null;await loadCronYear(state.cronYear);
   setToast(eventId?"Atividade atualizada.":"Atividade cadastrada no Cronograma.");
  }finally{if(button?.isConnected)button.disabled=false}
  return;
 }
 if(form.id==="cron-reminder-form"){
  if(!canWrite()||!state.cronReminder)return setToast("Atividade não disponível.");
  const date=form.elements.at?.value;
  if(!date)return setToast("Selecione a data e a hora do lembrete.");
  const target={...state.cronReminder};
  const payload={taskId:null,scheduleEntryId:target.entryId,title:target.title,message:"",
   recurrence:"once",repeatUntil:null,autoDelete:true,
   channels:{email:false,android:true,pc:true},schedules:[{at:date}]};
  const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
  try{
   await request("/personal-reminders","POST",payload);
   state.cronReminder=null;state.reminderLoadedFor=null;
   render();setToast("Lembrete salvo em Meus lembretes. Será excluído depois do aviso.");
  }finally{if(button?.isConnected)button.disabled=false}
  return;
 }
 if(form.id==="task-form"){await saveTask(form);return}
 if(form.id==="commission-form"){await saveCommission(form);return}
 if(form.id==="meeting-form"){
    const f=collectRich(form,userFields(form));
    const ok=await saveAndReload(()=>request("/meetings"+(form.dataset.id?"/"+id(form.dataset.id):""),form.dataset.id?"PUT":"POST",{title:f.title,date:f.date,rawNotes:f.rawNotes}),"Ata salva.");
    if(ok){resetMeetingDraft();location.hash=workspaceHash("reunioes")}
    return;
   }
 if(form.id==="personal-reminder-form"){
   const f=userFields(form),type=f.reminderType||"task";
   const task=type==="task"?data.tasks.find(t=>t.id===f.taskId&&isMyPending(t)):null;
   if(type==="task"&&!task)return setToast("Selecione uma pendência que ainda pertença a você.");
   const schedules=readReminderSlots(form).map(slot=>
    f.recurrence==="once"?{at:slot.at}:
    f.recurrence==="daily"?{time:slot.time}:{weekday:slot.weekday,time:slot.time});
   const chosenStage=type==="task"?reminderStageFor(task,f.taskStageId):null;
   if(type==="task"&&f.taskStageId&&!chosenStage)return setToast("Escolha uma etapa disponível desta demanda.");
   const payload={taskId:type==="task"?task.id:null,taskStageId:chosenStage?.id||null,title:type==="task"?task.title:String(f.title||"").trim(),
    message:f.message||"",recurrence:f.recurrence,repeatUntil:f.repeatUntil||null,
    channels:{email:false,android:form.elements.android.checked,pc:form.elements.pc.checked},
    autoDelete:form.elements.autoDelete.checked,schedules};
   if(!payload.channels.android&&!payload.channels.pc)
    return setToast("Escolha celular ou PC para o lembrete.");
   const button=form.querySelector('button[type="submit"]');
   if(button)button.disabled=true;
   try{
    const updating=state.reminderEditing!=="new";
    await request("/personal-reminders"+(updating?"/"+id(state.reminderEditing):""),updating?"PUT":"POST",payload);
    state.reminderEditing=false;state.reminderDraft=null;state.reminderSchedules=[];
    state.reminderLoadedFor=null;await loadPersonalReminders();
    setToast(updating?"Lembrete atualizado.":"Lembrete criado.");
   }finally{if(button?.isConnected)button.disabled=false}
   return;
 }
 if(form.id==="notification-template-form"){
   const f=state.templateChannel==="app"?userFields(form):collectRich(form,userFields(form));
   if(!String(f.message||"").replace(/<[^>]*>/g,"").trim())return setToast("Escreva a mensagem da notificação.");
   if(state.templateChannel==="app"&&!String(f.title||"").trim())return setToast("Informe o título da notificação.");
   const payload=state.templateChannel==="app"?{kind:f.kind,channel:"app",title:f.title,message:f.message}:
    {kind:f.kind,channel:"email",subject:f.subject,message:f.message};
   const ok=await saveAndReload(()=>request("/admin/notification-template","PUT",payload,"admin"),"Modelo de notificação salvo.");
   if(ok)delete state.templateDrafts[state.templateChannel+":"+f.kind];
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
   if(choice==="encerrar-incompleta"&&task&&!task.archivedAt){
     if(await askConfirm("Encerrar esta demanda como não concluída? As participações realizadas serão mantidas. As que não foram realizadas continuarão registradas.",{
       title:"Encerrar como não concluída?",confirmLabel:"Encerrar demanda",cancelLabel:"Manter atrasada"
     })){
       await saveAndReload(()=>request("/tasks/"+id(task.id)+"/close-unfinished","PATCH",{}),"Demanda encerrada como não concluída.");
     }
   }
   return;
  }
 if(t.dataset.filter==="navigateDemands"){
   state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
   state.statusFilter=t.value;
   if(["concluida","nao_concluida"].includes(t.value))state.mode="arquivo";
   else if(state.mode==="arquivo")state.mode="mensal";
   location.hash=workspaceHash("demandas");return;
 }
 if(t.dataset.filter==="commissionStatus"){state.commissionStatusFilter=t.value;render();return}
 if(t.dataset.filter==="mineStatus"){state.mineStatusFilter=t.value;render();return}
 if(t.dataset.filter==="meetings"){state.meetingView=t.value;render();return}
 if(t.dataset.filter==="periodMode"){state.mode=t.value;render();return}
 if(t.dataset.filter==="conclusionKind"){state.conclusionKind=t.value;render();return}
 if(t.dataset.filter){
   state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
   if(t.dataset.filter==="status"){
    state.statusFilter=t.value;
    if(["concluida","nao_concluida"].includes(t.value))state.mode="arquivo";
    else if(state.mode==="arquivo")state.mode="mensal";
    render();return;
   }
    const val=Number(t.value);
   if(t.dataset.filter==="month"){state.month=val;state.week=0}
   if(t.dataset.filter==="year"){state.year=val;state.week=0}
   if(t.dataset.filter==="week")state.week=val;
   localStorage.setItem("pet-gestao:period",JSON.stringify({year:state.year,month:state.month,week:state.week}));render();return;
 }
 if(t.matches?.("[data-rich-highlight]")){
   const editor=t.closest(".rich-editor")?.querySelector("[data-rich-input]");
   if(editor)applyRichFormat(editor,"hiliteColor",t.value);
   return;
 }
 if(t.matches?.("[data-rich-color]")){
   const editor=t.closest(".rich-editor")?.querySelector("[data-rich-input]");
   if(editor&&applyRichFormat(editor,"foreColor",t.value)){
     const symbol=t.closest(".rich-color-label")?.querySelector(".rich-color-symbol");
     if(symbol)symbol.style.setProperty("--selected-text-color",t.value);
   }
   return;
 }
 if(t?.matches?.("[data-notice-kind][data-notice-channel]")){
  if(state.noticeDraft?.[t.dataset.noticeKind]){
   state.noticeDraft[t.dataset.noticeKind][t.dataset.noticeChannel]=t.checked;
   state.noticeDirty=true;
  }
  return;
 }
 if(t.id==="reminder-type"){
  captureReminderEditor();
  state.reminderDraft.reminderType=t.value;
  render();return;
 }
 if(t.id==="reminder-task"){
  captureReminderEditor();
  state.reminderDraft.taskStageId="";
  if(state.reminderRecurrence==="once"){
   const selected=data.tasks.find(task=>task.id===t.value&&isMyPending(task));
   if(selected)state.reminderSchedules=[reminderDefaultSlot("once",selected)];
  }
  render();return;
 }
 if(t.id==="reminder-stage"){
  captureReminderEditor();
  const selected=data.tasks.find(task=>task.id===state.reminderDraft?.taskId&&isMyPending(task));
  const stage=reminderStageFor(selected,t.value);
  // Trocar a etapa redefine a agenda para apenas a data da nova etapa.
  // O titular ainda pode adicionar outros horários explicitamente.
  if(state.reminderRecurrence==="once"&&selected)
   state.reminderSchedules=[reminderDefaultSlot("once",selected,stage)];
  render();return;
 }
 if(t.id==="reminder-recurrence"){
  captureReminderEditor();
  state.reminderRecurrence=t.value;
  const selected=data.tasks.find(task=>task.id===state.reminderDraft?.taskId&&isMyPending(task));
  state.reminderSchedules=[reminderDefaultSlot(t.value,selected,reminderStageFor(selected,state.reminderDraft?.taskStageId))];
  render();return;
 }
 if(t.id==="notification-template-kind"||t.id==="notification-template-channel"){
   const form=t.closest("#notification-template-form");
   if(form){
     const previous=state.templateChannel+":"+state.templateKind;
     state.templateDrafts[previous]=state.templateChannel==="app"?
      {title:form.elements.title?.value||"",body:form.elements.message?.value||""}:
      {subject:form.elements.subject?.value||"",body:safeRich(form.querySelector('[data-rich-input="message"]')?.innerHTML||"")};
     if(t.id==="notification-template-kind")state.templateKind=t.value;
     else state.templateChannel=t.value;
     const fields=form.querySelector("#notification-template-fields");
     if(fields)fields.innerHTML=notificationTemplateFields(state.templateKind);
   }
   return;
 }

 if(t.id==="quicknav-enabled"){
  if(!state.quickNavDraft)return;
  state.quickNavDraft.enabled=t.checked;render();return;
 }
 if(t.hasAttribute("data-quicknav-choice")){
  if(!state.quickNavDraft)return;
  const key=t.dataset.quicknavChoice,list=state.quickNavDraft.items;
  if(t.checked){if(list.length>=5){t.checked=false;return setToast("Escolha até cinco atalhos.");}if(!list.includes(key))list.push(key);}
  else state.quickNavDraft.items=list.filter(v=>v!==key);
  render();return;
 }
 if(t.id==="admin-report-kind"){state.adminReportView=["todos","cronograma","comissoes","usuarios"].includes(t.value)?t.value:"cronograma";render();return}
 if(t.id==="admin-report-year"){const y=Number(t.value);if(y>=2000&&y<=2100){state.adminReportYear=y;state.adminReportData=null;state.adminReportLoadedYear=null;state.adminReportError="";state.adminOverviewData=null;state.adminOverviewLoadedYear=null;state.adminOverviewError="";render();}return}
 if(t.id==="admin-report-commission"){state.adminReportCommission=t.value;render();return}
  if(t.id==="admin-report-user"){state.adminReportUser=t.value;render();return}
 if(t.id==="cron-source"){state.cronFilter=["cronograma","demandas","todos"].includes(t.value)?t.value:"cronograma";render();return}
 if(t.id==="cron-year"){
  const year=Number(t.value);if(Number.isInteger(year)&&year>=2000&&year<=2100){
   state.cronYear=year;state.cronSelectedDay=cronIso(year,state.cronMonth,1);render();
  }return;
 }
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
 if(lastHash!==location.hash&&location.hash==="#/admin/relatorios"){state.adminReportLoadedYear=null;state.adminReportError="";}
 if(lastHash!==location.hash&&lastHash.startsWith("#/cronograma")&&!location.hash.startsWith("#/cronograma")){state.cronFilter="cronograma";state.cronEditing=null;state.cronReminder=null;state.cronDetails=null;}
 if(lastHash!==location.hash){
  const stack=state.navStack||[];
  const index=stack.lastIndexOf(location.hash);
  if(index>=0&&index===stack.length-2)stack.pop();
  else if(index>=0)stack.splice(index+1);
  else stack.push(location.hash);
  state.previousRoute=lastHash;lastHash=location.hash;
 }
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
 me=null;regularMe=null;resetTaskDraft();resetMeetingDraft();
 state.adminMenuOpen=false;state.archiveDeleteMode=false;state.archiveSelectedIds.clear();
 location.hash="#/inicio";
 reload();
}
function start(){
 if(hasStarted)return;
 hasStarted=true;
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Não foi possível iniciar o cache público do site:",err));
 state.navStack=[lastHash];
 if(!location.hash)location.replace(location.pathname+location.search+"#/inicio");
 
 
 $("#open-menu")?.addEventListener("click",()=>{$("#sidebar").classList.add("open");$("#overlay").hidden=false});
 $("#close-menu")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 $("#overlay")?.addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#overlay").hidden=true});
 // Ao voltar pelo Android/Chrome, fechar primeiro qualquer detalhe aberto.
 // A janela possui sua própria entrada de histórico, mas mantém a URL do Cronograma.
 window.addEventListener("popstate",event=>{
  if(state.cronDetails&&location.hash===lastHash&&!event.state?.petCronDetails){
   const previous=state.cronDetails;
   state.cronDetails=null;
   render();
   $('[data-do="cron-details"][data-id="'+previous+'"]')?.focus();
   return;
  }
  if(location.hash!==lastHash&&event.state?.petCronDetails){
   state.cronDetails=event.state.petCronDetails;
  }
 });
 window.addEventListener("hashchange",()=>{
   // Eventos duplicados para a mesma rota não devem fechar uma confirmação aberta.
   if(location.hash===lastHash)return;
   $("#sidebar")?.classList.remove("open");$("#overlay").hidden=true;
   closeCommissionDialog();closeAuthMessage();closeNotice(false);closeFinishDialog();closeMailPreview();
   const destination=location.hash;
   if(destination!==lastHash&&(hasUnsavedTaskChanges()||hasUnsavedMeetingChanges())){
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
       resetTaskDraft();resetMeetingDraft();state.taskFormId=null;
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
  if(!token||hasUnsavedTaskChanges()||hasUnsavedMeetingChanges())return;
  try{
   const response=await request("/auth/me");
   if(response.user?.role!==me?.role||response.user?.adminSession!==me?.adminSession||
      response.user?.mustChangePassword!==me?.mustChangePassword)await reload();
  }catch{/* Sessões inválidas serão verificadas na próxima navegação ou recarga. */}
 }
 window.addEventListener("focus",()=>{syncBrowserSession();void refreshPermissionOnFocus()});
 window.addEventListener("beforeunload",e=>{
   if(hasUnsavedTaskChanges()||hasUnsavedMeetingChanges()){e.preventDefault();e.returnValue="";}
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
   else if(state.cronDetails){e.preventDefault();closeCronDetails()}
   else if(state.cronReminder){e.preventDefault();state.cronReminder=null;render()}
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
 document.addEventListener("input",e=>{
  const editor=e.target.closest?.("[data-rich-input]");
  if(!editor)return;
  // Não modificar nós enquanto o teclado ainda está compondo a palavra.
  if(e.isComposing||e.inputType==="insertCompositionText"||e.inputType==="deleteCompositionText"){
   previewRichNativeComposition(editor);return;
  }
  clearRichCompositionPreview(editor);
  reconcileRichNativeInput(editor);
 });
 document.addEventListener("compositionstart",e=>{
  const editor=e.target.closest?.("[data-rich-input]");
  if(editor&&!richNativeSnapshots.has(editor))snapshotRichInput(editor);
 });
 document.addEventListener("compositionend",e=>{
  const editor=e.target.closest?.("[data-rich-input]");
  if(editor)setTimeout(()=>{clearRichCompositionPreview(editor);if(editor.isConnected)reconcileRichNativeInput(editor)},0);
 });
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
   const selectedHelp=e.target.closest?.(".pet-context-help");
   document.querySelectorAll(".pet-context-help[open]").forEach(help=>{if(help!==selectedHelp)help.open=false});
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
 document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".pet-context-help[open]").forEach(help=>help.open=false)});
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
   if(el?.id==="admin-user-search"){filterAdminUsers();return}
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
