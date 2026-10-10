import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/router.js';

class FakeHistory {
  constructor(first = null) { this.e = [first]; this.k = 0; this.fns = []; }
  get state() { return this.e[this.k]; }
  pushState(s) { this.e.length = this.k + 1; this.e.push(s); this.k++; }
  replaceState(s) { this.e[this.k] = s; }
  back() { if (this.k > 0) { this.k--; this.fns.forEach(f => f({ state: this.state })); } }
  addEventListener(t, f) { if (t === 'popstate') this.fns.push(f); }
}
const mk = (opts = {}, first) => {
  const h = new FakeHistory(first);
  const r = createRouter({ history: h, win: h, ...opts });
  const log = [];
  r.onChange(c => log.push(c));
  return { h, r, log };
};

test('router: forward/back dir', () => {
  const { r, log } = mk();
  r.start();
  r.go('bots');
  r.go('settings', {}, { replace: true });
  r.back();
  assert.deepEqual(log.map(c => c.dir), ['replace', 'forward', 'replace', 'back']);
  assert.equal(r.current.name, 'menu');
});

test('router: game back opens pause', () => {
  const { r, h } = mk();
  r.start();
  r.go('bots');
  r.go('game', {}, { replace: true });
  assert.deepEqual(h.e.map(s => s.name), ['menu', 'game']);
  r.back();
  assert.equal(r.current.name, 'pause');
  r.back();
  assert.equal(r.current.name, 'game');
  // tarayıcı geri tuşu: game kaydı silinse de pause açılır
  h.back();
  assert.equal(r.current.name, 'pause');
  assert.equal(h.e.at(-1).name, 'pause');
});

test('router: guard redirects', () => {
  const { r, h } = mk({ guards: { game: () => false } });
  r.start();
  r.go('game');
  assert.equal(r.current.name, 'menu');
  assert.equal(h.state.name, 'menu');
  // yenileme: state game kalır, bellekte oyun yok
  const m = mk({ guards: { game: () => false } }, { ahilik: 1, i: 3, name: 'game', params: {} });
  m.r.start();
  assert.equal(m.r.current.name, 'menu');
});

test('router: foreign state', () => {
  const { r, h } = mk();
  r.start();
  r.go('bots');
  h.e[0] = null; // yabancı giriş
  assert.doesNotThrow(() => r.back());
  assert.equal(r.current.name, 'menu');
});

test('router: first profile ignores back', () => {
  const { r, h } = mk();
  r.start({ name: 'profile', params: { first: true } });
  r.back();
  assert.equal(r.current.name, 'profile');
  r.go('menu');
  r.go('profile', { first: true });
  h.back();
  assert.equal(r.current.name, 'profile');
});

test('router: leaveGuard blocks', () => {
  let ok = false, blocked = 0;
  const { r, h } = mk({ leaveGuards: { lobby: () => ok }, onBlockedBack: () => blocked++ });
  r.start();
  r.go('lobby');
  r.back();
  h.back();
  assert.equal(r.current.name, 'lobby');
  assert.equal(blocked, 2);
  ok = true;
  r.back();
  assert.equal(r.current.name, 'menu');
});

test('router: end/error go to menu, menu back is noop', () => {
  const { r, h } = mk();
  r.start();
  r.back();
  assert.equal(h.k, 0);
  r.go('end');
  r.back();
  assert.equal(r.current.name, 'menu');
});
