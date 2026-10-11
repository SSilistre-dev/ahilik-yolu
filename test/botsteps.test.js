// Bot aksiyonlarının ekranda sıralı anlatımı: metin üretimi + kuyruk (DOM yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, apply, actor } from '../src/game.js';
import { safeBotAction } from '../src/botstep.js';
import { botSteps, createStepQueue } from '../src/botclock.js';

function fake() {
  const t = new Map(); let n = 0, clock = 0;
  return {
    setTimer: (fn, ms) => { t.set(++n, { fn, at: clock + ms }); return n; },
    clearTimer: id => t.delete(id),
    now: () => clock,
    tick(ms) { clock += ms; for (const [id, x] of [...t]) if (x.at <= clock) { t.delete(id); x.fn(); } },
  };
}

test('botSteps: tüm bot aksiyonları okunur metin üretir, insan aksiyonu üretmez', () => {
  const seen = new Set(); let bots = 0;
  for (let seed = 1; seed <= 6; seed++) {
    let s = newGame({ players: [{ name: 'Ali' }, { name: 'B1', bot: true }, { name: 'B2', bot: true }, { name: 'B3', bot: true }], seed, startIdx: seed % 4 });
    for (let i = 0; i < 1500 && s.phase !== 'over'; i++) {
      const who = actor(s), a = safeBotAction(s, 'medium', 't'), r = apply(s, a);
      const steps = botSteps(r.events, who, r.state);
      if (s.players[who].bot) {
        bots++;
        for (const st of steps) { assert.equal(st.who, who); assert.ok(st.text.length > 3 && st.text.length < 70, st.text); assert.ok(!/undefined|NaN|\[object/.test(st.text), st.text); seen.add(st.type); }
        if (a.type === 'endTurn' || a.type === 'drawAhlak' || a.type === 'closeTile' || a.type === 'move') assert.ok(steps.length >= 1, `${a.type} anlatılmadı`);
      }
      s = r.state;
    }
  }
  assert.ok(bots > 100);
  for (const t of ['ahlak', 'close', 'move', 'endTurn']) assert.ok(seen.has(t), `${t} görülmedi`);
  // bot olmayan oyuncu adına adım yok
  const s = newGame({ players: [{ name: 'Ali' }, { name: 'B1', bot: true }], seed: 1 });
  const r = apply(s, { type: 'drawAhlak' });
  assert.deepEqual(botSteps(r.events, 0, r.state), []);
});

test('botSteps: ahlak adımı kart id taşır (büyük görsel için)', () => {
  const s = newGame({ players: [{ name: 'B0', bot: true }, { name: 'B1', bot: true }], seed: 2 });
  const r = apply(s, { type: 'drawAhlak' });
  const st = botSteps(r.events, 0, r.state).find(x => x.type === 'ahlak');
  assert.ok(st?.card?.startsWith('ahlak') || st?.card, 'kart yok');
});

test('stepQueue: adımlar sırayla, her biri en az hold kadar kalır, üst üste binmez', () => {
  const f = fake(), shown = []; let idle = 0;
  const q = createStepQueue({ ...f, onShow: s => shown.push(s), onIdle: () => idle++ });
  q.push('a', 700); q.push('b', 1200); q.push('c', 700);
  assert.deepEqual(shown, ['a']);
  assert.equal(q.backlog(), 2600);
  f.tick(699); assert.deepEqual(shown, ['a']);
  f.tick(1); assert.deepEqual(shown, ['a', 'b']);
  assert.equal(q.backlog(), 1900);
  f.tick(1199); assert.deepEqual(shown, ['a', 'b']);
  f.tick(1); f.tick(700);
  assert.deepEqual(shown, ['a', 'b', 'c']); assert.equal(idle, 1); assert.equal(q.backlog(), 0);
  q.push('d', 100); assert.deepEqual(shown.at(-1), 'd'); // boşken hemen gösterir
});

test('stepQueue: skip sıradakine geçer, clear her şeyi bırakır', () => {
  const f = fake(), shown = []; let idle = 0;
  const q = createStepQueue({ ...f, onShow: s => shown.push(s), onIdle: () => idle++ });
  q.push('a', 700); q.push('b', 700);
  q.skip(); assert.deepEqual(shown, ['a', 'b']);
  q.skip(); assert.equal(idle, 1); q.skip(); assert.equal(idle, 1);
  q.push('c', 700); q.push('d', 700); q.clear(); f.tick(5000);
  assert.deepEqual(shown, ['a', 'b', 'c']); assert.equal(q.backlog(), 0);
});

test('stepQueue: kuyruk taşarsa en eski bekleyen düşer (sınırsız büyümez)', () => {
  const f = fake(), shown = [];
  const q = createStepQueue({ ...f, onShow: s => shown.push(s) });
  for (let i = 0; i < 30; i++) q.push(i, 100);
  assert.ok(q.backlog() <= 100 * 9);
});
