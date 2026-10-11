// Çevrimiçi menü saf yardımcıları (OL-3/4): kod, derin link, lobi modeli, avatar eşlemesi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, isCode, invalidChars, parseRoomParam, takeRoomLink, shareLink, avatarIndex, avatarById, createError, joinCheck, lobbyModel, connText } from '../src/menu-online.js';
import { AVATAR_IDS } from '../src/data.js';

test('kod: normalleştirme ve doğrulama', () => {
  assert.equal(cleanCode(' ab c 234 '), 'ABC234');
  assert.equal(cleanCode('abcdefghj'), 'ABCDEF');
  assert.ok(isCode('ABC234'));
  assert.ok(!isCode('ABC23'));
  assert.ok(!isCode('ABC230')); // 0 alfabede yok
  assert.ok(!isCode('abc234'));
  assert.deepEqual(invalidChars('a0o1i0'), ['0', 'O', '1', 'I']);
  assert.deepEqual(invalidChars('ABC234'), []);
  assert.deepEqual(invalidChars('ab-c'), ['-']);
});

test('derin link: ?oda ayrıştırma ve URL temizliği', () => {
  assert.equal(parseRoomParam('?oda=abc234'), 'ABC234');
  assert.equal(parseRoomParam('?x=1&oda=abc%20234'), 'ABC234');
  assert.equal(parseRoomParam('?oda=abc'), null);
  assert.equal(parseRoomParam('?oda=ABC230'), null);
  assert.equal(parseRoomParam(''), null);
  const calls = [];
  const hist = { state: { k: 1 }, replaceState: (...a) => calls.push(a) };
  const loc = { search: '?oda=abc234&x=1', href: 'https://h.test/p/?oda=abc234&x=1#z' };
  assert.equal(takeRoomLink(loc, hist), 'ABC234');
  assert.deepEqual(calls, [[{ k: 1 }, '', '/p/?x=1#z']]);
  calls.length = 0;
  assert.equal(takeRoomLink({ search: '?oda=zz', href: 'https://h.test/?oda=zz' }, hist), null);
  assert.equal(calls.length, 1); // geçersiz kod da silinir
  assert.equal(takeRoomLink({ search: '', href: 'https://h.test/' }, hist), null);
  assert.equal(calls.length, 1); // param yoksa dokunulmaz
  assert.equal(shareLink('https://h.test', 'ABC234'), 'https://h.test/?oda=ABC234');
});

test('avatar id <-> indeks', () => {
  AVATAR_IDS.forEach((id, i) => { assert.equal(avatarIndex(id), i); assert.equal(avatarById(i).id, id); });
  assert.equal(avatarIndex('yok'), 0);
  assert.equal(avatarById(9).id, AVATAR_IDS[0]);
});

test('HTTP hata/katılma metinleri', () => {
  assert.match(createError(429), /Çok fazla/);
  assert.match(createError(503), /dolu/);
  assert.deepEqual(joinCheck(200, { exists: true, phase: 'lobby', joinable: true }, false), { ok: true });
  assert.match(joinCheck(200, { exists: false }, false).msg, /yok/);
  assert.match(joinCheck(200, { exists: true, phase: 'game', joinable: false }, false).msg, /başladı/);
  assert.match(joinCheck(200, { exists: true, phase: 'lobby', joinable: false }, false).msg, /dolu/);
  assert.deepEqual(joinCheck(200, { exists: true, phase: 'game', joinable: false }, true), { ok: true }); // token sahibi döner
  assert.equal(joinCheck(200, { exists: false }, true).ok, false);
  assert.equal(joinCheck(429, null, false).ok, false);
  assert.equal(joinCheck(0, null, false).ok, false);
  assert.equal(connText('ok'), '');
  assert.ok(connText('lost'));
});

const seat = (seat, o = {}) => ({ seat, name: `P${seat}`, avatar: 1, bot: false, level: null, ready: false, online: true, host: false, ...o });
const lobby = (seats, options) => ({ seats, options, phase: 'lobby' });

test('lobi modeli: Başlat ne zaman etkin', () => {
  const host = seat(0, { host: true, ready: true });
  assert.equal(lobbyModel({ lobby: lobby([host]), you: 0 }).canStart, false); // tek koltuk
  const bot = seat(1, { bot: true, level: 'hard', ready: true, avatar: 0 });
  assert.equal(lobbyModel({ lobby: lobby([host, bot]), you: 0 }).canStart, true);
  const guest = seat(1);
  const m = lobbyModel({ lobby: lobby([host, guest, seat(2, { bot: true, level: 'easy', ready: true })]), you: 0 });
  assert.equal(m.canStart, false);
  assert.match(m.hint, /hazır/);
  assert.equal(lobbyModel({ lobby: lobby([host, { ...guest, ready: true }]), you: 0 }).canStart, true);
  // misafir asla başlatamaz
  const g = lobbyModel({ lobby: lobby([host, { ...guest, ready: true }]), you: 1 });
  assert.equal(g.canStart, false);
  assert.equal(g.isHost, false);
  assert.equal(g.myReady, true);
});

test('lobi modeli: host kontrolleri kime görünür', () => {
  const host = seat(0, { host: true, ready: true });
  const bot = seat(1, { bot: true, level: 'medium', ready: true });
  const guest = seat(2);
  const h = lobbyModel({ lobby: lobby([host, bot, guest]), you: 0 });
  assert.deepEqual(h.seats.map(s => s.canRemove), [false, true, true]); // host kendini atamaz
  assert.deepEqual(h.seats.map(s => s.canSetLevel), [false, true, false]);
  assert.equal(h.canAddBot, true);
  const g = lobbyModel({ lobby: lobby([host, bot, guest]), you: 2 });
  assert.ok(g.seats.every(s => !s.canRemove && !s.canSetLevel));
  assert.equal(g.canAddBot, false);
  assert.equal(g.seats[2].isYou, true);
  assert.equal(g.seats[1].levelText, 'Orta');
  const full = lobbyModel({ lobby: lobby(Array.from({ length: 6 }, (_, i) => seat(i, i ? { bot: true, level: 'easy', ready: true } : { host: true, ready: true }))), you: 0 });
  assert.equal(full.canAddBot, false);
  assert.equal(lobbyModel({ lobby: null, you: null }).seats.length, 0);
});

test('findLiveRoom: yaşayan oda kodu döner, ölü odanın kaydı silinir, ağ hatasında kalır', async () => {
  const { createStore, roomKey } = await import('../src/store.js');
  const mem = new Map();
  const st = createStore({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i], get length() { return mem.size; } });
  const { findLiveRoom, savedRooms } = await import('../src/menu-online.js');
  st.set(roomKey('ABC234'), 't1'); st.set(roomKey('DEF567'), 't2'); st.set(roomKey('BAD000'), 't3'); st.set('ahilik.profile', {});
  assert.deepEqual(savedRooms(st).sort(), ['ABC234', 'DEF567']); // geçersiz kod ve başka anahtarlar atlanır
  const answers = { ABC234: { status: 200, body: { exists: false } }, DEF567: { status: 200, body: { exists: true, phase: 'game' } } };
  const asked = [];
  const code = await findLiveRoom(async c => { asked.push(c); return answers[c]; }, st);
  assert.equal(code, 'DEF567');
  assert.equal(st.get(roomKey('ABC234')), null, 'ölü oda unutuldu');
  assert.equal(await findLiveRoom(async () => ({ status: 0, body: null }), st), null);
  assert.equal(st.get(roomKey('DEF567')), 't2', 'ağ hatasında kayıt kalır');
});

test('savedRooms: en son katılınan oda (ahilik.lastRoom) önce denenir', async () => {
  const { createStore, roomKey } = await import('../src/store.js');
  const { savedRooms } = await import('../src/menu-online.js');
  const mem = new Map();
  const st = createStore({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i], get length() { return mem.size; } });
  st.set(roomKey('ABC234'), 'a'.repeat(32)); st.set(roomKey('DEF567'), 'b'.repeat(32));
  st.set('ahilik.lastRoom', 'DEF567');
  assert.equal(savedRooms(st)[0], 'DEF567');
  st.set('ahilik.lastRoom', 'ABC234');
  assert.equal(savedRooms(st)[0], 'ABC234');
});
