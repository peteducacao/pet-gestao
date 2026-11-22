// PET Gestão — notificações Android e integração com Web Push do computador.
import {notifyBrowserUsers} from "./web-push.js";
const maxTokens=300;
const now=()=>new Date().toISOString();
const ids=x=>[...new Set(Array.isArray(x)?x.map(String).filter(Boolean):[])];
const json=(value,fallback)=>{try{return JSON.parse(value||"")}catch{return fallback}};
function reject(message,status=400){const error=new Error(message);error.status=status;throw error}
function enabled(value){return value===true||value===false?value:null}
const defaultPreferences={newDemands:true,deadlines:true,overdue:true};
const preferencesFor=row=>({
 newDemands:row?row.new_demands===1:true,
 deadlines:row?row.deadlines===1:true,
 overdue:row?row.overdue===1:true
});
export async function getPushPreferences(db,user){
 const row=await db.prepare("SELECT new_demands,deadlines,overdue FROM push_preferences WHERE user_id=?").bind(user.id).first();
 const devices=await db.prepare("SELECT COUNT(*) AS total FROM push_devices d JOIN sessions s ON s.token_hash=d.session_hash AND s.user_id=d.user_id WHERE d.user_id=? AND s.expires_at>?").bind(user.id,now()).first();
 return {preferences:preferencesFor(row),registeredDevices:Number(devices?.total||0)};
}
export async function savePushPreferences(db,user,payload){
 const prefs={...defaultPreferences,...(await getPushPreferences(db,user)).preferences};
 for(const key of Object.keys(defaultPreferences)){
   if(payload[key]!==undefined){
     const value=enabled(payload[key]);
     if(value===null)reject("Preferência de notificações inválida.");
     prefs[key]=value;
   }
 }
 await db.prepare("INSERT INTO push_preferences(user_id,new_demands,deadlines,overdue,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET new_demands=excluded.new_demands,deadlines=excluded.deadlines,overdue=excluded.overdue,updated_at=excluded.updated_at")
   .bind(user.id,prefs.newDemands?1:0,prefs.deadlines?1:0,prefs.overdue?1:0,now()).run();
 return getPushPreferences(db,user);
}
export async function registerPushDevice(db,user,payload,sessionHash=null){
 const token=String(payload.token||"").trim(), deviceId=String(payload.deviceId||"").trim();
 if(!/^[A-Za-z0-9:_-]{40,4096}$/.test(token))reject("Token Android inválido.");
 if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(deviceId))reject("Identificador Android inválido.");
 if(user.must_change_password)reject("Atualize sua senha antes de ativar os avisos.",403);
 const stamp=now();
 // Um identificador é exclusivo do aparelho e do aplicativo, nunca da conta:
 // entrar com outro usuário substitui o vínculo anterior.
 await db.batch([
  db.prepare("DELETE FROM push_devices WHERE device_id=? OR token=?").bind(deviceId,token),
  db.prepare("INSERT INTO push_devices(device_id,user_id,token,created_at,updated_at,session_hash) VALUES(?,?,?,?,?,?)").bind(deviceId,user.id,token,stamp,stamp,sessionHash)
 ]);
 return {ok:true,deviceId};
}
export async function unregisterPushDevice(db,user,payload){
 const deviceId=String(payload.deviceId||"");
 if(!/^[a-f\d-]{36}$/i.test(deviceId))reject("Identificador Android inválido.");
 await db.prepare("DELETE FROM push_devices WHERE user_id=? AND device_id=?").bind(user.id,deviceId).run();
 return {ok:true};
}
let googleTokenCache=null;
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const encodeText=value=>b64url(new TextEncoder().encode(value));
async function fcmAccess(env){
 if(!env.FCM_SERVICE_ACCOUNT_JSON)return null;
 if(googleTokenCache&&googleTokenCache.expiresAt>Date.now()+90000)return googleTokenCache.value;
 const account=json(env.FCM_SERVICE_ACCOUNT_JSON,{});
 if(!account.client_email||!account.private_key||!account.project_id)throw Error("Credencial FCM incompleta.");
 const pem=String(account.private_key).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 const bytes=Uint8Array.from(atob(pem),char=>char.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",bytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const iat=Math.floor(Date.now()/1000);
 const header=encodeText(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const payload=encodeText(JSON.stringify({
  iss:account.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",
  aud:"https://oauth2.googleapis.com/token",iat,exp:iat+3300
 }));
 const signed=header+"."+payload;
 const signature=b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(signed))));
 const response=await fetch("https://oauth2.googleapis.com/token",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:signed+"."+signature})
 });
 if(!response.ok)throw new Error("Autenticação FCM indisponível ("+response.status+").");
 const result=await response.json();
 if(!result.access_token)throw new Error("FCM não forneceu acesso.");
 googleTokenCache={value:result.access_token,expiresAt:Date.now()+Math.min(Number(result.expires_in)||3300,3300)*1000};
 return result.access_token;
}
function fcmConfiguration(env){
 const account=json(env.FCM_SERVICE_ACCOUNT_JSON,{});
 return account.project_id&&account.private_key&&account.client_email?account:null;
}
async function deliver(env,token,message){
 const account=fcmConfiguration(env);
 if(!account)return {status:"disabled"};
 const access=await fcmAccess(env);
 const response=await fetch("https://fcm.googleapis.com/v1/projects/"+encodeURIComponent(account.project_id)+"/messages:send",{
   method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},
   body:JSON.stringify({message:{
    token,android:{priority:"HIGH",ttl:"86400s"},
    data:{title:message.title.slice(0,90),body:message.body.slice(0,220),route:message.route,kind:message.kind}
   }})
 });
 if(response.ok)return {status:"sent"};
 const failure=await response.text();
 if(response.status===404||response.status===410||/UNREGISTERED|INVALID_ARGUMENT/.test(failure))
   return {status:"invalid"};
 throw new Error("FCM recusou envio ("+response.status+").");
}
async function devicesFor(db,userIds,preference){
 if(!userIds.length)return [];
 const list=ids(userIds).slice(0,maxTokens);
 const holders=list.map(()=>"?").join(",");
 const rows=(await db.prepare("SELECT d.user_id,d.token,d.device_id,"+
  "COALESCE(p.new_demands,1) AS new_demands,COALESCE(p.deadlines,1) AS deadlines,COALESCE(p.overdue,1) AS overdue "+
  "FROM push_devices d JOIN sessions s ON s.token_hash=d.session_hash AND s.user_id=d.user_id "+
  "LEFT JOIN push_preferences p ON p.user_id=d.user_id "+
  "WHERE s.expires_at>? AND d.user_id IN ("+holders+") LIMIT 300").bind(now(),...list).all()).results;
 const column=preference==="newDemands"?"new_demands":preference==="overdue"?"overdue":"deadlines";
 return preference?rows.filter(x=>Number(x[column])===1):rows;
}
async function notifyMany(env,userIds,message,preference,dedupeForUser=null,channel="both"){
 const totals={android:0,pc:0};
 if(!userIds.length)return totals;
 // Celular usa FCM no Android e Web Push oficial da Apple no iPhone/iPad.
 // As inscrições do computador continuam separadas.
 if(channel==="android")totals.android=await notifyBrowserUsers(env,userIds,message,null,dedupeForUser,"ios")
  .catch(error=>{console.error("PET Gestão — envio para iOS indisponível:",String(error.message||error).slice(0,160));return 0;});
 if(channel==="pc")totals.pc=await notifyBrowserUsers(env,userIds,message,preference,dedupeForUser,"pc")
  .catch(error=>{console.error("PET Gestão — envio para PC indisponível:",String(error.message||error).slice(0,160));return 0;});
 if(channel==="pc"||!fcmConfiguration(env))return totals;
 const db=env.DB,devices=await devicesFor(db,userIds,preference);
 for(const device of devices){
   let key=null;
   try{
    if(dedupeForUser){
      // Uma chave por dispositivo e horário; reter somente se o FCM aceitou.
      key=dedupeForUser+"|"+device.device_id;
      const claim=await db.prepare("INSERT OR IGNORE INTO push_notice_log(dedupe_key,device_id,task_id,kind,created_at) VALUES(?,?,?,?,?)")
        .bind(key,device.device_id,message.taskId,message.kind,now()).run();
      if(!claim.meta?.changes)continue;
    }
    const result=await deliver(env,device.token,message);
    if(result.status==="sent")totals.android++;
    else {
      if(key)await db.prepare("DELETE FROM push_notice_log WHERE dedupe_key=?").bind(key).run();
      if(result.status==="invalid")
        await db.prepare("DELETE FROM push_devices WHERE device_id=? AND token=?").bind(device.device_id,device.token).run();
    }
   }catch(err){
    if(key)await db.prepare("DELETE FROM push_notice_log WHERE dedupe_key=?").bind(key).run().catch(()=>{});
    console.error("PET Gestão — falha no envio push:",String(err?.message||err).slice(0,160));
   }
 }
 return totals;
}
export async function pushNotificationToChannels(env,targets,message,dedupe){
 const androidIds=(targets?.android||[]).map(x=>typeof x==="string"?x:x.id);
 const pcIds=(targets?.pc||[]).map(x=>typeof x==="string"?x:x.id);
 const [mobile,desktop]=await Promise.all([
  notifyMany(env,androidIds,message,null,dedupe,"android"),
  notifyMany(env,pcIds,message,null,dedupe,"pc")
 ]);
 return {android:mobile.android,pc:desktop.pc};
}

/** Comprovação controlada do fluxo Android → Worker → FCM, apenas para o próprio aparelho. */
export async function sendPushTest(env,user,payload){
 if(!fcmConfiguration(env))reject("Firebase ainda não está configurado no Cloudflare.",503);
 const deviceId=String(payload.deviceId||"").trim();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId))
   reject("Identificador do aparelho inválido.");
 const device=await env.DB.prepare("SELECT device_id,token FROM push_devices WHERE user_id=? AND device_id=?")
   .bind(user.id,deviceId).first();
 if(!device)reject("Este aparelho ainda não foi conectado. Abra novamente o aplicativo Android.",409);
 // Limite de 1 teste por aparelho a cada janela de 2 minutos.
 const key="test|"+deviceId+"|"+Math.floor(Date.now()/120000);
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO push_notice_log(dedupe_key,device_id,task_id,kind,created_at) VALUES(?,?,?,?,?)")
   .bind(key,deviceId,"pet-gestao-self-test","test",now()).run();
 if(!claim.meta?.changes)reject("Aguarde dois minutos antes de enviar outro teste.",429);
 try{
   const result=await deliver(env,device.token,{
     title:"PET Gestão • Notificações ativadas",
     body:"Teste recebido! Seu celular está pronto para avisos de novas demandas e prazos.",
     route:"/inicio",kind:"test"
   });
   if(result.status==="sent")return {ok:true,acceptedByFirebase:true};
   if(result.status==="invalid"){
     await env.DB.prepare("DELETE FROM push_devices WHERE user_id=? AND device_id=?")
       .bind(user.id,deviceId).run();
     reject("O registro deste aparelho expirou. Reinicie o aplicativo e tente novamente.",409);
   }
   reject("Firebase ainda não está configurado para envio.",503);
 }catch(err){
   // Não gastar cota de teste em falhas externas e permitir nova tentativa.
   await env.DB.prepare("DELETE FROM push_notice_log WHERE dedupe_key=?").bind(key).run();
   if(err.status)throw err;
   console.error("PET Gestão — falha no teste FCM:",String(err?.message||err).slice(0,150));
   reject("Não foi possível entregar o teste ao Firebase. Confira a configuração do Cloud Messaging.",503);
 }
}

async function assignedUsers(db,task){
 const chosen=new Set(ids(json(task.assignee_ids,[])));
 const commissions=ids(json(task.commission_ids,[]));
 if(task.assignment_scope==="todos"){
   const rows=(await db.prepare("SELECT id,role,role_override FROM users").all()).results;
   for(const u of rows)if(["petiano","tutor","admin"].includes(u.role_override||u.role))chosen.add(u.id);
 }
 if(commissions.length){
   const sql=commissions.map(()=>"?").join(",");
   const rows=(await db.prepare("SELECT commission_id,user_id FROM commission_members WHERE commission_id IN ("+sql+")").bind(...commissions).all()).results;
   for(const m of rows)chosen.add(m.user_id);
 }
 const done=json(task.user_done,{});
 for(const id of chosen)if(done[id])chosen.delete(id);
 return [...chosen];
}
export async function pushTaskCreated(env,taskId,authorId){
 const task=await env.DB.prepare("SELECT * FROM tasks WHERE id=? AND archived_at IS NULL").bind(taskId).first();
 if(!task||String(task.title||"").startsWith("[TESTE]"))return;
 const members=(await assignedUsers(env.DB,task)).filter(id=>id!==authorId);
 await notifyMany(env,members,{
  title:"Nova demanda atribuída",
  body:String(task.title||"").slice(0,180),route:"/atividade/"+task.id,taskId:task.id,kind:"new"
 },"newDemands","new|"+task.id);
}
const dateKey=value=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Maceio",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
function dueMoment(raw){
 const date=String(raw||"");
 if(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(date))return null;
 const validDate=date.length===10?date+"T23:59:00":date.length===16?date+":00":date;
 const n=Date.parse(validDate+"-03:00");
 return Number.isFinite(n)?n:null;
}
export async function pushDeadlineReminders(env){
 const [hasAndroid,hasDesktop]=await Promise.all([
  env.DB.prepare("SELECT 1 FROM push_devices LIMIT 1").first(),
  env.DB.prepare("SELECT 1 FROM web_push_subscriptions LIMIT 1").first()
 ]);
 if(!hasAndroid&&!hasDesktop)return;
 const tasks=(await env.DB.prepare("SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 250").all()).results;
 const instant=Date.now(),today=dateKey(new Date(instant));
 const todayUTC=Date.parse(today+"T00:00:00Z");
 for(const task of tasks){
  if(String(task.title||"").startsWith("[TESTE]"))continue;
  const members=await assignedUsers(env.DB,task);
  if(!members.length)continue;
  const completedCommissions=json(task.commission_done,{});
  const active=new Set(members);
  // Evita notificar integrantes de comissões já concluídas.
  const groupIds=ids(json(task.commission_ids,[]));
  if(groupIds.length){
    const groupUsers=(await env.DB.prepare("SELECT commission_id,user_id FROM commission_members WHERE commission_id IN ("+groupIds.map(()=>"?").join(",")+")").bind(...groupIds).all()).results;
    const assignees=new Set(ids(json(task.assignee_ids,[])));
    for(const m of groupUsers)if(completedCommissions[m.commission_id]&&!assignees.has(m.user_id))active.delete(m.user_id);
  }
  const deadlines=json(task.deadlines,[]);
  for(let i=0;i<deadlines.length;i++){
    const d=deadlines[i];
    if(!d||!d.dueAt||d.completedAt)continue;
    const when=dueMoment(d.dueAt);
    if(when===null)continue;
    const dayUTC=Date.parse(String(d.dueAt).slice(0,10)+"T00:00:00Z");
    const days=Math.round((dayUTC-todayUTC)/86400000);
    const overdue=instant>when&&instant-when<24*60*60*1000;
    const near=days===1&&instant<when;
    const todayEvent=d.label==="Evento"&&days===0&&instant<when;
    if(!near&&!overdue&&!todayEvent)continue;
    const kind=overdue?"overdue":todayEvent?"event":"deadline";
    const stageIds=ids(d.assigneeIds);
    const recipients=stageIds.length?stageIds.filter(id=>active.has(id)):[...active];
    if(!recipients.length)continue;
    const title=kind==="overdue"?"Prazo vencido":kind==="event"?"Evento hoje":"Prazo amanhã";
    await notifyMany(env,recipients,{
     title,body:String(task.title||"").slice(0,160),
     route:"/atividade/"+task.id,taskId:task.id,kind
    },kind==="overdue"?"overdue":"deadlines",
    [kind,task.id,String(d.id||i),String(d.dueAt)].join("|"));
  }
 }
}
