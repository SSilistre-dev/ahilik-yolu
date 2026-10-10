import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply, score, actor, WANT_KINDS } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { CARDS, HAND_SIZE, PLAYER_COLORS } from '../src/data.js';

const P2 = [{ name: 'A', bot: false }, { name: 'B', bot: true }];
const P3 = [...P2, { name: 'C', bot: true }];
const fresh = (players = P2, seed = 7) => newGame({ players, seed });
const place = (s, pi, tile) => {
  const o = s.tiles[s.players[pi].pos].occupants;
  o.splice(o.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi);
  s.players[pi].pos = tile;
};
// move-phase state with controllable hand/task
const moveState = ({ pos = 0, hand = [], task = 'ticaret-kayseri-0', players = P2 } = {}) => {
  const s = fresh(players);
  s.phase = 'move';
  place(s, 0, pos);
  s.players[0].hand = hand;
  s.players[0].task = task;
  return s;
};
const types = (s) => legalActions(s).map((a) => a.type);
const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));
const closeComert = (s) => { s.tiles[16].closed = true; s.tiles[16].closedBy = 'ahlak-comert-neg'; return s; };
const yolCards = (s) => [...s.players.flatMap((p) => p.hand), ...s.decks.yol, ...s.decks.yolDiscard];

test('openRoad solo: 4 cards (incl. joker) open it at once, 1 card = 1 badge', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-ahievran-0', 'yol-comert-2', 'yol-comert-3', 'yol-adaletli-0'] }));
  const roads = legalActions(s).filter((a) => a.type === 'openRoad');
  assert.deepEqual(roads.map((a) => a.cards.length), [0, 1, 1, 2, 2, 3, 3, 4]); // v6: 0-card call + every kind combination
  const four = roads[7];
  assert.deepEqual(four.cards, ['yol-comert-1', 'yol-comert-2', 'yol-comert-3', 'yol-ahievran-0']); // ilke first, joker last
  const { state: r, events } = apply(s, four);
  assert.equal(r.pending, null);
  assert.ok(!r.tiles[16].closed && r.tiles[16].closedBy === null);
  assert.equal(r.players[0].badges, 4);
  assert.equal(r.awards.comert, 0);
  assert.deepEqual(r.players[0].hand, ['yol-adaletli-0']);
  assert.equal(r.decks.yolDiscard.length, 4);
  assert.deepEqual(r.decks.ahlakDiscard, ['ahlak-comert-neg']);
  assert.ok(events.find((e) => e.type === 'openRoad').text);
});

test('openRoad: jokers count; foreign, duplicate and >4 cards rejected', () => {
  const s = closeComert(moveState({ hand: ['yol-ahievran-0', 'yol-ahievran-1', 'yol-comert-1', 'yol-comert-2', 'yol-comert-3', 'yol-adaletli-0'] }));
  const road = (cards) => ({ type: 'openRoad', tile: 16, cards });
  assert.doesNotThrow(() => apply(s, road(['yol-ahievran-0', 'yol-ahievran-1'])));
  assert.throws(() => apply(s, road(['yol-adaletli-0'])));
  assert.throws(() => apply(s, road(['yol-comert-1', 'yol-comert-1'])));
  assert.throws(() => apply(s, road(['yol-comert-1', 'yol-comert-2', 'yol-comert-3', 'yol-ahievran-0', 'yol-ahievran-1'])));
  assert.throws(() => apply(s, { type: 'openRoad', tile: 7, cards: ['yol-comert-1'] })); // tile not closed
  const none = closeComert(moveState({ hand: ['yol-adaletli-0'] }));
  assert.deepEqual(legalActions(none).filter((a) => a.type === 'openRoad'), [{ type: 'openRoad', tile: 16, cards: [] }]); // v6: only the 0-card call
});

test('shared road: others asked in seat order, awards 2/2, cards leave only on success', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2', 'yol-adaletli-0'], players: P3 }));
  s.players[1].hand = ['yol-durust-0']; s.players[2].hand = ['yol-comert-3', 'yol-ahievran-0', 'yol-comert-4'];
  const a = apply(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1', 'yol-comert-2'] });
  assert.equal(a.state.pending.ask, 1);
  assert.equal(a.state.pending.need, 2);
  assert.equal(actor(a.state), 1);
  assert.ok(a.events.some((e) => e.type === 'roadAsk' && e.ask === 1 && e.need === 2));
  assert.equal(a.state.players[0].hand.length, 3); // nothing removed yet
  assert.deepEqual(legalActions(a.state), [{ type: 'contribute', cards: [] }]); // player 1 has no matching card
  const b = apply(a.state, { type: 'contribute', cards: [] }).state;
  assert.equal(actor(b), 2);
  assert.deepEqual(legalActions(b).map((x) => x.cards.length), [0, 1, 1, 2, 2]);
  assert.throws(() => apply(b, { type: 'contribute', cards: ['yol-comert-1'] })); // not own card
  assert.throws(() => apply(b, { type: 'contribute', cards: ['yol-comert-3', 'yol-comert-4', 'yol-ahievran-0'] })); // more than need
  assert.throws(() => apply(b, { type: 'endTurn' })); // only answers while pending
  const { state: r, events } = apply(b, { type: 'contribute', cards: ['yol-comert-3', 'yol-comert-4'] });
  assert.equal(r.pending, null);
  assert.equal(actor(r), 0);
  assert.equal(r.players[0].badges, 2);
  assert.equal(r.players[2].badges, 2);
  assert.equal(r.awards.comert, 0);
  assert.deepEqual(r.players[0].hand, ['yol-adaletli-0']);
  assert.deepEqual(r.players[2].hand, ['yol-ahievran-0']);
  assert.equal(r.decks.yolDiscard.length, 4);
  assert.deepEqual(r.decks.ahlakDiscard, ['ahlak-comert-neg']);
  assert.ok(!r.tiles[16].closed);
  assert.deepEqual(events.find((e) => e.type === 'openRoad').contrib,
    [{ pIdx: 0, cards: ['yol-comert-1', 'yol-comert-2'] }, { pIdx: 2, cards: ['yol-comert-3', 'yol-comert-4'] }]);
});

test('road failure: everyone asked, nobody loses cards, tile stays closed', () => {
  const s = closeComert(moveState({ hand: ['yol-comert-1', 'yol-comert-2'] }));
  s.players[1].hand = ['yol-comert-3', 'yol-durust-0'];
  const a = apply(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1', 'yol-comert-2'] }).state;
  const { state: r, events } = apply(a, { type: 'contribute', cards: ['yol-comert-3'] }); // 1 short, nobody left to ask
  assert.ok(events.some((e) => e.type === 'roadFailed' && e.tile === 16));
  assert.equal(r.pending, null);
  assert.ok(r.tiles[16].closed);
  assert.deepEqual(r.players[0].hand, ['yol-comert-1', 'yol-comert-2']);
  assert.deepEqual(r.players[1].hand, ['yol-comert-3', 'yol-durust-0']);
  assert.equal(r.awards.comert, 4);
  assert.equal(r.decks.yolDiscard.length, 0);
  assert.equal(r.players[0].badges, 0);
  assert.equal(actor(r), 0);
});

test('offerTrade -> accept swaps one card each', () => {
  const s = moveState({ hand: ['yol-comert-1', 'yol-durust-1'] });
  s.players[1].hand = ['yol-bilgili-0', 'yol-bilgili-1', 'yol-tokgozlu-1'];
  const offer = { type: 'offerTrade', withPlayer: 1, give: 'yol-comert-1', want: 'bilgili' };
  assert.ok(isLegal(s, offer));
  const o = apply(s, offer);
  assert.deepEqual(o.state.pending, { kind: 'trade', from: 0, to: 1, give: 'yol-comert-1', want: 'bilgili' });
  assert.ok(o.events.some((e) => e.type === 'tradeOffer' && e.to === 1));
  assert.equal(actor(o.state), 1);
  const resp = legalActions(o.state);
  assert.deepEqual(resp, [{ type: 'respondTrade', accept: true, card: 'yol-bilgili-0' }, { type: 'respondTrade', accept: true, card: 'yol-bilgili-1' }, { type: 'respondTrade', accept: false }]);
  assert.throws(() => apply(o.state, { type: 'respondTrade', accept: true, card: 'yol-tokgozlu-1' })); // wrong kind
  assert.throws(() => apply(o.state, { type: 'endTurn' })); // pending blocks everything else
  const { state: r, events } = apply(o.state, resp[1]);
  assert.deepEqual(r.players[0].hand, ['yol-bilgili-1', 'yol-durust-1']);
  assert.deepEqual(r.players[1].hand, ['yol-bilgili-0', 'yol-comert-1', 'yol-tokgozlu-1']);
  assert.equal(r.pending, null);
  assert.equal(actor(r), 0);
  assert.ok(events.some((e) => e.type === 'swap'));
  assert.equal(r.moveDone, false); // swapping does not end movement
  assert.throws(() => apply(s, { ...offer, withPlayer: 0 }));
  assert.throws(() => apply(s, { ...offer, give: 'yol-comert-9' }));
  assert.throws(() => apply(s, { ...offer, want: 'nope' }));
  assert.throws(() => apply(s, { type: 'respondTrade', accept: false })); // nothing pending
});

test('offerTrade -> decline records s.declined and blocks the same offer this turn only', () => {
  const s = moveState({ hand: ['yol-comert-1', 'yol-durust-1'] });
  s.players[1].hand = ['yol-bilgili-1'];
  const offer = { type: 'offerTrade', withPlayer: 1, give: 'yol-comert-1', want: 'bilgili' };
  const o = apply(s, offer).state;
  const { state: r, events } = apply(o, { type: 'respondTrade', accept: false });
  assert.deepEqual(r.declined, [{ to: 1, want: 'bilgili' }]);
  assert.ok(events.some((e) => e.type === 'tradeDeclined' && e.pIdx === 1 && e.from === 0 && e.want === 'bilgili'));
  assert.equal(r.pending, null);
  assert.deepEqual(r.players[0].hand, ['yol-comert-1', 'yol-durust-1']);
  const wants = legalActions(r).filter((a) => a.type === 'offerTrade' && a.withPlayer === 1).map((a) => a.want);
  assert.ok(!wants.includes('bilgili') && wants.includes('durust'));
  assert.throws(() => apply(r, { ...offer, give: 'yol-durust-1' })); // same (to, want), other give card
  r.movesThisTurn = 1;
  const n = apply(r, { type: 'endTurn' }).state;
  assert.deepEqual(n.declined, []);
  assert.equal(n.offersThisTurn, 0);
});

test("legalActions never leaks other players' cards", () => {
  const s = moveState({ hand: ['yol-comert-1', 'yol-comert-2', 'yol-durust-1'] });
  s.players[1].hand = ['yol-bilgili-0', 'yol-bilgili-1', 'yol-tokgozlu-1', 'yol-kargo-0'];
  const mine = new Set(s.players[0].hand);
  const offers = legalActions(s).filter((a) => a.type === 'offerTrade');
  assert.ok(offers.every((a) => mine.has(a.give) && WANT_KINDS.includes(a.want) && a.withPlayer === 1));
  assert.equal(offers.length, 2 * WANT_KINDS.length - 2); // 2 give kinds (comert deduped) x 9 wants, minus own-kind wants
  const theirs = JSON.stringify(legalActions(s));
  for (const id of s.players[1].hand) assert.ok(!theirs.includes(id), id);
  closeComert(s);
  const a = apply(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1'] }).state;
  assert.ok(!JSON.stringify(legalActions(a)).includes('yol-comert-2'));
});

test('endTurn requires a move; pass only when truly stuck', () => {
  const s = moveState({ hand: ['yol-merhametli-1', 'yol-durust-2'] });
  assert.ok(!types(s).includes('endTurn'));
  assert.throws(() => apply(s, { type: 'endTurn' }));
  assert.ok(!types(s).includes('pass')); // a merhametli move exists
  assert.throws(() => apply(s, { type: 'pass' }));
  const stuck = moveState({ hand: ['yol-comert-1', 'yol-durust-2'] });
  assert.ok(types(stuck).includes('pass') && !types(stuck).includes('endTurn'));
  const kargo = moveState({ hand: ['yol-comert-1', 'yol-kargo-0'] });
  assert.ok(!types(kargo).includes('pass')); // kargo counts as a legal move
  const m = apply(s, { type: 'move', card: 'yol-merhametli-1', tile: 1 }).state;
  assert.ok(types(m).includes('endTurn') && !types(m).includes('pass'));
  assert.throws(() => apply(m, { type: 'pass' }));
  const done = moveState({ hand: ['yol-comert-1'] });
  done.moveDone = true;
  assert.ok(types(done).includes('endTurn') && !types(done).includes('pass') && !types(done).includes('offerTrade'));
});

test('turn start: next player topped up to 6 before ahlak, with refill event', () => {
  const s = moveState({ hand: ['yol-comert-1'] });
  s.movesThisTurn = 1;
  s.players[1].hand = s.players[1].hand.slice(0, 2);
  const { state: r, events } = apply(s, { type: 'endTurn' });
  assert.equal(r.phase, 'ahlak');
  assert.equal(r.players[1].hand.length, 6);
  assert.equal(r.players[0].hand.length, 6);
  assert.ok(events.some((e) => e.type === 'refill' && e.pIdx === 1 && e.n === 4));
  const full = moveState({ hand: ['yol-comert-1', 'yol-comert-2', 'yol-comert-3', 'yol-comert-4', 'yol-comert-5', 'yol-comert-6'] });
  full.movesThisTurn = 1;
  assert.ok(!apply(full, { type: 'endTurn' }).events.some((e) => e.type === 'refill')); // n=0 => no event
});

test('actor() follows pending kind', () => {
  const s = moveState({ hand: ['yol-comert-1', 'yol-comert-2'] });
  assert.equal(actor(s), 0);
  s.active = 1; assert.equal(actor(s), 1); s.active = 0;
  s.pending = { kind: 'trade', from: 0, to: 1, give: 'yol-comert-1', want: 'bilgili' };
  assert.equal(actor(s), 1);
  s.pending = { kind: 'road', tile: 16, ilke: 'comert', offers: [], ask: 1, need: 2 };
  assert.equal(actor(s), 1);
  s.pending = null; s.phase = 'ahlak'; assert.equal(actor(s), 0);
});

test('5-6 players supported, 1 and 7 rejected, 6 distinct colours', () => {
  for (const n of [5, 6]) {
    const s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), seed: 3 });
    assert.equal(s.players.length, n);
    assert.equal(new Set(s.players.map((p) => p.color)).size, n);
    assert.ok(s.players.every((p) => p.hand.length === HAND_SIZE));
    assert.equal(yolCards(s).length, 57);
  }
  assert.equal(new Set(PLAYER_COLORS).size, 6);
  assert.throws(() => newGame({ players: [{ name: 'a' }], seed: 1 }));
  assert.throws(() => newGame({ players: Array.from({ length: 7 }, () => ({ name: 'x' })), seed: 1 }));
});

test('startIdx: starts there, game ends when turn wraps back to it', () => {
  let s = newGame({ players: P3, seed: 5, startIdx: 1 });
  assert.equal(s.active, 1);
  assert.equal(s.startIdx, 1);
  s.endgame = true;
  const step = () => { s.phase = 'move'; s.movesThisTurn = 1; s = apply(s, { type: 'endTurn' }).state; };
  step(); assert.equal(s.active, 2); assert.equal(s.phase, 'ahlak');
  step(); assert.equal(s.active, 0); assert.equal(s.phase, 'ahlak'); // seat 0 is not the end
  step(); assert.equal(s.active, 1); assert.equal(s.phase, 'over');
});

test('score: full tie shares rank, otherwise tie-breaks still order', () => {
  const s = fresh([...P3, { name: 'D' }]);
  const set = (i, badges, trades) => { s.players[i].badges = badges; s.players[i].trades = trades; };
  set(0, 5, ['ticaret-ankara-4']); set(1, 5, ['ticaret-ankara-5']); // 2x2 each, same badges and trades
  set(2, 3, ['ticaret-ankara-0']); set(3, 0, []);
  assert.deepEqual(score(s).map((x) => [x.pIdx, x.rank]), [[0, 1], [1, 1], [2, 3], [3, 4]]);
  set(1, 5, ['ticaret-ankara-4', 'ticaret-ankara-0']); // 3x2=6 > 4
  assert.deepEqual(score(s).map((x) => x.rank), [1, 2, 3, 4]);
});

test('bot answers trade offers and road asks with a legal action', () => {
  const s = moveState({ hand: ['yol-comert-1'] });
  s.players[1].hand = ['yol-bilgili-1', 'yol-comert-2'];
  const o = apply(s, { type: 'offerTrade', withPlayer: 1, give: 'yol-comert-1', want: 'bilgili' }).state;
  assert.ok(isLegal(o, botAction(o)));
  closeComert(s);
  s.players[0].hand = ['yol-comert-1', 'yol-comert-3'];
  const r = apply(s, { type: 'openRoad', tile: 16, cards: ['yol-comert-1', 'yol-comert-3'] }).state;
  const c = botAction(r);
  assert.equal(c.type, 'contribute');
  assert.ok(isLegal(r, c));
  assert.equal(CARDS[c.cards[0]]?.ilke ?? 'comert', 'comert');
});
