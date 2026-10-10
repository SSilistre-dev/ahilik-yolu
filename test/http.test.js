import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/index.js';

const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const fakeHub = { has: () => false, close() {} };

async function withServer(fn) {
  const app = createApp({ hub: fakeHub });
  const srv = http.createServer(app.handle);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // http.request: fetch yol normalleştirir (/../ gibi), ham yol gerekir.
  const req = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
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
