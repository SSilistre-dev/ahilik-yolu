// OL-5/6: oyun içi çevrimiçi arayüzün saf kısımları (süre halkası, künye, tepki, rematch, düğme görünürlüğü, sansürlü olaylar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/game.js';
import { viewFor, eventsFor } from '../src/view.js';
import { botSteps } from '../src/botclock.js';
import { createOnlineSession } from '../src/session.js';
import { EMOTES, emoteOf, timerView, seatTags, rematchInfo, onlineChrome, eventText, cardArt } from '../src/ui.js';

test('tepkiler: SPEC id listesi, Türkçe etiket + emoji, bilinmeyen id null', () => {
  assert.deepEqual(EMOTES.map(e => e.id), ['selam', 'aferin', 'olsun', 'tesekkurler', 'hadi', 'dusunuyorum']);
  for (const e of EMOTES) assert.ok(e.label && e.emoji, e.id);
  assert.equal(emoteOf('tesekkurler').label, 'Teşekkürler');
  assert.equal(emoteOf('serbest metin'), null);
});

test('süre halkası: skew düzeltilmiş deadline ile kalan sn, son 10 sn vurgulu, deadline yoksa null', () => {
  // Sunucu saati istemciden 10 sn ileri; sunucu 20 sn sonrasını söylüyor -> istemcide de 20 sn.
  const subs = {}, net = { conn: 'ok', send() {}, close() {}, on: (t, cb) => { subs[t] = cb; return () => {}; } };
  let meta; const s = createOnlineSession({ net, now: () => 40000 });
  s.onUpdate(u => { meta = u.meta; });
  subs.game({ t: 'game', version: 1, gameId: 'G', view: { phase: 'move', active: 0, players: [] }, legal: [], events: [], now: 50000, deadline: 70000, seats: [] });
  assert.equal(timerView(meta, 40000, 30).left, 20);
  assert.equal(timerView(meta, 40000, 30).urgent, false);
  assert.equal(timerView(meta, 40000, 30).frac, 20 / 30);
  assert.equal(timerView(meta, 52500, 30).left, 8); // 7.5 sn -> yukarı yuvarla
  assert.equal(timerView(meta, 52500, 30).urgent, true);
  assert.equal(timerView(meta, 99999, 30).left, 0);
  assert.equal(timerView({ deadline: null }, 1, 30), null);
  assert.equal(timerView(null, 1, 30), null);
});

test('künye: Sen, çevrimdışı soluk, takeover "Bot oynuyor", bota dönen insan', () => {
  assert.deepEqual(seatTags({ seat: 1, online: true, takeover: false, bot: false }, 1, false), { you: true, faded: false, tag: null });
  assert.deepEqual(seatTags({ seat: 0, online: false, takeover: false, bot: false }, 1, false), { you: false, faded: true, tag: 'Çevrimdışı' });
  assert.deepEqual(seatTags({ seat: 0, online: false, takeover: true, bot: false }, 1, false), { you: false, faded: true, tag: 'Bot oynuyor' });
  assert.equal(seatTags({ seat: 2, online: true, takeover: false, bot: true }, 1, true).tag, null, 'başlangıçtan bot: etiket yok');
  assert.equal(seatTags({ seat: 2, online: true, takeover: false, bot: true }, 1, false).tag, 'Bot devraldı', 'oyundan ayrılıp bota dönen insan');
  assert.deepEqual(seatTags(undefined, 1, false), { you: false, faded: false, tag: null });
});

test('rematch metni: oy öncesi, oy sonrası x/y, oy yok', () => {
  assert.deepEqual(rematchInfo({ votes: [], need: 2 }, 0), { voted: false, text: 'Tekrar Oyna' });
  assert.deepEqual(rematchInfo({ votes: [1], need: 2 }, 0), { voted: false, text: 'Tekrar Oyna (1/2)' });
  assert.deepEqual(rematchInfo({ votes: [0], need: 2 }, 0), { voted: true, text: 'Oyun bekleniyor (1/2)' });
  assert.deepEqual(rematchInfo(null, 0), { voted: false, text: 'Tekrar Oyna' });
});

test('düğme görünürlüğü: online Geri Al/perde/eğitim yok, oyun sonunda Tekrar Oyna + Ana Menü; yerel Yeni Oyun aynı', () => {
  assert.deepEqual(onlineChrome(true, 'move'), { undo: false, curtain: false, tutorial: false, emote: true, rematch: false, menu: false, newGame: false });
  assert.deepEqual(onlineChrome(true, 'over'), { undo: false, curtain: false, tutorial: false, emote: true, rematch: true, menu: true, newGame: false });
  assert.deepEqual(onlineChrome(false, 'move'), { undo: true, curtain: true, tutorial: true, emote: false, rematch: false, menu: false, newGame: false });
  assert.deepEqual(onlineChrome(false, 'over'), { undo: true, curtain: true, tutorial: true, emote: false, rematch: false, menu: false, newGame: true });
});

test('sansürlü olaylar (give/want null) ve gizli el: UI saf kısımları çökmez', () => {
  const g = newGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 3 });
  const evs = eventsFor([
    { type: 'swap', pIdx: 0, withPlayer: 1, give: 'yol-comert-1', want: 'yol-adaletli-1', text: 'A ile B takas etti' },
    { type: 'tradeOffer', from: 0, to: 1, give: 'yol-comert-1', want: 'comert' },
  ], 2);
  assert.equal(evs[0].give, null); assert.equal(evs[1].give, null);
  const v = viewFor(g, 2); v.you = 2;
  assert.ok(v.players[0].hand.every(c => c === null));
  for (const ev of evs) assert.doesNotThrow(() => eventText(v, ev));
  assert.doesNotThrow(() => botSteps(evs, 0, { ...v, players: v.players.map((p, i) => i === 0 ? { ...p, bot: true } : p) }));
  assert.match(cardArt(null), /yol-back/);
  v.players[1].bot = true;
  assert.equal(eventText(v, { type: 'tradeOffer', from: 0, to: 1, give: null, want: 'comert' }), 'A, B ile takas teklif etti');
});

test('session: gelen emote onEmote ile iletilir, leave sonrası susar', () => {
  const subs = {}, net = { conn: 'ok', send() {}, close() {}, on: (t, cb) => { subs[t] = cb; return () => { delete subs[t]; }; } };
  const s = createOnlineSession({ net }), got = [];
  s.onEmote(m => got.push([m.seat, m.id]));
  subs.emote({ t: 'emote', seat: 2, id: 'selam' });
  assert.deepEqual(got, [[2, 'selam']]);
  s.leave(); assert.equal(subs.emote, undefined);
});
