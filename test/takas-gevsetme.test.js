import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply } from '../src/game.js';

const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));

// SPEC "Bilinçli sapmalar ve notlar": takas koşulu (kural 25) bilerek gevşek.
test('offerTrade: hareket edebilirken de yasal (bilinçli gevşetme)', () => {
  const s = newGame({ players: [{ name: 'A', bot: false }, { name: 'B', bot: true }], seed: 7 });
  s.phase = 'move';
  s.players[0].hand = ['yol-merhametli-1', 'yol-durust-1'];
  s.players[1].hand = ['yol-bilgili-1'];
  assert.ok(legalActions(s).some((a) => a.type === 'move'), 'aktif oyuncu hareket edebiliyor');
  const offer = { type: 'offerTrade', withPlayer: 1, give: 'yol-durust-1', want: 'bilgili' };
  assert.ok(isLegal(s, offer));
  assert.ok(!isLegal(s, { ...offer, want: 'durust' }), 'kendi türünü istemek yasadışı');
  const o = apply(s, offer).state;
  const r = apply(o, { type: 'respondTrade', accept: false }).state;
  assert.ok(!isLegal(r, offer), 'reddedilen teklif aynı tur tekrarlanamaz');
});
