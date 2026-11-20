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
assert.ok(executed.some(x=>x.sql.startsWith("INSERT INTO personal_reminders")&&JSON.parse(x.args[5]).email===false),"Alarme pessoal nunca salva e-mail ligado");
executed=[];
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,taskId:"mine",title:"Minha entrega"})).ok);
assert.ok(executed.some(x=>x.sql.startsWith("INSERT INTO personal_reminders")&&x.args[2]==="mine"),"Lembrete vinculado apenas à própria pendência");
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,taskId:"other"}),/sua pendência/);
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,schedules:[{at:localTime},{at:localTime}]}),/duas vezes/);
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,channels:{email:false,android:false,pc:false}}),/pelo menos um canal/);
await assert.rejects(personal.savePersonalReminder(personalDb,user,{...once,channels:{email:true,android:false,pc:false}}),/celular ou o PC/);
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,channels:{email:true,android:true,pc:false}})).ok,"Uma escolha antiga de email é ignorada e não enviada");
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,recurrence:"daily",schedules:[{time:"09:00"},{time:"18:00"}]})).ok);
assert.ok((await personal.savePersonalReminder(personalDb,user,{...once,recurrence:"weekly",schedules:[{time:"08:30",weekday:2}]})).ok);
console.log("Lembretes: personalizado, demandas próprias, vários horários, repetição e validações OK.");
