// Offline: aplikacija radi i bez interneta (osim videa).
const C = 'markfit-v2';
const CORE = ['./', 'index.html', 'app.js', 'data.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/img/')) {
    // slike: iz keša, a ako nisu tu – skini i zapamti
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const c = n.clone(); caches.open(C).then(x => x.put(e.request, c)); return n; })));
  } else {
    // kod: uvek najnovija verzija kad ima interneta, inače iz keša
    e.respondWith(fetch(e.request).then(n => { const c = n.clone(); caches.open(C).then(x => x.put(e.request, c)); return n; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
