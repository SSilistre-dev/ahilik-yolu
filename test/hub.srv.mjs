// ws gerektirir: konteynerde `make test-srv` ile koşar (host'ta ws yok). Hub ve uygulama aynı süreçte kurulur.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createHub } from '../server/hub.js';

const booted = [];
async function boot(dir, env = {}) {
  const hub = createHub({ dir, env });
  const app = createApp({ hub, env: { ROOM_CREATE_PER_MIN: '1000', ...env } });
  const srv = http.createServer(app.handle);
  srv.on('upgrade', app.upgrade);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = { hub, srv, port: srv.address().port, base: `http://127.0.0.1:${srv.address().port}`,
    async stop() { hub.close(); srv.closeAllConnections(); await new Promise(r => srv.close(r)); } };
  booted.push(b);
  return b;
}
const tmp = () => mkdtempSync(path.join(tmpdir(), 'ahi-hub-'));
const newRoom = async b => (await (await fetch(b.base + '/api/rooms', { method: 'POST' })).json()).code;

// Mesajları biriktiren istemci. next(pred) bir sonraki eşleşen mesajı bekler (önceden gelenler dahil, tüketir).
function client(b, code) {
  const ws = new WebSocket(`ws://127.0.0.1:${b.port}/ws/${code}`);
  const msgs = [], waiters = [];
  const c = { ws, msgs, closed: null };
  const closedP = new Promise(r => ws.addEventListener('close', e => { c.closed = e.code; r(e.code); }));
  c.closedP = closedP;
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data); msgs.push(m);
    for (const w of [...waiters]) { const i = msgs.findIndex(w.pred); if (i >= 0) { waiters.splice(waiters.indexOf(w), 1); w.res(msgs.splice(i, 1)[0]); } }
  });
  c.opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws error'))); });
  c.send = o => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.next = (pred, ms = 3000) => new Promise((res, rej) => {
    const i = msgs.findIndex(pred);
    if (i >= 0) return res(msgs.splice(i, 1)[0]);
    const w = { pred, res };
    waiters.push(w);
    setTimeout(() => rej(new Error('zaman aşımı')), ms).unref();
  });
  c.hello = async (name, extra = {}) => { await c.opened; c.send({ v: 1, t: 'hello', name, avatar: 1, ...extra }); return c.next(m => m.t === 'welcome'); };
  return c;
}
const isT = t => m => m.t === t;

test.after(async () => { for (const b of booted) await b.stop().catch(() => {}); });

test('oda aç: POST /api/rooms 201 ve 6 harfli kod', async () => {
  const b = await boot(tmp());
  const r = await fetch(b.base + '/api/rooms', { method: 'POST' });
  assert.equal(r.status, 201);
  assert.match((await r.json()).code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});

test('hello -> welcome + lobby (koltuk 0, host)', async () => {
  const b = await boot(tmp());
  const code = await newRoom(b);
  const a = client(b, code);
  const w = await a.hello('Ali');
  assert.equal(w.code, code);
  assert.equal(w.you.seat, 0);
  assert.match(w.you.token, /^[0-9a-f]{32}$/);
  const lobby = await a.next(isT('lobby'));
  assert.equal(lobby.seats[0].host, true);
  assert.equal(lobby.seats[0].name, 'Ali');
  assert.ok(!JSON.stringify(lobby).includes(w.you.token), 'lobi token sızdırmaz');
  a.ws.close();
});

test('ikinci istemci katılır, ilk istemci lobby güncellemesi alır', async () => {
  const b = await boot(tmp());
  const code = await newRoom(b);
  const a = client(b, code), c = client(b, code);
  await a.hello('Ali'); await a.next(isT('lobby'));
  const w = await c.hello('Veli');
  assert.equal(w.you.seat, 1);
  const upd = await a.next(m => m.t === 'lobby' && m.seats.length === 2);
  assert.deepEqual(upd.seats.map(s => s.name), ['Ali', 'Veli']);
  a.ws.close(); c.ws.close();
});

test('addBot + start: bot sırasında istemci mesaj göndermeden version artar (zamanlayıcı çalışıyor)', { skip: 'N07/N08 bekleniyor' }, () => {});
test('act: sırası gelen istemci geçerli aksiyon gönderir, iki istemci de yeni version alır', { skip: 'N07/N08 bekleniyor' }, () => {});

test('aynı token ikinci soketten: eskisi replaced ile 4007 kapanır, koltuk aynı', async () => {
  const b = await boot(tmp());
  const code = await newRoom(b);
  const a = client(b, code);
  const w = await a.hello('Ali');
  const a2 = client(b, code);
  const w2 = await a2.hello('Ali', { token: w.you.token });
  assert.equal(w2.you.seat, 0);
  assert.equal((await a.next(m => m.t === 'error')).code, 'replaced');
  assert.equal(await a.closedP, 4007);
  assert.equal(b.hub.info(code).humans, 1);
  a2.ws.close();
});

test('9000 baytlık mesaj 1009 ile kapanır; 1 sn içinde 25 mesaj: error rate ve kapanış 4008', async () => {
  const b = await boot(tmp());
  const code = await newRoom(b);
  const a = client(b, code);
  await a.hello('Ali');
  a.send('x'.repeat(9000));
  assert.equal(await a.closedP, 1009);
  const c = client(b, code);
  await c.hello('Veli');
  for (let i = 0; i < 25; i++) c.send({ v: 1, t: 'ping' });
  assert.equal((await c.next(m => m.t === 'error')).code, 'rate');
  assert.equal(await c.closedP, 4008);
});

test('7. insan: full; yanlış Origin: 403; kodu olmayan oda 404', async () => {
  const b = await boot(tmp());
  const code = await newRoom(b);
  const cs = [];
  for (let i = 0; i < 6; i++) { const c = client(b, code); await c.hello('Oyuncu' + i); cs.push(c); }
  const x = client(b, code);
  await x.opened;
  x.send({ v: 1, t: 'hello', name: 'Fazla', avatar: 1 });
  assert.equal((await x.next(m => m.t === 'error')).code, 'full');
  assert.equal(await x.closedP, 4001);
  const upgrade = (p, origin) => new Promise(res => {
    const r = http.request({ host: '127.0.0.1', port: b.port, path: p, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': Buffer.from('0123456789abcdef').toString('base64'), ...(origin ? { Origin: origin } : {}) } });
    r.on('upgrade', (rs, s) => { s.destroy(); res(rs.statusCode); });
    r.on('response', rs => { rs.resume(); res(rs.statusCode); });
    r.end();
  });
  assert.equal(await upgrade('/ws/' + code, 'https://evil.example'), 403);
  assert.equal(await upgrade('/ws/' + code, 'https://ahilik.ssilistre.dev.evil.com'), 403);
  assert.equal(await upgrade('/ws/' + code, 'https://ahilik.ssilistre.dev'), 101);
  assert.equal(await upgrade('/ws/ABCDEF', undefined), 404);
  for (const c of cs) c.ws.close();
});

test('hello göndermeyen bağlantı 10 sn sonra 4000 ile kapanır', { timeout: 20000 }, async () => {
  const b = await boot(tmp());
  const code = await newRoom(b);
  const a = client(b, code);
  await a.opened;
  const t0 = Date.now();
  assert.equal(await a.closedP, 4000);
  const dt = Date.now() - t0;
  assert.ok(dt >= 9000 && dt < 12000, 'süre ' + dt);
});

test('MAX_ROOMS dolunca create full döner', async () => {
  const b = await boot(tmp(), { MAX_ROOMS: '2' });
  assert.equal(b.hub.create('AAAAAA'), 'created');
  assert.equal(b.hub.create('AAAAAA'), 'exists');
  assert.equal(b.hub.create('BBBBBB'), 'created');
  assert.equal(b.hub.create('CCCCCC'), 'full');
  assert.deepEqual(b.hub.stats(), { rooms: 2, sockets: 0 });
});

test('anlık görüntü: oda dosyası <kod>.json yazılır, tmp kalıntısı yok, bozuk dosya atlanır', async () => {
  const dir = tmp();
  const b = await boot(dir);
  const code = await newRoom(b);
  const rd = path.join(dir, 'rooms');
  assert.ok(existsSync(path.join(rd, code + '.json')));
  const a = client(b, code);
  await a.hello('Ali');
  const snap = JSON.parse(readFileSync(path.join(rd, code + '.json'), 'utf8'));
  assert.equal(snap.schema, 1);
  assert.equal(snap.room.seats[0].name, 'Ali');
  assert.deepEqual(readdirSync(rd).filter(f => f.endsWith('.tmp')), []);
  a.ws.close();
  await b.stop();
  writeFileSync(path.join(rd, 'ZZZZZZ.json'), '{bozuk');
  writeFileSync(path.join(rd, 'YYYYYY.json.tmp'), 'yarım');
  const b2 = await boot(dir);
  assert.equal(b2.hub.has(code), true);
  assert.equal(b2.hub.has('ZZZZZZ'), false);
  assert.ok(existsSync(path.join(rd, 'ZZZZZZ.json.bozuk')));
  assert.ok(!existsSync(path.join(rd, 'YYYYYY.json.tmp')));
});

test('hub yeniden başlatma: eski token ile hello -> aynı koltuk ve lobi durumu', async () => {
  const dir = tmp();
  const b = await boot(dir);
  const code = await newRoom(b);
  const a = client(b, code), c = client(b, code);
  await a.hello('Ali');
  const wc = await c.hello('Veli');
  await b.stop();
  assert.equal(await c.closedP, 1001);
  const b2 = await boot(dir);
  const c2 = client(b2, code);
  const w = await c2.hello('Veli', { token: wc.you.token });
  assert.equal(w.you.seat, 1);
  assert.equal(w.you.token, wc.you.token);
  const lobby = await c2.next(isT('lobby'));
  assert.deepEqual(lobby.seats.map(s => s.name), ['Ali', 'Veli']);
  assert.equal(lobby.seats[0].online, false, 'dönmeyen koltuk çevrimdışı');
  assert.equal(lobby.seats[1].online, true);
  c2.ws.close();
});

test('hub yeniden başlatma: kopan insan 30 sn sonra takeover', { skip: 'N07/N08 bekleniyor' }, () => {});
