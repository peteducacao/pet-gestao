import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {webcrypto} from "node:crypto";

// Teste 100% local, sem serviços externos e sem usar contas reais.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const src=await readFile(new URL("../worker/src/web-push.js",import.meta.url),"utf8");
const api=await import("data:text/javascript;charset=utf-8,"+encodeURIComponent(src));
const {webPushPublicKey,webPushSubscribe,webPushCheck,webPushStatus,webPushSavePreferences,
       webPushTest,webPushUnsubscribe}=api;
const user={id:"pessoa-teste",must_change_password:0},another={id:"pessoa-2",must_change_password:0};
const endpoint="https://fcm.googleapis.com/fcm/send/teste-web-local";
const b64=bytes=>Buffer.from(bytes).toString("base64url");
const unb64=text=>Buffer.from(text,"base64url");
const ua=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
const p256dh=b64(await crypto.subtle.exportKey("raw",ua.publicKey));
const auth=b64(crypto.getRandomValues(new Uint8Array(16)));
let vapid=null;
const subscriptions=new Map(),preferences=new Map(),logs=new Set();
const db={
 prepare(sql){
  return {
   async first(){
    if(sql.startsWith("SELECT public_key,private_key FROM web_push_vapid"))return vapid;
    throw Error("Consulta direta inesperada: "+sql);
   },
   bind(...args){
    return {
     async first(){
      if(sql.startsWith("SELECT public_key,private_key FROM web_push_vapid"))return vapid;
      if(sql.startsWith("SELECT COUNT(*) AS total FROM web_push_subscriptions"))
       return {total:[...subscriptions.values()].filter(x=>x.user_id===args[0]).length};
      if(sql.startsWith("SELECT new_demands,deadlines,overdue FROM web_push_preferences"))
       return preferences.get(args[0])||null;
      if(sql.startsWith("SELECT id FROM web_push_subscriptions WHERE user_id="))
       return [...subscriptions.values()].find(x=>x.user_id===args[0]&&x.endpoint===args[1])||null;
      if(sql.startsWith("SELECT * FROM web_push_subscriptions WHERE user_id="))
       return [...subscriptions.values()].find(x=>x.user_id===args[0]&&x.endpoint===args[1])||null;
      throw Error("Consulta inesperada: "+sql);
     },
     async run(){
      if(sql.startsWith("INSERT OR IGNORE INTO web_push_vapid")){
       vapid??={public_key:args[0],private_key:args[1]};
      }else if(sql.startsWith("INSERT INTO web_push_subscriptions")){
       subscriptions.set(args[2],{id:args[0],user_id:args[1],endpoint:args[2],p256dh:args[3],auth:args[4]});
      }else if(sql.startsWith("INSERT INTO web_push_preferences")){
       preferences.set(args[0],{new_demands:args[1],deadlines:args[2],overdue:args[3]});
      }else if(sql.startsWith("INSERT OR IGNORE INTO web_push_log")){
       if(logs.has(args[0]))return {meta:{changes:0}};
       logs.add(args[0]);
      }else if(sql.startsWith("DELETE FROM web_push_log"))logs.delete(args[0]);
      else if(sql.startsWith("DELETE FROM web_push_subscriptions WHERE user_id=")){
       const x=subscriptions.get(args[1]);if(x?.user_id===args[0])subscriptions.delete(args[1]);
      }else if(sql.startsWith("DELETE FROM web_push_subscriptions WHERE id=")){
       for(const [id,x] of subscriptions)if(x.id===args[0])subscriptions.delete(id);
      }else throw Error("Alteração inesperada: "+sql);
      return {meta:{changes:1}};
     }
    };
   }
  };
 }
};
const text=new TextEncoder(),decode=new TextDecoder();
const concat=(...parts)=>Buffer.concat(parts.map(x=>Buffer.from(x)));
async function hmac(key,data){
 const sk=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return Buffer.from(await crypto.subtle.sign("HMAC",sk,data));
}
async function decryptPush(buffer){
 const bytes=Buffer.from(buffer);
 const salt=bytes.subarray(0,16),rs=bytes.readUInt32BE(16),length=bytes[20],asPublic=bytes.subarray(21,21+length);
 assert.equal(rs,4096);
 assert.equal(length,65);
 const ecdhPub=await crypto.subtle.importKey("raw",asPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const secret=Buffer.from(await crypto.subtle.deriveBits({name:"ECDH",public:ecdhPub},ua.privateKey,256));
 const clientPublic=await crypto.subtle.exportKey("raw",ua.publicKey);
 const prkKey=await hmac(unb64(auth),secret);
 const material=await hmac(prkKey,concat(text.encode("WebPush: info"),[0],clientPublic,asPublic,[1]));
 const prk=await hmac(salt,material);
 const cek=(await hmac(prk,concat(text.encode("Content-Encoding: aes128gcm"),[0,1]))).subarray(0,16);
 const nonce=(await hmac(prk,concat(text.encode("Content-Encoding: nonce"),[0,1]))).subarray(0,12);
 const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["decrypt"]);
 const plain=Buffer.from(await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce},key,bytes.subarray(21+length)));
 assert.equal(plain.at(-1),2);
 return JSON.parse(decode.decode(plain.subarray(0,-1)));
}
const {publicKey}=await webPushPublicKey(db);
assert.equal(unb64(publicKey).length,65);
assert.equal((await webPushPublicKey(db)).publicKey,publicKey,"VAPID deve ser estável");
assert.equal((await webPushStatus(db,user)).registeredComputers,0);
await assert.rejects(()=>webPushSubscribe(db,user,{endpoint:"https://localhost/private",keys:{p256dh,auth}}),
 /reconhecido/);
await webPushSubscribe(db,user,{endpoint,keys:{p256dh,auth}});
assert.equal((await webPushStatus(db,user)).registeredComputers,1);
assert.equal((await webPushCheck(db,user,{endpoint})).connected,true);
assert.equal((await webPushCheck(db,another,{endpoint})).connected,false);
const {preferences:changed}=await webPushSavePreferences(db,user,{newDemands:false,deadlines:true,overdue:false});
assert.deepEqual(changed,{newDemands:false,deadlines:true,overdue:false});
let messages=0;
const oldFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
 assert.equal(url,endpoint);
 assert.equal(options.method,"POST");
 assert.equal(options.headers["Content-Encoding"],"aes128gcm");
 assert.match(options.headers.Authorization,/^vapid t=[A-Za-z0-9._-]+, k=[A-Za-z0-9_-]+$/);
 const jwt=options.headers.Authorization.split("t=")[1].split(",")[0].split(".");
 const signed=jwt[0]+"."+jwt[1],signature=unb64(jwt[2]);
 const verifyKey=await crypto.subtle.importKey("raw",unb64(publicKey),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
 assert.equal(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},verifyKey,signature,text.encode(signed)),true);
 const payload=JSON.parse(decode.decode(unb64(jwt[1])));
 assert.equal(payload.aud,"https://fcm.googleapis.com");
 assert.equal(payload.sub,"https://peteducacao.github.io/pet-gestao/");
 const notification=await decryptPush(options.body);
 assert.equal(notification.kind,"test");
 assert.match(notification.body,/computador/);
 messages++;
 return new Response("",{status:201});
};
try{
 const result=await webPushTest({DB:db},user,{endpoint});
 assert.deepEqual(result,{ok:true,acceptedByService:true});
 assert.equal(messages,1);
 await assert.rejects(()=>webPushTest({DB:db},user,{endpoint}),/Aguarde dois minutos/);
 await webPushUnsubscribe(db,another,{endpoint});
 assert.equal((await webPushStatus(db,user)).registeredComputers,1,"Não excluir inscrição de outra conta");
 await webPushUnsubscribe(db,user,{endpoint});
 assert.equal((await webPushStatus(db,user)).registeredComputers,0);
 console.log("OK: VAPID ES256, AES128GCM descriptografável, permissões por conta e teste de push desktop.");
}finally{globalThis.fetch=oldFetch;}
