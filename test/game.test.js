import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalActions, apply, score } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { CARDS, CITIES, HAND_SIZE } from '../src/data.js';

const P2 = [{ name: 'A', bot: false }, { name: 'B', bot: true }];
const fresh = (seed = 7, players = P2) => newGame({ players, seed });
const place = (s, pi, tile) => {
  const o = s.tiles[s.players[pi].pos].occupants;
  o.splice(o.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi);
  s.players[pi].pos = tile;
};
// move-phase state with controllable hand/task/deck tops (deck draws via pop => top is last)
const moveState = ({ pos = 0, hand = [], task = 'ticaret-kayseri-0' } = {}) => {
  const s = fresh();
  s.phase = 'move';
  place(s, 0, pos);
  s.players[0].hand = hand;
  s.players[0].task = task;
  return s;
};
const types = (s) => legalActions(s).map((a) => a.type);
const YOL = Object.keys(CARDS).filter((id) => CARDS[id].type === 'yol');
const yolCards = (s) => [...s.players.flatMap((p) => p.hand), ...s.decks.yol, ...s.decks.yolDiscard];

test('newGame setup', () => {
  const s = fresh(1, [...P2, { name: 'C' }, { name: 'D' }]);
  assert.equal(s.phase, 'ahlak');
  assert.deepEqual(Object.values(s.awards), Array(7).fill(4));
  for (const p of s.players) {
    assert.equal(p.hand.length, HAND_SIZE);
    assert.ok(CARDS[p.task]);
    assert.equal(s.tiles[p.pos].city, CITIES[CARDS[p.task].city].opposite);
  }
  assert.equal(yolCards(s).length, 57);
  assert.equal(s.decks.ticaret.length, 28 - 4);
  assert.doesNotThrow(() => JSON.stringify(s));
});

test('apply does not mutate input', () => {
  const s = fresh();
  const snap = JSON.stringify(s);
  apply(s, { type: 'drawAhlak' });
  assert.equal(JSON.stringify(s), snap);
});

test('positive ahlak puts badges on 3 open tiles, occupant gets them immediately', () => {
  const s = fresh();
  s.decks.ahlak.push('ahlak-comert-0');
  place(s, 1, 7); // comert tile
  s.tiles[16].closed = true; // closed tiles get nothing
  const { state, events } = apply(s, { type: 'drawAhlak' });
  assert.equal(state.phase, 'move');
  assert.equal(state.tiles[7].badges, 0);
  assert.equal(state.players[1].badges, 1);
  assert.equal(state.tiles[19].badges, 1);
  assert.equal(state.tiles[16].badges, 0);
  assert.ok(events.every((e) => typeof e.text === 'string' && e.text));
  // all three open: each gets one
  const s2 = fresh(); s2.decks.ahlak.push('ahlak-comert-0');
  const r = apply(s2, { type: 'drawAhlak' }).state;
  assert.deepEqual([7, 16, 19].map((i) => r.tiles[i].badges), [1, 1, 1]);
});

test('first occupant gets accumulated badges', () => {
  const s = fresh(); s.decks.ahlak.push('ahlak-comert-0');
  s.tiles[7].badges = 2;
  place(s, 1, 7); place(s, 0, 7);
  const r = apply(s, { type: 'drawAhlak' }).state;
  assert.equal(r.players[1].badges, 3);
  assert.equal(r.players[0].badges, 0);
});

test('negative ahlak: close phase, occupied tile not closable, badges removed, 2 badge penalty', () => {
  const s = fresh(); s.decks.ahlak.push('ahlak-comert-neg');
  place(s, 1, 7);
  s.tiles[16].badges = 3; s.players[0].badges = 5;
  const c = apply(s, { type: 'drawAhlak' }).state;
  assert.equal(c.phase, 'close');
  assert.equal(c.pendingClose, 'comert');
  assert.deepEqual(legalActions(c).map((a) => a.tile).sort(), [16, 19]);
  assert.throws(() => apply(c, { type: 'closeTile', tile: 7 }));
  assert.throws(() => apply(c, { type: 'closeTile', tile: 6 }));
  const { state, events } = apply(c, { type: 'closeTile', tile: 16 });
  assert.equal(state.phase, 'move');
  assert.ok(state.tiles[16].closed);
  assert.equal(state.tiles[16].closedBy, 'ahlak-comert-neg');
  assert.equal(state.tiles[16].badges, 0);
  assert.equal(state.players[0].badges, 3);
  assert.ok(events[0].text);
});

test('move: matching tile collects badges, joker works, closed tile not enterable', () => {
  const s = moveState({ pos: 0, hand: ['yol-merhametli-1', 'yol-ahievran-0', 'yol-comert-1'] });
  s.tiles[1].badges = 2;
  assert.ok(legalActions(s).some((a) => a.type === 'move' && a.tile === 1));
  assert.ok(!legalActions(s).some((a) => a.type === 'move' && a.card === 'yol-comert-1')); // no comert near ankara
  assert.ok(legalActions(s).some((a) => a.type === 'move' && a.card === 'yol-ahievran-0' && a.tile === 5));
  const r = apply(s, { type: 'move', card: 'yol-merhametli-1', tile: 1 }).state;
  assert.equal(r.players[0].badges, 2);
  assert.equal(r.players[0].pos, 1);
  assert.equal(r.movesThisTurn, 1);
  assert.deepEqual(r.tiles[0].occupants.includes(0), false);
  assert.ok(r.decks.yolDiscard.includes('yol-merhametli-1'));
  s.tiles[1].closed = true;
  assert.ok(!legalActions(s).some((a) => a.type === 'move' && a.tile === 1));
  assert.throws(() => apply(s, { type: 'move', card: 'yol-merhametli-1', tile: 1 }));
  assert.throws(() => apply(s, { type: 'move', card: 'yol-comert-1', tile: 5 }));
});

test('move legal actions are deduped by ilke / joker', () => {
  const s = moveState({ pos: 0, hand: ['yol-merhametli-1', 'yol-merhametli-2', 'yol-ahievran-0', 'yol-ahievran-1'] });
  const m = legalActions(s).filter((a) => a.type === 'move');
  assert.equal(m.length, 1 + 3); // merhametli->1, joker->1,5,6 ... see below
});

test('reaching goal neighbor completes trade, pawn to city, new task, only endTurn legal', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1', 'yol-durust-2'] });
  s.decks.ticaret.push('ticaret-ankara-0');
  const r = apply(s, { type: 'move', card: 'yol-durust-1', tile: 18 }).state;
  assert.deepEqual(r.players[0].trades, ['ticaret-kayseri-0']);
  assert.equal(r.players[0].pos, 24);
  assert.equal(r.players[0].task, 'ticaret-ankara-0');
  assert.ok(r.tiles[24].occupants.includes(0));
  assert.deepEqual(types(r), ['endTurn']);
  assert.throws(() => apply(r, { type: 'move', card: 'yol-durust-2', tile: 18 }));
  // reading text still possible after trade
  const t = moveState({ pos: 17, hand: ['yol-durust-0'] });
  const rt = apply(t, { type: 'move', card: 'yol-durust-0', tile: 18 }).state;
  assert.deepEqual(types(rt), ['readText', 'endTurn']);
});

test('new task in the same city completes immediately and redraws', () => {
  const s = moveState({ pos: 17, hand: ['yol-durust-1'] });
  s.decks.ticaret.push('ticaret-konya-0', 'ticaret-kayseri-1');
  const r = apply(s, { type: 'move', card: 'yol-durust-1', tile: 18 }).state;
  assert.deepEqual(r.players[0].trades, ['ticaret-kayseri-0', 'ticaret-kayseri-1']);
  assert.equal(r.players[0].task, 'ticaret-konya-0');
  // empty deck guard
  const e = moveState({ pos: 17, hand: ['yol-durust-1'] });
  e.decks.ticaret = ['ticaret-kayseri-1'];
  const re = apply(e, { type: 'move', card: 'yol-durust-1', tile: 18 }).state;
  assert.equal(re.players[0].task, null);
  assert.equal(re.players[0].trades.length, 2);
  assert.ok(re.endgame);
});

test('readText: only after hasText card; +1 badge; other actions clear it', () => {
  const s = moveState({ pos: 0, hand: ['yol-merhametli-0', 'yol-merhametli-1'] });
  assert.ok(!types(s).includes('readText'));
  assert.throws(() => apply(s, { type: 'readText' }));
  const m = apply(s, { type: 'move', card: 'yol-merhametli-0', tile: 1 }).state;
  assert.equal(m.players[0].pendingText, 'yol-merhametli-0');
  const r = apply(m, { type: 'readText' }).state;
  assert.equal(r.players[0].badges, 1);
  assert.equal(r.players[0].pendingText, null);
  const c = apply(m, { type: 'endTurn' }).state;
  assert.equal(c.players[0].pendingText, null);
});

test('kargo only when movesThisTurn===0; flies to task city, completes trade, ends turn', () => {
  const s = moveState({ pos: 0, hand: ['yol-kargo-0', 'yol-comert-1'] });
  assert.equal(legalActions(s).filter((a) => a.type === 'kargo').length, 3);
  s.decks.ticaret.push('ticaret-ankara-0');
  const r = apply(s, { type: 'kargo', card: 'yol-kargo-0', city: 'kayseri' }).state;
  assert.equal(r.players[0].pos, 24);
  assert.equal(r.players[0].trades.length, 1);
  assert.equal(r.active, 1);
  assert.equal(r.phase, 'ahlak');
  assert.equal(r.players[0].hand.length, 6);
  const t = moveState({ pos: 0, hand: ['yol-kargo-0'] });
  t.movesThisTurn = 1;
  assert.ok(!types(t).includes('kargo'));
  assert.throws(() => apply(t, { type: 'kargo', card: 'yol-kargo-0', city: 'kayseri' }));
});

test('openRoad: contribution order, award split, discards', () => {
  const s = moveState({ pos: 0, hand: ['yol-comert-1', 'yol-ahievran-0', 'yol-comert-2', 'yol-adaletli-0'] });
  s.tiles[16].closed = true; s.tiles[16].closedBy = 'ahlak-comert-neg';
  s.players[1].hand = ['yol-comert-3', 'yol-comert-4', 'yol-durust-0'];
  assert.ok(legalActions(s).some((a) => a.type === 'openRoad' && a.tile === 16));
  const { state: r, events } = apply(s, { type: 'openRoad', tile: 16 });
  // A gives 2 comert + joker (3), B gives 1
  assert.deepEqual(r.players[0].hand, ['yol-adaletli-0']);
  assert.deepEqual(r.players[1].hand, ['yol-comert-4', 'yol-durust-0']);
  assert.equal(r.players[0].badges, 3);
  assert.equal(r.players[1].badges, 1);
  assert.equal(r.awards.comert, 0);
  assert.ok(!r.tiles[16].closed && r.tiles[16].closedBy === null);
  assert.equal(r.decks.yolDiscard.length, 4);
  assert.deepEqual(r.decks.ahlakDiscard, ['ahlak-comert-neg']);
  assert.ok(events[0].text);
  // active must give at least 1
  const t = moveState({ pos: 0, hand: ['yol-adaletli-0'] });
  t.tiles[16].closed = true; t.tiles[16].closedBy = 'ahlak-comert-neg';
  t.players[1].hand = Array.from({ length: 4 }, (_, i) => `yol-comert-${i}`);
  assert.ok(!types(t).includes('openRoad'));
  assert.throws(() => apply(t, { type: 'openRoad', tile: 16 }));
});

test('trade swaps one card each', () => {
  const s = moveState({ pos: 0, hand: ['yol-comert-1', 'yol-durust-1'] });
  s.players[1].hand = ['yol-bilgili-1'];
  const r = apply(s, { type: 'trade', withPlayer: 1, give: 'yol-comert-1', want: 'yol-bilgili-1' }).state;
  assert.deepEqual(r.players[0].hand, ['yol-bilgili-1', 'yol-durust-1']);
  assert.deepEqual(r.players[1].hand, ['yol-comert-1']);
  assert.throws(() => apply(s, { type: 'trade', withPlayer: 0, give: 'yol-comert-1', want: 'yol-bilgili-1' }));
  assert.throws(() => apply(s, { type: 'trade', withPlayer: 1, give: 'yol-comert-9', want: 'yol-bilgili-1' }));
});

test('pass discards hand, refills to 6, ends turn', () => {
  const s = moveState({ pos: 0, hand: ['yol-comert-1', 'yol-durust-1'] });
  s.decks.yol = s.decks.yol.filter((id) => !s.players.some((p) => p.hand.includes(id)));
  const r = apply(s, { type: 'pass' }).state;
  assert.equal(r.players[0].hand.length, 6);
  assert.ok(!r.players[0].hand.includes('yol-comert-1'));
  assert.equal(r.active, 1);
  assert.equal(r.phase, 'ahlak');
  assert.equal(r.movesThisTurn, 0);
});

test('endTurn refills to 6', () => {
  const s = moveState({ pos: 0, hand: ['yol-comert-1'] });
  const r = apply(s, { type: 'endTurn' }).state;
  assert.equal(r.players[0].hand.length, 6);
  assert.equal(r.active, 1);
});

test('yol deck reshuffles from discard', () => {
  const s = moveState({ pos: 0, hand: [] });
  const rest = YOL.filter((id) => !s.players[1].hand.includes(id));
  s.decks.yol = []; s.decks.yolDiscard = rest;
  const r = apply(s, { type: 'endTurn' }).state;
  assert.equal(r.players[0].hand.length, 6);
  assert.equal(r.decks.yol.length + r.decks.yolDiscard.length, rest.length - 6);
  assert.equal(yolCards(r).length, 57);
});

test('end conditions finish the round to startIdx', () => {
  // ahlak deck last card
  let s = fresh(); s.decks.ahlak = ['ahlak-comert-0'];
  s = apply(s, { type: 'drawAhlak' }).state;
  assert.ok(s.endgame);
  s = apply(s, { type: 'endTurn' }).state; // A -> B, round not complete
  assert.equal(s.phase, 'ahlak');
  s = apply(s, { type: 'drawAhlak' }).state; // empty deck is tolerated
  s = apply(s, { type: 'endTurn' }).state; // B -> A (startIdx)
  assert.equal(s.phase, 'over');
  assert.deepEqual(legalActions(s), []);
  assert.throws(() => apply(s, { type: 'endTurn' }));
  // all awards empty
  const a = moveState({ pos: 0, hand: ['yol-comert-1'] });
  for (const k of Object.keys(a.awards)) a.awards[k] = 0;
  a.awards.comert = 1;
  a.tiles[16].closed = true; a.tiles[16].closedBy = 'ahlak-comert-neg';
  a.players[1].hand = ['yol-comert-2', 'yol-comert-3', 'yol-comert-4'];
  const ra = apply(a, { type: 'openRoad', tile: 16 }).state;
  assert.ok(ra.endgame);
  // ticaret deck last card
  const t = moveState({ pos: 17, hand: ['yol-durust-1'] });
  t.decks.ticaret = ['ticaret-ankara-0'];
  assert.ok(apply(t, { type: 'move', card: 'yol-durust-1', tile: 18 }).state.endgame);
  // endgame triggered with startIdx last in line: B ends -> over
  const e = moveState(); e.endgame = true; e.active = 1;
  assert.equal(apply(e, { type: 'endTurn' }).state.phase, 'over');
});

test('score multipliers and tie-break', () => {
  const s = fresh(1, [...P2, { name: 'C' }, { name: 'D' }]);
  const set = (i, badges, trades) => { s.players[i].badges = badges; s.players[i].trades = trades; };
  set(0, 4, ['ticaret-ankara-0', 'ticaret-ankara-4']); // 1+2=3, x1 => 3
  set(1, 5, ['ticaret-ankara-0']); // 1 x2 => 2
  set(2, 20, ['ticaret-ankara-6']); // 3 x5 => 15
  set(3, 14, ['ticaret-ankara-4', 'ticaret-ankara-5']); // 4 x3 => 12
  const r = score(s);
  assert.deepEqual(r.map((x) => [x.pIdx, x.mult, x.total, x.rank]), [[2, 5, 15, 1], [3, 3, 12, 2], [0, 1, 3, 3], [1, 2, 2, 4]]);
  assert.deepEqual(r.map((x) => x.mult), [5, 3, 1, 2]);
  // 15-19 => x4, 10-14 => x3, 0-4 => x1
  set(0, 15, []); set(1, 10, []); set(2, 0, []); set(3, 9, []);
  assert.deepEqual(s.players.map((p) => score(s).find((x) => x.pIdx === s.players.indexOf(p)).mult), [4, 3, 1, 2]);
  // tie on total: higher badges wins, then trade count
  set(0, 5, ['ticaret-ankara-4']); // 2x2=4
  set(1, 0, ['ticaret-ankara-4', 'ticaret-ankara-0']); // 3 x1 => 3
  set(2, 1, ['ticaret-ankara-0', 'ticaret-ankara-1', 'ticaret-ankara-2', 'ticaret-ankara-3']); // 4 x1 => 4
  set(3, 0, []);
  const t = score(s);
  assert.equal(t[0].pIdx, 0); // 4 total, 5 badges beats 4 total, 1 badge
  assert.equal(t[1].pIdx, 2);
});

test('property: 50 seeds, 4 bots finish, no exceptions, yol cards conserved', () => {
  for (let seed = 1; seed <= 50; seed++) {
    let s = newGame({ players: [1, 2, 3, 4].map((n) => ({ name: `Bot${n}`, bot: true })), seed });
    let steps = 0;
    while (s.phase !== 'over' && steps++ < 2000) {
      const a = botAction(s);
      s = apply(s, a).state;
      const all = yolCards(s);
      assert.equal(all.length, 57, `seed ${seed} step ${steps}`);
      assert.equal(new Set(all).size, 57);
    }
    assert.equal(s.phase, 'over', `seed ${seed} did not finish`);
    assert.equal(score(s).length, 4);
  }
});
