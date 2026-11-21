import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const src=await readFile(new URL("../worker/src/notification-center.js",import.meta.url),"utf8");
const api=await import("data:text/javascript,"+encodeURIComponent(src));
const kinds=["create","review","due_soon","overdue","event_soon","event_today"];
const stored=new Map(),legacyAndroid={new_demands:0,deadlines:1,overdue:0},legacyPC={new_demands:1,deadlines:0,overdue:1};
const people=[{id:"a",email:"a@pet.test",role:"petiano",role_override:null},
 {id:"b",email:"b@pet.test",role:"tutor",role_override:null},
 {id:"v",email:"v@pet.test",role:"petiano",role_override:"usuario"}];
const model={create:{title:"Nova: {demanda}",body:"{autor} registrou {demanda}"}};
let statements=[];
const make=(sql,args=[])=>({
 bind(...values){return make(sql,values)},
 async first(){
  if(sql.includes("FROM push_preferences"))return legacyAndroid;
  if(sql.includes("FROM web_push_preferences"))return legacyPC;
  if(sql.includes("key='notificationPushTemplates'"))return {value:JSON.stringify(model)};
  throw Error("Consulta first inesperada: "+sql);
 },
 async all(){
  if(sql.includes("FROM notification_preferences")&&!sql.includes("JOIN"))return {results:kinds.map(k=>stored.get(args[0]+"|"+k)).filter(Boolean)};
  if(sql.includes("FROM users u")){
   const kind=args[0];return {results:people.filter(p=>args.slice(1).includes(p.id)).map(p=>{
    const row=stored.get(p.id+"|"+kind);
    return {...p,email_enabled:row?.email_enabled??null,android_enabled:row?.android_enabled??null,
     pc_enabled:row?.pc_enabled??null,legacy_android:legacyAndroid[kind==="create"||kind==="review"?"new_demands":kind==="overdue"?"overdue":"deadlines"],
     legacy_pc:legacyPC[kind==="create"||kind==="review"?"new_demands":kind==="overdue"?"overdue":"deadlines"]};
   })};
  }
  throw Error("Consulta all inesperada: "+sql);
 },
 async run(){
  if(sql.startsWith("INSERT INTO notification_preferences")){
   stored.set(args[0]+"|"+args[1],{kind:args[1],email_enabled:args[2],android_enabled:args[3],pc_enabled:args[4]});
  }else throw Error("UPDATE inesperado: "+sql);
  return {meta:{changes:1}};
 }
});
const db={prepare(sql){return make(sql)},async batch(ops){statements=ops;return Promise.all(ops.map(s=>s.run()))}};
// Mesma regra de disparo do e-mail: apenas tutor ou Admin com confirmação.
for(const role of ["petiano","usuario"]){
 for(const kind of ["create","review"]){
  assert.deepEqual(api.noticeSendPolicy({role,notification_enabled:true},kind,true),
   {email:false,push:false},"PETiano(a) não dispara avisos ao criar ou revisar");
 }
 assert.deepEqual(api.noticeSendPolicy({role,notification_enabled:false},"create",true),
   {email:false,push:false},"PETiano não dispara mesmo marcando notify explicitamente");
}
for(const role of ["tutor","admin"]){
 assert.deepEqual(api.noticeSendPolicy({role,notification_enabled:true},"create",true),
  {email:true,push:true},"Tutor/Admin dispara ambos os canais ao confirmar");
 assert.deepEqual(api.noticeSendPolicy({role,notification_enabled:true},"create",false),
  {email:false,push:false},"Recusar aviso bloqueia ambos os canais");
 assert.deepEqual(api.noticeSendPolicy({role,notification_enabled:false},"create",true),
  {email:true,push:true},"Confirmar envio funciona mesmo se checkbox legado do remetente estava desativado");
 assert.deepEqual(api.noticeSendPolicy({role,notification_enabled:false},"create",false),
  {email:false,push:false},"Salvar sem enviar nunca dispara notificações");
}
const audienceDb={prepare(sql){
 assert.ok(sql.includes("FROM commission_members"),"Busca integrantes das comissões selecionadas");
 return {bind(id){return {async all(){return {results:id==="videos"?
  [{user_id:"a"},{user_id:"b"}]:[{user_id:"b"}]}}}}};
}};
const audience=await api.noticeAudience(audienceDb,
 {assigneeIds:["a"],commissionIds:["videos","textos"]});
assert.deepEqual(audience,["a","b"],"Autor que faz parte da comissão também recebe; não duplica");
const defaults=await api.preferencesForUser(db,"a");
assert.equal(Object.keys(defaults).length,6);
assert.deepEqual(defaults.create,{email:false,android:false,pc:false},"Sem escolha explícita, todos os canais começam desligados");
assert.deepEqual(defaults.event_today,{email:false,android:false,pc:false},"Evento também depende de consentimento");
const choices=Object.fromEntries(kinds.map(kind=>[kind,{email:true,android:true,pc:true}]));
choices.create={email:false,android:true,pc:false};
choices.event_today={email:false,android:false,pc:false};
await api.saveNotificationPreferences(db,{id:"a"},choices);
assert.equal(statements.length,6,"Salvar tudo grava os seis tipos juntos");
assert.deepEqual(await api.preferencesForUser(db,"a"),choices);
const unsaved=await api.notificationRecipients(db,["b","v"],"create");
assert.equal(unsaved.email.length+unsaved.android.length+unsaved.pc.length,0,"Pessoa sem preferências salvas não recebe avisos");
await api.saveNotificationPreferences(db,{id:"b"},Object.fromEntries(kinds.map(kind=>[kind,{email:true,android:false,pc:true}])));
// Regressão: a pessoa que cria a demanda e também participa da comissão é destinatária.
const commissionDb={prepare(sql){
 assert.match(sql,/FROM commission_members WHERE commission_id=/);
 return {bind(id){return {async all(){
  return {results:id==="videos"?[{user_id:"a"},{user_id:"b"}]:[]};
 }}}};
}};
const commissionAudience=await api.noticeAudience(commissionDb,{
 assigneeIds:[],commissionIds:["videos"]
});
assert.deepEqual(commissionAudience,["a","b"],"Comissão inclui a própria pessoa que criou a demanda");
const mixedAudience=await api.noticeAudience(commissionDb,{
 assigneeIds:["a"],commissionIds:["videos"]
});
assert.deepEqual(mixedAudience,["a","b"],"Uma pessoa vinculada duas vezes recebe um único aviso");
assert.deepEqual(api.noticeSendPolicy({id:"a",role:"petiano",notification_enabled:0},"create",false),
 {email:false,push:false},"PETiano não dispara e-mail nem push ao criar demanda");
assert.deepEqual(api.noticeSendPolicy({id:"a",role:"tutor",notification_enabled:1},"create",true),
 {email:true,push:true},"Tutor que escolhe enviar avisa por ambos os canais");
assert.deepEqual(api.noticeSendPolicy({id:"a",role:"tutor",notification_enabled:1},"create",false),
 {email:false,push:false},"Tutor que recusa o envio não dispara nenhum aviso");
assert.deepEqual(api.noticeSendPolicy({id:"a",role:"petiano",notification_enabled:0},"review",false),
 {email:false,push:false},"Atualização sem solicitação não dispara revisão");
const memberTargets=await api.notificationRecipients(db,commissionAudience,"create");
assert.deepEqual(memberTargets.android.map(x=>x.id),["a"],"Criador da comissão com Celular ativado recebe push Android");
assert.deepEqual(memberTargets.email.map(x=>x.id),["b"],"Criador com e-mail desligado não é incluído contra sua escolha");
await api.saveNotificationPreferences(db,{id:"a"},{...choices,create:{email:true,android:true,pc:true}});
const selfTargets=await api.notificationRecipients(db,commissionAudience,"create");
assert.deepEqual(selfTargets.email.map(x=>x.id),["a","b"],"Autor responsável e outros membros que optaram por e-mail devem receber");
assert.deepEqual(selfTargets.android.map(x=>x.id),["a"],"Autor pode receber Android independente do e-mail");
await api.saveNotificationPreferences(db,{id:"a"},choices);
assert.deepEqual(memberTargets.pc.map(x=>x.id),["b"],"Outros membros recebem PC quando ativado");

const targets=await api.notificationRecipients(db,["a","b","v"],"create");
assert.deepEqual(targets.email.map(x=>x.id),["b"],"Pessoa com e-mail desativado não o recebe");
assert.deepEqual(targets.android.map(x=>x.id),["a"],"Android segue habilitado apesar do e-mail off");
assert.deepEqual(targets.pc.map(x=>x.id),["b"],"PC segue ativado apesar do e-mail off");
const none=await api.notificationRecipients(db,["a"],"event_today");
assert.equal(none.email.length+none.android.length+none.pc.length,0,"Nenhum = nenhum aviso");
const push=await api.notificationPushModel(db,"create",{demanda:"Relatório",autor:"Ana"});
assert.deepEqual(push,{title:"Nova: Relatório",body:"Ana registrou Relatório"});
await assert.rejects(api.saveNotificationPreferences(db,{id:"a"},{create:choices.create}),/seis notificações/);
console.log("Notificações: seis tipos, um único salvamento, canais independentes, opt-out e modelos push OK.");
const personalSource=(await readFile(new URL("../worker/src/personal-reminders.js",import.meta.url),"utf8"))
 .replace('import {pushWithoutMinuteDuplicates} from "./push-collision.js";','const pushWithoutMinuteDuplicates=async()=>({android:0,pc:0,skipped:{android:0,pc:0}});');
const personal=await import("data:text/javascript,"+encodeURIComponent(personalSource));
let executed=[];
const task={id:"mine",title:"Minha entrega",archived_at:null,assignee_ids:'["a"]',commission_ids:"[]",user_done:"{}",commission_done:"{}",assignment_scope:"usuarios"};
const personalDb={prepare(sql){
 return {bind(...args){
  return {
   async first(){
    if(sql.startsWith("SELECT COUNT(*)"))return {n:0};
    if(sql.startsWith("SELECT id,title,archived_at"))return args[0]==="mine"?task:null;
    if(sql.startsWith("SELECT 1 AS yes FROM task_tutor_reviews"))return null;
    if(sql.startsWith("SELECT role,role_override"))return {role:"petiano",role_override:null};
    throw Error("first inesperado: "+sql);
   },
   async all(){if(sql.includes("FROM commission_members"))return {results:[]};throw Error("all inesperado: "+sql)},
   async run(){executed.push({sql,args});return {meta:{changes:1}}}
  };
 },async first(){throw Error("first sem bind: "+sql)}};
},async batch(commands){return Promise.all(commands.map(s=>s.run()))}};
const user={id:"a"};
const localTime=new Date(Date.now()+2*3600000-3*3600000).toISOString().slice(0,16);
const once={taskId:null,title:"Tomar água",message:"",channels:{email:false,android:true,pc:false},autoDelete:true,recurrence:"once",schedules:[{at:localTime}]};
assert.ok((await personal.savePersonalReminder(personalDb,user,once)).ok);
assert.ok(executed.some(x=>x.sql.startsWith("INSERT INTO personal_reminders")&&x.args[2]===null),"Personalizado não exige demanda");
assert.ok(executed.some(x=>x.sql.startsWith("INSERT INTO personal_reminders")&&JSON.parse(x.args[6]).email===false),"Alarme pessoal nunca salva e-mail ligado");
executed=[];
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,taskId:"mine",title:"Minha entrega"})).ok);
assert.ok(executed.some(x=>x.sql.startsWith("INSERT INTO personal_reminders")&&x.args[2]==="mine"),"Lembrete vinculado apenas à própria pendência");
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,taskId:"other"}),/sua pendência/);
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,schedules:[{at:localTime},{at:localTime}]}),/duas vezes/);
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,channels:{email:false,android:false,pc:false}}),/celular ou o PC/);
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,channels:{email:true,android:false,pc:false}}),/celular ou o PC/);
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,channels:{email:true,android:true,pc:false}})).ok,"Uma escolha antiga de email é ignorada e não enviada");
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,recurrence:"daily",schedules:[{time:"09:00"},{time:"18:00"}]})).ok);
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,recurrence:"weekly",schedules:[{time:"08:30",weekday:2}]})).ok);
console.log("Lembretes: personalizado, demandas próprias, vários horários, repetição e validações OK.");

const collisionSource=(await readFile(new URL("../worker/src/push-collision.js",import.meta.url),"utf8"))
 .replace('import {pushNotificationToChannels} from "./push.js";','const pushNotificationToChannels=async (...args)=>globalThis.__testSendPush(...args);');
const collision=await import("data:text/javascript,"+encodeURIComponent(collisionSource));
const sentLog=new Set(),pushCalls=[];
let pushAccepted=true;
const collisionDb={prepare(sql){
 return {bind(...args){return {async run(){
  const key=args.slice(0,4).join("|");
  if(sql.includes("INSERT OR IGNORE INTO push_delivery_minute_log")){
   if(sentLog.has(key))return {meta:{changes:0}};
   sentLog.add(key);return {meta:{changes:1}};
  }
  if(sql.includes("DELETE FROM push_delivery_minute_log")){
   return {meta:{changes:Number(sentLog.delete(key))}};
  }
  throw Error("Consulta de colisão inesperada: "+sql);
 }}}};
}};
globalThis.__testSendPush=async (env,targets,message,key)=>{
 pushCalls.push({targets,message,key});
 return {android:pushAccepted?targets.android.length:0,pc:pushAccepted?targets.pc.length:0};
};
const collisionEnv={DB:collisionDb};
const notice={taskId:"mine",kind:"personal",title:"Aviso",body:"Entrega",route:"/atividade/mine"};
const minute=Date.parse("2026-11-21T09:00:00Z");
const first=await collision.pushWithoutMinuteDuplicates(collisionEnv,{android:["a"],pc:[]} ,notice,"personal-1",minute);
assert.equal(first.android,1);
const duplicate=await collision.pushWithoutMinuteDuplicates(collisionEnv,{android:["a"],pc:[]} ,{...notice,kind:"due_soon"},"system-1",minute+20000);
assert.equal(duplicate.android,0);
assert.equal(duplicate.skipped.android,1,"Automático não repete alarme pessoal no mesmo minuto");
assert.equal(pushCalls.length,1,"Um único envio Android é feito");
const otherTime=await collision.pushWithoutMinuteDuplicates(collisionEnv,{android:["a"],pc:[]} ,notice,"personal-2",minute+60000);
assert.equal(otherTime.android,1,"Horário diferente deve notificar novamente");
const otherChannel=await collision.pushWithoutMinuteDuplicates(collisionEnv,{android:[],pc:["a"]},notice,"personal-pc",minute);
assert.equal(otherChannel.pc,1,"PC é canal independente do Android");
pushAccepted=false;
const failure=await collision.pushWithoutMinuteDuplicates(collisionEnv,{android:["a"],pc:[]},notice,"personal-failed",minute+120000);
assert.equal(failure.android,0);
pushAccepted=true;
const retry=await collision.pushWithoutMinuteDuplicates(collisionEnv,{android:["a"],pc:[]},notice,"personal-retry",minute+120000);
assert.equal(retry.android,1,"Sem aceitação, a chave do minuto é liberada para retentativa");
console.log("Deduplicação: mesmo minuto/canal só uma notificação, horários diferentes independentes, falhas recuperáveis OK.");
