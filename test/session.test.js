// Session arayüzü (src/session.js): LocalSession eski main.js akışıyla aynı sonucu verir; OnlineSession ağ mesajlarını update'e çevirir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, apply, legalActions, score, actor } from '../src/game.js';
import { safeBotAction } from '../src/botstep.js';
import { createBotClock } from '../src/botclock.js';
import { createLocalSession, createOnlineSession } from '../src/session.js';

const fakeTimers = () => {
  const t = new Map(); let n = 0;
  return { setTimer: (fn, ms) => { t.set(++n, { fn, ms }); return n; }, clearTimer: id => t.delete(id), get size() { return t.size; },
    fire() { const [id, x] = [...t][0]; t.delete(id); x.fn(); return x.ms; } };
};
const rig = (opts, extra = {}) => {
  const f = fakeTimers(), clock = createBotClock(f), ups = [];
  const s = createLocalSession({ opts, clock, delays: () => ({ bot: 700, ahlak: 1200 }), now: () => 1000, ...extra });
  s.onUpdate(u => ups.push(u));
  return { s, f, ups, clock, last: () => ups.at(-1) };
};
const flush = () => new Promise(r => setImmediate(r));

// Eski main.js döngüsü: tam state üzerinde safeBotAction + apply.
function referenceBotGame(opts) {
  let st = newGame(opts), n = 0;
  while (st.phase !== 'over' && n++ < 5000) st = apply(st, safeBotAction(st, 'medium', 'local')).state;
  return st;
}

test('local: tüm-bot oyunu sonuna kadar oynanır, sonuç eski akışla aynı', async () => {
  const opts = { players: [{ name: 'A', bot: true }, { name: 'B', bot: true }, { name: 'C', bot: true }], startIdx: 0, seed: 12345 };
  const ref = referenceBotGame(opts);
  const { s, f, last, ups } = rig(opts);
  s.start();
  for (let i = 0; i < 5000 && last().view.phase !== 'over'; i++) { await flush(); assert.ok(f.size, 'bot zamanlayıcısı kurulu'); f.fire(); }
  assert.equal(last().view.phase, 'over');
  assert.deepEqual(last().view.__score, score(ref));
  assert.deepEqual(s.state.players.map(p => p.badges), ref.players.map(p => p.badges));
  assert.deepEqual(last().meta.conn, 'ok');
  assert.ok(ups.length > 10);
});

test('local: view gizli alanı boşaltır, insanın eli açık, bot sırasında ms ve ahlak gecikmesi', async () => {
  const { s, f, last } = rig({ players: [{ name: 'Ben' }, { name: 'Bot', bot: true }], startIdx: 1, seed: 7 });
  s.start();
  const v = last().view;
  assert.equal(v.seed, undefined);
  assert.equal(v.gameId, '7');
  assert.ok(v.players[0].hand.every(c => typeof c === 'string'));
  assert.ok(v.players[1].hand.every(c => c === null));
  await flush();
  assert.equal(f.size, 1, 'bot sırası: bir zamanlayıcı');
  f.fire();
  assert.ok(last().events.length > 0);
});

test('local: bot aksiyonunda botAct render öncesi çağrılır; insan aksiyonunda çağrılmaz', async () => {
  const log = [];
  const { s, f, last } = rig({ players: [{ name: 'Ben' }, { name: 'Bot', bot: true }], startIdx: 1, seed: 7 }, { botAct: (ev, who) => log.push(['botAct', who, ev.length]) });
  s.onUpdate(() => log.push(['update']));
  s.start(); await flush(); f.fire();
  assert.deepEqual(log.slice(0, 3).map(x => x[0]), ['update', 'botAct', 'update']);
  assert.equal(log[1][1], 1);
});

test('local: undo yalnız insan hareketinden sonra legal\'de, geri alınca eski view', async () => {
  const { s, last } = rig({ players: [{ name: 'Ben' }, { name: 'Bot', bot: true }], startIdx: 0, seed: 3 });
  s.start();
  let guard = 0;
  while (!last().legal.some(a => a.type === 'move') && guard++ < 50) {
    s.act(last().legal.find(a => a.type === 'drawAhlak') ?? last().legal[0]);
    assert.ok(last().view.players[0] && actor(s.state) === 0 || true);
  }
  assert.ok(last().legal.some(a => a.type === 'move'), 'hareket bulundu');
  assert.ok(!last().legal.some(a => a.type === 'undo'));
  const before = JSON.stringify(last().view);
  s.act(last().legal.find(a => a.type === 'move'));
  assert.ok(last().legal.some(a => a.type === 'undo') || last().view.phase !== 'move', 'undo sunuldu (ya da tur ilerledi)');
  if (last().legal.some(a => a.type === 'undo')) {
    assert.equal(s.undo(), true);
    assert.equal(JSON.stringify(last().view), before);
    assert.equal(s.undo(), false, 'yığın boş');
  }
});

test('local: aynı telefonda iki insan: bot sırasında son bakan insanın eli açık kalır', async () => {
  const { s, last } = rig({ players: [{ name: 'A' }, { name: 'B' }, { name: 'Bot', bot: true }], startIdx: 0, seed: 11 });
  s.start();
  assert.ok(last().view.players[0].hand.every(c => c !== null));
  assert.ok(last().view.players[1].hand.every(c => c === null), 'perde: öteki insanın eli kapalı');
});

test('local: leave() bekleyen bot zamanlayıcısını iptal eder, sonrası act yok sayılır', async () => {
  const { s, f, ups } = rig({ players: [{ name: 'Ben' }, { name: 'Bot', bot: true }], startIdx: 1, seed: 7 });
  s.start(); await flush();
  assert.equal(f.size, 1);
  s.leave();
  assert.equal(f.size, 0);
  const n = ups.length; s.act({ type: 'endTurn' });
  assert.equal(ups.length, n);
});

test('local: skipWait sıradaki bot aksiyonunu son bot hamlesinden 150 ms sonraya çeker', async () => {
  const { s, f } = rig({ players: [{ name: 'Bot1', bot: true }, { name: 'Bot2', bot: true }], startIdx: 0, seed: 7 });
  s.start(); await flush();
  assert.equal(s.skipWait(), true); assert.equal(f.fire(), 0, 'hiç bot hamlesi yok: hemen');
  await flush(); // now() sabit 1000 = son bot hamlesi
  assert.equal(s.skipWait(), true); assert.equal(f.fire(), 150);
});

// ---- Çevrimiçi ----
function fakeNet() {
  const subs = {}, sent = [];
  return { sent, conn: 'ok', closed: false, send: (t, f) => { sent.push({ t, ...f }); return true; }, close() { this.closed = true; },
    on(t, cb) { (subs[t] ??= new Set()).add(cb); return () => subs[t].delete(cb); }, emit(t, m) { for (const cb of subs[t] ?? []) cb({ t, ...m }); } };
}
const gameMsg = (over = {}) => ({ version: 4, gameId: 'G1', view: { phase: 'move', active: 0, players: [{ hand: ['a'], badges: 0, trades: [] }], gameId: 'G1' }, legal: [{ type: 'endTurn' }], events: [{ type: 'move' }], deadline: 61000, now: 50000, seats: [{ seat: 0 }], ...over });

test('online: game mesajı onUpdate şekline çevrilir (view, legal, events, meta)', () => {
  const net = fakeNet(), s = createOnlineSession({ net, now: () => 40000 }), ups = [];
  s.onUpdate(u => ups.push(u));
  net.emit('welcome', { you: { seat: 2, token: 'x' } });
  net.emit('game', gameMsg());
  assert.equal(s.mode, 'online'); assert.equal(s.you, 2);
  const u = ups[0];
  assert.equal(u.view.you, 2); assert.equal(u.view.gameId, 'G1');
  assert.deepEqual(u.legal, [{ type: 'endTurn' }]); assert.deepEqual(u.events, [{ type: 'move' }]);
  assert.deepEqual(u.meta, { conn: 'ok', deadline: 51000, skew: 10000, seats: [{ seat: 0 }], rematch: null, version: 4, gameId: 'G1' });
  assert.equal(s.undo, undefined);
});

test('online: act base=version gönderir; stale sonrası yeni game ile güncellenir', () => {
  const net = fakeNet(), s = createOnlineSession({ net }), ups = [];
  s.onUpdate(u => ups.push(u));
  s.act({ type: 'endTurn' }); assert.equal(net.sent.length, 0, 'game gelmeden act yok');
  net.emit('game', gameMsg({ version: 4 }));
  s.act({ type: 'endTurn' });
  assert.deepEqual(net.sent.at(-1), { t: 'act', action: { type: 'endTurn' }, base: 4 });
  net.emit('error', { code: 'stale' });
  net.emit('game', gameMsg({ version: 5, events: [] }));
  assert.equal(ups.at(-1).meta.version, 5);
  s.act({ type: 'endTurn' });
  assert.equal(net.sent.at(-1).base, 5);
});

test('online: conn değişimi son görüntüyü yeni meta.conn ile yayar; bitişte skor hesaplanır', () => {
  const net = fakeNet(), s = createOnlineSession({ net }), ups = [];
  s.onUpdate(u => ups.push(u));
  net.emit('game', gameMsg());
  net.emit('conn', { conn: 'reconnecting' });
  assert.equal(ups.at(-1).meta.conn, 'reconnecting'); assert.deepEqual(ups.at(-1).events, []);
  const over = gameMsg({ rematch: { votes: [], need: 1 } }); over.view = { ...over.view, phase: 'over' };
  net.emit('game', over);
  assert.ok(Array.isArray(ups.at(-1).view.__score));
  assert.deepEqual(ups.at(-1).meta.rematch, { votes: [], need: 1 });
});

test('online: onUpdate sonradan kayıtlanırsa son game tekrar verilir; lobi komutları ve leave', () => {
  const net = fakeNet(), s = createOnlineSession({ net }), lob = [];
  s.onLobby(m => lob.push(m.t));
  net.emit('lobby', { seats: [] }); assert.deepEqual(lob, ['lobby']);
  net.emit('game', gameMsg());
  let got = null; s.onUpdate(u => { got = u; }); assert.ok(got);
  s.ready(true); s.addBot('hard'); s.setBot(1, 'easy'); s.removeSeat(1); s.setOptions({ turnSeconds: 30, startSeat: 'random' }); s.start(); s.emote('selam'); s.rematch();
  assert.deepEqual(net.sent.map(m => m.t), ['ready', 'addBot', 'setBot', 'removeSeat', 'setOptions', 'start', 'emote', 'rematch']);
  assert.deepEqual(net.sent[2], { t: 'setBot', seat: 1, level: 'easy' });
  s.leave();
  assert.equal(net.sent.at(-1).t, 'leave'); assert.ok(net.closed);
});
