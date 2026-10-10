// Ana menü saf yardımcıları (M03): zaman metni, Devam Et etiketi, düğme süzgeci.
import test from 'node:test';
import assert from 'node:assert/strict';
import { timeAgo, continueLabel, mainButtons } from '../src/menu-main.js';

const NOW = 1_700_000_000_000;
const ago = s => timeAgo(NOW - s * 1000, NOW);

test('menu: timeAgo', () => {
  assert.equal(ago(0), 'az önce');
  assert.equal(ago(59), 'az önce');
  assert.equal(ago(60), '1 dk önce');
  assert.equal(ago(59 * 60), '59 dk önce');
  assert.equal(ago(3600), '1 saat önce');
  assert.equal(ago(23 * 3600), '23 saat önce');
  assert.equal(ago(24 * 3600), 'dün');
  assert.equal(ago(47 * 3600), 'dün');
  assert.equal(ago(48 * 3600), '2 gün önce');
  assert.equal(timeAgo(NOW + 5000, NOW), 'az önce'); // saat geri/ileri kaymasında bozulmaz
});

test('menu: continueLabel', () => {
  assert.equal(continueLabel({ n: 4, turn: 7, at: NOW - 86_400_000 }, NOW), '4 oyuncu · 7. tur · dün');
  assert.equal(continueLabel({ players: [1, 2, 3], turn: 1, at: NOW }, NOW), '3 oyuncu · 1. tur · az önce');
  assert.equal(continueLabel(null, NOW), null);
  assert.equal(continueLabel({ n: 'x' }, NOW), null);
});

test('menu: button filter by flags', () => {
  const ids = o => mainButtons(o).map(b => b.id);
  assert.deepEqual(ids({ save: null, has: () => false }), ['bots', 'friends', 'local', 'howto', 'settings']);
  assert.deepEqual(ids({ save: { n: 2 }, has: () => false }), ['continue', 'bots', 'friends', 'local', 'howto', 'settings']);
  const b = id => mainButtons({ save: null, has: () => false }).find(x => x.id === id);
  assert.equal(b('friends').disabled, true, 'çevrimiçi yokken Yakında');
  assert.equal(b('bots').primary, true, 'kayıt yokken Botlarla Oyna birincil');
  assert.equal(mainButtons({ save: { n: 2 }, has: () => true }).find(x => x.id === 'friends').disabled, false);
  assert.equal(mainButtons({ save: { n: 2 }, has: () => true }).filter(x => x.primary).map(x => x.id).join(), 'continue');
});
