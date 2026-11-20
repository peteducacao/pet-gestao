// PET Gestão — Web Push para PWA no computador (RFC 8291 + VAPID).
// Sem Firebase no navegador: o par VAPID é criado uma única vez e protegido no D1.
const enc=new TextEncoder();
const stamp=()=>new Date().toISOString();
const base64url=data=>btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unbase64url=value=>{
 const text=String(value||"");
 if(!/^[A-Za-z0-9_-]+$/.test(text)||text.length>4000)throw Error("Chave de notificação inválida.");
 return Uint8Array.from(atob(text.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
};
const join=(...arrays)=>{
 const out=new Uint8Array(arrays.reduce((s,a)=>s+a.length,0));
 let i=0;for(const a of arrays){out.set(a,i);i+=a.length;}return out;
};
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const now=()=>Date.now();
const defaultPreferences={newDemands:true,deadlines:true,overdue:true};
const preferencesFor=row=>({
 newDemands:row?row.new_demands===1:true,
 deadlines:row?row.deadlines===1:true,
 overdue:row?row.overdue===1:true
});
function endpointAllowed(endpoint){
 try{
  if(typeof endpoint!=="string"||endpoint.length>2500)return false;
  const url=new URL(endpoint),host=url.hostname.toLowerCase();
  const trusted=host==="fcm.googleapis.com"||
   host==="updates.push.services.mozilla.com"||host==="push.services.mozilla.com"||
   host==="web.push.apple.com"||host.endsWith(".push.apple.com")||
   host.endsWith(".notify.windows.com");
  return url.protocol==="https:"&&url.port===""&&url.username===""&&url.password===""&&
   !url.hash&&trusted;
 }catch{return false}
}
function checkSubscription(payload){
 const sub=payload?.subscription||payload;
 const endpoint=sub?.endpoint;
 if(!endpointAllowed(endpoint))fail("Este navegador não forneceu um serviço de notificações reconhecido.");
 const p256dh=String(sub?.keys?.p256dh||"");
 const auth=String(sub?.keys?.auth||"");
 let key,secret;
 try{key=unbase64url(p256dh);secret=unbase64url(auth)}catch{fail("As chaves de notificação do navegador são inválidas.")}
 if(key.length!==65||key[0]!==4||secret.length!==16)fail("As chaves de notificação não são compatíveis.");
 return {endpoint,p256dh,auth};
}
async function vapidKeys(db){
 let row=await db.prepare("SELECT public_key,private_key FROM web_push_vapid WHERE id=1").first();
 if(row)return row;
 const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const pub=base64url(await crypto.subtle.exportKey("raw",pair.publicKey));
 const priv=base64url(await crypto.subtle.exportKey("pkcs8",pair.privateKey));
 await db.prepare("INSERT OR IGNORE INTO web_push_vapid(id,public_key,private_key) VALUES(1,?,?)").bind(pub,priv).run();
 row=await db.prepare("SELECT public_key,private_key FROM web_push_vapid WHERE id=1").first();
 if(!row)throw Error("Não foi possível preparar a chave de notificações.");
 return row;
}
export async function webPushPublicKey(db){
 const keys=await vapidKeys(db);
 return {publicKey:keys.public_key};
}
export async function webPushStatus(db,user){
 const [prefs,devices]=await Promise.all([
  db.prepare("SELECT new_demands,deadlines,overdue FROM web_push_preferences WHERE user_id=?").bind(user.id).first(),
  db.prepare("SELECT COUNT(*) AS total FROM web_push_subscriptions WHERE user_id=?").bind(user.id).first()
 ]);
 return {preferences:preferencesFor(prefs),registeredComputers:Number(devices?.total||0)};
}
export async function webPushCheck(db,user,payload){
 const endpoint=String(payload?.endpoint||"");
 if(!endpointAllowed(endpoint))return {connected:false};
 const row=await db.prepare("SELECT id FROM web_push_subscriptions WHERE user_id=? AND endpoint=?").bind(user.id,endpoint).first();
 return {connected:!!row};
}
export async function webPushSavePreferences(db,user,payload){
 const current=(await webPushStatus(db,user)).preferences;
 const prefs={...current};
 for(const k of Object.keys(defaultPreferences)){
  if(payload?.[k]!==undefined){
   if(typeof payload[k]!=="boolean")fail("Preferência de notificação inválida.");
   prefs[k]=payload[k];
  }
 }
 await db.prepare("INSERT INTO web_push_preferences(user_id,new_demands,deadlines,overdue,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET new_demands=excluded.new_demands,deadlines=excluded.deadlines,overdue=excluded.overdue,updated_at=excluded.updated_at")
  .bind(user.id,Number(prefs.newDemands),Number(prefs.deadlines),Number(prefs.overdue),stamp()).run();
 return webPushStatus(db,user);
}
export async function webPushSubscribe(db,user,payload){
 if(user.must_change_password)fail("Altere sua senha temporária antes de ativar os avisos.",403);
 const sub=checkSubscription(payload);
 // O navegador pertence apenas à conta atualmente ativa: evita vazamento entre logins.
 await db.prepare("INSERT INTO web_push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at")
  .bind(crypto.randomUUID(),user.id,sub.endpoint,sub.p256dh,sub.auth,stamp(),stamp()).run();
 return {ok:true};
}
export async function webPushUnsubscribe(db,user,payload){
 const endpoint=String(payload?.endpoint||"");
 if(!endpointAllowed(endpoint))fail("Inscrição de notificações inválida.");
 await db.prepare("DELETE FROM web_push_subscriptions WHERE user_id=? AND endpoint=?").bind(user.id,endpoint).run();
 return {ok:true};
}
async function hmac(key,data){
 const secret=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return new Uint8Array(await crypto.subtle.sign("HMAC",secret,data));
}
async function encrypt(sub,message){
 const uaPublic=unbase64url(sub.p256dh),auth=unbase64url(sub.auth);
 const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 const asPublic=new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey));
 const uaKey=await crypto.subtle.importKey("raw",uaPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:uaKey},pair.privateKey,256));
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const keyInfo=join(enc.encode("WebPush: info"),new Uint8Array([0]),uaPublic,asPublic,new Uint8Array([1]));
 const keyMaterial=await hmac(await hmac(auth,secret),keyInfo);
 const prk=await hmac(salt,keyMaterial);
 const cek=(await hmac(prk,join(enc.encode("Content-Encoding: aes128gcm"),new Uint8Array([0,1])))).slice(0,16);
 const nonce=(await hmac(prk,join(enc.encode("Content-Encoding: nonce"),new Uint8Array([0,1])))).slice(0,12);
 const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
 const plain=join(enc.encode(JSON.stringify(message)),new Uint8Array([2]));
 if(plain.length>3900)throw Error("Notificação muito extensa.");
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},key,plain));
 const header=join(salt,new Uint8Array([0,0,16,0,65]),asPublic);
 return join(header,cipher);
}
async function vapidAuthorization(db,endpoint){
 const keys=await vapidKeys(db),origin=new URL(endpoint).origin;
 const payload=base64url(enc.encode(JSON.stringify({aud:origin,exp:Math.floor(now()/1000)+3600,sub:"https://peteducacao.github.io/pet-gestao/"})));
 const header=base64url(enc.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
 const jwt=header+"."+payload;
 const key=await crypto.subtle.importKey("pkcs8",unbase64url(keys.private_key),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
 const sig=base64url(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(jwt)));
 return "vapid t="+jwt+"."+sig+", k="+keys.public_key;
}
export async function deliverWebPush(db,sub,message){
 if(!endpointAllowed(sub.endpoint))return {status:"invalid"};
 const body=await encrypt(sub,message);
 const res=await fetch(sub.endpoint,{
  method:"POST",
  headers:{"Content-Type":"application/octet-stream","Content-Encoding":"aes128gcm",
   "TTL":"86400","Authorization":await vapidAuthorization(db,sub.endpoint)},
  body
 });
 if(res.ok)return {status:"accepted"};
 if([404,410].includes(res.status))return {status:"invalid"};
 throw Error("Serviço de notificações recusou o aviso ("+res.status+").");
}
export async function webPushTest(env,user,payload){
 const endpoint=String(payload?.endpoint||"");
 if(!endpointAllowed(endpoint))fail("Este computador não possui uma inscrição de notificações válida.");
 const sub=await env.DB.prepare("SELECT * FROM web_push_subscriptions WHERE user_id=? AND endpoint=?").bind(user.id,endpoint).first();
 if(!sub)fail("Ative as notificações neste computador antes de testar.",409);
 const key="web-test|"+sub.id+"|"+Math.floor(now()/120000);
 const claimed=await env.DB.prepare("INSERT OR IGNORE INTO web_push_log(dedupe_key,subscription_id,created_at) VALUES(?,?,?)").bind(key,sub.id,stamp()).run();
 if(!claimed.meta?.changes)fail("Aguarde dois minutos antes de outro teste neste computador.",429);
 try{
  const result=await deliverWebPush(env.DB,sub,{
   title:"PET Gestão • Notificações ativadas",
   body:"Teste recebido! Este computador está pronto para receber avisos.",
   route:"/inicio",kind:"test"
  });
  if(result.status==="invalid"){
   await env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id=?").bind(sub.id).run();
   fail("A inscrição deste navegador expirou. Ative as notificações novamente.",409);
  }
  return {ok:true,acceptedByService:true};
 }catch(error){
  await env.DB.prepare("DELETE FROM web_push_log WHERE dedupe_key=?").bind(key).run();
  if(error.status)throw error;
  console.error("PET Gestão — erro no teste Web Push:",String(error.message||error).slice(0,150));
  fail("Não foi possível enviar a notificação ao serviço deste navegador.",503);
 }
}
export async function notifyBrowserUsers(env,userIds,message,preference,dedupe){
 const members=[...new Set(userIds.map(String).filter(Boolean))].slice(0,300);
 if(!members.length)return 0;
 const column=preference==="newDemands"?"new_demands":preference==="overdue"?"overdue":"deadlines";
 const clause=preference?" AND COALESCE(p."+column+",1)=1":"";
 const rows=(await env.DB.prepare("SELECT s.* FROM web_push_subscriptions s LEFT JOIN web_push_preferences p ON p.user_id=s.user_id WHERE s.user_id IN ("+
  members.map(()=>"?").join(",")+")"+clause+" LIMIT 300").bind(...members).all()).results;
 let delivered=0;
 for(const sub of rows){
  let key=null;
  try{
   if(dedupe){
    key=dedupe+"|"+sub.id;
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO web_push_log(dedupe_key,subscription_id,created_at) VALUES(?,?,?)").bind(key,sub.id,stamp()).run();
    if(!claim.meta?.changes)continue;
   }
   const result=await deliverWebPush(env.DB,sub,message);
   if(result.status==="accepted")delivered++;
   if(result.status==="invalid"){
    await env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id=?").bind(sub.id).run();
   }
  }catch(error){
   if(key)await env.DB.prepare("DELETE FROM web_push_log WHERE dedupe_key=?").bind(key).run().catch(()=>{});
   console.error("PET Gestão — web push indisponível:",String(error.message||error).slice(0,150));
  }
 }
 return delivered;
}
