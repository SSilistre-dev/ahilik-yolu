// SPEC drift guard: SPEC.md contract lists must match src/game.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame } from '../src/game.js';

const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const uniq = (a) => [...new Set(a)].sort();

test('SPEC: action list equals game.js apply cases', () => {
  const line = spec.split('\n').find((l) => l.startsWith("`{type:'drawAhlak'}`"));
  assert.ok(line, 'aksiyon satırı bulunamadı');
  const inSpec = uniq([...line.matchAll(/type:'(\w+)'/g)].map((m) => m[1]));
  const inCode = uniq([...game.matchAll(/case '(\w+)':/g)].map((m) => m[1]));
  assert.deepEqual(inSpec, inCode);
});

test('SPEC: every game.js event type is in the Event listesi section', () => {
  const sec = spec.split('### Event listesi')[1]?.split(/\n#{2,3} /)[0];
  assert.ok(sec, 'Event listesi bölümü yok');
  const types = uniq([...game.matchAll(/log\(\w+, '(\w+)'/g)].map((m) => m[1]));
  assert.deepEqual(types.filter((t) => !sec.includes('`' + t)), []);
});

test('SPEC: state block lists every newGame key', () => {
  const block = spec.split('state = {')[1]?.split('```')[0];
  assert.ok(block, 'state bloğu yok');
  const keys = Object.keys(newGame({ players: [{ name: 'a' }, { name: 'b' }], seed: 1 }));
  assert.deepEqual(keys.filter((k) => !new RegExp('\\b' + k + '\\b').test(block)), []);
});
