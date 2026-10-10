// AHI-017: aynı cihazda çok insanlı oyunda gizli bilgi sızıntıları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game.js';
import { nextViewer } from '../src/ui.js';
import { viewerPlayer } from '../src/tutorial.js';

// 0 Ayşe (insan), 1 Burak (insan), 2 Bot
const mk = (humans = 2) => newGame({ players: [{ name: 'Ayşe' }, { name: 'Burak', bot: humans < 2 }, { name: 'Bot', bot: true }], seed: 1 });

test('privacy: nextViewer table', () => {
  const s = mk();
  s.active = 0; assert.equal(nextViewer(s, 0), 0);        // kendi sırası
  s.active = 2; assert.equal(nextViewer(s, 0), null);     // bot sırası: el gizli
  s.active = 1; assert.equal(nextViewer(s, 0), null);     // başka insan: el gizli
  assert.equal(nextViewer(s, null), null);                // perde kalkmadan kimse
  s.active = 0; s.pending = { kind: 'trade', from: 0, to: 1 };
  assert.equal(nextViewer(s, 0), null);                   // teklif ikinci insanda
  s.pending = { kind: 'trade', from: 0, to: 2 };
  assert.equal(nextViewer(s, 0), 0);                      // bot cevaplarken sırası olan telefonu tutuyor
  s.pending = null; s.phase = 'over';
  assert.equal(nextViewer(s, 0), null);
  const one = mk(1);                                      // tek insan: değişmez
  for (const a of [0, 1, 2]) { one.active = a; assert.equal(nextViewer(one, null), 0); assert.equal(nextViewer(one, 0), 0); }
  one.phase = 'over'; assert.equal(nextViewer(one, 0), 0);
});

test('privacy: slides generic when multi-human', () => {
  const s = mk();
  assert.equal(viewerPlayer(s, null), null);              // çok insan, telefon kimsede değil: jenerik örnek
  assert.equal(viewerPlayer(s, 1).name, 'Burak');         // perde kalktı: o oyuncunun kendi verisi
  assert.equal(viewerPlayer(s, 2), null);                 // bot koltuğu hiç örnek olmaz
  assert.equal(viewerPlayer(mk(1), null).name, 'Ayşe');   // tek insan: bugünkü davranış
});
