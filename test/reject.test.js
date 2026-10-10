// AHI-014: geçersiz tahta dokunuşu için neden metni (saf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalActions } from '../src/game.js';
import { rejectReason } from '../src/ui.js';

// Sen (insan, 0) + Bot (1); piyon pos karesinde, el verilen kartlar. Kare 12'nin komşuları: 6 disiplinli 7 comert 8 adaletli 11 adaletli 13 tokgozlu 16 comert 17 bilgili 18 durust.
function setup({ phase = 'move', pos = 12, hand = ['yol-comert-1', 'yol-adaletli-1'], task = 'ticaret-ankara-2', ...extra } = {}) {
  const s = newGame({ players: [{ name: 'Sen' }, { name: 'Bot', bot: true }], seed: 1 });
  const p = s.players[0];
  s.tiles[p.pos].occupants = s.tiles[p.pos].occupants.filter((i) => i !== 0);
  p.pos = pos; s.tiles[pos].occupants.push(0);
  p.hand = hand; p.task = task;
  s.phase = phase; s.active = 0;
  Object.assign(s, extra);
  return s;
}
const why = (s, idx, selected = null, viewer = 0) => rejectReason(s, legalActions(s), selected, viewer, idx);

test('reject: ahlak phase', () => {
  assert.equal(why(setup({ phase: 'ahlak' }), 7), 'Önce Ahlak Kartı Aç düğmesine dokun.');
});

test('reject: close phase', () => {
  const s = setup({ phase: 'close', pendingClose: 'comert' });
  s.tiles[7].closed = true;
  s.tiles[16].occupants.push(1);
  assert.equal(why(s, 0), 'Şehirler kapatılamaz.');
  assert.equal(why(s, 7), 'Bu kare zaten kapalı.');
  assert.equal(why(s, 16), 'Piyon olan kareyi kapatamazsın.');
  assert.equal(why(s, 8), 'Sadece Cömert karelerinden birini kapatabilirsin.');
  s.tiles[7].closed = false; s.tiles[16].occupants = [];
  assert.equal(why(s, 7), null); // geçerli kare: tapTile halleder
});

test('reject: move phase', () => {
  const s = setup();
  assert.equal(why(s, 2), 'Bu kare uzak. Piyonunun yanındaki bir kareye git.');
  assert.equal(why(s, 0), 'Şehre doğrudan gidilmez. Hedef şehre komşu kareye git.');
  assert.equal(why(s, 13), 'Elinde Tokgözlü kartı yok.');
  assert.equal(why(s, 8, 'yol-comert-1'), 'Bu kare Adaletli. Seçtiğin kart Cömert.');
  s.tiles[7].closed = true; s.roadTries = 2; // yol çağrısı hakkı bitti -> açılamaz
  assert.equal(why(s, 7), 'Bu yol kapalı. Açmak için aynı ilkeden kartların lazım.');
  const d = setup({ moveDone: true, movesThisTurn: 1 });
  assert.equal(why(d, 13), 'Hareketin bitti. Turu Bitir\'e dokun.');
});

test('reject: valid taps give no feedback', () => {
  const s = setup();
  assert.equal(why(s, 7), null); // eşleşen kart var
  assert.equal(why(s, 7, 'yol-comert-1'), null);
  assert.equal(why(s, 12), null); // kendi karesi
  assert.equal(why(setup({ hand: ['yol-ahievran-0'] }), 8, 'yol-ahievran-0'), null); // joker her ilkeye uyar
  const c = setup({ pos: 6 }); // 6, ankara'ya komşu: şehre gir
  assert.equal(why(c, 0), null);
  const r = setup(); r.tiles[7].closed = true; // yol açma sayfası
  assert.equal(why(r, 7), null);
});

test('reject: silent when not the human turn', () => {
  const s = setup();
  assert.equal(why(s, 2, null, null), null); // perde: viewer yok
  assert.equal(why(s, 2, null, 1), null);
  s.active = 1;
  assert.equal(why(s, 2), null); // bot sırası
  s.active = 0; s.pending = { kind: 'trade', from: 0, to: 1 };
  assert.equal(why(s, 2), null);
  s.pending = null; s.phase = 'over';
  assert.equal(why(s, 2), null);
});
