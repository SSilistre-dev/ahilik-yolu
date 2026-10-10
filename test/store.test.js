import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, getSettings, setSettings, migrateLegacy, KEYS, roomKey, DEFAULT_SETTINGS, SCHEMA } from '../src/store.js';

class FakeStorage {
  constructor({ failGet = false, failSet = false } = {}) { this.m = new Map(); this.failGet = failGet; this.failSet = failSet; }
  getItem(k) { if (this.failGet) throw new DOMException('x', 'SecurityError'); return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.failSet) throw new DOMException('x', 'QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const quiet = fn => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

test('store: roundtrip', () => {
  const fs = new FakeStorage(), s = createStore(fs);
  assert.equal(s.set(KEYS.profile, { name: 'a', avatar: 'b' }), true);
  assert.deepEqual(s.get(KEYS.profile), { name: 'a', avatar: 'b' });
  assert.equal(fs.m.get(KEYS.profile), '{"v":1,"d":{"name":"a","avatar":"b"}}');
  assert.equal(s.get('ahilik.yok', 7), 7);
  assert.equal(roomKey('ABC'), 'ahilik.room.ABC');
});

test('store: corrupt json', () => {
  const fs = new FakeStorage(), s = createStore(fs);
  for (const raw of ['{bozuk', '"düz"', '{"d":1}', '{"v":0,"d":1}', '{"v":"1","d":1}']) {
    fs.m.set(KEYS.flags, raw);
    assert.equal(quiet(() => s.get(KEYS.flags, 'fb')), 'fb', raw);
    assert.equal(fs.m.has(KEYS.flags), false, raw);
  }
  s.set(KEYS.flags, { tutorialDone: 5 });
  assert.equal(quiet(() => s.get(KEYS.flags, 'fb', d => typeof d.tutorialDone === 'boolean')), 'fb');
  assert.equal(fs.m.has(KEYS.flags), false);
});

test('store: newer schema kept', () => {
  const fs = new FakeStorage(), s = createStore(fs);
  fs.m.set(KEYS.save, `{"v":${SCHEMA + 1},"d":{"x":1}}`);
  assert.equal(s.get(KEYS.save, 'fb'), 'fb');
  assert.equal(fs.m.has(KEYS.save), true);
});

test('store: quota fallback', () => {
  const s = createStore(new FakeStorage({ failSet: true }));
  assert.equal(s.set(KEYS.profile, { name: 'z' }), false);
  assert.deepEqual(s.get(KEYS.profile), { name: 'z' });
  s.remove(KEYS.profile);
  assert.equal(s.get(KEYS.profile), null);
});

test('store: getItem throws', () => {
  const s = createStore(new FakeStorage({ failGet: true, failSet: true }));
  assert.deepEqual(getSettings(s), DEFAULT_SETTINGS);
  setSettings({ sound: false }, s);
  assert.equal(getSettings(s).sound, false);
  assert.deepEqual(s.keys().sort(), [KEYS.settings]);
  s.clearAll();
});

test('store: settings merge', () => {
  const s = createStore(new FakeStorage());
  s.set(KEYS.settings, { botSpeed: 'x', sound: false, textScale: 'large', zzz: 1, lastBots: { count: 'a', levels: [] } });
  assert.deepEqual(getSettings(s), { ...DEFAULT_SETTINGS, sound: false, textScale: 'large' });
  setSettings({ botSpeed: 'fast', motion: 'bad' }, s);
  const g = getSettings(s);
  assert.equal(g.botSpeed, 'fast'); assert.equal(g.motion, 'auto'); assert.equal(g.sound, false);
  setSettings({ lastBots: { count: 3, levels: ['a', 'b', 'c'] } }, s);
  assert.deepEqual(getSettings(s).lastBots, { count: 3, levels: ['a', 'b', 'c'] });
});

test('store: clearAll prefix', () => {
  const fs = new FakeStorage(), s = createStore(fs);
  s.set(KEYS.profile, { name: 'a' }); s.set(roomKey('X'), { token: 't' });
  fs.m.set('baska', '1'); fs.m.set('ahilik-muted', '1');
  assert.equal(s.keys().length, 2);
  s.clearAll();
  assert.deepEqual([...fs.m.keys()].sort(), ['ahilik-muted', 'baska']);
});

test('store: legacy migration', () => {
  const fs = new FakeStorage(), s = createStore(fs);
  fs.m.set('ahilik-muted', '1'); fs.m.set('ahilik.tutorial.done', '1');
  migrateLegacy(s, fs);
  assert.equal(getSettings(s).sound, false);
  assert.deepEqual(s.get(KEYS.flags), { tutorialDone: true });
  assert.equal(fs.m.has('ahilik-muted'), false);
  assert.equal(fs.m.has('ahilik.tutorial.done'), false);
  const snap = JSON.stringify([...fs.m]);
  migrateLegacy(s, fs);
  assert.equal(JSON.stringify([...fs.m]), snap);
  // yeni anahtar varsa eskisine bakılmaz
  fs.m.set('ahilik-muted', '1'); s.set(KEYS.settings, { sound: true });
  migrateLegacy(s, fs);
  assert.equal(getSettings(s).sound, true);
  assert.equal(fs.m.has('ahilik-muted'), false);
});
