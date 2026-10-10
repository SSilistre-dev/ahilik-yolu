// Bump V together with ?v= in index.html (done at merge time).
// SHELL (html, modules, css) is renewed on every V. ASSETS (models, cards, sounds, CDN three) is keyed by
// ASSETS_REV from the generated precache.js, so a V bump does not re-download the ~5 MB of assets; it only
// re-downloads when asset contents change (accepted cost: an image replaced under the same name changes the rev).
importScripts('./precache.js');
const V = 15;
const SHELL = `ahilik-shell-v${V}`;
const ASSETS = `ahilik-assets-${self.ASSETS_REV}`;
const NET_TIMEOUT = 3000;
const SCOPE = new URL('./', location).pathname;
const shellUrls = ['./', './index.html', './manifest.webmanifest', ...self.SHELL_FILES.map((f) => `./${f}?v=${V}`)];

// Only the small shell is cached on install; the big assets come later via the PRECACHE message (src/pwa.js).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(shellUrls)).then(() => self.skipWaiting()));
});

// Delete only our own stale caches (old ahilik-v*, older shell/assets); never another app's.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('ahilik-') && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ponytail: 4 lanes, no retry; a failed file is reported as "missing" and retried on the next PRECACHE.
async function precacheAssets() {
  const c = await caches.open(ASSETS);
  const all = [...self.ASSET_URLS.map((u) => `./${u}`), ...self.CDN_URLS];
  const todo = [];
  for (const u of all) if (!(await c.match(u))) todo.push(u);
  let i = 0;
  const lane = async () => {
    while (i < todo.length) {
      const u = todo[i++];
      try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch { /* one failed file must not stop the rest */ }
    }
  };
  await Promise.all([lane(), lane(), lane(), lane()]);
  let missing = 0;
  for (const u of all) if (!(await c.match(u))) missing++;
  return { total: all.length, missing };
}

self.addEventListener('message', (e) => {
  if (e.data?.type === 'PRECACHE') e.waitUntil(precacheAssets().then((r) => e.source?.postMessage({ type: 'PRECACHE_DONE', ...r })));
});

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

// Documents: fresh when the network answers within NET_TIMEOUT, cached copy otherwise.
async function networkFirst(e) {
  const c = await caches.open(SHELL);
  try {
    const r = await withTimeout(fetch(e.request), NET_TIMEOUT);
    if (r.ok) e.waitUntil(c.put(e.request, r.clone()).catch(() => {}));
    return r;
  } catch (err) {
    return (await c.match(e.request, { ignoreSearch: true })) || (await c.match('./index.html')) || Promise.reject(err);
  }
}

// Modules/styles (SHELL) and assets/CDN (ASSETS). A full store (QuotaExceeded) must not break the game.
async function cacheFirst(e, name) {
  const c = await caches.open(name);
  const hit = await c.match(e.request);
  if (hit) return hit;
  const r = await fetch(e.request);
  if (r.ok) e.waitUntil(c.put(e.request, r.clone()).catch(() => {}));
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (!u.pathname.startsWith(SCOPE)) return;
    const rel = u.pathname.slice(SCOPE.length);
    if (/^(api|ws)\//.test(rel)) return; // online mode: API/WebSocket traffic bypasses the SW (ARCHITECTURE.md section 11)
    const isDoc = req.mode === 'navigate' || rel === '' || rel === 'index.html';
    e.respondWith(isDoc ? networkFirst(e) : cacheFirst(e, rel.startsWith('assets/') ? ASSETS : SHELL));
  } else if (u.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(e, ASSETS));
  }
});
