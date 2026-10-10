// Bump V together with ?v= in index.html.
const V = 15;
const CACHE = `ahilik-v${V}`;
const PRECACHE = [
  './', './index.html', `./style.css?v=${V}`, './manifest.webmanifest',
  ...['main', 'data', 'game', 'bot', 'path', 'scene', 'ui', 'tutorial', 'sfx', 'assets', 'botstep'].map((m) => `./src/${m}.js?v=${V}`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    return (await c.match(req, { ignoreSearch: true })) || Promise.reject(err);
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (!u.pathname.startsWith(new URL('./', location).pathname)) return;
    const isDoc = req.mode === 'navigate' || u.pathname.endsWith('/index.html') || u.pathname.endsWith('/');
    e.respondWith(isDoc ? networkFirst(req) : cacheFirst(req));
  } else if (u.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(req));
  }
});
