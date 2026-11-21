// PET Gestão — alarmes pessoais; somente o titular acessa e programa seus avisos.
// Datas civis calculadas para Sergipe (UTC-3). Reprocessamentos não repetem horários concluídos.
import {pushWithoutMinuteDuplicates} from "./push-collision.js";
const now=()=>new Date().toISOString();
const asJson=(v,f)=>{try{return JSON.parse(v||"")}catch{return f}};
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const DATE=/^\d{4}-\d{2}-\d{2}$/, TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const localDate=()=>new Date(Date.now()-3*3600000).toISOString().slice(0,10);
const localStamp=ms=>new Date(ms-3*3600000).toISOString().slice(0,16);
const asInstant=(date,time)=>{
 if(!DATE.test(date)||!TIME.test(time))return null;
 const n=Date.parse(date+"T"+time+":00-03:00");
 return Number.isFinite(n)&&localStamp(n)===date+"T"+time?new Date(n).toISOString():null;
};
const plusDays=(date,days)=>new Date(Date.parse(date+"T12:00:00Z")+days*86400000).toISOString().slice(0,10);
function nextTime(mode,time,weekday,start=Date.now()){
 const today=localDate();
 for(let days=0;days<9;days++){
  const date=plusDays(today,days),dow=new Date(date+"T12:00:00Z").getUTCDay();
  if(mode==="weekly"&&dow!==weekday)continue;
  const result=asInstant(date,time);
  if(result&&Date.parse(result)>start)return result;
 }
 return null;
}
async function mine(db,taskId,userId){
 const task=await db.prepare("SELECT id,title,archived_at,assignee_ids,commission_ids,user_done,commission_done,assignment_scope FROM tasks WHERE id=?").bind(taskId).first();
 if(!task||task.archived_at)return null;
 const personal=asJson(task.assignee_ids,[]).includes(userId)&&!asJson(task.user_done,{})[userId];
 const commissionIds=asJson(task.commission_ids,[]);
 let commission=false;
 if(commissionIds.length){
  const members=(await db.prepare("SELECT commission_id FROM commission_members WHERE user_id=?").bind(userId).all()).results;
  commission=members.some(m=>commissionIds.includes(m.commission_id)&&!asJson(task.commission_done,{})[m.commission_id]);
 }
 if(!personal&&!commission)return null;
 const reviewed=await db.prepare("SELECT 1 AS yes FROM task_tutor_reviews WHERE task_id=? AND user_id=?").bind(taskId,userId).first();
 const role=await db.prepare("SELECT role,role_override FROM users WHERE id=?").bind(userId).first();
 if((role?.role_override||role?.role)==="tutor"&&reviewed)return null;
 return task;
}
export async function prunePersonalReminders(db,taskId=null){
 const query=taskId?"SELECT id,task_id,user_id FROM personal_reminders WHERE task_id=?":"SELECT id,task_id,user_id FROM personal_reminders WHERE task_id IS NOT NULL LIMIT 1000";
 const rows=(await (taskId?db.prepare(query).bind(taskId):db.prepare(query)).all()).results;
 for(const r of rows){
  if(!await mine(db,r.task_id,r.user_id))await db.prepare("DELETE FROM personal_reminders WHERE id=?").bind(r.id).run();
 }
}
export async function listPersonalReminders(db,user){
 await prunePersonalReminders(db);
 const rows=(await db.prepare("SELECT id,task_id,schedule_entry_id,title,message,channels,auto_delete,recurrence,repeat_until,created_at FROM personal_reminders WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all()).results;
 const reminders=[];
 for(const r of rows){
  const slots=(await db.prepare("SELECT id,time_local,weekday,next_at,status,notified_at FROM personal_reminder_times WHERE reminder_id=? ORDER BY next_at,time_local").bind(r.id).all()).results;
  reminders.push({id:r.id,taskId:r.task_id,scheduleEntryId:r.schedule_entry_id,title:r.title,message:r.message,channels:asJson(r.channels,{}),autoDelete:!!r.auto_delete,recurrence:r.recurrence,repeatUntil:r.repeat_until,schedules:slots.map(x=>({id:x.id,at:x.time_local,weekday:x.weekday,nextAt:x.next_at,status:x.status,notifiedAt:x.notified_at}))});
 }
 return {items:reminders};
}
export async function savePersonalReminder(db,user,input,id=null){
 if(!input||typeof input!=="object")fail("Lembrete inválido.");
 const current=id?await db.prepare("SELECT id,schedule_entry_id FROM personal_reminders WHERE id=? AND user_id=?").bind(id,user.id).first():null;
 if(id&&!current)fail("Lembrete não encontrado.",404);
 const count=await db.prepare("SELECT COUNT(*) AS n FROM personal_reminders WHERE user_id=?").bind(user.id).first();
 if(!id&&count.n>=60)fail("Limite de 60 lembretes pessoais atingido.");
 const taskId=input.taskId===null||input.taskId===""?null:String(input.taskId||"");
 const scheduleEntryId=input.scheduleEntryId?String(input.scheduleEntryId):current?.schedule_entry_id||null;
 let schedule=null;
 if(scheduleEntryId){
  if(taskId)fail("Selecione uma atividade ou uma demanda, não ambas.");
  schedule=await db.prepare("SELECT id,title FROM schedule_entries WHERE id=?").bind(scheduleEntryId).first();
  if(!schedule)fail("Atividade do cronograma não encontrada.",404);
 }

 let task=null;
 if(taskId){task=await mine(db,taskId,user.id);if(!task)fail("Selecione uma demanda que ainda seja sua pendência.",403);}
 const title=String(schedule?.title||input.title||task?.title||"").trim().slice(0,120);
 if(!title)fail("Informe o título do lembrete pessoal.");
 const message=String(input.message||"").trim().slice(0,200);
 const requestedChannels=input.channels;
 if(!requestedChannels||typeof requestedChannels!=="object"||["android","pc"].some(k=>typeof requestedChannels[k]!=="boolean"))
  fail("Escolha celular e/ou PC para o lembrete.");
 // E-mail não é um canal disponível nos alarmes pessoais, mesmo em registros antigos.
 const channels={email:false,android:requestedChannels.android,pc:requestedChannels.pc};
 if(!channels.android&&!channels.pc)fail("Ative o celular ou o PC para receber o lembrete.");
 if(typeof input.autoDelete!=="boolean")fail("Escolha se deseja excluir o lembrete após notificar.");
 const autoDelete=scheduleEntryId?true:input.autoDelete;
 const recurrence=String(input.recurrence||"once");
 if(!["once","daily","weekly"].includes(recurrence))fail("Repetição inválida.");
 const repeatUntil=input.repeatUntil?String(input.repeatUntil):null;
 if(repeatUntil&&(!DATE.test(repeatUntil)||repeatUntil<localDate()))fail("Data final da repetição inválida.");
 const schedules=input.schedules;
 if(!Array.isArray(schedules)||!schedules.length||schedules.length>20)fail("Informe de 1 a 20 horários.");
 const slots=[],keys=new Set();
 for(const item of schedules){
  let time,weekday=null,due,display;
  if(recurrence==="once"){
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item?.at||""))fail("Data e horário inválidos.");
   const date=item.at.slice(0,10);time=item.at.slice(11);
   due=asInstant(date,time);
   if(!due||Date.parse(due)<=Date.now())fail("Escolha horários futuros para os lembretes.");
   display=item.at;
  }else{
   time=String(item?.time||"");
   if(!TIME.test(time))fail("Horário da repetição inválido.");
   if(recurrence==="weekly"){
    weekday=Number(item.weekday);
    if(!Number.isInteger(weekday)||weekday<0||weekday>6)fail("Dia da semana inválido.");
   }
   due=nextTime(recurrence,time,weekday);
   display=time;
   if(repeatUntil&&due&&localStamp(Date.parse(due)).slice(0,10)>repeatUntil)fail("A repetição termina antes do próximo aviso.");
  }
  const unique=recurrence+"|"+display+"|"+weekday;
  if(keys.has(unique))fail("O mesmo dia e horário foi incluído duas vezes.");
  keys.add(unique);
  slots.push({id:crypto.randomUUID(),display,weekday,due});
 }
 const reminderId=id||crypto.randomUUID(),stamp=now();
 const statements=[];
 if(id){
  const processing=await db.prepare("SELECT 1 AS yes FROM personal_reminder_times WHERE reminder_id=? AND status='processando' LIMIT 1").bind(id).first();
  if(processing)fail("Um aviso está sendo enviado. Atualize a página antes de editar.",409);
  statements.push(db.prepare("UPDATE personal_reminders SET task_id=?,schedule_entry_id=?,title=?,message=?,channels=?,auto_delete=?,recurrence=?,repeat_until=?,updated_at=? WHERE id=? AND user_id=?")
   .bind(taskId,scheduleEntryId,title,message,JSON.stringify(channels),+autoDelete,recurrence,repeatUntil,stamp,id,user.id));
  statements.push(db.prepare("DELETE FROM personal_reminder_times WHERE reminder_id=?").bind(id));
 }else{
  statements.push(db.prepare("INSERT INTO personal_reminders(id,user_id,task_id,schedule_entry_id,title,message,channels,auto_delete,recurrence,repeat_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(reminderId,user.id,taskId,scheduleEntryId,title,message,JSON.stringify(channels),+autoDelete,recurrence,repeatUntil,stamp,stamp));
 }
 for(const slot of slots)statements.push(db.prepare("INSERT INTO personal_reminder_times(id,reminder_id,time_local,weekday,next_at,status,updated_at) VALUES(?,?,?,?,?,'pendente',?)")
  .bind(slot.id,reminderId,slot.display,slot.weekday,slot.due,stamp));
 await db.batch(statements);
 return {ok:true,id:reminderId};
}
export async function deletePersonalReminder(db,user,id){
 const result=await db.prepare("DELETE FROM personal_reminders WHERE id=? AND user_id=?").bind(id,user.id).run();
 if(!result.meta?.changes)fail("Lembrete não encontrado.",404);
 return {ok:true};
}
export async function processPersonalReminders(env){
 const db=env.DB;
 await prunePersonalReminders(db);
 // Recuperar uma execução interrompida após 15 minutos, sem prender alarmes para sempre.
 await db.prepare("UPDATE personal_reminder_times SET status='pendente' WHERE status='processando' AND updated_at<?").bind(new Date(Date.now()-900000).toISOString()).run();
 // Há uma única cobrança por horário. Cron concorrente não pode ocupar a mesma linha.
 const pending=(await db.prepare("SELECT t.*,r.user_id,r.task_id,r.schedule_entry_id,r.title,r.message,r.channels,r.auto_delete,r.recurrence,r.repeat_until,r.id AS parent_id FROM personal_reminder_times t JOIN personal_reminders r ON r.id=t.reminder_id JOIN users u ON u.id=r.user_id WHERE t.status='pendente' AND t.next_at<=? AND (t.retry_after IS NULL OR t.retry_after<=?) ORDER BY t.next_at LIMIT 20").bind(now(),now()).all()).results;
 for(const slot of pending){
  const claim=await db.prepare("UPDATE personal_reminder_times SET status='processando',attempts=attempts+1,updated_at=? WHERE id=? AND status='pendente'").bind(now(),slot.id).run();
  if(!claim.meta?.changes)continue;
  try{
   const stillOwned=await db.prepare("SELECT id FROM personal_reminders WHERE id=? AND user_id=?").bind(slot.parent_id,slot.user_id).first();
   if(!stillOwned)continue;
   // Não entregar caso a pessoa conclua sua parte entre a consulta e o envio.
   if(slot.task_id&&!await mine(db,slot.task_id,slot.user_id)){
    await db.prepare("DELETE FROM personal_reminders WHERE id=?").bind(slot.parent_id).run();continue;
   }
   const channels=asJson(slot.channels,{}),title="PET Gestão • "+slot.title.slice(0,70);
   const message=slot.message||"Lembrete: "+slot.title+". Confira suas atividades no PET Gestão.";
   const route=slot.task_id?"/atividade/"+slot.task_id:slot.schedule_entry_id?"/cronograma":"/meus-lembretes";
   const results={android:0,pc:0,skipped:{android:0,pc:0}};
   if(channels.android||channels.pc){
    const push=await pushWithoutMinuteDuplicates(env,{
     android:channels.android?[slot.user_id]:[],pc:channels.pc?[slot.user_id]:[]
    },{title,body:message.slice(0,220),route,kind:"personal",taskId:slot.task_id||slot.parent_id,noticeId:slot.id},
    "personal|"+slot.id+"|"+slot.next_at);
    Object.assign(results,push);
   }
   // Colisão no mesmo minuto já implica que houve uma notificação aceita.
   const success=results.android>0||results.pc>0||results.skipped.android>0||results.skipped.pc>0;
   if(!success){
    // Sem dispositivo conectado ou falha temporária: manter e tentar novamente.
    // Não usar Gmail para alarmes pessoais.
    await db.prepare("UPDATE personal_reminder_times SET status='pendente',retry_after=?,updated_at=? WHERE id=? AND status='processando'").bind(new Date(Date.now()+Math.min(360,10*Math.max(1,slot.attempts+1))*60000).toISOString(),now(),slot.id).run();
    continue;
   }
   if(slot.recurrence==="once"){
    if(slot.auto_delete){
     await db.prepare("DELETE FROM personal_reminder_times WHERE id=?").bind(slot.id).run();
     const left=await db.prepare("SELECT 1 AS yes FROM personal_reminder_times WHERE reminder_id=? LIMIT 1").bind(slot.parent_id).first();
     if(!left)await db.prepare("DELETE FROM personal_reminders WHERE id=?").bind(slot.parent_id).run();
    }else await db.prepare("UPDATE personal_reminder_times SET status='disparado',next_at=NULL,notified_at=?,updated_at=? WHERE id=?").bind(now(),now(),slot.id).run();
   }else{
    const next=nextTime(slot.recurrence,slot.time_local,slot.weekday,Date.now()+60000);
    const ended=!next||(slot.repeat_until&&localStamp(Date.parse(next)).slice(0,10)>slot.repeat_until);
    if(ended){
     if(slot.auto_delete)await db.prepare("DELETE FROM personal_reminder_times WHERE id=?").bind(slot.id).run();
     else await db.prepare("UPDATE personal_reminder_times SET status='disparado',next_at=NULL,notified_at=?,updated_at=? WHERE id=?").bind(now(),now(),slot.id).run();
     if(slot.auto_delete){
      const left=await db.prepare("SELECT 1 AS yes FROM personal_reminder_times WHERE reminder_id=? LIMIT 1").bind(slot.parent_id).first();
      if(!left)await db.prepare("DELETE FROM personal_reminders WHERE id=?").bind(slot.parent_id).run();
     }
    }else await db.prepare("UPDATE personal_reminder_times SET status='pendente',next_at=?,retry_after=NULL,notified_at=?,updated_at=? WHERE id=?").bind(next,now(),now(),slot.id).run();
   }
  }catch(error){
   console.error("PET Gestão — falha no lembrete pessoal:",String(error?.message||error).slice(0,150));
   await db.prepare("UPDATE personal_reminder_times SET status='pendente',retry_after=?,updated_at=? WHERE id=? AND status='processando'").bind(new Date(Date.now()+600000).toISOString(),now(),slot.id).run().catch(()=>{});
  }
 }
}
