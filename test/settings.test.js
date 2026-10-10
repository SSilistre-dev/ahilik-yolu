// AHI-051: ayarlar — bot gecikmeleri, görünür satırlar, veri silme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botDelays, createStore, KEYS, setSettings, getSettings } from '../src/store.js';
import { settingsRows, domSettings } from '../src/settings.js';

test('settings: botDelays', () => {
  assert.deepEqual(botDelays({ botSpeed: 'normal' }), { bot: 700, ahlak: 1200 });
  assert.deepEqual(botDelays({ botSpeed: 'fast' }), { bot: 350, ahlak: 600 });
  assert.deepEqual(botDelays({ botSpeed: 'slow' }), { bot: 1120, ahlak: 1920 });
  assert.deepEqual(botDelays({}), { bot: 700, ahlak: 1200 });
  assert.ok(botDelays({ botSpeed: 'fast' }, 100, 100).bot >= 150); // alt sınır
});

test('settings: rows hidden without vibrate', () => {
  const ids = nav => settingsRows(nav).map(r => r.id);
  assert.ok(!ids({}).includes('vibrate'));
  assert.ok(ids({ vibrate() {} }).includes('vibrate'));
  assert.deepEqual(ids({ vibrate() {} }), ['sound', 'vibrate', 'botSpeed', 'textScale', 'motion']);
});

test('settings: dom attributes', () => {
  assert.deepEqual(domSettings({ textScale: 'large', motion: 'off' }), { text: 'large', motion: 'off' });
  assert.deepEqual(domSettings({ textScale: 'normal', motion: 'auto' }), { text: null, motion: null });
});

test('settings: clearAll keeps foreign keys', () => {
  const m = new Map([['baska.anahtar', 'x']]);
  const s = createStore({ getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } });
  setSettings({ sound: false }, s); s.set(KEYS.profile, { name: 'a', avatar: 'mage' }); s.set(KEYS.save, { x: 1 });
  s.clearAll();
  assert.deepEqual([...m.keys()], ['baska.anahtar']);
  assert.equal(getSettings(s).sound, true);
});
