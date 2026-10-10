import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, BOT_NAMES, createRoom, makeCode, normalizeCode, join, receive, disconnect } from '../server/room.js';
import { mkRand, mkClock, fakeJoin } from './helpers/rand.mjs';

const T0 = 1_000_000;
const rand = mkRand(42);
const room0 = () => createRoom({ code: 'K7M2QX', now: T0 });
const msg = (t, extra = {}) => ({ v: 1, t, ...extra });
const hex32 = /^[0-9a-f]{32}$/;
const sent = (r, to) => r.out.filter(o => o.to === to).map(o => o.msg);
const errCode = (r, to) => sent(r, to).find(x => x.t === 'error')?.code;
const lastLobby = r => r.out.map(o => o.msg).filter(x => x?.t === 'lobby').at(-1);
// host + n insan; token dizisi döner
function lobbyWith(...names) {
  const room = room0();
  const tokens = names.map(n => fakeJoin(room, n, T0, rand));
  return { room, tokens };
}
// Her out öğesi: token yalnız sahibine giden welcome içinde olabilir.
function assertNoTokenLeak(room, out) {
  const tokens = room.seats.filter(s => s.token).map(s => s.token);
  for (const o of out) {
    const json = JSON.stringify(o.msg);
    for (const t of tokens) {
      if (o.msg?.t === 'welcome' && o.to === t) continue;
      assert.ok(!json.includes(t), `token sızdı: ${o.msg?.t} -> ${o.to}`);
    }
  }
}

test('createRoom: boş lobi ve varsayılan ayarlar', () => {
  assert.deepEqual(room0(), { code: 'K7M2QX', createdAt: T0, lastActivity: T0, phase: 'lobby',
    options: { turnSeconds: 0, startSeat: 'random' }, hostToken: null, seats: [] });
});

test('makeCode: 6 karakter, yalnız alfabe, 10000 üretimde 31 harf görülür', () => {
  const r = mkRand(1), seen = new Set();
  for (let i = 0; i < 10000; i++) {
    const c = makeCode(r);
    assert.equal(c.length, 6);
    for (const ch of c) { assert.ok(CODE_ALPHABET.includes(ch), c); seen.add(ch); }
  }
  assert.equal(CODE_ALPHABET.length, 31);
  assert.equal(seen.size, 31);
});

test('normalizeCode: küçük harf ve boşluk temizlenir, geçersiz null', () => {
  assert.equal(normalizeCode('k7m2qx '), 'K7M2QX');
  assert.equal(normalizeCode(' k7 m2\tqx'), 'K7M2QX');
  for (const bad of ['K7M2Q', 'K7M2QXX', 'K7M2QI', 'K7M2Q0', 'K7M2QL', 'K7M2QO', '', null, undefined, 123, {}]) assert.equal(normalizeCode(bad), null, String(bad));
});

test('join: ilk insan host ve 0. koltuk, token 32 onaltılık karakter', () => {
  const room = room0();
  const r = join(room, { name: 'Ayşe', avatar: 3 }, T0 + 5, rand);
  assert.equal(r.ok, true);
  assert.match(r.token, hex32);
  assert.equal(room.hostToken, r.token);
  assert.deepEqual(room.seats[0], { token: r.token, name: 'Ayşe', avatar: 3, bot: false, level: null, ready: true, online: true, lostAt: null });
  assert.deepEqual(sent(r, r.token)[0], { v: 1, t: 'welcome', code: 'K7M2QX', you: { seat: 0, token: r.token } });
  assert.equal(lastLobby(r).seats[0].host, true);
  assert.equal(room.lastActivity, T0 + 5);
  const b = join(room, { name: 'Burak', avatar: 1 }, T0, rand);
  assert.equal(room.seats[1].ready, false);
  assert.notEqual(b.token, r.token);
  assert.equal(room.hostToken, r.token);
});

test('join: aynı token aynı koltuğa döner ve online olur', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  disconnect(room, tokens[1], T0 + 10);
  assert.equal(room.seats[1].online, false);
  const r = join(room, { token: tokens[1], name: 'Başka', avatar: 7 }, T0 + 20, rand);
  assert.equal(r.ok, true);
  assert.equal(r.token, tokens[1]);
  assert.equal(room.seats.length, 2);
  assert.deepEqual([room.seats[1].online, room.seats[1].lostAt, room.seats[1].name, room.seats[1].avatar], [true, null, 'Burak', 0]);
  assert.equal(sent(r, tokens[1])[0].you.seat, 1);
});

test('join: ad doğrulama (boş, 17 karakter, kontrol karakteri, bidi, NFC)', () => {
  const room = room0();
  const bad = name => join(room, { name, avatar: 0 }, T0, rand);
  for (const n of ['', '   ', 'a'.repeat(17), 'a\nb', 'a\tb', 'ab‮cd', '‏ab', 'a​b', 5, null, undefined, {}]) {
    const r = bad(n);
    assert.equal(r.ok, false, JSON.stringify(n));
    assert.equal(r.error.code, 'badName');
    assert.equal(r.close, false);
  }
  assert.equal(room.seats.length, 0);
  assert.equal(join(room, { name: 'a'.repeat(16), avatar: 0 }, T0, rand).ok, true);
  assert.equal(join(room, { name: '😀'.repeat(16), avatar: 0 }, T0, rand).ok, true); // kod noktası sayılır
  const nfd = join(room, { name: '  Cafe\u0301  ', avatar: 0 }, T0, rand); // NFD girdi
  assert.equal(room.seats[2].name, 'Café');
  assert.equal(room.seats[2].name.length, 4);
  assert.equal(join(room, { name: 'x', avatar: 8 }, T0, rand).error.code, 'badMsg');
  assert.equal(join(room, { name: 'x', avatar: 1.5 }, T0, rand).error.code, 'badMsg');
  assert.equal(join(room, { name: 'x', avatar: '1' }, T0, rand).error.code, 'badMsg');
  assert.ok(nfd.ok);
});

test('join: aynı ad ikinciye (2) eki alır ve 16 karaktere kırpılır', () => {
  const room = room0();
  for (const n of ['Ayşe', 'ayşe', 'AYŞE']) fakeJoin(room, n, T0, rand);
  assert.deepEqual(room.seats.map(s => s.name), ['Ayşe', 'ayşe (2)', 'AYŞE (3)']);
  const long = 'x'.repeat(16);
  fakeJoin(room, long, T0, rand); fakeJoin(room, long, T0, rand);
  assert.equal(room.seats[4].name, 'x'.repeat(12) + ' (2)');
  assert.equal([...room.seats[4].name].length, 16);
});

test('join: 6 koltuk dolunca full ve close', () => {
  const room = room0();
  for (let i = 0; i < 6; i++) fakeJoin(room, 'o' + i, T0, rand);
  const r = join(room, { name: 'Yedinci', avatar: 0 }, T0, rand);
  assert.deepEqual([r.ok, r.error.code, r.close], [false, 'full', true]);
  assert.equal(room.seats.length, 6);
});

test('join: oyun başlamışsa tokensiz started', () => {
  const { room, tokens } = lobbyWith('Ayşe');
  room.phase = 'game';
  const r = join(room, { name: 'Geç', avatar: 0 }, T0, rand);
  assert.deepEqual([r.ok, r.error.code, r.close], [false, 'started', true]);
  const u = join(room, { token: 'f'.repeat(32), name: 'Geç', avatar: 0 }, T0, rand); // tanınmayan token
  assert.deepEqual([u.ok, u.error.code, u.close], [false, 'started', true]);
  assert.equal(join(room, { token: tokens[0], name: 'x', avatar: 0 }, T0, rand).ok, true); // sahibi dönebilir
  room.phase = 'over';
  assert.equal(join(room, { name: 'Geç', avatar: 0 }, T0, rand).error.code, 'started');
});

test('ready: host için yok sayılır, bot için illegal', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  const [h, b] = tokens;
  let r = receive(room, h, msg('ready', { on: false }), T0, rand);
  assert.deepEqual([r.out, r.changed, room.seats[0].ready], [[], false, true]);
  r = receive(room, b, msg('ready', { on: true }), T0 + 1, rand);
  assert.equal(room.seats[1].ready, true);
  assert.equal(lastLobby(r).seats[1].ready, true);
  receive(room, h, msg('addBot'), T0, rand);
  r = receive(room, b, msg('ready', { on: false, seat: 2 }), T0, rand);
  assert.equal(errCode(r, b), 'illegal');
  assert.equal(room.seats[2].ready, true);
  assert.equal(errCode(receive(room, b, msg('ready', { on: 'evet' }), T0, rand), b), 'badMsg');
});

test('addBot: yalnız host, varsayılan medium, ad listesinden benzersiz', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  assert.equal(errCode(receive(room, tokens[1], msg('addBot'), T0, rand), tokens[1]), 'notHost');
  assert.equal(room.seats.length, 2);
  let r = receive(room, tokens[0], msg('addBot'), T0, rand);
  assert.deepEqual(r.changed, true);
  assert.deepEqual(room.seats[2], { token: null, name: BOT_NAMES[0], avatar: 0, bot: true, level: 'medium', ready: true, online: true, lostAt: null });
  receive(room, tokens[0], msg('addBot', { level: 'hard' }), T0, rand);
  assert.deepEqual([room.seats[3].name, room.seats[3].level], [BOT_NAMES[1], 'hard']);
  assert.equal(errCode(receive(room, tokens[0], msg('addBot', { level: 'imkansiz' }), T0, rand), tokens[0]), 'illegal');
  assert.equal(room.seats.length, 4);
  assert.equal(lastLobby(r).seats[2].level, 'medium');
  // ad çakışması: insan bot adını almışsa bot bir sonrakini alır, aynı ad iki kez verilmez
  const { room: r2, tokens: [h] } = lobbyWith(BOT_NAMES[0]);
  receive(r2, h, msg('addBot'), T0, rand);
  assert.equal(r2.seats[1].name, BOT_NAMES[1]);
  receive(r2, h, msg('addBot'), T0, rand);
  assert.equal(new Set(r2.seats.map(s => s.name.toLowerCase())).size, 3);
  r2.phase = 'game';
  assert.equal(errCode(receive(r2, h, msg('addBot'), T0, rand), h), 'illegal');
});

test('addBot: oda doluysa full', () => {
  const { room, tokens } = lobbyWith('Ayşe');
  for (let i = 0; i < 5; i++) receive(room, tokens[0], msg('addBot'), T0, rand);
  assert.equal(room.seats.length, 6);
  const r = receive(room, tokens[0], msg('addBot'), T0, rand);
  assert.equal(errCode(r, tokens[0]), 'full');
  assert.equal(r.out[0].close, undefined); // host'un soketi kapanmaz
  assert.equal(room.seats.length, 6);
});

test('setBot: seviye değişir, insan koltuğunda illegal', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  const [h, b] = tokens;
  receive(room, h, msg('addBot'), T0, rand);
  const r = receive(room, h, msg('setBot', { seat: 2, level: 'hard' }), T0, rand);
  assert.equal(room.seats[2].level, 'hard');
  assert.equal(lastLobby(r).seats[2].level, 'hard');
  for (const bad of [{ seat: 1, level: 'hard' }, { seat: 0, level: 'hard' }, { seat: 9, level: 'hard' }, { seat: 2, level: 'x' }, { seat: '2', level: 'hard' }, { level: 'hard' }]) {
    assert.equal(errCode(receive(room, h, msg('setBot', bad), T0, rand), h), 'illegal', JSON.stringify(bad));
  }
  assert.equal(errCode(receive(room, b, msg('setBot', { seat: 2, level: 'easy' }), T0, rand), b), 'notHost');
  assert.equal(room.seats[2].level, 'hard');
});

test('removeSeat: bot çıkar, insan kicked alır ve close', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  const [h, b] = tokens;
  receive(room, h, msg('addBot'), T0, rand);
  let r = receive(room, h, msg('removeSeat', { seat: 2 }), T0, rand);
  assert.equal(room.seats.length, 2);
  assert.equal(r.out.some(o => o.close), false);
  r = receive(room, h, msg('removeSeat', { seat: 1 }), T0, rand);
  const k = r.out.find(o => o.to === b);
  assert.deepEqual([k.msg.t, k.msg.code, k.close], ['error', 'kicked', true]);
  assert.equal(r.out.filter(o => o.to === b).length, 1); // atılana lobi gitmez
  assert.equal(room.seats.length, 1);
  assert.equal(errCode(receive(room, h, msg('removeSeat', { seat: 0 }), T0, rand), h), 'illegal'); // kendini atamaz
  assert.equal(errCode(receive(room, h, msg('removeSeat', { seat: 5 }), T0, rand), h), 'illegal');
  assert.equal(errCode(receive(room, h, msg('removeSeat', { seat: 'x' }), T0, rand), h), 'illegal');
});

test('removeSeat: koltuklar kayar, etkilenen insanlara yeni welcome gider', () => {
  const { room, tokens } = lobbyWith('A', 'B', 'C', 'D');
  const [h, b, c, d] = tokens;
  const r = receive(room, h, msg('removeSeat', { seat: 1 }), T0, rand);
  assert.deepEqual(room.seats.map(s => s.name), ['A', 'C', 'D']);
  assert.equal(sent(r, c).find(x => x.t === 'welcome').you.seat, 1);
  assert.equal(sent(r, d).find(x => x.t === 'welcome').you.seat, 2);
  assert.equal(sent(r, h).some(x => x.t === 'welcome'), false); // indeksi değişmeyene gitmez
  assert.equal(sent(r, b).some(x => x.t === 'welcome'), false);
  assertNoTokenLeak(room, r.out);
});

test('removeSeat: startSeat sayısı kaymaya göre ayarlanır', () => {
  const run = (startSeat, removed) => {
    const { room, tokens } = lobbyWith('A', 'B', 'C', 'D');
    receive(room, tokens[0], msg('setOptions', { turnSeconds: 0, startSeat }), T0, rand);
    receive(room, tokens[0], msg('removeSeat', { seat: removed }), T0, rand);
    return room.options.startSeat;
  };
  assert.equal(run(2, 2), 'random');
  assert.equal(run(3, 1), 2);
  assert.equal(run(1, 3), 1);
  assert.equal(run('random', 1), 'random');
});

test('setOptions: beyaz liste dışı illegal', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  const [h, b] = tokens;
  const r = receive(room, h, msg('setOptions', { turnSeconds: 60, startSeat: 3 }), T0, rand);
  assert.deepEqual(room.options, { turnSeconds: 60, startSeat: 3 });
  assert.deepEqual(lastLobby(r).options, { turnSeconds: 60, startSeat: 3 });
  for (const bad of [{ turnSeconds: 45 }, { turnSeconds: '30' }, { turnSeconds: -1 }, { startSeat: 6 }, { startSeat: -1 }, { startSeat: 1.5 }, { startSeat: 'ilk' }, { startSeat: null }]) {
    assert.equal(errCode(receive(room, h, msg('setOptions', bad), T0, rand), h), 'illegal', JSON.stringify(bad));
  }
  assert.deepEqual(room.options, { turnSeconds: 60, startSeat: 3 });
  for (const ok of [0, 30, 60, 120]) assert.equal(receive(room, h, msg('setOptions', { turnSeconds: ok }), T0, rand).changed, true);
  assert.equal(errCode(receive(room, b, msg('setOptions', { turnSeconds: 30 }), T0, rand), b), 'notHost');
});

test('leave: lobide koltuk kalkar ve host devredilir', () => {
  const { room, tokens } = lobbyWith('A', 'B', 'C');
  const [a, b, c] = tokens;
  disconnect(room, b, T0); // B çevrimdışı: devir C'ye gitmeli
  let r = receive(room, a, msg('leave'), T0, rand);
  assert.deepEqual(r.out[0], { to: a, msg: null, close: true });
  assert.deepEqual(room.seats.map(s => s.name), ['B', 'C']);
  assert.equal(room.hostToken, c);
  assert.equal(room.seats[1].ready, true);
  assert.equal(sent(r, c).find(x => x.t === 'welcome').you.seat, 1);
  assert.equal(lastLobby(r).seats[1].host, true);
  assert.equal(lastLobby(r).seats.filter(s => s.host).length, 1);
  // çevrimiçi kimse yoksa en küçük numaralı insan
  disconnect(room, c, T0);
  receive(room, c, msg('leave'), T0, rand);
  assert.equal(room.hostToken, b);
  receive(room, b, msg('leave'), T0, rand);
  assert.deepEqual([room.seats.length, room.hostToken], [0, null]);
  // sonraki ilk katılan host olur
  const n = fakeJoin(room, 'Yeni', T0, rand);
  assert.equal(room.hostToken, n);
  // host olmayan ayrılınca host değişmez
  const x = fakeJoin(room, 'X', T0, rand);
  receive(room, x, msg('leave'), T0, rand);
  assert.equal(room.hostToken, n);
});

test('receive: sürüm uyuşmazlığı version, bilinmeyen tip badMsg, host olmayan notHost', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  const [h, b] = tokens;
  let r = receive(room, h, { v: 2, t: 'ready', on: true }, T0, rand);
  assert.deepEqual([errCode(r, h), r.out[0].close], ['version', true]);
  assert.equal(errCode(receive(room, h, { t: 'ping' }, T0, rand), h), 'version');
  for (const bad of ['x', 5, null, [], undefined]) assert.equal(errCode(receive(room, h, bad, T0, rand), h), 'badMsg');
  for (const t of ['yok', 'start', 'act', 'emote', 'rematch', 'hello', '__proto__', 'constructor', 'toString', undefined, 5]) {
    r = receive(room, h, msg(t), T0, rand);
    assert.equal(errCode(r, h), 'badMsg', String(t));
    assert.equal(r.out[0].close, undefined);
  }
  assert.equal(errCode(receive(room, b, msg('addBot'), T0, rand), b), 'notHost');
  assert.equal(errCode(receive(room, b, msg('removeSeat', { seat: 0 }), T0, rand), b), 'notHost');
  assert.equal(errCode(receive(room, 'f'.repeat(32), msg('ready', { on: true }), T0, rand), 'f'.repeat(32)), 'illegal'); // tanınmayan gönderen
});

test('ping: pong döner ve lastActivity değişmez', () => {
  const { room, tokens } = lobbyWith('Ayşe');
  const clock = mkClock(T0 + 100);
  room.lastActivity = T0;
  const r = receive(room, tokens[0], msg('ping'), clock(), rand);
  assert.deepEqual(r, { out: [{ to: tokens[0], msg: { v: 1, t: 'pong' } }], changed: false });
  assert.equal(room.lastActivity, T0);
  receive(room, tokens[0], msg('addBot'), clock.tick(50), rand);
  assert.equal(room.lastActivity, T0 + 150);
});

test('lobby yayını token içermez ve her insana gider', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak', 'Can');
  const [h, b, c] = tokens;
  const all = [];
  const run = r => { all.push(...r.out); assertNoTokenLeak(room, r.out); return r; };
  run(receive(room, h, msg('addBot', { level: 'hard' }), T0, rand));
  run(receive(room, b, msg('ready', { on: true }), T0, rand));
  run(receive(room, h, msg('setOptions', { turnSeconds: 30 }), T0, rand));
  const r = run(receive(room, h, msg('setBot', { seat: 3, level: 'easy' }), T0, rand));
  assert.deepEqual(r.out.map(o => o.to).sort(), [...tokens].sort()); // bot'a mesaj yok, 3 insana lobi
  const lobby = lastLobby(r);
  assert.equal(lobby.phase, 'lobby');
  assert.deepEqual(Object.keys(lobby.seats[0]).sort(), ['avatar', 'bot', 'host', 'level', 'name', 'online', 'ready', 'seat']);
  assert.equal(lobby.seats.length, 4);
  run(join(room, { name: 'Deniz', avatar: 2 }, T0, rand));
  run(disconnect(room, c, T0));
  // JSON ile çoğaltılan oda aynı sonucu verir (disk anlık görüntüsü)
  const a = room, copy = JSON.parse(JSON.stringify(room));
  const step = (rm, rnd) => [receive(rm, h, msg('removeSeat', { seat: 1 }), T0 + 9, rnd), join(rm, { name: 'Yeni', avatar: 4 }, T0 + 9, rnd)];
  assert.deepEqual(step(copy, mkRand(5)), step(a, mkRand(5)));
  assert.deepEqual(copy, a);
});

test('disconnect: online false, lostAt dolu, lobi yayınlanır', () => {
  const { room, tokens } = lobbyWith('Ayşe', 'Burak');
  const [h, b] = tokens;
  const r = disconnect(room, b, T0 + 77);
  assert.deepEqual([room.seats[1].online, room.seats[1].lostAt, r.changed], [false, T0 + 77, true]);
  assert.equal(lastLobby(r).seats[1].online, false);
  assert.deepEqual(r.out.map(o => o.to), [h, b]); // çevrimdışı token'a giden mesajı hub sessizce düşürür
  assert.equal(room.hostToken, h); // devir 30 sn sonra (N08)
  const again = disconnect(room, b, T0 + 99);
  assert.deepEqual([again.out, again.changed, room.seats[1].lostAt], [[], false, T0 + 77]);
  assert.deepEqual(disconnect(room, 'f'.repeat(32), T0), { out: [], changed: false });
});
