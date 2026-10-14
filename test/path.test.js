import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goalTile, pathTo } from '../src/path.js';
import { neighbors } from '../src/data.js';

const load = () => JSON.parse(readFileSync(new URL('../fixtures/start.json', import.meta.url)));

test('path: Ankara -> Kayseri goal-adjacent in 3 steps', () => {
  const s = load();
  assert.equal(goalTile(s, 0), 24);
  const p = pathTo(s, 0);
  assert.equal(p.length, 3);
  assert.ok(neighbors(24).includes(p.at(-1)));
  assert.ok(p.every((t) => s.tiles[t].kind === 'ilke'));
});

test('path: closed tile avoided', () => {
  const s = load();
  const first = pathTo(s, 0);
  for (const t of first) s.tiles[t].closed = true;
  const p = pathTo(s, 0);
  assert.ok(p.every((t) => !first.includes(t)));
});

test('path: no task / already adjacent -> []', () => {
  const s = load();
  s.players[0].task = null;
  assert.equal(goalTile(s, 0), null);
  assert.deepEqual(pathTo(s, 0), []);
  const s2 = load();
  s2.players[0].pos = 18;
  assert.deepEqual(pathTo(s2, 0), []);
});

import { pawnSlot, pawnScale, PAWN_R, walkTiles } from '../src/path.js';

test('pawnSlot: 1-6 piyon karede çakışmaz ve kare içinde kalır', () => {
  for (let n = 1; n <= 6; n++) {
    const s = Array.from({ length: n }, (_, i) => pawnSlot(i, n));
    const r = PAWN_R * pawnScale(n); // taban diskinin gerçek yarıçapı
    assert.ok(s.every((p) => Math.abs(p.x) + r <= 0.55 && Math.abs(p.d) + r <= 0.55), `n=${n} kare dışı`);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].d - s[j].d) >= 2 * r, `n=${n} ${i}-${j} üst üste`);
  }
});

test('walkTiles: ara karelerden komşu komşu geçer, ışınlanma yok', () => {
  assert.deepEqual(walkTiles(7, 7), []);
  assert.deepEqual(walkTiles(7, 8), [8]);
  for (const [a, b] of [[0, 24], [24, 0], [4, 20], [20, 4], [3, 21], [12, 0]]) {
    const w = walkTiles(a, b);
    assert.equal(w.at(-1), b);
    assert.equal(new Set(w).size, w.length);
    [a, ...w].slice(1).forEach((t, i) => assert.ok(neighbors([a, ...w][i]).includes(t), `${a}->${b} adım ${i}`));
  }
  assert.equal(walkTiles(0, 24).length, 4); // köşegen: 4 adım
});
