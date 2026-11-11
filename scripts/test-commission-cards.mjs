// Teste isolado dos cards das comissões; não acessa D1 nem contas reais.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const js=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
const start=js.indexOf("function commissionCardTheme(");
const end=js.indexOf("function commissionHelp(){",start);
assert.ok(start>0&&end>start,"Bloco de comissões não encontrado.");
const ctx={
 data:{committees:[
  {id:"videos",name:"Vídeos",backgroundColor:"#f3e8ff",memberCount:1,maxMembers:2,memberIds:["p1"],imageData:""},
  {id:"site",name:"Site",backgroundColor:"#0088ff",memberCount:0,maxMembers:2,memberIds:[],imageData:"data:image/jpeg;base64,QUJD"},
  {id:"outra",name:"Equipe de pesquisa",backgroundColor:"#884411",memberCount:2,maxMembers:3,memberIds:[],imageData:""}]},
 me:{id:"p1"},canWrite:()=>true,isAdmin:()=>false,
 button:label=>'<button>'+label+'</button>',header:()=>"",workspaceHash:p=>"#/"+p,
 id:x=>x,ico:x=>'<svg data-icon="'+x+'"></svg>',
 esc:x=>String(x??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;")
};
const factory=new Function("ctx","with(ctx){"+js.slice(start,end)+"return {commissionCardTheme,commissionCardArt,renderComissoes};}");
const {commissionCardTheme,commissionCardArt,renderComissoes}=factory(ctx);
const names=["Vídeos","Cards","ImaginAÇÃO","CinePET","Salinha","Finanças","Legendas","Site","Comemorações","Impressora 3D","Comissão nova"];
for(const name of names){
 const svg=commissionCardArt(name);
 assert.ok(svg.startsWith('<svg class="commission-card-svg"'),"Sem ilustração: "+name);
 assert.ok(svg.endsWith("</svg>")&&svg.includes("<defs>")&&!svg.includes("undefined"),"SVG incorreto: "+name);
}
assert.ok(commissionCardArt("Comissão nova").includes("petCardGreen"),"Fallback genérico ausente.");
for(const hex of ["#000000","#ffffff","#f3e8ff","#00fa19","#ae0000","#0000ff"]){
 const theme=commissionCardTheme(hex);
 assert.equal(theme.color,hex);
 assert.match(theme.tone,/^hsl\(\d+ \d+% 65%\)$/);
 assert.match(theme.ink,/^hsl\(\d+ \d+% 26%\)$/);
}
assert.equal(commissionCardTheme("invalida").color,"#f7f3ff");
let html=renderComissoes();
assert.ok(html.includes("commission-tile-v2")&&html.includes("commission-v2-marker"));
assert.ok(html.includes("--commission-bg:#0088ff"),"RGB escolhido deve ser preservado.");
assert.ok(html.includes("commission-v2-art-custom")&&html.includes('src="data:image/jpeg;base64,QUJD"'),"Imagem personalizada perdeu prioridade.");
assert.ok(html.includes("Ver atividades")&&html.includes('data-do="join-commission"'),"Ações antigas foram perdidas.");
assert.ok(!html.includes("Vagas a definir"),"Vagas informadas não devem sumir.");
ctx.canWrite=()=>false;
html=renderComissoes();
assert.ok(!html.includes("Ver atividades")&&!html.includes("commission-tile-menu"),"Leitura não pode ter interações.");
assert.ok(html.includes('<div class="commission-tile-link'),"Leitura precisa preservar o conteúdo sem link.");
assert.match(css,/#screen \.commission-tile-link-v2\{[^}]*flex-direction:row/s,"O layout horizontal deve esticar o bloco de texto para manter Ver atividades perto da base.");
for(const token of [".commission-tile-link-v2",".commission-v2-art-custom","#screen .commission-tile-v2","--commission-tone","@media(max-width:650px)"])
 assert.ok(css.includes(token),"CSS ausente: "+token);
console.log("OK: artes padrão, fallback, cor RGB, foto própria, permissões e responsividade.");
