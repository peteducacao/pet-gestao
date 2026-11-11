import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

// Banco D1 100% local do workflow; nunca apontar para a produção.
const root="http://127.0.0.1:8787/api/v1";
let token="";
async function api(path,method="GET",payload){
 const res=await fetch(root+path,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
  body:payload===undefined?undefined:JSON.stringify(payload)});
 const json=await res.json();
 assert.ok(res.ok,method+" "+path+" -> "+res.status+" "+JSON.stringify(json));
 return json;
}
const sqlValue=value=>"'"+String(value).replaceAll("'","''")+"'";
function query(sql){
 execFileSync("wrangler",["d1","execute","pet-gestao-db","--local","--config","test-wrangler.json","--command",sql],
  {encoding:"utf8",stdio:["ignore","pipe","pipe"]});
}
const admin=await api("/auth/login","POST",{email:process.env.TEST_ADMIN_EMAIL,password:process.env.TEST_ADMIN_PASSWORD});
token=admin.token;
const bootstrap=await api("/bootstrap");
const commission=bootstrap.committees[0];
assert.ok(commission,"Banco local precisa ter uma comissão");
const future=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10)+"T17:00:00";
const dueA=future(10),dueB=future(18);
const baseTask=deadline=>({title:"Verificação local de e-mails obsoletos",description:"Teste sem entrega externa",
 assignmentScope:"comissoes",assigneeIds:[],commissionIds:[commission.id],notify:false,
 deadlines:[{id:"prazo-teste-email",label:"Prazo",dueAt:deadline,assigneeIds:[]}]});
const taskId=(await api("/tasks","POST",baseTask(dueA))).id;
const ids=[];
function insert(kind,stageDue=null){
 const id="email-regressao-"+crypto.randomUUID();
 const columns="id,creator_id,kind,recipient_emails,subject,body,scheduled_at,status,created_at,task_id";
 const values=[id,null,kind,JSON.stringify(["destinatario@example.org"]),"Aviso de teste","Mensagem isolada",
  "2099-01-01T00:00:00.000Z","pendente",new Date().toISOString(),taskId];
 query("INSERT INTO email_queue("+columns+") VALUES("+values.map(v=>v===null?"NULL":sqlValue(v)).join(",")+")");
 if(stageDue){
  const logValues=["log-regressao-"+crypto.randomUUID(),taskId,"prazo-teste-email",kind,stageDue,id,new Date().toISOString()];
  query("INSERT INTO deadline_notice_log(dedupe_key,task_id,stage_id,notice_kind,stage_due_at,queue_id,created_at) VALUES("+
    logValues.map(sqlValue).join(",")+")");
 }
 ids.push(id);
 return id;
}
const lookup=async id=>(await api("/mail")).items.find(x=>x.id===id);
try{
 const staleReminder=insert("due_soon",dueA);
 const staleCreate=insert("automatica");
 await api("/tasks/"+encodeURIComponent(taskId),"PUT",baseTask(dueB));
 assert.equal((await lookup(staleReminder)).status,"cancelado","Prazo alterado cancela lembrete na fila");
 assert.equal((await lookup(staleCreate)).status,"cancelado","Edição cancela aviso automático antigo");
 const toDelete=insert("automatica");
 await api("/tasks/"+encodeURIComponent(taskId),"DELETE");
 assert.equal((await lookup(toDelete)).status,"cancelado","Excluir demanda cancela mensagem em fila");
 console.log("PASS fila local: prazo adiado, demanda editada e excluída não deixam e-mails pendentes");
}finally{
 const tasks=(await api("/bootstrap")).tasks;
 if(tasks.some(x=>x.id===taskId))await api("/tasks/"+encodeURIComponent(taskId),"DELETE");
 for(const id of ids)query("DELETE FROM email_queue WHERE id="+sqlValue(id));
 query("DELETE FROM deadline_notice_log WHERE task_id="+sqlValue(taskId));
}
