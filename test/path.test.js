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
