// Network-first service worker: online the app always loads the latest files, offline it falls back
// to the copies saved at the last online visit. No version number to bump on deploy.
// shortcut: only same-origin files are cached (Firebase SDK and card images are not), fine until
// login or images must work offline.
var CACHE = 'op-shell';
var FILES = ['./', 'index.html', 'logic.js', 'card-catalog.json', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // no-cache: revalidate with the server instead of trusting the 10-minute GitHub Pages cache
    fetch(req, { cache: 'no-cache' }).then(function(res){
      if(res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
      return res;
    }).catch(function(){
      return caches.match(req, { ignoreSearch: true });
    })
  );
});
