/* US Heffingen: Offline-Kopie der App. Immer zuerst aus dem Netz laden (damit Updates sofort da sind),
   nur ohne Verbindung die gespeicherte Kopie zeigen. Daten von Supabase werden nicht zwischengespeichert. */
var C='ush-v1';
self.addEventListener('install',function(e){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n!==C}).map(function(n){return caches.delete(n)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var r=e.request; if(r.method!=='GET') return;
  var u=new URL(r.url); if(u.origin!==location.origin) return;
  e.respondWith(fetch(r).then(function(res){if(res&&res.ok){var c=res.clone();caches.open(C).then(function(x){x.put(r,c)})}return res})
    .catch(function(){return caches.match(r,{ignoreSearch:true}).then(function(m){return m||(r.mode==='navigate'?caches.match('./index.html').then(function(i){return i||caches.match('./')}):Response.error())})}));
});
