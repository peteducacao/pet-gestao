import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {generateKeyPairSync,webcrypto} from "node:crypto";

// Teste 100% local: chaves, token e dispositivos fictícios. Nunca envia push real.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const source=await readFile(new URL("../worker/src/push.js",import.meta.url),"utf8");
const webPushSource=await readFile(new URL("../worker/src/web-push.js",import.meta.url),"utf8");
const webPushUrl="data:text/javascript;charset=utf-8,"+encodeURIComponent(webPushSource);
const moduleUrl="data:text/javascript;charset=utf-8,"+encodeURIComponent(source.replace('from "./web-push.js"','from "'+webPushUrl+'"'));
const {registerPushDevice,unregisterPushDevice,getPushPreferences,savePushPreferences,sendPushTest,pushNotificationToChannels}=await import(moduleUrl);

const user={id:"integrante-local",must_change_password:0};
const anotherUser={id:"outro-integrante",must_change_password:0};
const deviceId="69a2f37e-0c6b-45f7-8a1f-6e8d314b72c9";
const token="fake_fcm_"+("a".repeat(128));
const devices=new Map(),notices=new Set(),preferences=new Map();
let oauthRequests=0,deliveryRequests=0;
const db={
 prepare(statement){
  return {
   bind(...params){
    return {
     async all(){
      if(statement.startsWith("SELECT s.* FROM web_push_subscriptions s"))return {results:[]};
      if(statement.startsWith("SELECT d.user_id,d.token,d.device_id"))
       return {results:[...devices.values()].filter(d=>params.includes(d.user_id)).map(d=>({
        ...d,new_demands:1,deadlines:1,overdue:1
       }))};
      throw Error("Consulta all inesperada: "+statement);
     },
     async first(){
      if(statement.startsWith("SELECT device_id,token FROM push_devices")){
       const d=devices.get(params[1]);
       return d?.user_id===params[0]?{device_id:d.device_id,token:d.token}:null;
      }
      if(statement.startsWith("SELECT new_demands,deadlines,overdue FROM push_preferences"))
       return preferences.get(params[0])||null;
      if(statement.startsWith("SELECT count(*) AS total FROM push_devices"))
       return {total:[...devices.values()].filter(d=>d.user_id===params[0]).length};
      throw Error("Consulta inesperada: "+statement);
     },
     async run(){
      if(statement.startsWith("DELETE FROM push_devices WHERE device_id=? OR token=?")){
       for(const [id,d] of devices)if(id===params[0]||d.token===params[1])devices.delete(id);
       return {meta:{changes:1}};
      }
      if(statement.startsWith("INSERT INTO push_devices")){
       devices.set(params[0],{device_id:params[0],user_id:params[1],token:params[2]});
       return {meta:{changes:1}};
      }
      if(statement.startsWith("DELETE FROM push_devices WHERE user_id=? AND device_id=?")){
       const row=devices.get(params[1]);
       if(row?.user_id===params[0])devices.delete(params[1]);
       return {meta:{changes:1}};
      }
      if(statement.startsWith("INSERT OR IGNORE INTO push_notice_log")){
       assert.ok(params[2],"ID da demanda é obrigatório; o D1 recusaria um push sem vínculo");
       if(notices.has(params[0]))return {meta:{changes:0}};
       notices.add(params[0]);return {meta:{changes:1}};
      }
      if(statement.startsWith("DELETE FROM push_notice_log")){
       notices.delete(params[0]);return {meta:{changes:1}};
      }
      if(statement.startsWith("INSERT INTO push_preferences")){
       preferences.set(params[0],{new_demands:params[1],deadlines:params[2],overdue:params[3]});
       return {meta:{changes:1}};
      }
      throw Error("Gravação inesperada: "+statement);
     }
    };
   }
  };
 },
 async batch(statements){return Promise.all(statements.map(q=>q.run()));}
};
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const serviceAccount={
 project_id:"pet-gestao-yfs",
 client_email:"teste-local@pet-gestao-yfs.iam.gserviceaccount.com",
 private_key:privateKey.export({type:"pkcs8",format:"pem"})
};
const env={DB:db,FCM_SERVICE_ACCOUNT_JSON:JSON.stringify(serviceAccount)};
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,init)=>{
 if(url==="https://oauth2.googleapis.com/token"){
  oauthRequests++;
  const form=new URLSearchParams(init.body);
  assert.equal(form.get("grant_type"),"urn:ietf:params:oauth:grant-type:jwt-bearer");
  assert.equal(form.get("assertion").split(".").length,3);
  return new Response(JSON.stringify({access_token:"token-local-simulado",expires_in:3600}),
   {status:200,headers:{"Content-Type":"application/json"}});
 }
 if(String(url).includes("fcm.googleapis.com/v1/projects/pet-gestao-yfs/messages:send")){
  deliveryRequests++;
  assert.equal(init.headers.Authorization,"Bearer token-local-simulado");
  const request=JSON.parse(init.body);
  assert.equal(request.message.token,token);
  if(request.message.data.kind==="test")assert.equal(request.message.data.route,"/inicio");
  else {
   assert.ok(["create","review"].includes(request.message.data.kind));
   assert.equal(request.message.data.route,"/atividade/42af9a2b-8536-4706-a4c8-daa948847b29");
  }
  return new Response(JSON.stringify({name:"projects/pet-gestao-yfs/messages/local"}),
   {status:200,headers:{"Content-Type":"application/json"}});
 }
 throw Error("Rede externa não permitida em teste: "+url);
};
try{
 assert.equal((await getPushPreferences(db,user)).registeredDevices,0);
 assert.deepEqual((await getPushPreferences(db,user)).preferences,
   {newDemands:true,deadlines:true,overdue:true});
 await assert.rejects(()=>registerPushDevice(db,user,{deviceId:"nada",token}),/Identificador Android inválido/);
 await assert.rejects(()=>registerPushDevice(db,user,{deviceId,token:"invalido"}),/Token Android inválido/);
 await registerPushDevice(db,user,{deviceId,token});
 assert.equal((await getPushPreferences(db,user)).registeredDevices,1);

 await assert.rejects(()=>sendPushTest(env,user,{deviceId:"identificador-com-problema"}),
  /Identificador do aparelho inválido/);
 await assert.rejects(()=>sendPushTest(env,anotherUser,{deviceId}),
  /Este aparelho ainda não foi conectado/);

 const first=await sendPushTest(env,user,{deviceId});
 assert.deepEqual(first,{ok:true,acceptedByFirebase:true});
 assert.equal(oauthRequests,1);
 assert.equal(deliveryRequests,1);
 await assert.rejects(()=>sendPushTest(env,user,{deviceId}),
  /Aguarde dois minutos antes de enviar outro teste/);
 for(const kind of ["create","review"]){
  const taskId="42af9a2b-8536-4706-a4c8-daa948847b29";
  const result=await pushNotificationToChannels(env,{android:[user.id],pc:[]},{
   title:kind==="create"?"Nova demanda":"Texto para revisão",
   body:"Demanda com identificador válido",route:"/atividade/"+taskId,
   taskId,kind
  },kind+"|"+taskId);
  assert.deepEqual(result,{android:1,pc:0},"Firebase aceita "+kind+" com ID da demanda");
 }
 assert.equal(deliveryRequests,3,"Teste, criação e revisão chegaram ao Firebase fictício");

 await savePushPreferences(db,user,{newDemands:false,deadlines:true,overdue:false});
 assert.deepEqual((await getPushPreferences(db,user)).preferences,
  {newDemands:false,deadlines:true,overdue:false});
 await unregisterPushDevice(db,anotherUser,{deviceId});
 assert.equal((await getPushPreferences(db,user)).registeredDevices,1,
  "Outra conta não pode desvincular o aparelho");
 await unregisterPushDevice(db,user,{deviceId});
 assert.equal((await getPushPreferences(db,user)).registeredDevices,0);
 console.log("Firebase push (local): UUID Android válido, registro, isolamento, envio, deduplicação e preferências OK.");
}finally{globalThis.fetch=originalFetch;}
