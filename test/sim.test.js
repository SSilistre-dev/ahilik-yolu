import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSim, parseLineup, LEVELS } from './sim.mjs';

test('sim: aynı argüman aynı sonuç (deterministik tohum)', () => {
  const a = runSim({ games: 16, players: 4, levels: ['medium'], seed: 7 });
  const b = runSim({ games: 16, players: 4, levels: ['medium'], seed: 7 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, runSim({ games: 16, players: 4, levels: ['medium'], seed: 8 }));
});

test('sim: oyun sayısı P^2 katına yuvarlanır, kazanma payları toplamı 100', () => {
  const r = runSim({ games: 10, players: 3, levels: ['medium'], seed: 1 });
  assert.equal(r.games, 18);
  assert.equal(Math.round(Object.values(r.levels).reduce((n, l) => n + l.win, 0)), 100);
  assert.equal(r.seatsFromStart.length, 3);
});

test('sim: geçersiz seviye ve dizilim uzunluğu reddedilir', () => {
  assert.throws(() => parseLineup(['yok'], 4), /bilinmeyen seviye/);
  assert.throws(() => parseLineup(LEVELS.length ? [LEVELS[0], LEVELS[0]] : [], 4), /değer ister/);
  assert.throws(() => runSim({ players: 7 }), /2-6/);
});

test('sim: long bayrağı oyunu uzatır (6 oyuncu), varsayılan kapalı', () => {
  const normal = runSim({ games: 72, players: 6, levels: ['medium'], seed: 1 });
  const long = runSim({ games: 72, players: 6, levels: ['medium'], seed: 1, long: true });
  assert.equal(normal.long, false);
  assert.ok(long.avgTurns > normal.avgTurns, `uzun ${long.avgTurns} normal ${normal.avgTurns}`);
});
