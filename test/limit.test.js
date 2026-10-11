import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../server/limit.js';

test('limiter: kapasite kadar izin, sonra ret ve retryAfterS', () => {
  let t = 0;
  const l = createLimiter({ limit: 3, now: () => t });
  for (let i = 0; i < 3; i++) assert.equal(l.take('a').ok, true);
  const r = l.take('a');
  assert.equal(r.ok, false);
  assert.equal(r.retryAfterS, 20); // 60 sn / 3 jeton
  assert.equal(l.take('b').ok, true); // anahtarlar bağımsız
});

test('limiter: zamanla dolar (sanal saat) ve dolu kovalar süpürülür', () => {
  let t = 0;
  const l = createLimiter({ limit: 10, now: () => t });
  for (let i = 0; i < 10; i++) l.take('a');
  assert.equal(l.take('a').ok, false);
  t = 6000; // 1 jeton
  assert.equal(l.take('a').ok, true);
  assert.equal(l.take('a').ok, false);
  t = 120_000;
  assert.equal(l.take('a').ok, true);
});
