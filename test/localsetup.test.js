// Aynı Telefonda / Botlarla kurulum saf mantığı (M06).
import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueNames, buildLocalGame } from '../src/menu-main.js';

test('localsetup: uniqueNames', () => {
  assert.deepEqual(uniqueNames(['Ayşe', 'Ayşe', 'Can']), ['Ayşe', 'Ayşe 2', 'Can']);
  assert.deepEqual(uniqueNames(['ayşe', 'AYŞE']), ['ayşe', 'AYŞE 2']);
  assert.deepEqual(uniqueNames(['IŞIK', 'ışık']), ['IŞIK', 'ışık 2'], 'Türkçe I/ı eşleşir');
  assert.deepEqual(uniqueNames(['A', 'A', 'A 2']), ['A', 'A 2', 'A 2 2'], 'üretilen ad da çakışmaz');
});

test('localsetup: buildLocalGame', () => {
  const rows = [{ name: ' Ayşe ', bot: false }, { name: 'ayşe', bot: false }, { name: '', bot: true }, { name: '', bot: false }];
  const g = buildLocalGame({ profile: { name: 'Zeynep', avatar: 'mage' }, rows, starter: 1 });
  assert.deepEqual(g.players.map(p => p.name), ['Ayşe', 'ayşe 2', 'Bot 2', 'Oyuncu 4']);
  assert.deepEqual(g.players.map(p => p.bot), [false, false, true, false]);
  assert.equal(g.startIdx, 1);
  const h = buildLocalGame({ profile: { name: 'Zeynep', avatar: 'mage' }, rows: [{ name: '', bot: false }, { name: 'x', bot: true }], starter: 0 });
  assert.equal(h.players[0].name, 'Zeynep', 'boş ilk satır profil adına düşer');
  assert.equal(h.players[0].avatar, 'mage');
  assert.deepEqual(g.players.map(p => p.avatar), ['mage', 'rogue_hooded', 'knight', 'barbarian'], 'avatarlar sırayla, tekrarsız');
  const six = buildLocalGame({ profile: null, rows: Array.from({ length: 6 }, () => ({ name: '', bot: false })) });
  assert.equal(six.players.length, 6);
  assert.ok(six.players.every(p => typeof p.avatar === 'string'), '6 oyuncuda hepsine karakter atanır');
});

test('localsetup: random starter', () => {
  const rows = Array.from({ length: 4 }, () => ({ name: '', bot: false }));
  assert.equal(buildLocalGame({ rows, starter: 'random' }, () => 0).startIdx, 0);
  assert.equal(buildLocalGame({ rows, starter: 'random' }, () => 0.99).startIdx, 3);
  assert.equal(buildLocalGame({ rows, starter: 9 }).startIdx, 0, 'geçersiz başlatıcı 0 olur');
});
