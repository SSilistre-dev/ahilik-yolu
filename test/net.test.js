// WebSocket istemcisi (src/net.js): sahte WebSocket + sahte zamanlayıcı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNet, BACKOFF, PING_MS } from '../src/net.js';
import { createStore, roomKey } from '../src/store.js';

function rig(extra = {}) {
  const sockets = [], timers = new Map(); let n = 0;
  class FakeWS {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); }
    send(d) { this.sent.push(JSON.parse(d)); }
    close() { this.readyState = 3; this.closedByClient = true; }
    open() { this.readyState = 1; this.onopen(); }
    recv(o) { this.onmessage({ data: JSON.stringify(o) }); }
    drop() { this.readyState = 3; this.onclose(); }
  }
  const mem = new Map();
  const store = createStore({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) });
  const net = createNet({
    code: 'k7m2qx', WebSocket: FakeWS, store, url: 'ws://t/ws/K7M2QX',
    setTimer: (fn, ms) => { timers.set(++n, { fn, ms }); return n; }, clearTimer: id => timers.delete(id), ...extra,
  });
  const due = () => [...timers].sort((a, b) => a[1].ms - b[1].ms)[0];
  const fire = () => { const [id, t] = due(); timers.delete(id); t.fn(); return t.ms; };
  const conns = []; net.on('conn', m => conns.push(m.conn));
  return { net, sockets, timers, store, fire, conns, last: () => sockets.at(-1) };
}
const welcome = { v: 1, t: 'welcome', code: 'K7M2QX', you: { seat: 1, token: 'abc' } };

test('net: hello token olmadan gider, welcome token saklar, sonraki bağlantı tokenı yollar', () => {
  const r = rig();
  r.net.connect({ name: 'Ayşe', avatar: 2 });
  r.last().open();
  assert.deepEqual(r.last().sent[0], { v: 1, t: 'hello', name: 'Ayşe', avatar: 2 });
  r.last().recv(welcome);
  assert.equal(r.store.get(roomKey('K7M2QX')), 'abc');
  assert.deepEqual(r.conns, ['ok']);
  r.last().drop(); r.fire(); r.last().open();
  assert.equal(r.last().sent[0].token, 'abc');
});

test('net: 25 sn ping, send v:1 koyar; mesajlar dinleyicilere gider', () => {
  const r = rig(); const got = [];
  r.net.on('game', m => got.push(m)); r.net.on('lobby', m => got.push(m));
  r.net.connect({ name: 'A', avatar: 0 }); r.last().open();
  assert.equal(r.fire(), PING_MS);
  assert.deepEqual(r.last().sent.at(-1), { v: 1, t: 'ping' });
  r.fire(); assert.equal(r.last().sent.filter(m => m.t === 'ping').length, 2, 'ping yinelenir');
  r.net.send('act', { action: { type: 'endTurn' }, base: 3 });
  assert.deepEqual(r.last().sent.at(-1), { action: { type: 'endTurn' }, base: 3, v: 1, t: 'act' });
  r.last().recv({ v: 1, t: 'game', version: 2 }); r.last().recv({ v: 1, t: 'lobby', seats: [] });
  assert.deepEqual(got.map(m => m.t), ['game', 'lobby']);
});

test('net: kopunca üstel geri çekilmeyle yeniden bağlanır, welcome sayacı sıfırlar', () => {
  const r = rig();
  r.net.connect({ name: 'A', avatar: 0 }); r.last().open(); r.last().recv(welcome);
  const waits = [];
  for (let i = 0; i < 7; i++) { r.last().drop(); assert.equal(r.net.conn, 'reconnecting'); waits.push(r.fire()); } // açılmadan düşer
  assert.deepEqual(waits, [500, 1000, 2000, 4000, 8000, 10000, 10000]);
  assert.deepEqual(BACKOFF.at(-1), 10000);
  r.last().open(); r.last().recv(welcome);
  assert.equal(r.net.conn, 'ok');
  r.last().drop(); assert.equal(r.fire(), 500, 'başarılı bağlantıdan sonra baştan');
  assert.equal(r.sockets.length, 9);
});

test('net: kapatan hata kodunda yeniden bağlanma yok, durum lost + son hata', () => {
  for (const code of ['full', 'started', 'notFound', 'rate', 'tooBig', 'version', 'kicked', 'replaced', 'expired']) {
    const r = rig(); const errs = [];
    r.net.on('error', m => errs.push(m.code));
    r.net.connect({ name: 'A', avatar: 0 }); r.last().open();
    r.last().recv({ v: 1, t: 'error', code, msg: 'x' });
    r.last().drop();
    assert.equal(r.timers.size, 0, `${code}: zamanlayıcı kalmadı`);
    assert.equal(r.net.conn, 'lost');
    assert.equal(r.net.lastError.code, code);
    assert.deepEqual(errs, [code]);
    assert.equal(r.sockets.length, 1);
  }
});

test('net: stale/illegal kapatmaz, yalnız iletilir', () => {
  const r = rig(); const errs = [];
  r.net.on('error', m => errs.push(m.code));
  r.net.connect({ name: 'A', avatar: 0 }); r.last().open(); r.last().recv(welcome);
  r.last().recv({ v: 1, t: 'error', code: 'stale', msg: 'x' });
  assert.deepEqual(errs, ['stale']); assert.equal(r.net.conn, 'ok');
});

test('net: expired/notFound/kicked saklı tokenı siler, replaced/full silmez', () => {
  for (const [code, kept] of [['expired', false], ['notFound', false], ['kicked', false], ['replaced', true], ['full', true]]) {
    const r = rig();
    r.store.set(roomKey('K7M2QX'), 'abc');
    r.net.connect({ name: 'A', avatar: 0 }); r.last().open();
    r.last().recv({ v: 1, t: 'error', code, msg: 'x' });
    assert.equal(r.store.get(roomKey('K7M2QX')) === 'abc', kept, code);
  }
});

test('net: close() sonrası yeniden bağlanma ve ping yok', () => {
  const r = rig();
  r.net.connect({ name: 'A', avatar: 0 }); r.last().open(); r.last().recv(welcome);
  const ws = r.last();
  r.net.close();
  assert.ok(ws.closedByClient);
  ws.drop();
  assert.equal(r.timers.size, 0);
  assert.equal(r.sockets.length, 1);
  assert.equal(r.net.send('ping'), false);
  // bekleyen yeniden bağlanma da iptal olur
  const q = rig(); q.net.connect({ name: 'A', avatar: 0 }); q.last().open(); q.last().drop();
  assert.equal(q.timers.size, 1); q.net.close(); assert.equal(q.timers.size, 0);
});

test('net: varsayılan URL location protokolünden gelir', () => {
  globalThis.location = { protocol: 'https:', host: 'ahilik.example' };
  try {
    const r = rig({ url: undefined });
    r.net.connect({ name: 'A', avatar: 0 });
    assert.equal(r.last().url, 'wss://ahilik.example/ws/K7M2QX');
    globalThis.location = { protocol: 'http:', host: 'localhost:8080' };
    assert.equal(rig({ url: undefined }).net && (() => { const q = rig({ url: undefined }); q.net.connect({ name: 'A', avatar: 0 }); return q.last().url; })(), 'ws://localhost:8080/ws/K7M2QX');
  } finally { delete globalThis.location; }
});
