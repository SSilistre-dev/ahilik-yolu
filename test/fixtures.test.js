// fixtures/*.json şema ve oynanabilirlik kapısı (AHI-046). Şema kayarsa dev sayfaları ve testler sessizce bozulur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newGame, legalActions, apply, score, actor } from '../src/game.js';
import { CARDS, ILKE_IDS } from '../src/data.js';

const dir = new URL('../fixtures/', import.meta.url);
const names = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const keys = (o) => Object.keys(o).sort();
const ref = newGame({ players: [{ name: 'a' }, { name: 'b' }], seed: 1 }); // motorun gerçek şeması

// Hata listesi döner; boşsa fixture geçerli.
export function checkFixture(s) {
  const e = [];
  const same = (what, got, want) => { if (JSON.stringify(keys(got)) !== JSON.stringify(keys(want))) e.push(`${what} alanları: ${keys(got)} (beklenen ${keys(want)})`); };
  same('state', s, ref); same('decks', s.decks, ref.decks);
  s.players.forEach((p, i) => same(`players[${i}]`, p, ref.players[0]));
  s.tiles.forEach((t, i) => same(`tiles[${i}]`, t, ref.tiles[0]));
  if (e.length) return e; // alan yoksa sonraki denetimler anlamsız
  if (s.tiles.length !== 25) e.push(`kare sayısı ${s.tiles.length}`);
  if (JSON.stringify(keys(s.awards)) !== JSON.stringify([...ILKE_IDS].sort())) e.push('awards anahtarları 7 ilke değil');
  const yol = [...s.players.flatMap((p) => p.hand), ...s.decks.yol, ...s.decks.yolDiscard];
  const tic = [...s.decks.ticaret, ...s.players.flatMap((p) => [...p.trades, ...(p.task ? [p.task] : [])])];
  const ahl = [...s.decks.ahlak, ...s.decks.ahlakDiscard, ...s.tiles.flatMap((t) => (t.closedBy ? [t.closedBy] : [])), ...(s.phase === 'close' ? [`ahlak-${s.pendingClose}-neg`] : [])];
  for (const [ad, list, n] of [['yol', yol, 57], ['ticaret', tic, 28], ['ahlak', ahl, 21]]) {
    if (list.length !== n || new Set(list).size !== n) e.push(`${ad} kartları ${list.length}/${n} (tekil ${new Set(list).size})`);
    for (const id of list) if (!CARDS[id] || CARDS[id].type !== ad) e.push(`${ad} listesinde geçersiz kart: ${id}`);
  }
  s.players.forEach((p, i) => { if (!s.tiles[p.pos]?.occupants.includes(i)) e.push(`players[${i}] karesi (${p.pos}) occupants içinde yok`); });
  return e;
}

for (const name of names) {
  test(`fixture ${name}: şema, kart korunumu, legalActions ve score çalışır`, () => {
    const s = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    assert.deepEqual(checkFixture(s), []);
    const legal = legalActions(s);
    if (s.phase === 'over') assert.deepEqual(legal, []);
    else assert.ok(legal.length > 0, 'bitmemiş oyunda yasal aksiyon olmalı');
    assert.ok(actor(s) >= 0 && actor(s) < s.players.length);
    assert.equal(score(s).length, s.players.length);
    for (const type of new Set(legal.map((a) => a.type))) { // her tür için ilk aksiyon uygulanabilir
      assert.doesNotThrow(() => apply(s, legal.find((a) => a.type === type)), `${name}: ${type}`);
    }
  });
}

test('fixture: kapı bozuk fixture’ı yakalar (kendini sınar)', () => {
  const s = JSON.parse(readFileSync(new URL('start.json', dir), 'utf8'));
  const drop = structuredClone(s); delete drop.roadTries;
  assert.ok(checkFixture(drop).length > 0, 'eksik alan');
  const dup = structuredClone(s); dup.players[0].hand[0] = dup.players[1].hand[0];
  assert.ok(checkFixture(dup).length > 0, 'çift kart');
  const bad = structuredClone(s); bad.players[0].pos = 12;
  assert.ok(checkFixture(bad).length > 0, 'occupants uyumsuz');
});

test('fixture: en az 5 fixture var ve bekleyen-cevap durumları kapsanıyor', () => {
  assert.ok(names.length >= 5);
  const kinds = names.map((n) => JSON.parse(readFileSync(new URL(n, dir), 'utf8')).pending?.kind);
  assert.ok(kinds.includes('trade') && kinds.includes('road'));
});
