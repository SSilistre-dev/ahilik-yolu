// Bot zamanlayıcısı (M09): duraklatınca bekleyen hamle iptal, devamda yeniden kurulur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotClock } from '../src/botclock.js';

function fake() {
  const t = new Map(); let n = 0;
  return {
    setTimer: (fn, ms) => { t.set(++n, { fn, ms }); return n; },
    clearTimer: id => t.delete(id),
    get size() { return t.size; },
    fire() { const [id, x] = [...t][0]; t.delete(id); x.fn(); },
    get ms() { return [...t.values()][0]?.ms; },
  };
}

test('pause: botClock pause', () => {
  const f = fake(); const c = createBotClock(f); let ran = 0;
  c.schedule(() => ran++, 700);
  assert.equal(f.size, 1);
  c.pause();
  assert.equal(f.size, 0, 'bekleyen zamanlayıcı iptal');
  c.schedule(() => ran++, 50); // duraklatılmışken de yeni iş kurulmaz
  assert.equal(f.size, 0);
  assert.equal(ran, 0);
});

test('pause: botClock resume', () => {
  const f = fake(); const c = createBotClock(f); let ran = 0;
  c.schedule(() => ran++, 700);
  c.pause();
  c.resume();
  assert.equal(f.size, 1);
  assert.equal(f.ms, 700, 'tam bekleme yeniden başlar');
  f.fire();
  assert.equal(ran, 1);
  c.resume();
  assert.equal(f.size, 0, 'çalışan iş yeniden kurulmaz');
});

test('pause: botClock cancel', () => {
  const f = fake(); const c = createBotClock(f); let ran = 0;
  c.schedule(() => ran++, 700);
  c.cancel();
  assert.equal(f.size, 0);
  c.resume();
  assert.equal(f.size, 0, 'cancel bekleyen işi de siler');
  c.schedule(() => ran++, 10); c.pause(); c.cancel(); c.resume();
  assert.equal(f.size, 0);
  assert.equal(ran, 0);
});

test('pause: botClock schedule replaces', () => {
  const f = fake(); const c = createBotClock(f);
  c.schedule(() => {}, 1); c.schedule(() => {}, 2);
  assert.equal(f.size, 1);
  assert.equal(f.ms, 2);
  assert.equal(c.pending, true);
});
