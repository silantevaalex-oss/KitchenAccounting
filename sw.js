const CACHE_PREFIX='kitchen-accounting-shell-';
const CACHE=CACHE_PREFIX+'v1';
const APP_SHELL=[
 './','./index.html','./styles.css?v=136','./app.js?v=136',
 './js/core.js','./js/reports.js','./js/storage.js','./js/sync-merge.js','./js/journal.js','./js/google-sheets.js','./js/tech-cards.js',
 './manifest.webmanifest','./icon.svg'
];

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all(APP_SHELL.map(async url=>{
   try{const response=await fetch(url,{cache:'no-store'});if(response.ok)await cache.put(url,response)}catch(_){}
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   // Network-first keeps the app current online; Cache Storage is the offline fallback.
   const response=await fetch(request,{cache:'no-store'});
   if(response&&response.ok)await cache.put(request,response.clone());
   return response;
  }catch(_){
   const cached=await cache.match(request)||await cache.match('./index.html')||await cache.match('./');
   return cached||new Response('Приложение ещё не сохранено для работы без интернета. Откройте его один раз при подключённом интернете.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
 })());
});
