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
await test("manter-me conectado diferencia validade e exige opt-in",async()=>{
 const email=process.env.TEST_ADMIN_EMAIL,password=process.env.TEST_ADMIN_PASSWORD;
 const regular=good(await api("/auth/login","POST",{email,password,rememberMe:false}));
 const persistent=good(await api("/auth/login","POST",{email,password,rememberMe:true}));
 const legacy=good(await api("/auth/login","POST",{email,password}));
 const adminPersistent=good(await api("/auth/admin-login","POST",{identifier:"Admin",password,rememberMe:true}));
 const days=r=>(Date.parse(r.expiresAt)-Date.now())/86400000;
 assert.ok(days(regular)>6.95&&days(regular)<7.02,"Sessão comum: 7 dias");
 assert.ok(days(legacy)>6.95&&days(legacy)<7.02,"Sessão sem opt-in: 7 dias");
 assert.ok(days(persistent)>29.95&&days(persistent)<30.02,"Sessão mantida: 30 dias");
 assert.ok(days(adminPersistent)>29.95&&days(adminPersistent)<30.02,"Admin mantido: 30 dias");
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
await test("observações e sem status antigos",async()=>{
 good(await api("/tasks/"+task+"/notes","PATCH",{captionText:"Observação"}));
 assert.equal((await api("/tasks/"+task+"/status","PATCH",{status:"aprovada"})).status,410);
});
await test("conclusão independente",async()=>{
 for(const cid of [a,b]){
   const row=good(await api("/bootstrap")).committees.find(c=>c.id===cid);
   good(await api("/commissions/"+cid,"PUT",{name:row.name,maxMembers:1}));
   good(await api("/commissions/"+cid+"/join","POST",{}));
 }
 const r=good(await api("/tasks/"+task+"/finish","PATCH",{commissionId:a,early:true}));
 assert.equal(r.archived,false);
 assert.equal(r.remainingCommissions.length,1);
});
await test("arquivamento",async()=>{const r=good(await api("/tasks/"+task+"/finish","PATCH",{commissionId:b,early:true}));assert.equal(r.archived,true)});
await test("exclusão definitiva",async()=>{good(await api("/tasks/"+task,"DELETE"));assert.ok(!good(await api("/bootstrap")).tasks.some(x=>x.id===task))});
await test("cada pessoa conclui apenas sua própria tarefa e a última conclusão arquiva",async()=>{
 const adminToken=token,admin=good(await api("/auth/me")).user;
 const other=good(await api("/admin/users")).users.find(x=>x.email==="teste-usuario@pet.local");
 good(await api("/admin/users/"+other.id,"PATCH",{role:"petiano",notificationEnabled:false}));
 try{
   const created=good(await api("/tasks","POST",{
     title:"Teste duas participações individuais",commissionIds:[],assigneeIds:[admin.id,other.id],
     deadlines:[{id:"prazoIndividual",label:"Prazo",dueAt}]
   }),201).id;
   const petToken=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"})).token;
   token=petToken;
   assert.equal((await api("/tasks/"+created+"/finish","PATCH",{commissionId:a})).status,403,"Não pode concluir como comissão não atribuída.");
   const r=good(await api("/tasks/"+created+"/finish","PATCH",{userId:admin.id,early:true}));
   assert.equal(r.archived,false);
   const state=good(await api("/bootstrap")).tasks.find(x=>x.id===created);
   assert.ok(state.userDone[other.id]);
   assert.ok(!state.userDone[admin.id],"Não pode marcar conclusão de outra pessoa.");
   assert.ok(!state.archivedAt);
   assert.equal(good(await api("/tasks/"+created+"/finish","PATCH",{})).alreadyDone,true);
   token=adminToken;
   const ended=good(await api("/tasks/"+created+"/finish","PATCH",{}));
   assert.equal(ended.archived,true);
   const saved=good(await api("/bootstrap")).tasks.find(x=>x.id===created);
   assert.ok(saved.userDone[admin.id]&&saved.userDone[other.id]&&saved.archivedAt);
   good(await api("/tasks/"+created,"DELETE"));
 }finally{
   token=adminToken;
   good(await api("/admin/users/"+other.id,"PATCH",{role:"usuario",notificationEnabled:false}));
 }
});
await test("comissão e pessoa podem concluir independentemente na mesma demanda",async()=>{
 const admin=good(await api("/auth/me")).user;
 const created=good(await api("/tasks","POST",{
   title:"Teste comissão e pessoa",commissionIds:[a],assigneeIds:[admin.id],
   deadlines:[{id:"prazoMisto",label:"Prazo",dueAt}]
 }),201).id;
 const first=good(await api("/tasks/"+created+"/finish","PATCH",{commissionId:a}));
 assert.equal(first.archived,false);
 const interim=good(await api("/bootstrap")).tasks.find(x=>x.id===created);
 assert.ok(interim.commissionDone[a]);
 assert.ok(!interim.userDone[admin.id]);
 const last=good(await api("/tasks/"+created+"/finish","PATCH",{}));
 assert.equal(last.archived,true);
 good(await api("/tasks/"+created,"DELETE"));
});
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
 assert.ok(src.includes('Vagas ainda não definidas'));
 assert.ok(src.includes('commission-dialog-confirm'));
 assert.ok(!src.includes('window.confirm(action==="join-commission"'));
 assert.ok(!src.includes('(cmax&&members>=cmax?"disabled":"")'));
 assert.ok(css.includes('.commission-dialog-shade{'));
 assert.ok(css.includes('backdrop-filter:blur('));
});
await test("login opcional persiste somente token e recuperação abre popup legível",async()=>{
 const {readFileSync}=await import("node:fs");
 const src=readFileSync("app-live.js","utf8"),index=readFileSync("index.html","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(src.includes('name="rememberMe"'));
 assert.ok(src.includes('function saveSessionToken(key,value,remember)'));
 assert.ok(src.includes('(remember?localStorage:sessionStorage).setItem(key,value)'));
 assert.ok(src.includes('function forgetSessionToken(key)'));
 assert.ok(src.includes('const r=await request("/auth/forgot","POST",userFields(form))'));
 assert.ok(src.includes('showAuthMessage("Solicitação recebida"'));
 assert.ok(src.includes('showAuthMessage("Não foi possível solicitar o link"'));
 assert.ok(src.includes('data-do="auth-message-close"'));
 assert.ok(index.includes('id="auth-message-dialog"'));
 assert.ok(css.includes('.auth-message-shade{'));
 assert.ok(css.includes('backdrop-filter:blur('));
});
await test("responsáveis humanos não se confundem com nome da comissão",async()=>{
 const {readFileSync}=await import("node:fs");
 const js=readFileSync("app-live.js","utf8");
 assert.ok(js.includes('const who=t=>(t.assigneeIds||[]).map(nameFor).filter(Boolean).join(", ")||"Não definido"'));
 assert.ok(!js.includes('||selectedCommitteeNames(t)||"A definir"'));
 assert.ok(js.includes('"Comissão: ":"Comissões: "'));
 assert.ok(js.includes('assigned.join(", ")||"Não definido"'));
 assert.ok(js.includes('inheritedAssigneeLabel()'));
 assert.ok(js.includes('syncStageAssigneePlaceholder()'));
 assert.ok(js.includes('function inheritedAssigneeLabel(){return "Não definido"}'));
 assert.ok(!js.includes('defaultTutor=owners[0]'));
 assert.ok(!js.includes('person.value=data.users.find(x=>x.role==="tutor")'));
});
await test("seção SISTEMA e Administração somente Admin e Tutor sem piscar no F5",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync("index.html","utf8"),src=readFileSync("app-live.js","utf8");
 assert.match(index,/<p class="nav-caption separated" id="admin-nav-caption" hidden>SISTEMA<\/p>/);
 assert.match(index,/<nav class="nav-group" id="admin-nav-group" aria-label="Administração" hidden>/);
 assert.match(index,/<button class="nav-link" id="admin-link" type="button" hidden>/);
 assert.ok(src.includes('const adminVisible=adminRole(regularMe);'));
 assert.ok(src.includes('if(adminCaption)adminCaption.hidden=!adminVisible'));
 assert.ok(src.includes('if(adminGroup)adminGroup.hidden=!adminVisible'));
});
await test("roteamento por comissão, pessoas e todos; somente conclusão como status visível",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),worker=readFileSync("worker/src/index.js","utf8");
 const migration=readFileSync("worker/migrations/0004_user_done.sql","utf8");
 assert.ok(migration.includes("ALTER TABLE tasks ADD COLUMN user_done"));
 assert.ok(ui.includes('isTaskAssignedToMe(t)&&!isUserDone(t,me.id)'));
 assert.ok(ui.includes('data-do="finish-personal"'));
 assert.ok(ui.includes('canCompleteCommission(cid)'));
 assert.ok(ui.includes('const taskProgress='));
 assert.ok(ui.includes('state.assignmentScope==="todos"?data.users.filter'));
 assert.ok(ui.includes('commissions=state.assignmentScope==="todos"?[]'));
 assert.ok(!ui.includes('data-do="save-status"'));
 assert.ok(!ui.includes('data-do="choose-status"'));
 assert.ok(!ui.includes('["pendentes","Pendentes"]'));
 assert.ok(!ui.includes('["aprovadas","Aprovadas"]'));
 assert.ok(worker.includes('if(!assigneeIds.includes(user.id))'));
 assert.ok(worker.includes('if(!member)fail('));
 assert.ok(worker.includes('const finished=commissionIds.every('));
});
await test("Meu perfil fica em PESSOAL e a saída e identificação são legíveis",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync("index.html","utf8"),ui=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
 const personal=index.indexOf('PESSOAL'),profile=index.indexOf('data-route="conta"'),system=index.indexOf('id="admin-nav-caption"');
 assert.ok(personal>=0&&profile>personal&&profile<system,"Meu perfil pertence ao menu PESSOAL");
 assert.ok(index.includes('<span>Meu perfil</span>'));
 assert.ok(index.includes('href="#/conta" hidden'));
 assert.ok(ui.includes('if(el.dataset.route==="conta")el.hidden=!Boolean(regularMe)'),"Somente uma conta conectada vê Meu perfil");
 assert.ok(ui.includes('header("Pessoal","Meu perfil"'));
 assert.ok(ui.includes('class="button ghost account-logout-button"'));
 assert.ok(css.includes('.account-profile .account-logout-button{'));
 assert.ok(css.includes('min-height:51px'));
 assert.ok(css.includes('.topbar .today-label{font-size:15px'));
 assert.ok(css.includes('.topbar .profile-button .account-identification strong{font-size:14px'));
});
await test("edição de demanda apresenta Anotações sem alterar descrição de comissão",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8");
 assert.ok(ui.includes('<label>Anotações<textarea rows="3" name="description"'),"Anotações deve aparecer tanto no cadastro quanto na edição da demanda.");
 assert.ok(ui.includes('name="description"'),"Preserva campo e dados gravados.");
 assert.ok(ui.includes('<label>Descrição (opcional)<textarea name="description"'),"Não alterar formulário de comissão.");
});
await test("comissão exibe demanda mesmo fora da semana ou mês selecionado",async()=>{
 const {readFileSync}=await import("node:fs");
 const js=readFileSync("app-live.js","utf8"),worker=readFileSync("worker/src/index.js","utf8");
 assert.ok(js.includes('const all=data.tasks.filter(t=>active(t)&&(t.commissionIds||[]).includes(cid)&&!commissionFinished(t,cid))'));
 assert.ok(js.includes('const inPeriod=all.filter(t=>filtered(t,"mensal")'));
 assert.ok(js.includes('const otherDates=all.filter(t=>!inPeriod.includes(t))'));
 assert.ok(js.includes('otherDates.map(t=>taskCard(t,cid))'));
 assert.ok(js.includes('state.assignmentScope=cid||t?.commissionIds?.length'));
 assert.ok(js.includes('(t?"Anotações":"Descrição (opcional)")'),"Preservar o rótulo Anotações na edição.");
 assert.ok(worker.includes('JSON.stringify(t.commissionIds)'),"A API deve guardar a comissão vinculada.");
});
await test("novo card grande compartilhado nas três áreas mostra foto da comissão",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(ui.includes('class="placeholder-row task-list-row demand-activity-card"'));
 assert.ok(ui.includes('const ids=t.commissionIds||[],selected=committee(commissionId)||ids.map(committee).find(Boolean)'));
 assert.ok(ui.includes("selected?.imageData"));
 assert.ok(ui.includes("commissionDefaultArt(selected.name)"),"Sem foto usa arte padrão da comissão.");
 assert.ok(ui.includes('class="demand-activity-photo"'));
 assert.ok(ui.includes('class="activity-details-link demand-activity-action"'));
 assert.ok(ui.includes('Data</span>'));
 assert.ok(ui.includes('Responsáveis</span>'));
 assert.ok(ui.includes('const progress=taskProgress(t)'));
 assert.ok(ui.includes('next.map(t=>taskCard(t))'),"Visão geral usa mesmo card.");
 assert.ok(ui.includes('inPeriod.map(t=>taskCard(t,cid))'),"Comissão usa mesmo card.");
 assert.ok(ui.includes('otherDates.map(t=>taskCard(t,cid))'),"Comissão mantém tarefas fora do período.");
 assert.ok(ui.includes('list.map(t=>'));
 assert.ok(css.includes('#screen .demand-activity-card{'));
 assert.ok(css.includes('#screen .dashboard-grid .demand-activity-card{'));
 assert.ok(css.includes('@media(max-width:560px)'));
});
await test("formulário explica responsáveis e prazos e etapa sem pessoa indica Não definido",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),styles=readFileSync("live.css","utf8");
 assert.ok(ui.includes("Responsáveis pela demanda"));
 assert.ok(ui.includes("Escolha quem ficará responsável por realizar esta atividade"));
 assert.ok(ui.includes("Defina até quando os(as) PETianos(as) deverão concluir cada etapa"));
 assert.ok(ui.includes("function inheritedAssigneeLabel(){return \"Não definido\"}"));
 assert.ok(ui.includes('||"Não definido")'));
 assert.ok(styles.includes(".task-form-help{"));
});
await test("avisos e confirmações usam popup central sem caixas nativas",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),page=readFileSync("index.html","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(ui.includes("function showNotice("));
 assert.ok(ui.includes("function setToast(message,kind="));
 assert.ok(ui.includes("const askConfirm="));
 assert.ok(ui.includes('document.addEventListener("invalid",e=>'));
 assert.ok(ui.includes('showNotice(invalidFieldMessage(field)'));
 assert.ok(ui.includes('if(action==="notice-confirm")'));
 assert.ok(ui.includes('if(action==="notice-copy")'));
 assert.ok(!ui.includes("window.confirm("));
 assert.ok(!ui.includes("window.prompt("));
 assert.ok(page.includes('id="notice-dialog"'));
 assert.ok(css.includes(".notice-dialog-shade{"));
 assert.ok(css.includes("backdrop-filter:blur(8px)"));
});
console.log(tests+" testes passaram no banco local isolado");
