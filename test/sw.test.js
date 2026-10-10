// Service worker behaviour (AHI-036/037): sw.js runs in a node:vm sandbox with a fake Cache Storage.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const ORIGIN = 'http://sw.test', BASE = `${ORIGIN}/ahilik/`;

function fakeCaches(doFetch) {
  const stores = new Map();
  const key = (r, o = {}) => { const u = new URL(typeof r === 'string' ? r : r.url, BASE); if (o.ignoreSearch) u.search = ''; return u.href; };
  const mk = (name) => ({
    name,
    put: async (r, res) => { stores.get(name).set(key(r), res); },
    match: async (r, o) => { for (const [k, v] of stores.get(name)) if (k === key(r, o) || (o?.ignoreSearch && key(k, o) === key(r, o))) return v.clone(); },
    keys: async () => [...stores.get(name).keys()],
    addAll: async (urls) => { for (const u of urls) stores.get(name).set(key(u), await doFetch(u)); },
  });
  return {
    stores,
    open: async (n) => { if (!stores.has(n)) stores.set(n, new Map()); return mk(n); },
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (r, o) => { for (const n of o?.cacheName ? [o.cacheName] : stores.keys()) { const h = stores.has(n) && await mk(n).match(r, o); if (h) return h; } },
  };
}

function load(fetchImpl = async () => new Response('net')) {
  const handlers = {}, caches = fakeCaches((u) => ctx.fetchImpl(new URL(u, BASE).href));
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, clients: { claim: async () => {} }, skipWaiting: async () => {} };
  const ctx = {
    self, caches, fetch: (...a) => ctx.fetchImpl(...a), fetchImpl, Request, Response, URL, Promise, Map,
    location: new URL(`${BASE}sw.js`), setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a),
    importScripts: () => vm.runInContext(readFileSync(`${root}precache.js`, 'utf8'), ctx),
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(`${root}sw.js`, 'utf8'), ctx);
  return { handlers, caches, ctx, self };
}

// Fire an event; resolves {responded, response, waits}.
async function fire(h, type, ev) {
  const waits = []; let responded = false, response;
  h[type]({ ...ev, respondWith: (p) => { responded = true; response = p; }, waitUntil: (p) => waits.push(p) });
  const out = { responded, waits };
  if (responded) out.response = await response;
  await Promise.all(waits);
  return out;
}
const get = (path, extra = {}) => ({ request: Object.assign(new Request(`${ORIGIN}${path}`), extra) });
const shellName = (ctx) => vm.runInContext('SHELL', ctx);
const assetsName = (ctx) => vm.runInContext('ASSETS', ctx);

test('sw: /api/ and /ws/ requests never reach respondWith', async () => {
  const { handlers } = load();
  for (const p of ['/ahilik/api/rooms', '/ahilik/ws/ABC123']) assert.equal((await fire(handlers, 'fetch', get(p))).responded, false, p);
});

test('sw: non-GET and out-of-scope requests are ignored', async () => {
  const { handlers } = load();
  assert.equal((await fire(handlers, 'fetch', { request: new Request(`${BASE}x`, { method: 'POST', body: 'a' }) })).responded, false);
  assert.equal((await fire(handlers, 'fetch', get('/other/x.js'))).responded, false);
});

test('sw: networkFirst falls back to cached index.html after 3000 ms of silence', async () => {
  const { handlers, caches, ctx } = load(() => new Promise(() => {}));
  const c = await caches.open(shellName(ctx));
  await c.put(`${BASE}index.html`, new Response('cached-doc'));
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const done = fire(handlers, 'fetch', get('/ahilik/index.html'));
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(2999); await new Promise((r) => setImmediate(r));
    let early = false; done.then(() => { early = true; }); await new Promise((r) => setImmediate(r));
    assert.equal(early, false, 'must still wait at 2999 ms');
    mock.timers.tick(1);
    const out = await done;
    assert.equal(await out.response.text(), 'cached-doc');
  } finally { mock.timers.reset(); }
});

test('sw: networkFirst stores a fresh response through waitUntil exactly once', async () => {
  const { handlers, caches, ctx } = load(async () => new Response('fresh'));
  const out = await fire(handlers, 'fetch', get('/ahilik/index.html'));
  assert.equal(await out.response.text(), 'fresh');
  assert.equal(out.waits.length, 1);
  assert.equal(await (await (await caches.open(shellName(ctx))).match(`${BASE}index.html`)).text(), 'fresh');
});

test('sw: cacheFirst serves from cache without network; on miss fetches and stores via waitUntil', async () => {
  let calls = 0;
  const { handlers, caches, ctx } = load(async () => { calls++; return new Response('png'); });
  await (await caches.open(assetsName(ctx))).put(`${BASE}assets/cards/a.jpg`, new Response('cached'));
  const hit = await fire(handlers, 'fetch', get('/ahilik/assets/cards/a.jpg'));
  assert.equal(await hit.response.text(), 'cached'); assert.equal(calls, 0);
  const miss = await fire(handlers, 'fetch', get('/ahilik/assets/cards/b.jpg'));
  assert.equal(await miss.response.text(), 'png'); assert.equal(calls, 1); assert.equal(miss.waits.length, 1);
  assert.ok(await (await caches.open(assetsName(ctx))).match(`${BASE}assets/cards/b.jpg`));
});

test('sw: a failing cache write (quota) does not break the response', async () => {
  const { handlers, caches, ctx } = load(async () => new Response('ok'));
  const c = await caches.open(assetsName(ctx));
  const orig = caches.open; caches.open = async (n) => { const x = await orig(n); x.put = async () => { throw new Error('QuotaExceededError'); }; return x; };
  void c;
  const out = await fire(handlers, 'fetch', get('/ahilik/assets/cards/q.jpg'));
  assert.equal(await out.response.text(), 'ok');
});

test('sw: opaque responses are not stored', async () => {
  const { handlers, caches, ctx } = load(async () => { const r = new Response('x'); Object.defineProperty(r, 'type', { value: 'opaque' }); Object.defineProperty(r, 'ok', { value: false }); return r; });
  const out = await fire(handlers, 'fetch', { request: new Request('https://cdn.jsdelivr.net/npm/x.js') });
  assert.ok(out.responded);
  assert.equal(await (await caches.open(assetsName(ctx))).keys().then((k) => k.length), 0);
});

test('sw: CDN GET is cache-first in the assets cache', async () => {
  const { handlers, caches, ctx } = load(async () => new Response('three'));
  const u = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  await fire(handlers, 'fetch', { request: new Request(u) });
  assert.ok(await (await caches.open(assetsName(ctx))).match(u));
});

test('sw: activate deletes only stale ahilik- caches', async () => {
  const { handlers, caches, ctx } = load();
  for (const n of ['ahilik-v13', 'ahilik-shell-v1', 'ahilik-assets-eski', shellName(ctx), assetsName(ctx), 'baska-uygulama']) await caches.open(n);
  await fire(handlers, 'activate', {});
  assert.deepEqual([...await caches.keys()].sort(), [assetsName(ctx), shellName(ctx), 'baska-uygulama'].sort());
});

test('sw: install caches the shell only; PRECACHE message fills assets and reports', async () => {
  const seen = [];
  const { handlers, caches, ctx } = load(async (u) => { seen.push(String(u.url ?? u)); return new Response('b'); });
  await fire(handlers, 'install', {});
  const shell = await (await caches.open(shellName(ctx))).keys();
  assert.ok(shell.some((k) => k.endsWith('/index.html')));
  assert.ok(shell.every((k) => !k.includes('/assets/')));
  assert.equal(seen.filter((u) => u.includes('/assets/')).length, 0);
  let msg;
  await fire(handlers, 'message', { data: { type: 'PRECACHE' }, source: { postMessage: (m) => { msg = m; } } });
  const n = vm.runInContext('self.ASSET_URLS.length + self.CDN_URLS.length', ctx);
  assert.equal((await (await caches.open(assetsName(ctx))).keys()).length, n);
  assert.deepEqual(JSON.parse(JSON.stringify(msg)), { type: 'PRECACHE_DONE', total: n, missing: 0 });
});

test('sw: PRECACHE tolerates single-file failures and skips what is cached', async () => {
  let fail = true;
  const { handlers, caches, ctx } = load(async (u) => { if (fail && String(u).includes('Knight.glb')) throw new Error('net'); return new Response('b'); });
  let msg;
  const src = { postMessage: (m) => { msg = m; } };
  await fire(handlers, 'message', { data: { type: 'PRECACHE' }, source: src });
  assert.equal(msg.missing, 1);
  fail = false; let refetch = 0; ctx.fetchImpl = async () => { refetch++; return new Response('b'); };
  await fire(handlers, 'message', { data: { type: 'PRECACHE' }, source: src });
  assert.equal(msg.missing, 0); assert.equal(refetch, 1);
  void caches;
});

// pwa.js: PRECACHE is requested when idle on a normal connection, never with data saver / 2g.
async function pwaRun(connection) {
  const posted = [], g = globalThis, saved = {};
  const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(g, k); Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); };
  set('matchMedia', () => ({ matches: false }));
  set('screen', {});
  set('location', { protocol: 'https:', hostname: 'x.test' });
  set('document', { readyState: 'complete' });
  set('addEventListener', () => {});
  set('window', { requestIdleCallback: (f) => f() });
  set('navigator', { onLine: true, connection, serviceWorker: { register: async () => ({}), ready: Promise.resolve({ active: { postMessage: (m) => posted.push(m) } }) } });
  try {
    const { initPwa } = await import('../src/pwa.js');
    initPwa();
    await new Promise((r) => setTimeout(r, 20));
  } finally { for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } }
  return posted;
}

test('sw: pwa sends PRECACHE on a normal connection', async () => {
  assert.deepEqual(await pwaRun({ saveData: false, effectiveType: '4g' }), [{ type: 'PRECACHE' }]);
});

test('sw: pwa skips PRECACHE with data saver or 2g', async () => {
  assert.deepEqual(await pwaRun({ saveData: true, effectiveType: '4g' }), []);
  assert.deepEqual(await pwaRun({ saveData: false, effectiveType: '2g' }), []);
});
