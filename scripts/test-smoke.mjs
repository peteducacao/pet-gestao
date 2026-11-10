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
await test("Admin não acessa pela sessão comum",async()=>{
 const r=await api("/auth/login","POST",{email:process.env.TEST_ADMIN_EMAIL,password:process.env.TEST_ADMIN_PASSWORD,role:"admin",adminScope:true});
 assert.equal(r.status,403);
});
await test("sessões do Admin têm escopo exclusivo e validade configurada",async()=>{
 const password=process.env.TEST_ADMIN_PASSWORD;
 const regular=good(await api("/auth/admin-login","POST",{identifier:"Admin",password,rememberMe:false}));
 const persistent=good(await api("/auth/admin-login","POST",{identifier:"Admin",password,rememberMe:true}));
 const legacy=good(await api("/auth/admin-login","POST",{identifier:"Admin",password}));
 const days=r=>(Date.parse(r.expiresAt)-Date.now())/86400000;
 assert.ok(days(regular)>6.95&&days(regular)<7.02,"Sessão Admin comum: 7 dias");
 assert.ok(days(legacy)>6.95&&days(legacy)<7.02,"Sessão Admin padrão: 7 dias");
 assert.ok(days(persistent)>29.95&&days(persistent)<30.02,"Admin mantido: 30 dias");
 for(const r of [regular,persistent,legacy])assert.equal(r.user.adminSession,true);
 assert.equal(good(await api("/auth/me")).user.adminSession,true);
});
let a,b,task,meeting;
await test("login administrativo independente",async()=>{
 const bad=await api("/auth/admin-login","POST",{identifier:"Admin",password:"errada"});
 assert.equal(bad.status,401);
 const r=good(await api("/auth/admin-login","POST",{identifier:"Admin",password:process.env.TEST_ADMIN_PASSWORD}));
 assert.equal(r.user.role,"admin");assert.ok(r.token);
});
await test("cadastro começa como Usuário",async()=>{
 good(await api("/auth/register","POST",{name:"Pessoa Teste",email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!",role:"admin",adminSession:true}),201);
 const r=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}));
 assert.equal(r.user.role,"usuario");
 assert.equal(r.user.adminSession,false,"Campos enviados pelo navegador não criam permissão Admin.");
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
await test("ataques simulados: Tutoria não entra no Admin nem modifica credenciais",async()=>{
 const admin=token;
 const id=good(await api("/admin/users")).users.find(u=>u.email==="teste-usuario@pet.local").id;
 good(await api("/admin/users/"+id,"PATCH",{role:"tutor",notificationEnabled:true}));
 try{
  const tutor=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!",role:"admin",adminScope:true}));
  assert.equal(tutor.user.role,"tutor");
  assert.equal(tutor.user.adminSession,false);
  token=tutor.token;
  const me=good(await api("/auth/me"));
  assert.equal(me.user.role,"tutor");
  assert.equal(me.user.adminSession,false);
  const bootstrap=good(await api("/bootstrap"));
  assert.equal(bootstrap.session.user.role,"tutor");
  assert.equal(bootstrap.session.user.adminSession,false);
  const forbidden=[
   ["/admin/users","GET"],
   ["/admin/users/"+id,"PATCH",{role:"admin",adminScope:true}],
   ["/admin/users/"+id+"/temporary-password","POST",{}],
   ["/admin/settings","PUT",{autoWeek:false,autoMonth:false}],
   ["/admin/commission-order","PUT",{ids:[]}],
   ["/mail/status","GET"],
   ["/mail","GET"],
   ["/mail","POST",{all:true,subject:"Ataque",message:"Envio não autorizado"}],
   ["/mail/clear","POST",{}],
   ["/mail/retry","POST",{id:"qualquer"}],
   ["/commissions/videos","DELETE"]
  ];
  for(const [route,method,payload] of forbidden){
    const answer=await api(route,method,payload);
    assert.equal(answer.status,403,"Falha de isolamento "+method+" "+route+": "+JSON.stringify(answer));
  }
  const direct=await api("/auth/admin-login","POST",{identifier:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!",adminScope:true});
  assert.equal(direct.status,401,"Tutor(a) não deve autenticar como Administração");
  // Funções acordadas de Tutoria permanecem habilitadas.
  good(await api("/commissions","POST",{name:"Teste Comissão da Tutoria"}),200);
  const all=good(await api("/bootstrap")).committees;
  const own=all.find(x=>x.name==="Teste Comissão da Tutoria");
  assert.ok(own);
  good(await api("/commissions/"+own.id,"PUT",{name:"Teste Comissão Tutoria Editada",description:"Revisada pela Tutoria"}));
  assert.equal((await api("/commissions/"+own.id,"PUT",{name:"Não autorizado",maxMembers:999})).status,403);
  const taskId=good(await api("/tasks","POST",{title:"Revisão da Tutoria",commissionIds:[own.id],assigneeIds:[],deadlines:[{id:"p-tutor",label:"Prazo",dueAt}]}),201).id;
  good(await api("/tasks/"+taskId+"/notes","PATCH",{captionText:"Orientação da tutoria",notify:false}));
  good(await api("/tasks/"+taskId,"PUT",{title:"Revisão ajustada pela Tutoria",commissionIds:[own.id],assigneeIds:[],deadlines:[{id:"p-tutor",label:"Prazo",dueAt}],notify:false}));
  good(await api("/meetings","POST",{title:"Memória de teste da Tutoria",date:dueAt,rawNotes:"Responsável: (???)"}));
 }finally{
  token=admin;
  const own=good(await api("/bootstrap")).committees.find(x=>x.name==="Teste Comissão Tutoria Editada");
  if(own) {
    // Exclusão de comissão vinculada é bloqueada para qualquer perfil.
    assert.equal((await api("/commissions/"+own.id,"DELETE")).status,400);
  }
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
await test("exibição na Visão geral preserva registros e exige comissão para ocultar",async()=>{
 const deadline={id:"prazo1",label:"Prazo",dueAt};
 const payload={title:"Teste Editado",commissionIds:[a,b],assigneeIds:[],deadlines:[deadline]};
 const before=good(await api("/bootstrap")).tasks.find(x=>x.id===task);
 assert.equal(before.overviewVisible,true,"Demanda antiga deve permanecer pública na Visão geral.");
 good(await api("/tasks/"+task,"PUT",{...payload,overviewVisible:false}));
 const hidden=good(await api("/bootstrap")).tasks.find(x=>x.id===task);
 assert.equal(hidden.overviewVisible,false,"A opção somente comissões deve ser persistida.");
 good(await api("/tasks/"+task,"PUT",{...payload}));
 assert.equal(good(await api("/bootstrap")).tasks.find(x=>x.id===task).overviewVisible,false,"Editar outros campos não altera a opção.");
 good(await api("/tasks/"+task,"PUT",{...payload,overviewVisible:true}));
 assert.equal(good(await api("/bootstrap")).tasks.find(x=>x.id===task).overviewVisible,true,"A Visão geral pode ser reativada.");
 const userId=good(await api("/auth/me")).user.id;
 const forbidden=await api("/tasks","POST",{title:"Visibilidade inválida",commissionIds:[],assigneeIds:[userId],deadlines:[deadline],overviewVisible:false});
 assert.equal(forbidden.status,400,"Somente nas comissões exige comissão vinculada.");
 const invalidType=await api("/tasks/"+task,"PUT",{...payload,overviewVisible:"nao"});
 assert.equal(invalidType.status,400,"O servidor deve validar o formato booleano.");
});
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
await test("ataque simulado: PETiano(a) e Tutor(a) não apagam demandas arquivadas",async()=>{
 const original=token,person=good(await api("/admin/users")).users.find(x=>x.email==="teste-usuario@pet.local");
 try{
  for(const role of ["petiano","tutor"]){
   good(await api("/admin/users/"+person.id,"PATCH",{role,notificationEnabled:false}));
   const login=good(await api("/auth/login","POST",{email:"teste-usuario@pet.local",password:"SenhaPessoaSegura123!"}));
   token=login.token;
   assert.equal((await api("/tasks/"+task,"DELETE")).status,403,"Exclusão liberada a "+role);
   assert.ok(good(await api("/bootstrap")).tasks.some(x=>x.id===task),"Registro arquivado não foi apagado.");
   token=original;
  }
 }finally{
  token=original;
  good(await api("/admin/users/"+person.id,"PATCH",{role:"usuario",notificationEnabled:false}));
 }
});
await test("ataques simulados: injeção SQL e sessão falsa não revelam dados ou tabelas",async()=>{
 const original=token;
 const malicious="'); DROP TABLE users; --";
 const userListBefore=good(await api("/admin/users")).users.length;
 const created=good(await api("/commissions","POST",{name:malicious}),200);
 assert.equal(created.ok,true,"SQL deve entrar como valor, não comando.");
 const live=good(await api("/bootstrap"));
 assert.ok(live.committees.some(x=>x.name===malicious));
 assert.equal(good(await api("/admin/users")).users.length,userListBefore,"A tabela de usuários deve continuar íntegra.");
 const injectedId=encodeURIComponent("' OR 1=1 --");
 assert.equal((await api("/admin/users/"+injectedId,"PATCH",{role:"admin"})).status,404);
 const c=live.committees.find(x=>x.name===malicious);
 good(await api("/commissions/"+c.id,"DELETE"));
 token="x".repeat(50);
 assert.equal((await api("/admin/users")).status,401,"Token falso não autoriza acesso.");
 assert.equal((await api("/bootstrap")).session,null);
 token="";
 const preview=good(await api("/bootstrap"));
 assert.ok(preview.tasks.every(t=>!Object.hasOwn(t,"captionText")&&!Object.hasOwn(t,"assigneeIds")),"Detalhes privados não saem na API pública.");
 assert.deepEqual(preview.history,[],"Histórico privado não deve sair na API pública.");
 token=original;
 const cross=await fetch(base+"/admin/users",{headers:{Origin:"https://site-externo.example",Authorization:"Bearer "+original}});
 assert.equal(cross.status,403,"Origem não permitida");
});
await test("conclusão conjunta de pessoas e comissões ocorre numa operação",async()=>{
  const admin=good(await api("/auth/me")).user;
  const other=good(await api("/admin/users")).users.find(x=>x.email==="teste-usuario@pet.local");
  const created=good(await api("/tasks","POST",{
    title:"Atividade feita em equipe",commissionIds:[a,b],assigneeIds:[admin.id,other.id],
    deadlines:[{id:"joint-prazo",label:"Prazo",dueAt}]
  }),201).id;
  const first=good(await api("/tasks/"+created+"/finish","PATCH",{userIds:[admin.id,other.id],commissionIds:[a]}));
  assert.equal(first.archived,false);
  assert.deepEqual(first.remainingCommissions,[b]);
  const partial=good(await api("/bootstrap")).tasks.find(x=>x.id===created);
  assert.ok(partial.userDone[admin.id]&&partial.userDone[other.id]&&partial.commissionDone[a]);
  const second=good(await api("/tasks/"+created+"/finish","PATCH",{commissionIds:[b]}));
  assert.equal(second.archived,true);
  const final=good(await api("/bootstrap")).tasks.find(x=>x.id===created);
  assert.ok(final.archivedAt);
  good(await api("/tasks/"+created,"DELETE"));
});
await test("modelo editável das notificações fica no Admin",async()=>{
  const subject="PET Gestão — {tipo}",message="<p>📚 {autor} atualizou {demanda}.</p>";
  good(await api("/admin/notification-template","PUT",{subject,message}));
  const state=good(await api("/bootstrap")).settings.notificationTemplate;
  assert.equal(state.subject,subject);
  assert.equal(state.body,message);
});
await test("exclusão definitiva somente pela sessão Admin",async()=>{good(await api("/tasks/"+task,"DELETE"));assert.ok(!good(await api("/bootstrap")).tasks.some(x=>x.id===task))});
await test("conclusão individual só arquiva após a última participação",async()=>{
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
   const r=good(await api("/tasks/"+created+"/finish","PATCH",{early:true}));
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
 const selector=js.match(/const f=collectRich\(form,userFields\(form\)\),ids=([^,]+),userIds=/);
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
 assert.ok(js.includes('const adminRole=u=>Boolean(hasAdminRole(u)&&u.adminSession===true)'));
 assert.ok(js.includes('admin-menu-link'));
 assert.ok(js.includes('href="#/admin/emails"'));
 assert.ok(js.includes('href="#/admin/comissoes"'));
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
 assert.ok(js.includes('href="#/admin/demandas"'));
  assert.ok(js.includes('href="#/admin/reunioes"'));
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
 assert.match(index,/<a class="nav-link" id="admin-link" href="#\/admin" hidden>/);
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
 assert.ok(js.includes('const tag=ids.length?'),"Comissões devem aparecer apenas quando vinculadas.");
 assert.ok(js.includes('names.join(", ")||"Não definido"'));
 assert.ok(js.includes('inheritedAssigneeLabel()'));
 assert.ok(js.includes('syncStageAssigneePlaceholder()'));
 assert.ok(js.includes('function inheritedAssigneeLabel(){return "Não definido"}'));
 assert.ok(!js.includes('defaultTutor=owners[0]'));
 assert.ok(!js.includes('person.value=data.users.find(x=>x.role==="tutor")'));
});
await test("seção SISTEMA e Administração só aparecem na sessão administrativa",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync("index.html","utf8"),src=readFileSync("app-live.js","utf8");
 assert.match(index,/<p class="nav-caption separated" id="admin-nav-caption" hidden>SISTEMA<\/p>/);
 assert.match(index,/<nav class="nav-group" id="admin-nav-group" aria-label="Administração" hidden>/);
 assert.match(index,/<a class="nav-link" id="admin-link" href="#\/admin" hidden>/);
 assert.ok(src.includes('const adminVisible=routeParts().page==="admin"&&isAdmin();'));
 assert.ok(src.includes('if(adminCaption)adminCaption.hidden=!adminVisible'));
 assert.ok(src.includes('if(adminGroup)adminGroup.hidden=!adminVisible'));
});
await test("conclusão conjunta, filtros e seleção independente estão no código",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),worker=readFileSync("worker/src/index.js","utf8");
 assert.ok(ui.includes('state.assignmentScope==="todos"?data.users.filter'));
 assert.ok(ui.includes('state.selectedCommissions'));
 assert.ok(ui.includes('state.selectedUsers'));
 assert.ok(ui.includes('function openFinishDialog(task)'));
 assert.ok(ui.includes('data-do="finish-joint-open"'));
 assert.ok(ui.includes('data-do="finish-joint-confirm"'));
 assert.ok(ui.includes('status-filter-label'));
 assert.ok(ui.includes('taskStatus(t'));
 assert.ok(worker.includes('const selectedCommissions=unique(b.commissionIds),selectedUsers=unique(b.userIds)'));
 assert.ok(worker.includes('const finished=commissionIds.every('));
});

await test("Meu perfil fica em PESSOAL, sem dados repetidos no cabeçalho",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync("index.html","utf8"),ui=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(index.includes('data-route="conta"'));
 assert.ok(index.includes('href="#/conta" hidden'));
 assert.ok(index.includes('id="account-button" href="#/login"'));
 assert.ok(!index.includes('id="today-label"'));
 assert.ok(ui.includes('<strong>Status:</strong>'));
 assert.ok(ui.includes('change-password-toggle'));
 assert.ok(css.includes('.account-profile .account-logout-button{'));
});
await test("revisão e anotações têm editores independentes e texto longo",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(ui.includes('Anotações da comissão'));
 assert.ok(ui.includes('Texto para revisão'));
 assert.ok(ui.includes('richEditor("description"'));
 assert.ok(ui.includes('richEditor("captionText"'));
 assert.ok(ui.includes('function safeRich('));
 assert.ok(css.includes('.saved-activity-text{white-space:pre-wrap'));
 assert.ok(ui.includes('<label>Descrição (opcional)<textarea name="description"'),"Descrição de comissão permanece separada.");
});
await test("comissões mostram só pendências sem filtros redundantes",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8");
 const start=ui.indexOf("function renderCommittee(cid){");
 const end=ui.indexOf("function renderCommitteeEdit(cid){");
 const section=ui.slice(start,end);
 assert.ok(section.includes('Pendências da comissão'));
 assert.ok(section.includes('all.map(t=>taskCard(t,cid))'));
 assert.ok(!section.includes('period()'));
 assert.ok(!section.includes('+ Nova demanda'));
});
await test("cards compactos compartilham cores de status",async()=>{
 const {readFileSync}=await import("node:fs");
 const ui=readFileSync("app-live.js","utf8"),css=readFileSync("live.css","utf8");
 assert.ok(ui.includes('demand-activity-card status-'));
 assert.ok(ui.includes("selected?.imageData"));
 assert.ok(ui.includes("commissionDefaultArt(selected.name)"));
 assert.ok(ui.includes('next.map(t=>taskCard(t))'));
 assert.ok(ui.includes('all.map(t=>taskCard(t,cid))'));
 assert.ok(css.includes('.task-status-atrasada{'));
 assert.ok(css.includes('.task-status-pendente{'));
 assert.ok(css.includes('.task-status-concluida{'));
 assert.ok(css.includes('#screen .dashboard-grid .demand-activity-card{'));
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
