// AHI-024 / AHI-025: bot davranışı senaryoları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply, actor } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { viewFor } from '../src/view.js';

const decide = (s, level = 'medium') => botAction(viewFor(s, actor(s), 't'), legalActions(s), level);
const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));
const moveState = ({ pos = 0, hand = [], task = 'ticaret-kayseri-0', closed = [] } = {}) => {
  const s = newGame({ players: [{ name: 'A', bot: true }, { name: 'B', bot: true }], seed: 7 });
  s.phase = 'move';
  const o = s.tiles[s.players[0].pos].occupants; o.splice(o.indexOf(0), 1);
  s.tiles[pos].occupants.push(0); s.players[0].pos = pos;
  s.players[0].hand = hand; s.players[0].task = task;
  for (const t of closed) { s.tiles[t].closed = true; s.tiles[t].closedBy = 'x'; }
  return s;
};

test('AHI-024: görevsiz bot takas istemez, hedefsiz kargo oynamaz; rozetli kareye gider', () => {
  const hand = ['yol-tokgozlu-1', 'yol-adaletli-1', 'yol-comert-1'];
  const s = moveState({ pos: 7, task: null, hand });
  s.tiles[13].badges = 2;
  assert.deepEqual(decide(s), { type: 'move', card: 'yol-tokgozlu-1', tile: 13 });
  const stuck = moveState({ pos: 7, task: null, hand: ['yol-kargo-0', 'yol-durust-1'] }); // hamle yok, kargo zorunlu
  stuck.tiles = stuck.tiles.map((t) => (t.kind === 'ilke' && t.ilke === 'durust' ? { ...t, closed: true, closedBy: 'x' } : t));
  const a = decide(stuck);
  assert.ok(a.type === 'kargo' && isLegal(stuck, a), JSON.stringify(a));
  const after = apply(moveState({ pos: 7, task: null, hand }), { type: 'move', card: 'yol-tokgozlu-1', tile: 13 }).state;
  assert.equal(decide(after).type, 'endTurn', 'rozeti kalmayınca turu bitirir');
  for (const level of ['medium', 'hard']) { const t = moveState({ pos: 7, task: null, hand }); assert.notEqual(decide(t, level).type, 'offerTrade', level); }
});

test('AHI-025: Orta kargo kuralı değişmez; Zor eldeki kartlarla varabiliyorsa kargoyu saklar, varamıyorsa oynar', () => {
  const reach = moveState({ pos: 4, task: 'ticaret-konya-5', closed: [8], hand: ['yol-kargo-0', 'yol-tokgozlu-3', 'yol-tokgozlu-2', 'yol-bilgili-6', 'yol-bilgili-0', 'yol-comert-6'] });
  assert.deepEqual(decide(reach, 'medium'), { type: 'kargo', card: 'yol-kargo-0', city: 'konya' });
  assert.equal(decide(reach, 'hard').type, 'move', 'bilgili 9, tokgozlu 13, bilgili 17, comert 16: bu turda teslim');
  const blocked = moveState({ pos: 4, task: 'ticaret-konya-5', closed: [8], hand: ['yol-kargo-0', 'yol-durust-3', 'yol-durust-2', 'yol-adaletli-6', 'yol-adaletli-0', 'yol-merhametli-6'] });
  assert.deepEqual(decide(blocked, 'hard'), { type: 'kargo', card: 'yol-kargo-0', city: 'konya' });
});

test('AHI-025: hard + medium karma oyunlar biter, yalnız yasal aksiyon', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const n = 2 + (seed % 5);
    let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed });
    for (let steps = 0; s.phase !== 'over' && steps < 3000; steps++) {
      const a = decide(s, actor(s) % 2 ? 'hard' : 'medium');
      assert.ok(isLegal(s, a), `seed ${seed}: ${JSON.stringify(a)}`);
      s = apply(s, a).state;
    }
    assert.equal(s.phase, 'over');
  }
});
