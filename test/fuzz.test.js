import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply, score, actor } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { viewFor } from '../src/view.js';

// Card conservation: yol 57, ticaret 28, ahlak 21 at every step.
function check(s, where) {
  const yol = [...s.players.flatMap((p) => p.hand), ...s.decks.yol, ...s.decks.yolDiscard];
  assert.equal(yol.length, 57, where);
  assert.equal(new Set(yol).size, 57, where);
  const tic = [...s.decks.ticaret, ...s.players.flatMap((p) => [...p.trades, ...(p.task ? [p.task] : [])])];
  assert.equal(tic.length, 28, where);
  assert.equal(new Set(tic).size, 28, where);
  // the negative card being resolved (phase close) is held by no container
  const ahl = [...s.decks.ahlak, ...s.decks.ahlakDiscard, ...s.tiles.filter((t) => t.closedBy).map((t) => t.closedBy),
    ...(s.phase === 'close' ? [`ahlak-${s.pendingClose}-neg`] : [])];
  assert.equal(ahl.length, 21, where);
  assert.equal(new Set(ahl).size, 21, where);
}

test('fuzz: 200 seeded all-bot games (2-6 players) finish, only legal actions, cards conserved', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const n = 2 + (seed % 5);
    let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed, startIdx: seed % n });
    let steps = 0;
    check(s, `seed ${seed} start`);
    while (s.phase !== 'over' && steps++ < 3000) {
      const a = botAction(viewFor(s, actor(s), 't'), legalActions(s));
      assert.ok(legalActions(s).some((l) => isDeepStrictEqual(l, a)), `seed ${seed} step ${steps}: illegal ${JSON.stringify(a)}`);
      s = apply(s, a).state;
      check(s, `seed ${seed} step ${steps}`);
    }
    assert.equal(s.phase, 'over', `seed ${seed} did not finish in ${steps} steps`);
    assert.equal(score(s).length, n);
  }
});
