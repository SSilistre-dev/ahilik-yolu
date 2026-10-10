import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { safeBotAction } from '../src/botstep.js';

const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));
const boom = () => { throw new Error('boom'); };
const quiet = (fn) => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

function play(seed, n, pick) {
  let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed, startIdx: seed % n });
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 3000) {
    const a = safeBotAction(s, 'medium', 't', pick);
    assert.ok(isLegal(s, a), `seed ${seed} step ${steps}: illegal ${JSON.stringify(a)}`);
    s = apply(s, a).state;
  }
  return s;
}

test('safeBotAction: pick fırlatırsa yasal aksiyon', () => {
  quiet(() => { for (let seed = 1; seed <= 20; seed++) assert.equal(play(seed, 2 + (seed % 5), boom).phase, 'over'); });
});

test('safeBotAction: yasadışı çıktı yasala çevrilir', () => {
  quiet(() => {
    for (const bad of [undefined, null, { type: 'uydurma' }, { type: 'move', card: 'yok', tile: 999 }]) {
      assert.equal(play(3, 3, () => bad).phase, 'over');
    }
  });
});

test('fuzz: bot her 3. çağrıda fırlatır, oyun biter', () => {
  quiet(() => {
    for (let seed = 1; seed <= 20; seed++) {
      let c = 0;
      assert.equal(play(seed, 2 + (seed % 5), (v, l, lv) => (++c % 3 ? botAction(v, l, lv) : boom())).phase, 'over');
    }
  });
});
