// M04: profil — ad temizleme, karakter listesi, oyuncuya geçiş, kayıt doğrulama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATARS, AVATAR_IDS, NAME_MAX, cleanName, assignAvatars } from '../src/data.js';
import { MODELS } from '../src/assets.js';
import { newGame } from '../src/game.js';
import { createStore } from '../src/store.js';
import { getProfile, setProfile } from '../src/profile.js';

test('profile: cleanName', () => {
  assert.equal(NAME_MAX, 16);
  assert.equal(cleanName('  İsmail  '), 'İsmail');
  assert.equal(cleanName('a\u0000b'), 'ab');
  assert.equal(cleanName('x\u202Ey'), 'xy');
  assert.equal(cleanName('a\u200Bb\u2066c'), 'abc');
  assert.equal(cleanName('a \t  b'), 'a b');
  assert.equal(cleanName('é'), 'é'); // NFC
  assert.equal(cleanName('😀'.repeat(17)), '😀'.repeat(16));
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('\u200B\u0000'), null);
  assert.equal(cleanName(null), null);
  assert.equal(cleanName(5), null);
});

test('profile: assignAvatars', () => {
  const a = assignAvatars(4, 'mage');
  assert.equal(a[0], 'mage');
  assert.equal(new Set(a).size, 4);
  assert.ok(a.every(x => AVATAR_IDS.includes(x)));
  assert.deepEqual(assignAvatars(2, 'yok'), AVATAR_IDS.slice(0, 2));
  assert.equal(assignAvatars(6, 'knight').length, 6); // karakter sayısından fazla koltuk: başa sarar
});

test('profile: newGame avatar', () => {
  const g = newGame({ players: [{ name: 'a', avatar: 'knight' }, { name: 'b', avatar: 'yok' }, { name: 'c' }], seed: 3 });
  assert.deepEqual(g.players.map(p => p.avatar), ['knight', null, null]);
});

test('profile: models cover avatars', () => {
  assert.equal(new Set(AVATAR_IDS).size, AVATARS.length);
  for (const a of AVATARS) { assert.ok(MODELS[a.model], a.id); assert.ok(a.name && a.glyph && a.color, a.id); }
});

test('profile: stored profile is validated', () => {
  const m = new Map();
  const s = createStore({ getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } });
  assert.equal(getProfile(s), null);
  assert.equal(setProfile({ name: '  Ayşe ', avatar: 'mage' }, s), true);
  assert.deepEqual(getProfile(s), { name: 'Ayşe', avatar: 'mage' });
  assert.equal(setProfile({ name: '   ', avatar: 'mage' }, s), false);
  s.set('ahilik.profile', { name: 5, avatar: 'mage' });
  assert.equal(getProfile(s), null);
  s.set('ahilik.profile', { name: 'Ali', avatar: 'bilinmez' });
  assert.deepEqual(getProfile(s), { name: 'Ali', avatar: AVATAR_IDS[0] }); // eski/yanlış karakter varsayılana düşer
});
