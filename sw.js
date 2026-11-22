// Armazena somente arquivos estáticos públicos. Nunca armazena API, conta ou anexos.
const CACHE_NAME="pet-gestao-public-shell-v20261122-cron-confirmacao-v4";
const FILES=["./","./index.html","./styles.css","./live.css","./app-live.js",
 "./site.webmanifest","./assets/gestao-icon.svg","./assets/favicon.svg",
 "./assets/pet-gestao-180.png","./assets/pet-gestao-192.png","./assets/pet-gestao-512.png",
 "./assets/pet-gestao-maskable-192.png","./assets/pet-gestao-maskable-512.png"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys
  .filter(key=>key.startsWith("pet-gestao-public-shell-")&&key!==CACHE_NAME)
  .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 const scopePath=new URL(self.registration.scope).pathname;
 if(url.origin!==self.location.origin||!url.pathname.startsWith(scopePath))return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).catch(async()=>{
   const cache=await caches.open(CACHE_NAME);
   return (await cache.match("./index.html"))||Response.error();
  }));
  return;
 }
 // Apenas arquivos estáticos sem dados dos usuários.
 if(!/\.(?:css|js|webmanifest|svg|png)$/i.test(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));}
  return response;
 }).catch(()=>caches.match(request)));
});


// Notificações persistentes: o navegador pode estar fechado, desde que o serviço
// de push do sistema operacional continue ativo.
self.addEventListener("push",event=>{
 event.waitUntil((async()=>{
  if(!event.data)return;
  let payload;
  try{payload=event.data.json()}catch{return}
  if(!payload||typeof payload!=="object")return;
  const title=String(payload.title||"PET Gestão").slice(0,100);
  const message=String(payload.body||"Novo aviso do PET Gestão.").slice(0,250);
  const route=String(payload.route||"/inicio");
  const safe=/^\/(?:inicio|atividade\/[A-Za-z0-9_-]{1,100}|minhas-pendencias|meus-lembretes|cronograma)$/.test(route)?route:"/inicio";
  const url=new URL("./#"+safe,self.registration.scope).href;
  await self.registration.showNotification(title,{
   body:message,
   icon:new URL("./assets/pet-gestao-192.png",self.registration.scope).href,
   badge:new URL("./assets/pet-gestao-192.png",self.registration.scope).href,
   tag:"pet-gestao-"+String(payload.kind||"aviso")+"-"+safe+"-"+String(payload.noticeId||"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,60),
   data:{url}
  });
 })());
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const target=event.notification.data?.url||new URL("./#/inicio",self.registration.scope).href;
  const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
  for(const tab of windows){
   if(new URL(tab.url).origin===self.location.origin&&
      new URL(tab.url).pathname.startsWith(new URL(self.registration.scope).pathname)){
    await tab.navigate(target);await tab.focus();return;
   }
  }
  await clients.openWindow(target);
 })());
});
