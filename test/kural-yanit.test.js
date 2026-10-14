// Yazar cevapları (2026-10-12): olumsuz kart cezası, yazılı kart okuma hakları, tek bitiş kuralı, Kargo kapsamı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalActions, apply, score } from '../src/game.js';
import { ILKELER } from '../src/data.js';
import { rejectReason } from '../src/ui.js';
import { createRoom, resumeRoom } from '../server/room.js';

const P2 = [{ name: 'A' }, { name: 'B' }];
const P3 = [...P2, { name: 'C' }];
const place = (s, pi, tile) => {
  const o = s.tiles[s.players[pi].pos].occupants;
  o.splice(o.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi);
  s.players[pi].pos = tile;
};
const moveState = ({ pos = 0, hand = [], players = P2 } = {}) => {
  const s = newGame({ players, seed: 7 });
  s.phase = 'move'; place(s, 0, pos);
  s.players[0].hand = hand; s.players[0].task = 'ticaret-kayseri-0';
  return s;
};
const types = (s) => legalActions(s).map((a) => a.type);
const step = (s, a) => apply(s, a).state;
const closeComert = (s) => { s.tiles[16].closed = true; s.tiles[16].closedBy = 'ahlak-comert-neg'; return s; };
const COMERT4 = ['yol-comert-0', 'yol-comert-1', 'yol-comert-2', 'yol-comert-3'];

// ---- 1. olumsuz kart, boş kare yok ----
test('olumsuz kart, boş kare yok: min(2, rozet) öder, event.paid, kart ıskartada', () => {
  for (const [badges, paid] of [[5, 2], [1, 1], [0, 0]]) {
    const s = newGame({ players: P2, seed: 3 });
    for (const t of s.tiles) if (t.ilke === 'comert') t.closed = true; // kapatılacak açık kare kalmadı
    s.decks.ahlak.push('ahlak-comert-neg'); s.players[0].badges = badges;
    const { state, events } = apply(s, { type: 'drawAhlak' });
    assert.equal(state.players[0].badges, badges - paid);
    assert.equal(state.phase, 'move');
    assert.ok(state.decks.ahlakDiscard.includes('ahlak-comert-neg'));
    const e = events.find((x) => x.type === 'ahlak');
    assert.equal(e.paid, paid);
    if (paid) assert.match(e.text, new RegExp(`${paid} rozet`));
  }
});

// ---- 2. yazılı kart okuma hakları ----
test('texts: hamlede doğar, hamleyle düşmez; iki yazılı kart iki hak; readText ilkini okur', () => {
  let s = moveState({ hand: ['yol-merhametli-0', 'yol-comert-0', 'yol-comert-1', 'yol-comert-2'] });
  s = step(s, { type: 'move', card: 'yol-merhametli-0', tile: 1 });
  assert.deepEqual(s.players[0].texts, ['yol-merhametli-0']);
  s = step(s, { type: 'move', card: 'yol-comert-0', tile: 7 });
  assert.deepEqual(s.players[0].texts, ['yol-merhametli-0', 'yol-comert-0']);
  s = step(s, { type: 'readText' });
  assert.deepEqual(s.players[0].texts, ['yol-comert-0']);
  assert.equal(s.players[0].badges, 1);
  s = step(s, { type: 'readText' });
  assert.deepEqual(s.players[0].texts, []);
  assert.ok(!types(s).includes('readText'));
});

test('texts: tur sonunda temizlenir', () => {
  let s = moveState({ hand: ['yol-merhametli-0', 'yol-comert-1'] });
  s = step(s, { type: 'move', card: 'yol-merhametli-0', tile: 1 });
  assert.deepEqual(step(s, { type: 'endTurn' }).players[0].texts, []);
});

test('texts: solo yol açmada yazılı kart hak doğurur; yol açılamazsa doğmaz', () => {
  let s = closeComert(moveState({ hand: [...COMERT4, 'yol-comert-4'] }));
  s = step(s, { type: 'openRoad', tile: 16, cards: COMERT4 });
  assert.ok(!s.tiles[16].closed);
  assert.deepEqual(s.players[0].texts, ['yol-comert-0']);
  // açılamayan yol: kimse katkı vermez, kartlar elde kalır, hak yok
  let f = closeComert(moveState({ hand: ['yol-comert-0', 'yol-comert-1'], players: P3 }));
  f = step(f, { type: 'openRoad', tile: 16, cards: ['yol-comert-0', 'yol-comert-1'] });
  f = step(f, { type: 'contribute', cards: [] });
  f = step(f, { type: 'contribute', cards: [] });
  assert.ok(f.tiles[16].closed);
  assert.deepEqual(f.players[0].texts, []);
});

test('texts: katkıda yazılı kart katkıcıya hak verir; sahibinin turu bitene kadar durur, kendi sırasında okur', () => {
  let s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2'], players: P3 }));
  s.players[1].hand = ['yol-comert-0', 'yol-comert-3', 'yol-durust-1'];
  s = step(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1', 'yol-comert-2'] });
  assert.deepEqual(s.players[0].texts, []);
  s = step(s, { type: 'contribute', cards: ['yol-comert-0', 'yol-comert-3'] });
  assert.ok(!s.tiles[16].closed);
  assert.deepEqual(s.players[1].texts, ['yol-comert-0']);
  assert.ok(!types(s).includes('readText')); // aktif A: hakkı yok
  s.movesThisTurn = 1;
  s = step(s, { type: 'endTurn' }); // A bitirir; B'nin hakkı durur
  assert.deepEqual(s.players[1].texts, ['yol-comert-0']);
  s.phase = 'move';
  assert.equal(s.active, 1);
  assert.ok(types(s).includes('readText'));
  const b = s.players[1].badges;
  s = step(s, { type: 'readText' });
  assert.equal(s.players[1].badges, b + 1);
  assert.deepEqual(s.players[1].texts, []);
});

test('texts: sahibinin turu bitince okunmamış hak silinir', () => {
  let s = closeComert(moveState({ hand: ['yol-comert-1'], players: P3 }));
  s.players[1].hand = ['yol-comert-0', 'yol-comert-2', 'yol-comert-3'];
  s = step(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1'] });
  s = step(s, { type: 'contribute', cards: ['yol-comert-0', 'yol-comert-2', 'yol-comert-3'] });
  s.movesThisTurn = 1;
  s = step(s, { type: 'endTurn' });
  s.phase = 'move'; s.movesThisTurn = 1;
  s = step(s, { type: 'endTurn' }); // B, hakkını kullanmadan bitirir
  assert.deepEqual(s.players[1].texts, []);
});

// ---- 3. tek bitiş kuralı ----
const lastCard = (long = false) => {
  const s = newGame({ players: P3, seed: 5, startIdx: 0, long });
  s.decks.ahlak = ['ahlak-comert-0'];
  return s;
};
const finishTurn = (s) => { s.movesThisTurn = 1; return apply(s, { type: 'endTurn' }); };

test('bitiş: son ahlak kartı çekilince tur sürer, o oyuncunun turu bitince oyun biter', () => {
  const s = step(lastCard(), { type: 'drawAhlak' });
  assert.ok(s.endgame); assert.equal(s.phase, 'move'); assert.equal(s.active, 0);
  const r = finishTurn(s); // A başlangıç oyuncusu; eski kural B ve C'yi de oynatırdı
  assert.equal(r.state.phase, 'over');
  assert.ok(r.events.some((e) => e.type === 'over'));
});

test('bitiş: setEnd metni "ilk oyuncuya kadar" demez', () => {
  const { events } = apply(lastCard(), { type: 'drawAhlak' });
  const e = events.find((x) => x.type === 'endgame');
  assert.ok(e && !/ilk oyuncu/.test(e.text));
});

test('bitiş: ticaret destesi tükenince tetikleyen tur bitince oyun biter', () => {
  let s = moveState({ pos: 17, hand: ['yol-durust-1'] });
  s.decks.ticaret = ['ticaret-konya-0'];
  s = step(step(s, { type: 'move', card: 'yol-durust-1', tile: 18 }), { type: 'enterCity' });
  assert.ok(s.endgame); assert.equal(s.phase, 'move');
  assert.equal(apply(s, { type: 'endTurn' }).state.phase, 'over');
});

test('bitiş: ödül havuzları boşalınca oyun bitmez', () => {
  let s = closeComert(moveState({ hand: COMERT4 }));
  for (const k of Object.keys(s.awards)) s.awards[k] = k === 'comert' ? 4 : 0;
  s = step(s, { type: 'openRoad', tile: 16, cards: COMERT4 });
  assert.equal(s.awards.comert, 0);
  assert.equal(s.endgame, false);
});

test('bitiş: uzun oyunda ilk tükenmede ıskarta karışır, ikincide biter', () => {
  let s = lastCard(true);
  s.decks.ahlakDiscard = ['ahlak-durust-0', 'ahlak-durust-1'];
  s = step(s, { type: 'drawAhlak' });
  assert.equal(s.endgame, false);
  s = finishTurn(s).state; // B'nin turu başlar: ıskarta karıştı
  assert.ok(s.reshuf); assert.equal(s.decks.ahlak.length, 3); assert.equal(s.phase, 'ahlak');
  s.decks.ahlak = ['ahlak-comert-1'];
  s = step(s, { type: 'drawAhlak' });
  assert.ok(s.endgame);
  assert.equal(finishTurn(s).state.phase, 'over');
});

// ---- 5. Kargo kapsamı: takas ve yol açma "hamle" sayılmaz ----
test('kargo: takas ve yol açmadan sonra hâlâ yasal', () => {
  let s = closeComert(moveState({ hand: ['yol-kargo-0', ...COMERT4, 'yol-merhametli-1'], players: P2 }));
  s.players[1].hand = ['yol-durust-1', 'yol-durust-2'];
  s = step(s, { type: 'offerTrade', withPlayer: 1, give: 'yol-merhametli-1', want: 'durust' });
  s = step(s, { type: 'respondTrade', accept: true, card: 'yol-durust-1' });
  assert.ok(types(s).includes('kargo'));
  s = step(s, { type: 'openRoad', tile: 16, cards: COMERT4 });
  assert.ok(!s.tiles[16].closed);
  assert.ok(types(s).includes('kargo'));
});

// ---- 5. skor: 0-4 rozet ×1 ----
test('score: 0-4 rozet çarpan x1, 5 rozet x2', () => {
  const s = newGame({ players: P2, seed: 1 });
  s.players[0].trades = ['ticaret-ankara-0']; s.players[1].trades = ['ticaret-ankara-0'];
  s.players[0].badges = 4; s.players[1].badges = 5;
  const m = Object.fromEntries(score(s).map((r) => [r.pIdx, r.mult]));
  assert.deepEqual(m, { 0: 1, 1: 2 });
});

// ---- 6. dolu ilke karesine girilmez (yazar cevabı 10) ----
test('dolu kare: ilke karesine başka piyon move ile girebilir, iki piyon aynı karede; kapatma dolu kareyi dışlar', () => {
  const s = moveState({ pos: 0, hand: ['yol-merhametli-1'] });
  const target = legalActions(s).find((a) => a.type === 'move');
  assert.ok(target, 'kurulum: bir hamle olmalı');
  const occ = structuredClone(s); place(occ, 1, target.tile);
  assert.ok(legalActions(occ).some((a) => a.type === 'move' && a.tile === target.tile));
  assert.deepEqual(step(occ, { type: 'move', card: target.card, tile: target.tile }).tiles[target.tile].occupants.sort(), [0, 1]);
  assert.equal(rejectReason(occ, legalActions(occ), null, 0, target.tile), null);
});

test('dolu kare: şehir karesinde birden çok piyon olabilir (enterCity serbest)', () => {
  let s = moveState({ pos: 17, hand: ['yol-durust-1'] });
  s = step(s, { type: 'move', card: 'yol-durust-1', tile: 18 });
  place(s, 1, 24); // Kayseri'de başka piyon var
  s = step(s, { type: 'enterCity' });
  assert.deepEqual(s.tiles[24].occupants.sort(), [0, 1]);
});

// ---- 4. ad ----
test('olumsuz kart adı: Haksızlık Eden', () => assert.equal(ILKELER.adaletli.neg, 'Haksızlık Eden'));

// ---- sunucu snapshot uyumu ----
test('resumeRoom: eski biçimli oda durumu texts\'e göç eder', () => {
  const room = createRoom({ code: 'K7M2QX', now: 1 });
  room.phase = 'over';
  const state = newGame({ players: P2, seed: 1 });
  for (const p of state.players) delete p.texts;
  const OLD = 'pending' + 'Text';
  state.players[0][OLD] = 'yol-comert-0'; state.players[1][OLD] = null;
  room.game = { state, version: 1 };
  resumeRoom(room, 2);
  assert.deepEqual(state.players.map((p) => p.texts), [['yol-comert-0'], []]);
  assert.ok(state.players.every((p) => !(OLD in p)));
});
