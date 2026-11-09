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
await test("login",async()=>{const r=good(await api("/auth/login","POST",{email:process.env.TEST_ADMIN_EMAIL,password:process.env.TEST_ADMIN_PASSWORD}));token=r.token;assert.equal(r.user.role,"admin")});
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
await test("criar comissões",async()=>{good(await api("/commissions","POST",{name:"Teste Comissão A"}));good(await api("/commissions","POST",{name:"Teste Comissão B"}));const c=good(await api("/bootstrap")).committees;a=c.find(x=>x.name==="Teste Comissão A").id;b=c.find(x=>x.name==="Teste Comissão B").id});
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
await test("logout",async()=>{good(await api("/auth/logout","POST"));assert.equal((await api("/auth/me")).status,401)});
console.log(tests+" testes passaram no banco local isolado");
