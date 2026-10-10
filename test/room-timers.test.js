import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom, receive, join, disconnect, tick, nextDeadline, TIMING } from '../server/room.js';
import { actor } from '../src/game.js';
import { mkRand, fakeJoin, startedRoom, runUntil, playOut } from './helpers/rand.mjs';

const T0 = 1_000_000;
const DAY = 86_400_000, HOUR = 3_600_000;
const rand = mkRand(5);
const msg = (t, extra = {}) => ({ v: 1, t, ...extra });
const fx = n => JSON.parse(readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8'));
const games = (r, to) => r.out.filter(o => o.to === to && o.msg?.t === 'game').map(o => o.msg);
const act = (room, tok, action, now = T0) => receive(room, tok, msg('act', { action, base: room.game.version }), now, rand);
// fixture durumunu koyar ve known-token join ile zamanlayıcıları kurar (reschedule tetikleyicisi).
function withState(room, tokens, name, now = T0) {
  room.game.state = fx(name);
  join(room, { token: tokens[0], name: 'x', avatar: 0 }, now, rand);
}

test('bot sırası: 700 ms\'den önce aksiyon yok, sonra tek aksiyon', () => {
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
  assert.equal(room.timers.botAt, T0 + 700);
  assert.deepEqual(tick(room, T0 + 699, rand), { out: [], changed: false, expired: false });
  assert.equal(room.game.version, 1);
  const r = tick(room, T0 + 700, rand);
  assert.equal(room.game.version, 2);
  assert.equal(r.out.filter(o => o.msg.t === 'game').length, 2);
});

test('bot sırası: ahlak kartından sonra 1200 ms', () => {
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
  tick(room, T0 + 700, rand); // bot ahlak kartı çeker
  assert.equal(room.timers.botAt, T0 + 700 + 1200);
  assert.equal(tick(room, T0 + 700 + 1199, rand).changed, false);
  assert.equal(tick(room, T0 + 700 + 1200, rand).changed, true);
  assert.equal(room.game.version, 3);
});

test('bot adımı: bot view alır, state\'e erişmez (deps.bot\'a geçen argüman view)', () => {
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
  const calls = [];
  tick(room, T0 + 700, rand, { bot: (view, legal, level) => { calls.push({ view, legal, level }); return legal[0]; } });
  assert.equal(calls.length, 1);
  const { view, legal, level } = calls[0];
  assert.equal(level, 'medium');
  assert.ok(!('seed' in view) && view.rng === 0 && view.gameId === room.game.gameId);
  assert.ok(view.players[0].hand.every(c => c === null) && view.players[2].hand.every(c => c !== null));
  assert.ok(view.decks.yol.every(c => c === null));
  assert.ok(Array.isArray(legal) && legal.length > 0);
});

test('bot adımı: geçersiz ya da fırlatan bot yedek yasal aksiyon oynatır', () => {
  for (const bad of [() => ({ type: 'bogus' }), () => { throw new Error('bot çöktü'); }, () => undefined]) {
    const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
    tick(room, T0 + 700, rand, { bot: bad });
    assert.equal(room.game.version, 2);
    assert.equal(room.game.state.phase === 'ahlak', false); // yedek aksiyon drawAhlak'tı, faz ilerledi
  }
  // bekleyen takasta yedek: ret
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 0 } });
  room.game.state = fx('trade-offer'); room.game.state.pending.to = 2; room.timers.botAt = T0;
  tick(room, T0, rand, { bot: () => ({ type: 'zzz' }) });
  assert.equal(room.game.state.pending, null);
  assert.equal(room.game.version, 2);
});

test('bot zinciri: bot turu bitince sıra insana geçer ve zamanlayıcı durur', () => {
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
  let now = T0;
  for (let i = 0; i < 500 && room.seats[actor(room.game.state)].bot; i++) now = runUntil(room, now, room.timers.botAt, rand).now;
  assert.equal(room.seats[actor(room.game.state)].bot, false);
  assert.deepEqual([room.timers.botAt, room.timers.turnAt, room.timers.answerAt], [null, null, null]);
  assert.equal(tick(room, now + 60_000, rand).changed, false);
});

test('tur süresi 0: turAt yok', () => {
  const { room } = startedRoom({ humans: 2, options: { startSeat: 0, turnSeconds: 0 } });
  assert.equal(room.timers.turnAt, null);
  assert.equal(tick(room, T0 + 600_000, rand).changed, false);
});

test('tur süresi 30: dolunca Orta bot oynar ve turun kalanı otomatik gider', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: { startSeat: 0, turnSeconds: 30 } });
  assert.equal(room.timers.turnAt, T0 + 30_000);
  assert.equal(tick(room, T0 + 29_999, rand).changed, false);
  const r = tick(room, T0 + 30_000, rand);
  assert.equal(room.game.version, 2);
  const ev = games(r, tokens[1])[0].events;
  assert.ok(ev.some(e => e.type === 'timeout' && e.text === 'Süre doldu, otomatik oynandı.'));
  assert.equal(room.timers.autoKey, `${room.game.state.turn}:0`);
  assert.equal(errOf(act(room, tokens[0], { type: 'endTurn' }, T0 + 30_000)), 'notYourTurn'); // tur botta
  let now = T0 + 30_000;
  for (let i = 0; i < 500 && room.game.state.active === 0; i++) now = runUntil(room, now, nextDeadline(room), rand).now; // bot takas teklif ederse cevap süresi de işler
  assert.equal(room.game.state.active, 1);
  assert.equal(room.timers.autoKey, null);
  assert.equal(room.timers.turnAt, now + 30_000); // sıra insana geçti: yeni süre
});
const errOf = r => r.out.find(o => o.msg?.t === 'error')?.msg.code;

test('tur süresi: yalnız insan sırasında kurulur, bot sırasında kurulmaz', () => {
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2, turnSeconds: 30 } });
  assert.equal(room.timers.turnAt, null);
  let now = T0;
  for (let i = 0; i < 500 && room.seats[actor(room.game.state)].bot; i++) now = runUntil(room, now, room.timers.botAt, rand).now;
  assert.equal(room.timers.turnAt, now + 30_000);
});

test('tur süresi: pending bitince en az 10 sn kalır', () => {
  const { room, tokens } = startedRoom({ humans: 3, options: { startSeat: 0, turnSeconds: 30 } });
  withState(room, tokens, 'trade-offer'); // aktif 1, cevap veren 0
  assert.deepEqual([room.timers.answerAt, room.timers.turnAt], [T0 + 20_000, T0 + 30_000]);
  assert.equal(act(room, tokens[0], { type: 'respondTrade', accept: false }, T0 + 25_000).changed, true);
  assert.equal(room.timers.turnAt, T0 + 35_000);
  assert.equal(room.timers.answerAt, null);
});

test('cevap süresi: takas teklifi 20 sn sonra reddedilir', () => {
  const { room, tokens } = startedRoom({ humans: 3, options: { startSeat: 0 } });
  withState(room, tokens, 'trade-offer');
  assert.equal(tick(room, T0 + 19_999, rand).changed, false);
  const r = tick(room, T0 + 20_000, rand);
  assert.equal(room.game.state.pending, null);
  assert.ok(games(r, tokens[1])[0].events.some(e => e.type === 'timeout' && e.pIdx === 0 && /cevap vermedi/.test(e.text)));
});

test('cevap süresi: yol katkısı 20 sn sonra boş katkıyla geçer', () => {
  const { room, tokens } = startedRoom({ humans: 3, options: { startSeat: 0 } });
  withState(room, tokens, 'road-ask');
  assert.equal(tick(room, T0 + 19_999, rand).changed, false);
  const r = tick(room, T0 + 20_000, rand);
  assert.equal(room.game.version, 2);
  assert.ok(room.game.state.pending === null || room.game.state.pending.ask !== 0);
  assert.ok(games(r, tokens[1])[0].events.some(e => e.type === 'timeout'));
});

test('kopma: 29 sn bot yok, 30 sn takeover ve game yayını', () => {
  const { room, tokens } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 0 } });
  disconnect(room, tokens[1], T0);
  assert.equal(tick(room, T0 + 29_999, rand).changed, false);
  assert.equal(room.seats[1].takeover, false);
  const r = tick(room, T0 + 30_000, rand);
  assert.equal(room.seats[1].takeover, true);
  const g = games(r, tokens[0]);
  assert.equal(g.length, 1);
  assert.equal(g[0].version, 1); // sürüm artmaz
  assert.deepEqual(g[0].events.map(e => e.type), ['takeover']);
  assert.equal(g[0].events[0].text, 'Oyuncu1 bağlantısını kaybetti, bot devraldı.');
  assert.equal(g[0].seats[1].takeover, true);
  // sırası gelince bot oynar
  act(room, tokens[0], { type: 'drawAhlak' }, T0 + 30_000);
});

test('kopma: dönen oyuncu koltuğunu geri alır (takeover false)', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: { startSeat: 1 } });
  disconnect(room, tokens[1], T0);
  tick(room, T0 + 30_000, rand);
  assert.equal(room.seats[1].takeover, true);
  assert.equal(tick(room, T0 + 30_700, rand).changed, true); // bot koltuk 1 adına oynar
  assert.equal(room.game.version, 2);
  const j = join(room, { token: tokens[1], name: 'x', avatar: 0 }, T0 + 31_000, rand);
  assert.equal(j.ok, true);
  assert.deepEqual([room.seats[1].takeover, room.seats[1].token, room.seats[1].online], [false, tokens[1], true]);
  assert.equal(room.timers.botAt, null);
});

test('kopma: lobide 30 sn sonra koltuk düşer ve host devredilir', () => {
  const room = createRoom({ code: 'K7M2QX', now: T0 });
  const [a, b, c] = ['A', 'B', 'C'].map(n => fakeJoin(room, n, T0, rand));
  disconnect(room, a, T0 + 10);
  assert.equal(tick(room, T0 + 29_999, rand).changed, false);
  assert.equal(room.seats.length, 3);
  const r = tick(room, T0 + 30_010, rand);
  assert.equal(room.seats.length, 2);
  assert.equal(room.hostToken, b);
  assert.ok(r.out.some(o => o.to === a && o.msg === null && o.close));
  assert.ok(r.out.some(o => o.to === c && o.msg?.t === 'lobby'));
});

test('hiç insan çevrimiçi değilken oyun durur, bağlanınca sürer', () => {
  const { room, tokens } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
  disconnect(room, tokens[0], T0 + 100);
  disconnect(room, tokens[1], T0 + 100);
  assert.equal(room.timers.botAt, null);
  for (const t of [T0 + 10_000, T0 + 60_000, T0 + 600_000]) tick(room, t, rand);
  assert.equal(room.game.version, 1);
  join(room, { token: tokens[0], name: 'x', avatar: 0 }, T0 + 700_000, rand);
  assert.equal(room.timers.botAt, T0 + 700_700);
  assert.equal(tick(room, T0 + 700_699, rand).changed, false);
  tick(room, T0 + 700_700, rand);
  assert.equal(room.game.version, 2);
});

test('oda ömrü: 24 sa - 1 ms yaşar, 24 sa\'te expired', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: { startSeat: 0 } });
  const a = tick(room, T0 + DAY - 1, rand);
  assert.equal(a.expired, false);
  const b = tick(room, T0 + DAY, rand);
  assert.equal(b.expired, true);
  assert.deepEqual(b.out.map(o => [o.to, o.msg.code, o.close]).sort(), tokens.map(t => [t, 'expired', true]).sort());
});

test('oda ömrü: kimse katılmamış oda 1 sa\'te expired', () => {
  const room = createRoom({ code: 'K7M2QX', now: T0 });
  assert.equal(tick(room, T0 + HOUR - 1, rand).expired, false);
  assert.deepEqual(tick(room, T0 + HOUR, rand), { out: [], changed: false, expired: true });
  fakeJoin(room, 'A', T0 + 5, rand); // katılan odada 1 sa kuralı geçerli değil
  assert.equal(tick(room, T0 + HOUR, rand).expired, false);
});

test('nextDeadline: en yakın vade, ömür vadesi her zaman var', () => {
  const empty = createRoom({ code: 'K7M2QX', now: T0 });
  assert.equal(nextDeadline(empty), T0 + HOUR);
  fakeJoin(empty, 'A', T0 + 10, rand);
  assert.equal(nextDeadline(empty), T0 + 10 + DAY);
  const { room, tokens } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2, turnSeconds: 30 } });
  assert.equal(nextDeadline(room), T0 + 700);
  disconnect(room, tokens[0], T0 + 10);
  assert.equal(nextDeadline(room), T0 + 700);
  tick(room, T0 + 700, rand);
  assert.equal(nextDeadline(room), T0 + 700 + 1200);
  const h = startedRoom({ humans: 2, options: { startSeat: 0 } }).room;
  assert.equal(nextDeadline(h), T0 + DAY);
  disconnect(h, h.seats[1].token, T0 + 50);
  assert.equal(nextDeadline(h), T0 + 50 + 30_000);
});

test('tick idempotent: aynı now iki kez çağrılınca ikincisi boş', () => {
  const { room } = startedRoom({ humans: 2, bots: 1, options: { startSeat: 2 } });
  assert.equal(tick(room, T0 + 700, rand).changed, true);
  assert.deepEqual(tick(room, T0 + 700, rand), { out: [], changed: false, expired: false });
});

test('tam oyun: 2 insan + 2 bot over\'a ulaşır (3 tohum)', () => {
  for (const seed of [1, 2, 3]) {
    const r = mkRand(seed);
    const { room, tokens } = startedRoom({ humans: 2, bots: 2, rand: r });
    let last = 1, count = 0;
    const { steps } = playOut(room, T0, r, { onOut: out => {
      for (const g of out.filter(o => o.to === tokens[0] && o.msg.t === 'game').map(o => o.msg)) {
        assert.ok(g.version === last || g.version === last + 1, `sürüm atladı: ${last} -> ${g.version}`);
        last = g.version; count++;
      }
    } });
    assert.equal(room.phase, 'over', `tohum ${seed}`);
    assert.equal(room.game.state.phase, 'over');
    assert.equal(last, room.game.version);
    assert.ok(steps < 20000 && count > 20, `tohum ${seed}: ${steps} adım`);
  }
});

test('timing: botMs, graceMs ve idleMs createRoom\'a verilen değerle geçersiz kılınır (BOT_DELAY_MS/DISCONNECT_GRACE_MS/ROOM_IDLE_MS yolu)', () => {
  const timing = { botMs: 100, botAhlakMs: 200, graceMs: 5000, idleMs: 60_000 };
  const { room, tokens } = startedRoom({ humans: 2, bots: 1, timing, options: { startSeat: 2 } });
  assert.deepEqual(room.timing, { ...TIMING, ...timing });
  assert.equal(room.timers.botAt, T0 + 100);
  assert.equal(tick(room, T0 + 99, rand).changed, false);
  tick(room, T0 + 100, rand);
  assert.equal(room.timers.botAt, T0 + 300);
  disconnect(room, tokens[1], T0 + 100);
  assert.equal(nextDeadline(room), T0 + 300);
  tick(room, T0 + 5100, rand);
  assert.equal(room.seats[1].takeover, true);
  assert.equal(tick(room, T0 + 60_100, rand).expired, true);
  const plain = JSON.parse(JSON.stringify(room)); // anlık görüntüyle yüklenir
  assert.deepEqual(plain.timing, room.timing);
  assert.equal(createRoom({ code: 'K7M2QX', now: T0 }).timing, undefined); // varsayılan: TIMING geçerli
});
