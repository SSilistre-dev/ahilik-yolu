import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createApp, originAllowed, clientIp } from '../server/index.js';

const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const fakeHub = { has: () => false, close() {} };

// bellek içi sahte hub: create/info kayıt tutar, çağrıları sayar
function memHub({ max = 500, taken = [] } = {}) {
  const set = new Set(taken);
  const h = { creates: [], infos: [], has: c => set.has(c), close() {},
    create(c) { h.creates.push(c); if (set.has(c)) return 'exists'; if (set.size >= max) return 'full'; set.add(c); return 'created'; },
    info(c) { h.infos.push(c); return set.has(c) ? { exists: true, phase: 'lobby', humans: 2, capacity: 6, joinable: true } : { exists: false }; } };
  return h;
}

async function withServer(fn, { hub = fakeHub, ...opts } = {}) {
  const app = createApp({ hub, ...opts });
  const srv = http.createServer(app.handle);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // http.request: fetch yol normalleştirir (/../ gibi), ham yol gerekir.
  const req = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject); r.end();
  });
  try { await fn(req); } finally { srv.closeAllConnections(); await new Promise(r => srv.close(r)); }
}

test('http: GET /api/health 200 ve ok:true', () => withServer(async req => {
  const r = await req('/api/health');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^application\/json; charset=utf-8/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(r.body).ok, true);
}));

test('http: POST /api/health 405 ve Allow başlığı', () => withServer(async req => {
  const r = await req('/api/health', { method: 'POST' });
  assert.equal(r.status, 405);
  assert.equal(r.headers.allow, 'GET');
}));

test('http: bilinmeyen /api yolu 404 JSON', () => withServer(async req => {
  const r = await req('/api/yok');
  assert.equal(r.status, 404);
  assert.deepEqual(JSON.parse(r.body), { error: 'notFound' });
}));

test('statik: GET / index.html döner (200, text/html)', () => withServer(async req => {
  const r = await req('/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/html/);
  assert.equal(r.body.toString(), rd('index.html'));
}));

test('statik: beyaz liste dışı yollar 404 (server/, test/, docs/, AGENTS.md, SPEC.md, Makefile, Dockerfile, .git/config, *.pdf)', () => withServer(async req => {
  for (const p of ['/server/index.js', '/server/hub.js', '/test/http.test.js', '/docs/ARCHITECTURE.md', '/AGENTS.md', '/SPEC.md', '/README.md',
    '/Makefile', '/Dockerfile', '/docker-compose.yml', '/.git/config', '/.gitignore', '/Kural.pdf', '/dev/precache-gen.mjs', '/src', '/src/', '/assets', '/assets/', '/yok.html']) {
    assert.equal((await req(p)).status, 404, p);
  }
  assert.equal((await req('/assets/LICENSES.md')).status, 200);
}));

test('statik: yol gezintisi reddedilir (/../, /%2e%2e/, /src/..%2fserver/hub.js, %252e, NUL, ters eğik çizgi, //evil.example/x)', () => withServer(async req => {
  for (const p of ['/../', '/../package.json', '/%2e%2e/', '/%2e%2e/server/index.js', '/src/..%2fserver/hub.js', '/src/%2e%2e/server/hub.js',
    '/src/%252e%252e/server/hub.js', '/src/game.js%00', '/src/%00.js', '/src\\game.js', '/src/..\\server\\hub.js', '//evil.example/x', '//index.html', '/src/../server/hub.js',
    '/src/%ZZ', '/assets/%2e%2e/%2e%2e/etc/passwd']) {
    const s = (await req(p)).status;
    assert.ok(s === 404 || s === 400, `${p} -> ${s}`);
  }
}));

test('statik: ?v= sorgusu yok sayılır ve Content-Type doğru (.js, .css, .webmanifest, .png, .glb, .m4a)', () => withServer(async req => {
  const js = await req('/src/main.js?v=16');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /^text\/javascript/);
  assert.equal(js.headers['x-content-type-options'], 'nosniff');
  assert.equal(js.headers['referrer-policy'], 'no-referrer');
  assert.match((await req('/style.css?v=1')).headers['content-type'], /^text\/css/);
  assert.match((await req('/manifest.webmanifest')).headers['content-type'], /^application\/manifest\+json/);
  assert.equal((await req('/assets/sfx/click.m4a')).headers['content-type'], 'audio/mp4');
  const png = await req('/assets/icons/' + (await findAsset('png')));
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal((await req('/assets/models/' + (await findAsset('glb', 'models')))).headers['content-type'], 'model/gltf-binary');
}));

import { readdirSync } from 'node:fs';
async function findAsset(ext, dir = 'icons') {
  const f = readdirSync(new URL('../assets/' + dir + '/', import.meta.url)).find(n => n.endsWith('.' + ext));
  assert.ok(f, `assets/${dir} içinde .${ext} yok`);
  return f;
}

test('statik: Cache-Control sw.js ve index.html için no-cache; ETag ve If-None-Match 304', () => withServer(async req => {
  for (const p of ['/sw.js', '/', '/manifest.webmanifest', '/src/game.js', '/style.css']) {
    const r = await req(p);
    assert.equal(r.headers['cache-control'], 'no-cache', p);
    assert.match(r.headers.etag, /^W\/"\d+-\d+(\.\d+)?"$/, p);
    const r2 = await req(p, { headers: { 'if-none-match': r.headers.etag } });
    assert.equal(r2.status, 304, p);
    assert.equal(r2.body.length, 0);
  }
  assert.equal((await req('/assets/sfx/click.m4a')).headers['cache-control'], 'public, max-age=86400');
}));

test('statik: HEAD gövdesiz, POST 405', () => withServer(async req => {
  const h = await req('/sw.js', { method: 'HEAD' });
  assert.equal(h.status, 200);
  assert.equal(h.body.length, 0);
  assert.equal(Number(h.headers['content-length']), Buffer.byteLength(rd('sw.js')));
  const p = await req('/sw.js', { method: 'POST' });
  assert.equal(p.status, 405);
  assert.equal(p.headers.allow, 'GET, HEAD');
}));

test('statik: Range 206 ve Content-Range, geçersiz aralık 416', () => withServer(async req => {
  const full = await req('/assets/sfx/click.m4a');
  const r = await req('/assets/sfx/click.m4a', { headers: { range: 'bytes=0-99' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers['accept-ranges'], 'bytes');
  assert.equal(r.headers['content-range'], `bytes 0-99/${full.body.length}`);
  assert.deepEqual(r.body, full.body.subarray(0, 100));
  const tail = await req('/assets/sfx/click.m4a', { headers: { range: 'bytes=-10' } });
  assert.equal(tail.status, 206);
  assert.deepEqual(tail.body, full.body.subarray(full.body.length - 10));
  for (const bad of [`bytes=${full.body.length + 5}-`, 'bytes=9-2', 'bytes=0-1,5-6', 'bytes=abc']) {
    const b = await req('/assets/sfx/click.m4a', { headers: { range: bad } });
    assert.equal(b.status, 416, bad);
    assert.equal(b.headers['content-range'], `bytes */${full.body.length}`);
  }
}));

test('docker: Dockerfile node:22-alpine, USER node, npm ci --omit=dev ve HEALTHCHECK içeriyor', () => {
  const d = rd('Dockerfile');
  assert.match(d, /^FROM node:22-alpine$/m);
  assert.match(d, /^USER node$/m);
  assert.match(d, /npm ci --omit=dev/);
  assert.match(d, /^HEALTHCHECK /m);
  assert.match(d, /server\/package-lock\.json/);
});

test('docker: .dockerignore test, docs, .wt, assets-src, pdf, dev, .git ve node_modules içeriyor', () => {
  const lines = rd('.dockerignore').split('\n').map(s => s.trim());
  for (const x of ['test', 'docs', '.wt', 'assets-src', '*.pdf', 'dev', '.git', 'node_modules']) assert.ok(lines.includes(x), x);
});

test('compose: server servisi, 8080 portu, /data birimi ve node_modules anonim birimi var', () => {
  const c = rd('docker-compose.yml');
  assert.match(c, /^ {2}server:/m);
  assert.match(c, /\$\{PORT:-8080\}:8080/);
  assert.match(c, /ahilik-data:\/data/);
  assert.match(c, /- \/app\/server\/node_modules/);
});

test('package: server/package.json type module, tek bağımlılık ws, sabit sürüm', () => {
  const p = JSON.parse(rd('server/package.json'));
  assert.equal(p.type, 'module');
  assert.deepEqual(Object.keys(p.dependencies), ['ws']);
  assert.match(p.dependencies.ws, /^\d+\.\d+\.\d+$/);
});

test('Makefile: dev-online ve test-srv hedefleri var, olc server/*.js denetliyor', () => {
  const m = rd('Makefile');
  assert.match(m, /^dev-online:/m);
  assert.match(m, /^test-srv:/m);
  assert.match(m, /server\/\*\.js/);
});

// --- N09: origin ve ws yolu ---
test('origin: izinli prod, localhost, 127.0.0.1 geçer; başka origin 403; Origin yoksa geçer', () => {
  for (const o of ['https://ahilik.ssilistre.dev', 'capacitor://localhost', 'https://localhost', 'http://localhost', 'http://localhost:8080', 'http://127.0.0.1:3000', undefined, '']) {
    assert.equal(originAllowed(o), true, String(o));
  }
  for (const o of ['https://evil.example', 'http://ahilik.ssilistre.dev', 'null', 'http://localhost.evil.com', 'http://localhost:80a']) assert.equal(originAllowed(o), false, o);
  assert.equal(originAllowed('https://x.example', 'https://x.example, https://y.example'), true);
});

test('origin: önek tuzağı reddedilir', () => {
  for (const o of ['https://ahilik.ssilistre.dev.evil.com', 'https://ahilik.ssilistre.devx', 'http://localhost.evil.com:80', 'http://127.0.0.1.evil.com', 'capacitor://localhost.evil.com']) {
    assert.equal(originAllowed(o), false, o);
  }
});

test('ws yolu: Upgrade yoksa 426, kod biçimi hatalıysa 404', () => withServer(async req => {
  assert.equal((await req('/ws/K7M2QX')).status, 426);
  assert.equal((await req('/ws/ab')).status, 404);
  assert.equal((await req('/ws/K7M2Q0')).status, 404); // 0 alfabede yok
}));

// --- N10: oda API'si ---
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const jb = r => JSON.parse(r.body);
const post = req => req('/api/rooms', { method: 'POST' });

test('POST /api/rooms: 201 ve geçerli kod', () => {
  const hub = memHub();
  return withServer(async req => {
    const r = await post(req);
    assert.equal(r.status, 201);
    assert.match(jb(r).code, CODE_RE);
    assert.equal(hub.has(jb(r).code), true);
  }, { hub, env: {} });
});

test('POST /api/rooms: çakışmada yeni kod dener', () => {
  const hub = memHub({ taken: ['AAAAAA'] });
  const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]; // AAAAAA (dolu), sonra 6 kez alfabenin ortası
  let i = 0;
  return withServer(async req => {
    const r = await post(req);
    assert.equal(r.status, 201);
    assert.notEqual(jb(r).code, 'AAAAAA');
    assert.equal(hub.creates.length, 2);
  }, { hub, rand: () => seq[i++], env: {} });
});

test('POST /api/rooms: 5 çakışmada 503', () => {
  const hub = memHub();
  hub.create = c => (hub.creates.push(c), 'exists');
  return withServer(async req => {
    const r = await post(req);
    assert.equal(r.status, 503);
    assert.deepEqual(jb(r), { error: 'busy' });
    assert.equal(hub.creates.length, 5);
  }, { hub, env: {} });
});

test('POST /api/rooms: limit aşılınca 429 ve Retry-After', () => withServer(async req => {
  for (let i = 0; i < 10; i++) assert.equal((await post(req)).status, 201, 'istek ' + i);
  const r = await post(req);
  assert.equal(r.status, 429);
  assert.deepEqual(jb(r), { error: 'rate' });
  assert.ok(Number(r.headers['retry-after']) >= 1);
}, { hub: memHub(), env: {}, now: () => 0 }));

test('POST /api/rooms: GET ile 405', () => withServer(async req => {
  const r = await req('/api/rooms');
  assert.equal(r.status, 405);
  assert.equal(r.headers.allow, 'POST');
}, { hub: memHub() }));

test('POST /api/rooms: gövde > 1 KB ise 413', () => withServer(async req => {
  const r = await req('/api/rooms', { method: 'POST', headers: { 'content-length': '5000' } });
  assert.equal(r.status, 413);
  assert.deepEqual(jb(r), { error: 'tooBig' });
}, { hub: memHub(), env: {} }));

test('POST /api/rooms: MAX_ROOMS dolunca 503 busy', () => withServer(async req => {
  assert.equal((await post(req)).status, 201);
  assert.equal((await post(req)).status, 201);
  const r = await post(req);
  assert.equal(r.status, 503);
  assert.deepEqual(jb(r), { error: 'busy' });
}, { hub: memHub({ max: 2 }), env: {} }));

test('GET /api/rooms/:kod: var olan oda bilgisi, küçük harf kabul edilir', () => {
  const hub = memHub({ taken: ['K7M2QX'] });
  return withServer(async req => {
    for (const p of ['/api/rooms/K7M2QX', '/api/rooms/k7m2qx', '/api/rooms/k7m2qx%20']) {
      const r = await req(p);
      assert.equal(r.status, 200, p);
      assert.deepEqual(jb(r), { exists: true, phase: 'lobby', humans: 2, capacity: 6, joinable: true });
    }
    assert.equal(hub.infos[1], 'K7M2QX');
  }, { hub });
});

test('GET /api/rooms/:kod: olmayan oda exists:false, hub.create çağrılmaz', () => {
  const hub = memHub();
  return withServer(async req => {
    const r = await req('/api/rooms/ABCDEF');
    assert.equal(r.status, 200);
    assert.deepEqual(jb(r), { exists: false });
    assert.equal(hub.creates.length, 0);
  }, { hub });
});

test('GET /api/rooms/:kod: biçim hatası 400', () => withServer(async req => {
  for (const p of ['/api/rooms/ab', '/api/rooms/K7M2Q0', '/api/rooms/K7M2QXX', '/api/rooms/%ZZ', '/api/rooms/']) {
    const r = await req(p);
    assert.equal(r.status, 400, p);
    assert.deepEqual(jb(r), { error: 'badCode' });
  }
  assert.equal((await req('/api/rooms/ABCDEF/x')).status, 404);
  assert.equal((await req('/api/rooms/ABCDEF', { method: 'POST' })).headers.allow, 'GET');
}, { hub: memHub() }));

test('GET /api/rooms/:kod: sorgu limiti 429', () => withServer(async req => {
  for (let i = 0; i < 60; i++) assert.equal((await req('/api/rooms/ABCDEF')).status, 200);
  const r = await req('/api/rooms/ABCDEF');
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers['retry-after']) >= 1);
}, { hub: memHub(), now: () => 0 }));

test('API cevapları no-store ve JSON', () => withServer(async req => {
  for (const [p, m] of [['/api/rooms', 'POST'], ['/api/rooms/ABCDEF', 'GET'], ['/api/rooms/ab', 'GET'], ['/api/rooms', 'GET'], ['/api/rooms/ABCDEF', 'DELETE']]) {
    const r = await req(p, { method: m });
    assert.equal(r.headers['cache-control'], 'no-store', p);
    assert.match(r.headers['content-type'], /^application\/json; charset=utf-8$/, p);
  }
}, { hub: memHub(), env: {} }));

test('API: iç hata sabit {"error":"internal"} döner, yığın sızmaz', () => {
  const hub = memHub();
  hub.create = () => { throw new Error('gizli iç ayrıntı'); };
  const orig = console.error; console.error = () => {};
  return withServer(async req => {
    const r = await post(req);
    assert.equal(r.status, 500);
    assert.deepEqual(jb(r), { error: 'internal' });
    assert.ok(!r.body.toString().includes('gizli'));
  }, { hub, env: {} }).finally(() => { console.error = orig; });
});

test('rate limit anahtarı X-Forwarded-For en sağdaki girdi, yoksa socket adresi', () => {
  const mk = h => ({ headers: h, socket: { remoteAddress: '10.0.0.9' } });
  assert.equal(clientIp(mk({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })), '2.2.2.2');
  assert.equal(clientIp(mk({ 'x-forwarded-for': '3.3.3.3' })), '3.3.3.3');
  assert.equal(clientIp(mk({})), '10.0.0.9');
});

test('rate limit: sahte X-Forwarded-For sol girdisi limiti aşmanın yolu değil', () => withServer(async req => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await req('/api/rooms', { method: 'POST', headers: { 'x-forwarded-for': `9.9.9.${i}, 5.5.5.5` } })).status, 201);
  }
  assert.equal((await req('/api/rooms', { method: 'POST', headers: { 'x-forwarded-for': '7.7.7.7, 5.5.5.5' } })).status, 429);
  assert.equal((await req('/api/rooms', { method: 'POST', headers: { 'x-forwarded-for': '7.7.7.7, 6.6.6.6' } })).status, 201);
}, { hub: memHub(), env: {}, now: () => 0 }));

test('POST /api/rooms: üretilen 1000 kod alfabeye uyar', () => {
  const hub = memHub({ max: 5000 });
  return withServer(async req => {
    for (let i = 0; i < 1000; i++) {
      const r = await req('/api/rooms', { method: 'POST', headers: { 'x-forwarded-for': 'ip' + i } });
      assert.match(jb(r).code, CODE_RE);
    }
  }, { hub, env: {} });
});

// --- review düzeltmeleri: precache.js, fd sızıntısı, sembolik bağ ---
test('statik: GET /precache.js 200 (sw.js importScripts eder)', () => withServer(async req => {
  const r = await req('/precache.js');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /^text\/javascript/);
  assert.equal(r.body.toString(), rd('precache.js'));
}));

test('statik: beyaz listeli dizindeki sembolik bağ kök dışına çıkamaz', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'ahi-sym-'));
  const root = path.join(base, 'root');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'ok.js'), 'export const ok = 1;');
  writeFileSync(path.join(base, 'gizli.js'), 'export const gizli = 1;');
  symlinkSync(path.join(base, 'gizli.js'), path.join(root, 'src', 'kacis.js'));
  symlinkSync(path.join(root, 'src', 'ok.js'), path.join(root, 'src', 'ic.js')); // kök içi bağ serbest
  try {
    await withServer(async req => {
      assert.equal((await req('/src/ok.js')).status, 200);
      assert.equal((await req('/src/ic.js')).status, 200);
      const r = await req('/src/kacis.js');
      assert.equal(r.status, 404);
      assert.ok(!r.body.toString().includes('gizli'));
    }, { root });
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('statik: istemci yarıda kesince dosya tanıtıcısı sızmaz (40 kesilen istek)', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ahi-fd-'));
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'assets', 'buyuk.bin'), Buffer.alloc(20 * 1024 * 1024, 1));
  const fds = () => readdirSync('/dev/fd').length;
  try {
    await withServer(async () => {}, { root }); // ısınma
    const app = createApp({ hub: fakeHub, root });
    const srv = http.createServer(app.handle);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const before = fds();
    for (let i = 0; i < 40; i++) {
      await new Promise(res => {
        const s = net.connect(srv.address().port, '127.0.0.1', () => s.write('GET /assets/buyuk.bin HTTP/1.1\r\nHost: x\r\n\r\n'));
        s.once('data', () => s.destroy());
        s.on('close', res);
      });
    }
    await new Promise(r => setTimeout(r, 500));
    const after = fds();
    srv.closeAllConnections(); await new Promise(r => srv.close(r));
    assert.ok(after - before < 10, `fd ${before} -> ${after}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
