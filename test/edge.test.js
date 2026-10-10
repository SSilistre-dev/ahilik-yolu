// Kenar durum testleri (AHI-048). Bu durumlar normal oyunda nadir ya da hiç oluşmaz; motor ve bot yine de çökmemeli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply, score, actor } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { viewFor } from '../src/view.js';
import { pathTo } from '../src/path.js';

const P2 = [{ name: 'A', bot: true }, { name: 'B', bot: true }];
const decide = (s, level) => botAction(viewFor(s, actor(s), 't'), legalActions(s), level);
const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));
const place = (s, pi, tile) => {
  const o = s.tiles[s.players[pi].pos].occupants; o.splice(o.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi); s.players[pi].pos = tile;
};
// Botlar oyun bitene kadar oynar; her adımda aksiyon yasal olmalı. Adım sayısı döner.
function playOut(s, limit = 3000) {
  let steps = 0;
  while (s.phase !== 'over' && steps < limit) {
    const a = decide(s);
    assert.ok(isLegal(s, a), `adım ${steps}: yasal olmayan ${JSON.stringify(a)}`);
    s = apply(s, a).state; steps++;
  }
  return { s, steps };
}

test('edge: ahlak destesi boşken sıra gelen oyuncu ahlak aşamasını atlar, kart kaybolmaz', () => {
  const s = newGame({ players: P2, seed: 3 });
  s.decks.ahlakDiscard.push(...s.decks.ahlak.splice(0)); // 21 kart ıskartada, deste boş
  s.phase = 'move'; s.moveDone = true;
  const r = apply(s, { type: 'endTurn' });
  assert.equal(r.state.phase, 'move', 'sıradaki oyuncu doğrudan hamle aşamasına geçer');
  const ev = r.events.find((e) => e.type === 'ahlak');
  assert.ok(ev && ev.empty && !ev.card, 'kartsız ahlak olayı üretilir');
  assert.equal(r.state.decks.ahlak.length + r.state.decks.ahlakDiscard.length, 21);
});

test('edge: aşama ahlakta kalmışsa boş destede drawAhlak çökmez, move aşamasına geçer (savunma)', () => {
  const s = newGame({ players: P2, seed: 3 });
  s.decks.ahlakDiscard.push(...s.decks.ahlak.splice(0));
  const r = apply(s, { type: 'drawAhlak' });
  assert.equal(r.state.phase, 'move');
  assert.ok(r.events.some((e) => e.type === 'ahlak' && e.empty && !e.card));
  assert.equal(r.state.decks.ahlak.length + r.state.decks.ahlakDiscard.length, 21);
});

test('edge: yol destesi ve ıskarta boşken tur akışı çöker mi (savunma; normal oyunda 57 kart > 6x6 el)', () => {
  // Erişilemez durum: 6 oyuncuda en çok 36 kart ele sığar, 21 kart deste/ıskartada kalır. Yine de refill sessizce eksik kalmalı.
  const s = newGame({ players: P2, seed: 5 });
  s.decks.yol = []; s.decks.yolDiscard = [];
  s.players.forEach((p) => { p.hand = []; });
  const { s: end, steps } = playOut(s, 400);
  assert.ok(steps > 0);
  assert.ok(end.players.every((p) => p.hand.length <= 6));
});

test('edge: görev şehrinin 3 komşusu da kapalıyken piyon teslim edemez, bot takılmadan oyunu bitirir', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = newGame({ players: P2, seed });
    s.players[0].task = 'ticaret-ankara-0'; // Ankara komşuları: 1 (merhametli), 5 (bilgili), 6 (disiplinli)
    place(s, 0, 12);
    for (const [t, ilke] of [[1, 'merhametli'], [5, 'bilgili'], [6, 'disiplinli']]) {
      s.tiles[t].closed = true; s.tiles[t].closedBy = `ahlak-${ilke}-neg`;
      s.decks.ahlak = s.decks.ahlak.filter((id) => id !== `ahlak-${ilke}-neg`);
    }
    assert.deepEqual(pathTo(s, 0), [], 'kapalı komşularla yol yok');
    assert.ok(!legalActions({ ...s, phase: 'move' }).some((a) => a.type === 'move' && [1, 5, 6].includes(a.tile)));
    const { s: end } = playOut(s);
    assert.equal(end.phase, 'over', `seed ${seed} bitmedi`);
    assert.equal(score(end).length, 2);
  }
});

test('edge: görevi olmayan oyuncu için bot yasal aksiyon verir', () => {
  const s = newGame({ players: P2, seed: 9 });
  s.phase = 'move'; s.players[0].task = null;
  assert.ok(isLegal(s, decide(s)));
});
