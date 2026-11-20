import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {generateKeyPairSync,webcrypto} from "node:crypto";

// Teste isolado de entrega — sem usar destinatários reais nem rede externa.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const kinds=["create","review","due_soon","overdue","event_soon","event_today"];
const noticeSource=await readFile(new URL("../worker/src/notification-center.js",import.meta.url),"utf8");
const notices=await import("data:text/javascript,"+encodeURIComponent(noticeSource));
const source=await readFile(new URL("../worker/src/push.js",import.meta.url),"utf8");
const stubbedSource=source.replace(
 'import {notifyBrowserUsers} from "./web-push.js";',
 'const notifyBrowserUsers=(env,userIds,message)=>globalThis.__testBrowserDelivery(userIds,message);'
);
assert.ok(stubbedSource!==source,"O envio Web Push precisa ser substituído pelo simulador.");
const {pushNotificationToChannels}=await import("data:text/javascript,"+encodeURIComponent(stubbedSource));
const memberId="petiano-teste",token="token-ficticio-"+("A".repeat(120));
const logs=new Set(),android=[],desktop=[];
const env={
 DB:{prepare(sql){
  return {bind(...params){return {
   async all(){
    if(sql.startsWith("SELECT d.user_id,d.token,d.device_id"))
     return {results:[{user_id:memberId,token,device_id:"a9e0ff12-42cb-41bc-994d-74841a919020",new_demands:1,deadlines:1,overdue:1}]};
    throw Error("Consulta inesperada: "+sql);
   },
   async run(){
    if(sql.startsWith("INSERT OR IGNORE INTO push_notice_log")){
     if(logs.has(params[0]))return {meta:{changes:0}};
     logs.add(params[0]);return {meta:{changes:1}};
    }
    if(sql.startsWith("DELETE FROM push_notice_log")){
     logs.delete(params[0]);return {meta:{changes:1}};
    }
    throw Error("SQL inesperado: "+sql);
   }
  }}};
 }}
};
globalThis.__testBrowserDelivery=async(ids,message)=>{
 for(const id of ids){assert.equal(id,memberId);desktop.push(message.kind)}
 return ids.length;
};
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({
 project_id:"pet-gestao-yfs",
 client_email:"teste-local@pet-gestao-yfs.iam.gserviceaccount.com",
 private_key:privateKey.export({type:"pkcs8",format:"pem"})
});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 if(url==="https://oauth2.googleapis.com/token"){
  return new Response(JSON.stringify({access_token:"token-de-teste",expires_in:3300}),{status:200});
 }
 if(String(url).includes("fcm.googleapis.com/v1/projects/pet-gestao-yfs/messages:send")){
  const request=JSON.parse(init.body).message;
  assert.equal(request.token,token);
  assert.equal(request.data.route,"/atividade/demanda-teste");
  android.push(request.data.kind);
  return new Response(JSON.stringify({name:"projeto-ficticio/mensagem"}),{status:200});
 }
 throw Error("Rede não autorizada: "+url);
};
try{
 const rows=[{id:memberId,email:"petiano@example.test",role:"petiano",role_override:null,
  email_enabled:1,android_enabled:1,pc_enabled:1}];
 const db={prepare(sql){
  return {bind(kind,...ids){return {async all(){
   assert.ok(kinds.includes(kind));
   assert.deepEqual(ids,[memberId]);
   return {results:rows};
  }}}};
 }};
 // Cada tipo reutiliza o mesmo alvo selecionado para o e-mail.
 for(const kind of kinds){
  const targets=await notices.notificationRecipients(db,[memberId],kind);
  assert.deepEqual(targets.email.map(x=>x.id),[memberId],kind+": público do e-mail");
  assert.deepEqual(targets.android.map(x=>x.id),[memberId],kind+": público do Android");
  assert.deepEqual(targets.pc.map(x=>x.id),[memberId],kind+": público do PC");
  const message={title:"PET Gestão",body:"Demanda de teste",
   kind,taskId:"demanda-teste",route:"/atividade/demanda-teste"};
  const result=await pushNotificationToChannels(env,targets,message,kind+"|demanda-teste");
  assert.deepEqual(result,{android:1,pc:1},kind+": ambos os serviços aceitaram o aviso");
 }
 assert.deepEqual(android,kinds,"FCM recebe os seis avisos, uma vez cada");
 assert.deepEqual(desktop,kinds,"PC recebe os seis avisos, uma vez cada");
 // A indisponibilidade do Gmail não é pré-condição para o aviso push.
 const pushTargets={android:[memberId],pc:[memberId]};
 const recovery=await Promise.allSettled([
  Promise.reject(Error("Gmail atingiu a cota diária")),
  pushNotificationToChannels(env,pushTargets,{title:"PET Gestão",body:"Aviso",kind:"create",
    taskId:"demanda-teste",route:"/atividade/demanda-teste"},"create|teste-gmail")
 ]);
 assert.equal(recovery[0].status,"rejected");
 assert.deepEqual(recovery[1].value,{android:1,pc:1},"Push funciona com Gmail indisponível");
 console.log("Seis avisos: FCM e PC simulados; mesmo público do e-mail; cota Gmail independente OK.");
}finally{
 globalThis.fetch=originalFetch;
 delete globalThis.__testBrowserDelivery;
}
