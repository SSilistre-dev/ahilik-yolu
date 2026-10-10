// N04: bot yalnız viewFor çıktısını görür; gizli bilgi değişse karar değişmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalActions, apply, actor } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { viewFor } from '../src/view.js';

const decide = (s, level) => botAction(viewFor(s, actor(s), 't'), legalActions(s), level);

test('bot: aynı view aynı aksiyon; rakip eli ve deste sırası değişse karar değişmez', () => {
  const shuffle = (a, k) => { for (let i = a.length - 1; i > 0; i--) { const j = (k * 7 + i * 13) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (let seed = 1; seed <= 12; seed++) {
    let s = newGame({ players: [0, 1, 2, 3].map((i) => ({ name: `B${i}`, bot: true })), seed });
    while (s.phase !== 'over') {
      const a = decide(s), me = actor(s);
      assert.deepEqual(decide(s), a, 'deterministik değil');
      if (s.pending?.kind !== 'trade') { // takasta verilen kart zaten iki tarafa açık
        const t = structuredClone(s); t.seed = 424242; t.rng = 99;
        const others = t.players.map((_, i) => i).filter((i) => i !== me);
        const pool = shuffle([...others.flatMap((i) => t.players[i].hand), ...t.decks.yol], seed);
        for (const i of others) t.players[i].hand = pool.splice(0, t.players[i].hand.length);
        t.decks.yol = pool; shuffle(t.decks.ahlak, seed); shuffle(t.decks.ticaret, seed);
        assert.deepEqual(decide(t), a, `gizli bilgiye bakıyor (seed ${seed}, tur ${s.turn})`);
      }
      s = apply(s, a).state;
    }
  }
});

test('bot: bilinmeyen seviye adı hata verir', () => {
  const s = newGame({ players: [{ name: 'A', bot: true }, { name: 'B', bot: true }], seed: 1 });
  assert.throws(() => decide(s, 'x'), /bilinmeyen bot seviyesi: x/);
  assert.ok(decide(s, 'medium'));
});
