// Armazena somente arquivos estáticos públicos. Nunca armazena API, conta ou anexos.
const CACHE_NAME="pet-gestao-public-shell-v20261111-06";
const FILES=["./","./index.html","./styles.css","./live.css","./app-live.js",
 "./site.webmanifest","./assets/gestao-icon.svg","./assets/pet-gestao-192.png","./assets/pet-gestao-512.png",
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
