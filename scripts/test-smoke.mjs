import assert from "node:assert/strict";
const base="http://127.0.0.1:8787/api/v1";
let token="",tests=0;
async function api(path,method="GET",payload){
 const res=await fetch(base+path,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:payload===undefined?undefined:JSON.stringify(payload)});
 return {status:res.status,...await res.json()};
}
async function test(name,fn){await fn();console.log("PASS",++tests,name)}
const good=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r};
const dueAt=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
await test("saúde",async()=>{assert.equal(good(await api("/health")).database,true)});
await test("bootstrap público",async()=>{const r=good(await api("/bootstrap"));assert.equal(r.committees.length,10);assert.equal(r.session,null)});
await test("controle de acesso",async()=>{assert.equal((await api("/admin/users")).status,401)});
await test("login Admin separado",async()=>{const r=good(await api("/auth/admin-login","POST",{identifier:"Admin",password:process.env.TEST_ADMIN_PASSWORD}));token=r.token;assert.equal(r.user.role,"admin")});
await test("Admin pode entrar diretamente pela conta principal",async()=>{
 const r=good(await api("/auth/login","POST",{email:process.env.TEST_ADMIN_EMAIL,password:process.env.TEST_ADMIN_PASSWORD}));
 assert.equal(r.user.role,"admin");
 assert.ok(r.token);
});
let a,b,task,meeting;
await test("login administrativo independente",async()=>{
 const bad=await api("/auth/admin-login","POST",{identifier:"Admin",password:"errada"});
 assert.equal(bad.status,401);
 const r=good(await api("/auth/admin-login","POST",{identifier:"Admin",password:process.env.TEST_ADMIN_PASSWORD}));
 assert.equal(r.user.role,"admin");assert.ok(r.token);
});
await test("cadastro começa como Usuário",async()=>{
 good(await api("/auth/register","POST",{name:"Pessoa Teste",email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}),201);
 const r=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}));
 assert.equal(r.user.role,"usuario");
 const users=good(await api("/admin/users")).users;
 assert.equal(users.find(u=>u.email==="teste-usuario@pet.local").role,"usuario");
});
await test("admin pode promover ou voltar à categoria Usuário",async()=>{
 const id=good(await api("/admin/users")).users.find(u=>u.email==="teste-usuario@pet.local").id;
 good(await api("/admin/users/"+id,"PATCH",{role:"petiano",notificationEnabled:false}));
 assert.equal(good(await api("/admin/users")).users.find(u=>u.id===id).role,"petiano");
 good(await api("/admin/users/"+id,"PATCH",{role:"usuario",notificationEnabled:false}));
 assert.equal(good(await api("/admin/users")).users.find(u=>u.id===id).role,"usuario");
});
await test("Tutor possui acesso administrativo completo",async()=>{
 const admin=token;
 const id=good(await api("/admin/users")).users.find(u=>u.email==="teste-usuario@pet.local").id;
 good(await api("/admin/users/"+id,"PATCH",{role:"tutor",notificationEnabled:false}));
 try{
   const tutor=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}));
   assert.equal(tutor.user.role,"tutor");
   token=tutor.token;
   good(await api("/admin/users"));
   good(await api("/bootstrap"));
   good(await api("/admin/settings","PUT",{autoWeek:true,autoMonth:false}));
   const recipient=good(await api("/admin/users")).users.find(u=>u.email==="teste-usuario@pet.local").id;
   const scheduled=await api("/mail","POST",{all:false,userIds:[recipient],subject:"Ensaio de agendamento local",message:"Teste isolado sem envio ao Gmail.",scheduledAt:new Date(Date.now()+86400000).toISOString()});
   assert.equal(scheduled.ok,true);
   assert.equal(scheduled.status,"agendado");
   const history=good(await api("/mail")).items;
   assert.ok(history.some(x=>x.id===scheduled.id&&x.recipientEmails.includes("teste-usuario@pet.local")));
   const status=good(await api("/mail/status"));
   assert.equal(status.connected,false,"O teste isolado não pode fingir que existe integração Gmail.");
   assert.equal(status.code,"UNCONFIGURED");
   const before=good(await api("/mail")).items.length;
   const immediate=await api("/mail","POST",{all:false,userIds:[recipient],subject:"Ensaio de fila imediata local",message:"Fila isolada, não enviada ao Gmail."});
   assert.equal(immediate.status,503,"Não se deve registrar um envio quando a integração está desconectada.");
   assert.equal(good(await api("/mail")).items.length,before,"Falha da ponte não pode criar e-mail pendente.");
   assert.equal((await api("/mail/retry","POST",{id:scheduled.id})).status,503);
   assert.equal((await api("/mail","POST",{all:false,userIds:[],subject:"Sem destino",message:"Não pode enviar"})).status,400);
 }finally{
   token=admin;
   good(await api("/admin/users/"+id,"PATCH",{role:"usuario",notificationEnabled:false}));
 }
});
await test("criar comissões",async()=>{good(await api("/commissions","POST",{name:"Teste Comissão A"}));good(await api("/commissions","POST",{name:"Teste Comissão B"}));const c=good(await api("/bootstrap")).committees;a=c.find(x=>x.name==="Teste Comissão A").id;b=c.find(x=>x.name==="Teste Comissão B").id});
await test("vagas zero impedem participar; limite configurado é respeitado",async()=>{
  const commissionId=a;
  const current=good(await api("/bootstrap")).committees.find(c=>c.id===commissionId);
  assert.equal(current.maxMembers,0,"Comissão nova deve iniciar sem vagas definidas");
  const denied=await api("/commissions/"+commissionId+"/join","POST",{});
  assert.equal(denied.status,409,"Zero não pode funcionar como vagas ilimitadas.");
  assert.match(denied.error,/vagas definidas/);
  good(await api("/commissions/"+commissionId,"PUT",{name:current.name,maxMembers:1}));
  good(await api("/commissions/"+commissionId+"/join","POST",{}));
  assert.equal(good(await api("/bootstrap")).committees.find(c=>c.id===commissionId).memberCount,1);
  const adminToken=token;
  const pet=good(await api("/admin/users")).users.find(u=>u.email==="teste-usuario@pet.local");
  good(await api("/admin/users/"+pet.id,"PATCH",{role:"petiano",notificationEnabled:false}));
  try{
    const login=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}));
    token=login.token;
    const full=await api("/commissions/"+commissionId+"/join","POST",{});
    assert.equal(full.status,409,"Não ultrapassar o limite mesmo quando botão é ignorado.");
    assert.match(full.error,/vagas preenchidas/);
  }finally{
    token=adminToken;
    good(await api("/admin/users/"+pet.id,"PATCH",{role:"usuario",notificationEnabled:false}));
  }
  good(await api("/commissions/"+commissionId+"/leave","POST",{}));
  good(await api("/commissions/"+commissionId,"PUT",{name:current.name,maxMembers:0}));
  assert.equal((await api("/commissions/"+commissionId+"/join","POST",{})).status,409);
});
await test("editar comissão",async()=>{good(await api("/commissions/"+a,"PUT",{name:"Teste Renomeada",backgroundColor:"#123456"}));assert.equal(good(await api("/bootstrap")).committees.find(x=>x.id===a).backgroundColor,"#123456")});
await test("mover comissões",async()=>{const ids=good(await api("/bootstrap")).committees.map(x=>x.id).reverse();good(await api("/admin/commission-order","PUT",{ids}));assert.equal(good(await api("/bootstrap")).committees[0].id,ids[0])});
await test("configurações",async()=>{good(await api("/admin/settings","PUT",{autoWeek:false,autoMonth:false}));assert.equal(good(await api("/bootstrap")).settings.autoWeek,false)});
await test("criar demanda",async()=>{task=good(await api("/tasks","POST",{title:"Teste Demanda",commissionIds:[a,b],assigneeIds:[],deadlines:[{id:"prazo1",label:"Prazo",dueAt}]}),201).id});
await test("Usuário consegue visualizar, mas não pode criar, editar ou excluir",async()=>{
 const original=token;
 const login=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}));
 try{
   token=login.token;
   const preview=good(await api("/bootstrap"));
   assert.equal(preview.session.user.role,"usuario");
   assert.ok(preview.tasks.some(x=>x.id===task));
   assert.equal((await api("/tasks","POST",{title:"Proibido"})).status,403);
   assert.equal((await api("/tasks/"+task,"PUT",{title:"Alteração proibida"})).status,403);
   assert.equal((await api("/tasks/"+task+"/notes","PATCH",{captionText:"Proibido"})).status,403);
   assert.equal((await api("/tasks/"+task+"/status","PATCH",{status:"aprovada"})).status,403);
   assert.equal((await api("/tasks/"+task+"/finish","PATCH",{commissionId:a})).status,403);
   assert.equal((await api("/tasks/"+task,"DELETE")).status,403);
   assert.equal((await api("/commissions","POST",{name:"Proibido"})).status,403);
   assert.equal((await api("/commissions/"+a,"PUT",{name:"Proibido"})).status,403);
   assert.equal((await api("/commissions/"+a+"/join","POST",{})).status,403);
   assert.equal((await api("/meetings","POST",{title:"Proibido",date:dueAt})).status,403);
   assert.equal((await api("/admin/users")).status,403);
 }finally{token=original}
});
await test("editar demanda",async()=>{good(await api("/tasks/"+task,"PUT",{title:"Teste Editado",commissionIds:[a,b],assigneeIds:[],deadlines:[{id:"prazo1",label:"Prazo",dueAt}]}));assert.equal(good(await api("/bootstrap")).tasks.find(x=>x.id===task).title,"Teste Editado")});
await test("observações e aprovação",async()=>{good(await api("/tasks/"+task+"/notes","PATCH",{captionText:"Observação"}));good(await api("/tasks/"+task+"/status","PATCH",{status:"aprovada"}))});
await test("conclusão independente",async()=>{const r=good(await api("/tasks/"+task+"/finish","PATCH",{commissionId:a,early:true}));assert.equal(r.archived,false)});
await test("arquivamento",async()=>{const r=good(await api("/tasks/"+task+"/finish","PATCH",{commissionId:b,early:true}));assert.equal(r.archived,true)});
await test("exclusão definitiva",async()=>{good(await api("/tasks/"+task,"DELETE"));assert.ok(!good(await api("/bootstrap")).tasks.some(x=>x.id===task))});
await test("criar memória",async()=>{good(await api("/meetings","POST",{title:"Memória Teste",date:dueAt,rawNotes:"Responsável: teste"}));meeting=good(await api("/bootstrap")).meetings.find(x=>x.title==="Memória Teste").id});
await test("editar e excluir memória",async()=>{good(await api("/meetings/"+meeting,"PUT",{title:"Memória Editada",date:dueAt}));good(await api("/meetings/"+meeting,"DELETE"))});
await test("excluir comissões",async()=>{good(await api("/commissions/"+a,"DELETE"));good(await api("/commissions/"+b,"DELETE"))});
await test("senha administrativa temporária pode ser trocada sem login comum",async()=>{
 const admin=good(await api("/admin/users")).users.find(u=>u.role==="admin");
 assert.ok(admin?.id);
 const temporary=good(await api("/admin/users/"+admin.id+"/temporary-password","POST")).temporaryPassword;
 assert.ok(temporary);
 const entry=good(await api("/auth/admin-login","POST",{identifier:"Admin",password:temporary}));
 assert.equal(entry.user.mustChangePassword,true);
 token=entry.token;
 good(await api("/auth/change-password","POST",{password:temporary,newPassword:"SenhaNovaAdminSegura123!"}));
 assert.equal((await api("/auth/me")).status,401);
});
await test("logout",async()=>{good(await api("/auth/logout","POST"));assert.equal((await api("/auth/me")).status,401)});

await test("seleção múltipla de e-mails executa sem erro de map",async()=>{
 const {readFileSync}=await import("node:fs");
 const js=readFileSync("app-live.js","utf8");
 const selector=js.match(/const f=userFields\(form\),ids=([^,]+),userIds=/);
 assert.ok(selector,"Expressão de seleção dos destinatários não encontrada");
 const evaluate=new Function("$","$$","return "+selector[1]);
 const selection=evaluate(()=>({value:"incorreto"}),()=>[{value:"pessoa-1"},{value:"pessoa-2"}]);
 assert.deepEqual(selection,["pessoa-1","pessoa-2"]);
 assert.ok(js.includes('class="admin-commission-item"'));
 assert.ok(js.includes('class="admin-layout"'));
});
await test("painel usa apenas áreas existentes e respeita identidade",async()=>{
 const {readFileSync}=await import("node:fs");
 const js=readFileSync("app-live.js","utf8");
 const css=readFileSync("live.css","utf8");
 const html=readFileSync("index.html","utf8");
 assert.ok(js.includes('const roleLabel=role=>'));
 assert.ok(js.includes('const person=regularMe, logged=Boolean(person)'));
 assert.ok(js.includes('["tutor","admin"].includes(u.role)'));
 assert.ok(js.includes('admin-menu-link'));
 assert.ok(js.includes('data-value="emails"'));
 assert.ok(js.includes('data-value="comissoes"'));
 assert.ok(js.includes('admin-signout'));
 assert.ok(css.includes('.admin-layout{'));
 assert.ok(css.includes('#admin-link[hidden]{display:none!important}'));
 assert.ok(html.includes('id="account-button"'));
});
await test("ponte Google Apps Script rejeita token inválido e testa sem enviar",async()=>{
 const {readFileSync}=await import("node:fs");
 const {runInNewContext}=await import("node:vm");
 const source=readFileSync("integracoes/AppsScript_PET_Gestao.gs","utf8");
 const tokenValue="x".repeat(48),outbox=[];
 const props={PET_GESTAO_MAIL_TOKEN:tokenValue},executions=[];
 const environment={
  JSON,Array,String,Error,Number,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||"",setProperty:(k,v)=>{props[k]=v}})},
  Logger:{log:message=>executions.push(message)},
  ContentService:{MimeType:{JSON:"JSON"},createTextOutput:content=>({setMimeType(){return this},getContent(){return content}})},
  MailApp:{getRemainingDailyQuota:()=>500,sendEmail:x=>{outbox.push(x)}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  Utilities:{getUuid:()=>"abc12345-ef12-4abc-b007-001122334455",base64Decode:base64=>Buffer.from(base64,"base64"),newBlob:(bytes,mime,name)=>({bytes,mime,name})}
 };
 runInNewContext(source,environment,{timeout:1500});
 environment.gerarTokenPETGestao();
 assert.equal(props.PET_GESTAO_MAIL_TOKEN,tokenValue,"Chave existente não pode ser substituída.");
 assert.ok(executions.at(-1).includes(tokenValue),"Token precisa estar no registro de execução.");
 delete props.PET_GESTAO_MAIL_TOKEN;
 environment.gerarTokenPETGestao();
 const freshToken=props.PET_GESTAO_MAIL_TOKEN;
 assert.ok(freshToken.length>=32,"Nova chave precisa ter pelo menos 32 caracteres.");
 assert.ok(executions.at(-1).includes(freshToken),"Nova chave deve ser exibida no registro.");
 environment.gerarTokenPETGestao();
 assert.equal(props.PET_GESTAO_MAIL_TOKEN,freshToken,"Uma segunda execução não deve trocar a chave.");
 props.PET_GESTAO_MAIL_TOKEN=tokenValue; // Restaura chave dos testes de envio.
 const post=obj=>JSON.parse(environment.doPost({postData:{contents:JSON.stringify(obj)}}).getContent());
 const denied=post({acao:"enviar",token:"errada",para:["teste@pet.local"],assunto:"Teste",mensagem:"Teste"});
 assert.equal(denied.codigo,"NAO_AUTORIZADO");
 assert.equal(outbox.length,0);
 const status=post({acao:"status",token:tokenValue});
 assert.equal(status.ok,true);
 assert.equal(status.servico,"pet-gestao");
 assert.equal(outbox.length,0,"Consulta de status não deve enviar mensagem.");
 const sent=post({acao:"enviar",token:tokenValue,para:["teste@pet.local"],assunto:"Teste controlado",mensagem:"Mensagem simulada."});
 assert.equal(sent.ok,true);
 assert.equal(outbox.length,1,"Simulação deve registrar só um envio, sem chamar Gmail real.");
 assert.equal(outbox[0].to,"teste@pet.local");
 assert.equal(post({acao:"enviar",token:tokenValue,para:[],assunto:"Teste",mensagem:"Teste"}).ok,false);
});
await test("painel de e-mails apresenta monitoramento sem enviar automaticamente",async()=>{
 const {readFileSync}=await import("node:fs");
 const js=readFileSync("app-live.js","utf8");
 const worker=readFileSync("worker/src/index.js","utf8");
 assert.ok(js.includes('Fila atual ('));
 assert.ok(js.includes('Histórico recente ('));
 assert.ok(js.includes('mail-monitor-refresh'));
 assert.ok(js.includes('mailStatusPanel'));
 assert.ok(worker.includes('if(path==="/api/v1/mail/status"'));
 assert.ok(worker.includes('if(!health.connected)fail('));
});
await test("Admin mantém ferramentas no painel novo e mostra popup de conexão",async()=>{
 const {readFileSync}=await import("node:fs");
 const js=readFileSync("app-live.js","utf8");
 const index=readFileSync("index.html","utf8");
 const css=readFileSync("live.css","utf8");
 assert.match(js,/data-do="admin-route" data-value="demandas"/);
 assert.match(js,/function adminEmbeddedView\(parts\)/);
 assert.match(js,/if\(page==="demandas"\)return renderDemandas\(\)/);
 assert.match(js,/if\(page==="registrar"\)return renderTaskForm\(route\)/);
 assert.match(js,/location.hash=workspaceHash\("demandas"\)/);
 assert.match(js,/location.hash=workspaceHash\("comissoes"\)/);
 assert.match(js,/location.hash="#\/admin"\+href.slice\(1\)/);
 assert.ok(!js.includes(' Voltar ao sistema</a>'));
 assert.ok(js.includes(' Sair do modo Admin</button>'));
 assert.ok(index.includes('id="connecting-popup"'));
 assert.ok(js.includes('if(isLogin)setConnecting(true'));
 assert.ok(css.includes('.admin-embedded-view{'));
});
await test("F5 não exibe layout antigo nem acesso Admin antes de carregar o usuário",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync("index.html","utf8"),src=readFileSync("app-live.js","utf8");
 assert.ok(index.includes('document.documentElement.classList.add("pet-booting")'));
 assert.ok(index.includes('html.pet-booting .app-shell{visibility:hidden!important}'));
 assert.match(index,/<button class="nav-link" id="admin-link" type="button" hidden>/);
 assert.ok(index.includes('id="startup-loading"'));
 assert.ok(src.includes('document.documentElement.classList.remove("pet-booting")'));
});
await test("Comissão utiliza popup customizado central com fundo desfocado",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync("index.html","utf8"),src=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(index.includes('id="commission-dialog"'));
 assert.ok(src.includes('showCommissionDialog('));
 assert.ok(src.includes('vagas definidas'));
 assert.ok(src.includes('commission-dialog-confirm'));
 assert.ok(!src.includes('window.confirm(action==="join-commission"'));
 assert.ok(!src.includes('(cmax&&members>=cmax?"disabled":"")'));
 assert.ok(css.includes('.commission-dialog-shade{'));
 assert.ok(css.includes('backdrop-filter:blur('));
});
console.log(tests+" testes passaram no banco local isolado");
