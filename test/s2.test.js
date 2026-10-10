// S2 rule-compliance tests (SPEC v6): AHI-004 enterCity, AHI-007 reading, AHI-006 free road cards, AHI-005 early kargo, AHI-008 empty road call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply, actor } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { viewFor } from '../src/view.js';

const decide = (s) => botAction(viewFor(s, actor(s), 't'), legalActions(s));

const P2 = [{ name: 'A', bot: false }, { name: 'B', bot: true }];
const P3 = [...P2, { name: 'C', bot: true }];
const place = (s, pi, tile) => {
  const o = s.tiles[s.players[pi].pos].occupants;
  o.splice(o.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi);
  s.players[pi].pos = tile;
};
const moveState = ({ pos = 0, hand = [], task = 'ticaret-kayseri-0', players = P2 } = {}) => {
  const s = newGame({ players, seed: 7 });
  s.phase = 'move';
  place(s, 0, pos);
  s.players[0].hand = hand;
  s.players[0].task = task;
  return s;
};
const types = (s) => legalActions(s).map((a) => a.type);
const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));
const step = (s, a) => apply(s, a).state;
const closeComert = (s) => { s.tiles[16].closed = true; s.tiles[16].closedBy = 'ahlak-comert-neg'; return s; };
// Kayseri (tile 24) neighbors: 18 durust, 19 comert, 23 adaletli

// ---- AHI-004 ----
test('enterCity: komşu kareye varınca ticaret otomatik tamamlanmaz', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1', 'yol-comert-1'] });
  const { state: r, events } = apply(s, { type: 'move', card: 'yol-durust-1', tile: 18 });
  assert.deepEqual(r.players[0].trades, []);
  assert.equal(r.players[0].pos, 18);
  assert.equal(r.moveDone, false);
  assert.ok(events.some((e) => e.type === 'nearCity' && e.pIdx === 0 && e.city === 'kayseri' && e.text));
  const t = types(r);
  assert.ok(t.includes('enterCity') && t.includes('move') && t.includes('endTurn'));
  assert.ok(t.indexOf('enterCity') < t.indexOf('move'));
});

test('enterCity: yol uzatılır, rozet toplanır, sonra şehre girilir', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1', 'yol-comert-1'] });
  s.tiles[19].badges = 2;
  let r = step(s, { type: 'move', card: 'yol-durust-1', tile: 18 });
  r = step(r, { type: 'move', card: 'yol-comert-1', tile: 19 });
  assert.equal(r.players[0].badges, 2);
  assert.equal(r.players[0].trades.length, 0);
  r = step(r, { type: 'enterCity' });
  assert.deepEqual(r.players[0].trades, ['ticaret-kayseri-0']);
  assert.equal(r.players[0].pos, 24);
  assert.equal(r.moveDone, true);
});

test('enterCity: tur sonunda hâlâ komşuysa otomatik teslim (endTurn, pass, kargo)', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1'] });
  const near = step(s, { type: 'move', card: 'yol-durust-1', tile: 18 });
  const e = apply(near, { type: 'endTurn' });
  assert.deepEqual(e.state.players[0].trades, ['ticaret-kayseri-0']);
  assert.equal(e.state.players[0].pos, 24);
  assert.ok(e.events.some((x) => x.type === 'trade'));
  assert.equal(e.state.active, 1);
  // pass from a neighbor tile with no playable move
  const p = moveState({ pos: 18, hand: [] });
  assert.ok(types(p).includes('pass'));
  assert.deepEqual(step(p, { type: 'pass' }).players[0].trades, ['ticaret-kayseri-0']);
  // kargo from a neighbor tile still works and ends the turn
  const k = moveState({ pos: 18, hand: ['yol-kargo-0'] });
  const kr = step(k, { type: 'kargo', card: 'yol-kargo-0', city: 'konya' });
  assert.equal(kr.active, 1);
  assert.equal(kr.players[0].pos, 20);
  // leaving the neighbor tile means no delivery
  const away = moveState({ pos: 17, hand: ['yol-durust-1', 'yol-bilgili-1'] });
  const a1 = step(step(away, { type: 'move', card: 'yol-durust-1', tile: 18 }), { type: 'move', card: 'yol-bilgili-1', tile: 17 });
  assert.deepEqual(step(a1, { type: 'endTurn' }).players[0].trades, []);
});

test('enterCity: komşu değilken yasadışı', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1'] });
  assert.ok(!types(s).includes('enterCity'));
  assert.throws(() => apply(s, { type: 'enterCity' }));
  const done = step(step(moveState({ pos: 17, hand: ['yol-durust-1'] }), { type: 'move', card: 'yol-durust-1', tile: 18 }), { type: 'enterCity' });
  assert.throws(() => apply(done, { type: 'enterCity' }));
});

test('enterCity: teslimden sonra yalnız readText ve endTurn; aynı şehir zincirlenir', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-0', 'yol-durust-1'] });
  s.decks.ticaret.push('ticaret-konya-0', 'ticaret-kayseri-1');
  const r = step(step(s, { type: 'move', card: 'yol-durust-0', tile: 18 }), { type: 'enterCity' });
  assert.deepEqual(r.players[0].trades, ['ticaret-kayseri-0', 'ticaret-kayseri-1']);
  assert.equal(r.players[0].task, 'ticaret-konya-0');
  assert.deepEqual(types(r), ['readText', 'endTurn']);
});

test('bot: komşu karede enterCity çağırır', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1', 'yol-comert-1'] });
  s.players[0].bot = true;
  const near = step(s, { type: 'move', card: 'yol-durust-1', tile: 18 });
  assert.deepEqual(decide(near), { type: 'enterCity' });
});

// ---- AHI-007 ----
const textMove = (extra = {}) => step(moveState({ pos: 0, hand: ['yol-merhametli-0', 'yol-merhametli-1', 'yol-comert-1', 'yol-comert-2', 'yol-comert-3', 'yol-comert-4'], ...extra }), { type: 'move', card: 'yol-merhametli-0', tile: 1 });

test('readText: solo yol açma sonrası hâlâ yasal', () => {
  const s = closeComert(textMove());
  const four = legalActions(s).filter((a) => a.type === 'openRoad').find((a) => a.cards.length === 4);
  const r = step(s, four);
  assert.ok(!r.tiles[16].closed);
  assert.ok(types(r).includes('readText'));
  assert.equal(step(r, { type: 'readText' }).players[0].badges, 4 + 1);
});

test('readText: ortak yol açma sonrası hâlâ yasal', () => {
  const s = closeComert(textMove({ players: P3 }));
  s.players[1].hand = ['yol-comert-5', 'yol-comert-6'];
  const open = legalActions(s).find((a) => a.type === 'openRoad' && a.cards.length === 2);
  let r = step(s, open);
  r = step(r, { type: 'contribute', cards: ['yol-comert-5', 'yol-comert-6'] });
  assert.ok(!r.tiles[16].closed);
  assert.equal(actor(r), 0);
  assert.ok(types(r).includes('readText'));
});

test('readText: reddedilen takas sonrası yasal', () => {
  const s = textMove();
  const offer = legalActions(s).find((a) => a.type === 'offerTrade');
  let r = step(s, offer);
  r = step(r, { type: 'respondTrade', accept: false });
  assert.ok(types(r).includes('readText'));
});

test('readText: ikinci move fırsatı siler', () => {
  const s = textMove();
  const r = step(s, { type: 'move', card: 'yol-comert-1', tile: 7 });
  assert.equal(r.players[0].pendingText, null);
  assert.ok(!types(r).includes('readText'));
  assert.equal(step(textMove(), { type: 'endTurn' }).players[0].pendingText, null);
});

// ---- AHI-006 ----
const roads = (s) => legalActions(s).filter((a) => a.type === 'openRoad' && a.cards.length).map((a) => a.cards);

test('openRoad: kartlar tür bazında tüm kombinasyonlarla sunulur', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2', 'yol-ahievran-0'] }));
  assert.deepEqual(roads(s), [['yol-comert-1'], ['yol-ahievran-0'], ['yol-comert-1', 'yol-comert-2'], ['yol-comert-1', 'yol-ahievran-0'], ['yol-comert-1', 'yol-comert-2', 'yol-ahievran-0']]);
  const m = closeComert(moveState({ hand: ['yol-comert-1', 'yol-ahievran-0', 'yol-comert-2', 'yol-comert-3', 'yol-adaletli-0'] }));
  assert.equal(roads(m).length, 7);
});

test('openRoad: yazılı kart ayrı tür', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-0', 'yol-comert-1'] }));
  assert.deepEqual(roads(s), [['yol-comert-0'], ['yol-comert-1'], ['yol-comert-0', 'yol-comert-1']]);
});

test('openRoad: ilk varyant eski varsayılan (ilke kartları el sırasıyla, joker sonda)', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-ahievran-0', 'yol-comert-2', 'yol-comert-3', 'yol-adaletli-0'] }));
  const all = roads(s), own = ['yol-comert-1', 'yol-comert-2', 'yol-comert-3', 'yol-ahievran-0'];
  for (let n = 1; n <= 4; n++) assert.deepEqual(all.find((c) => c.length === n), own.slice(0, n));
  assert.deepEqual(all.map((c) => c.length), [...all.map((c) => c.length)].sort());
});

test('openRoad: seçilen joker verilir, ilke kartı elde kalır', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-ahievran-0'] }));
  s.players[1].hand = ['yol-comert-3', 'yol-comert-4', 'yol-comert-5'];
  const a = { type: 'openRoad', tile: 16, cards: ['yol-ahievran-0'] };
  assert.ok(isLegal(s, a));
  let r = step(s, a);
  assert.deepEqual(r.pending.offers, [{ pIdx: 0, cards: ['yol-ahievran-0'] }]);
  r = step(r, { type: 'contribute', cards: ['yol-comert-3', 'yol-comert-4', 'yol-comert-5'] });
  assert.ok(!r.tiles[16].closed);
  assert.deepEqual(r.players[0].hand, ['yol-comert-1']);
  assert.ok(r.decks.yolDiscard.includes('yol-ahievran-0'));
});

test('contribute: kombinasyonlar need ile sınırlı', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2'] }));
  s.players[1].hand = ['yol-comert-3', 'yol-ahievran-0', 'yol-comert-4', 'yol-comert-5'];
  const r = step(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1', 'yol-comert-2'] });
  const c = legalActions(r).map((a) => a.cards);
  assert.deepEqual(c[0], []);
  assert.deepEqual(c.slice(1), [['yol-comert-3'], ['yol-ahievran-0'], ['yol-comert-3', 'yol-comert-4'], ['yol-comert-3', 'yol-ahievran-0']]);
  assert.ok(c.every((x) => x.length <= 2));
});

test('bot: yol katkısı varsayılan varyantı seçer', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2'] }));
  s.players[1].hand = ['yol-comert-3', 'yol-comert-4', 'yol-ahievran-0', 'yol-durust-1', 'yol-durust-2', 'yol-durust-3'];
  const r = step(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1', 'yol-comert-2'] });
  const a = decide(r);
  assert.ok(isLegal(r, a));
  assert.deepEqual(a.cards, ['yol-comert-3', 'yol-comert-4']);
});

// ---- AHI-008 ----
test('openRoad: tur başına en çok 2 çağrı', () => {
  let s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2'] }));
  s.players[1].hand = ['yol-durust-0'];
  const call = { type: 'openRoad', tile: 16, cards: ['yol-comert-1'] };
  for (let i = 0; i < 2; i++) {
    assert.ok(isLegal(s, call), `call ${i + 1}`);
    s = step(step(s, call), { type: 'contribute', cards: [] });
  }
  assert.equal(s.roadTries, 2);
  assert.ok(!types(s).includes('openRoad'));
  assert.throws(() => apply(s, call));
  s.movesThisTurn = 1;
  const next = step(s, { type: 'endTurn' });
  assert.equal(next.roadTries, 0);
});

test('openRoad: kartsız başlatma ortak yolu açar, rozet yalnız verenlere', () => {
  const s = closeComert(moveState({ hand: ['yol-durust-1'], players: P3 }));
  s.players[1].hand = ['yol-comert-1', 'yol-comert-2']; s.players[2].hand = ['yol-comert-3', 'yol-ahievran-0'];
  const zero = { type: 'openRoad', tile: 16, cards: [] };
  assert.deepEqual(legalActions(s).find((a) => a.type === 'openRoad'), zero);
  let r = step(s, zero);
  assert.equal(r.pending.need, 4);
  assert.equal(actor(r), 1);
  r = step(r, { type: 'contribute', cards: ['yol-comert-1', 'yol-comert-2'] });
  r = step(r, { type: 'contribute', cards: ['yol-comert-3', 'yol-ahievran-0'] });
  assert.equal(r.pending, null);
  assert.ok(!r.tiles[16].closed);
  assert.deepEqual(r.players.map((p) => p.badges), [0, 2, 2]);
  assert.equal(r.awards.comert, 0);
  assert.deepEqual(r.players[0].hand, ['yol-durust-1']);
});

test('openRoad: kartsız başlatma reddedilince roadFailed ve kart kaybı yok', () => {
  const s = closeComert(moveState({ hand: [] }));
  s.players[1].hand = ['yol-comert-1', 'yol-comert-2', 'yol-comert-3'];
  const r0 = step(s, { type: 'openRoad', tile: 16, cards: [] });
  const { state: r, events } = apply(r0, { type: 'contribute', cards: [] });
  assert.ok(events.some((e) => e.type === 'roadFailed'));
  assert.equal(r.pending, null);
  assert.ok(r.tiles[16].closed);
  assert.equal(r.players[1].hand.length, 3);
  assert.equal(r.decks.yolDiscard.length, 0);
  assert.equal(r.players[0].badges, 0);
});

// ---- AHI-005 ----
const ahlakState = (hand) => { const s = newGame({ players: P2, seed: 7 }); s.players[0].hand = hand; return s; };

test('kargo: ahlak fazında yasal, ahlak destesi azalmaz, sıra biter', () => {
  const s = ahlakState(['yol-kargo-0', 'yol-comert-1']);
  assert.equal(s.phase, 'ahlak');
  assert.deepEqual(types(s), ['drawAhlak', 'kargo', 'kargo', 'kargo']);
  const n = s.decks.ahlak.length;
  s.decks.ticaret.push('ticaret-ankara-0');
  const { state: r, events } = apply(s, { type: 'kargo', card: 'yol-kargo-0', city: 'kayseri' });
  assert.equal(r.decks.ahlak.length, n);
  assert.equal(r.active, 1);
  assert.equal(r.phase, 'ahlak');
  assert.equal(r.players[0].pos, 24);
  assert.equal(r.players[0].trades.length, 1);
  assert.ok(!events.some((e) => e.type === 'ahlak'));
  assert.equal(r.players[0].hand.length, 6);
});

test('kargo: kargo kartı yoksa ahlak fazında yalnız drawAhlak; close fazında yasadışı', () => {
  assert.deepEqual(types(ahlakState(['yol-comert-1'])), ['drawAhlak']);
  assert.throws(() => apply(ahlakState(['yol-comert-1']), { type: 'kargo', card: 'yol-comert-1', city: 'konya' }));
  const c = ahlakState(['yol-kargo-0']);
  c.phase = 'close'; c.pendingClose = 'comert';
  assert.ok(!types(c).includes('kargo'));
  assert.throws(() => apply(c, { type: 'kargo', card: 'yol-kargo-0', city: 'konya' }));
  // still playable after the ahlak card, before moving
  const m = ahlakState(['yol-kargo-0']); m.phase = 'move';
  assert.ok(types(m).includes('kargo'));
});

// ---- random legal-action walk: every action legalActions offers must be accepted by apply ----
test('fuzz: random legal actions (enterCity, kargo before ahlak, 0-card roads) never throw, cards conserved', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const n = 2 + (seed % 3);
    let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `R${i}`, bot: true })), seed });
    let x = seed * 2654435761 >>> 0;
    const rand = (k) => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % k; };
    for (let i = 0; i < 1500 && s.phase !== 'over'; i++) {
      const legal = legalActions(s);
      assert.ok(legal.length, `seed ${seed} step ${i}: no legal action`);
      s = step(s, legal[rand(legal.length)]);
      assert.equal(new Set([...s.players.flatMap((p) => p.hand), ...s.decks.yol, ...s.decks.yolDiscard]).size, 57);
      assert.ok(s.roadTries <= 2);
    }
  }
});
