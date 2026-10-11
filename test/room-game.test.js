import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { receive, disconnect, join } from '../server/room.js';
import { actor, legalActions } from '../src/game.js';
import { viewFor } from '../src/view.js';
import { botAction } from '../src/bot.js';
import { mkRand, startedRoom, runUntil, playOut } from './helpers/rand.mjs';

const T0 = 1_000_000;
const msg = (t, extra = {}) => ({ v: 1, t, ...extra });
const fx = n => JSON.parse(readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8'));
const sent = (r, to) => r.out.filter(o => o.to === to).map(o => o.msg);
const errCode = (r, to) => sent(r, to).find(x => x.t === 'error')?.code;
const gameTo = (r, to) => sent(r, to).find(x => x.t === 'game');
const stateJson = room => JSON.stringify(room.game.state);
const act = (room, tok, action, base = room.game.version, now = T0, rand = mkRand(3)) => receive(room, tok, msg('act', { action, base }), now, rand);
const actorTok = room => room.seats[actor(room.game.state)].token;
// Sırası gelen insan için botAction ile bir hamle seçer.
const pick = room => { const st = room.game.state, w = actor(st); return botAction(viewFor(st, w, room.game.gameId), legalActions(st), 'medium'); };
const opts0 = { startSeat: 0 };
// startedRoom'u start öncesi lobiye geri sarar (hazırlar yeniden işaretli).
function relobby({ room }) { room.phase = 'lobby'; delete room.game; delete room.timers; room.seats.forEach(s => { s.ready = true; }); }

test('start: host değilse notHost', () => {
  const { room, tokens } = startedRoom({ humans: 2 });
  relobby({ room });
  assert.equal(errCode(receive(room, tokens[1], msg('start'), T0, mkRand(1)), tokens[1]), 'notHost');
  assert.equal(room.phase, 'lobby');
});

test('start: tek koltukla illegal', () => {
  const { room, r } = startedRoom({ humans: 1 });
  assert.equal(errCode(r, room.hostToken), 'illegal');
  assert.equal(room.phase, 'lobby');
});

test('start: hazır olmayan insan varken illegal', () => {
  const { room, tokens } = startedRoom({ humans: 3 });
  relobby({ room }); room.seats[2].ready = false;
  const r = receive(room, tokens[0], msg('start'), T0, mkRand(1));
  assert.equal(errCode(r, tokens[0]), 'illegal');
  assert.equal(sent(r, tokens[0])[0].msg, 'Herkes hazır değil.');
  assert.equal(room.phase, 'lobby');
});

test('start: faz game, version 1, her insana ayrı game mesajı', () => {
  const { room, tokens, r } = startedRoom({ humans: 2, bots: 1 });
  assert.equal(room.phase, 'game');
  assert.equal(room.game.version, 1);
  assert.equal(r.out.length, 2);
  const [a, b] = tokens.map(t => gameTo(r, t));
  assert.equal(a.version, 1);
  assert.notEqual(a, b);
  assert.ok(a.view.players[0].hand.every(c => c !== null) && a.view.players[1].hand.every(c => c === null));
  assert.ok(b.view.players[1].hand.every(c => c !== null) && b.view.players[0].hand.every(c => c === null));
  assert.equal(a.seats.length, 3);
});

test('start: startSeat sayı ve random (rand\'e bağlı) doğru koltuğu başlatır', () => {
  const { room } = startedRoom({ humans: 3, options: { startSeat: 2 } });
  assert.deepEqual([room.game.startIdx, room.game.state.active], [2, 2]);
  const base = startedRoom({ humans: 3 });
  relobby(base);
  const probe = mkRand(5); probe(); const want = Math.floor(probe() * 3);
  receive(base.room, base.tokens[0], msg('start'), T0, mkRand(5));
  assert.equal(base.room.game.startIdx, want);
});

test('start: aynı rand ve now aynı seed ve aynı state', () => {
  const mk = () => { const x = startedRoom({ humans: 2, bots: 1 }); relobby(x); receive(x.room, x.tokens[0], msg('start'), T0, mkRand(9)); return x.room; };
  const [a, b] = [mk(), mk()];
  assert.deepEqual(a.game, b.game);
  assert.equal(a.game.gameId.length, 12);
  assert.match(a.game.gameId, /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/);
});

test('act: sırası olmayan notYourTurn ve state değişmez', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  const before = stateJson(room);
  const r = act(room, tokens[1], { type: 'drawAhlak' });
  assert.equal(errCode(r, tokens[1]), 'notYourTurn');
  assert.equal(stateJson(room), before);
  assert.equal(room.game.version, 1);
});

test('act: eski base stale ve güncel game gönderilir', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  const before = stateJson(room);
  const r = act(room, tokens[0], { type: 'drawAhlak' }, 0);
  assert.equal(errCode(r, tokens[0]), 'stale');
  assert.equal(gameTo(r, tokens[0]).version, 1);
  assert.equal(r.out.some(o => o.to === tokens[1]), false);
  assert.equal(act(room, tokens[0], { type: 'drawAhlak' }, null).out.find(o => o.msg.t === 'error').msg.code, 'stale');
  assert.equal(stateJson(room), before);
});

test('act: yasadışı aksiyon illegal, state ve version değişmez', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  const before = stateJson(room);
  const r = act(room, tokens[0], { type: 'move', card: 'yok', tile: 3 });
  assert.equal(errCode(r, tokens[0]), 'illegal');
  assert.equal(sent(r, tokens[0])[0].msg, 'Bu hamle şimdi yapılamaz.');
  assert.equal(r.changed, false);
  assert.equal(stateJson(room), before);
  assert.equal(room.game.version, 1);
});

test('act: undo ve bilinmeyen tür reddedilir', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  const before = stateJson(room);
  for (const a of [{ type: 'undo' }, { type: 'x' }, {}, null, 5, 'drawAhlak', [], { type: '__proto__' }]) {
    assert.equal(errCode(act(room, tokens[0], a), tokens[0]), 'illegal', JSON.stringify(a));
  }
  assert.equal(stateJson(room), before);
});

test('act: başarılı aksiyon version+1 ve herkese game', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  const r = act(room, tokens[0], { type: 'drawAhlak' });
  assert.equal(r.changed, true);
  assert.equal(room.game.version, 2);
  for (const t of tokens) assert.equal(gameTo(r, t).version, 2);
  assert.ok(room.game.log.length >= 1);
  assert.ok(gameTo(r, tokens[1]).events.length >= 1);
});

test('act: pending cevabı sırası gelen koltuktan kabul edilir (takas ve yol katkısı)', () => {
  for (const [name, action] of [['trade-offer', { type: 'respondTrade', accept: false }], ['road-ask', { type: 'contribute', cards: [] }]]) {
    const { room, tokens } = startedRoom({ humans: 3, options: opts0 });
    room.game.state = fx(name);
    assert.equal(errCode(act(room, tokens[1], action), tokens[1]), 'notYourTurn', name); // aktif oyuncu cevap veremez
    const r = act(room, tokens[0], action);
    assert.equal(r.changed, true, name);
    assert.equal(room.game.state.pending, null, name);
    assert.equal(room.game.version, 2);
  }
});

test('act: sıra değişince legal yeni actor\'a gider, diğerlerine boş', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  let r = act(room, tokens[0], { type: 'drawAhlak' });
  assert.ok(gameTo(r, tokens[0]).legal.length > 0);
  assert.deepEqual(gameTo(r, tokens[1]).legal, []);
  // turu bitir: oynanabilir bir hamle zinciri
  for (let i = 0; i < 40 && actorTok(room) === tokens[0] && room.game.state.turn === 0; i++) {
    const a = pick(room); r = act(room, tokens[0], a);
  }
  assert.equal(actorTok(room), tokens[1]);
  assert.deepEqual(gameTo(r, tokens[0]).legal, []);
  assert.ok(gameTo(r, tokens[1]).legal.length > 0);
});

test('game mesajı: başka koltuğun eli ve desteler sızmaz (200 adım)', () => {
  let steps = 0; // oyunlar 200 adımdan kısa; toplam 200 adıma kadar yeni oyun açılır
  for (let seed = 11; steps < 200; seed++) {
    const rand = mkRand(seed);
    const { room } = startedRoom({ humans: 3, bots: 1, rand, options: opts0 });
    let now = T0;
    while (steps < 200 && room.phase === 'game') {
      const st = room.game.state, w = actor(st), seat = room.seats[w];
      let out;
      if (!seat.bot) out = act(room, seat.token, pick(room), room.game.version, now, rand).out;
      else { const r = runUntil(room, now, Math.max(now, room.timers.botAt), rand); now = r.now; out = r.out; }
      steps++;
      const post = room.game.state;
      for (const o of out.filter(x => x.msg.t === 'game')) {
        const seat = room.seats.findIndex(s => s.token === o.to), json = JSON.stringify(o.msg);
        const secret = [...post.players.flatMap((p, i) => i === seat ? [] : p.hand), ...post.decks.yol, ...post.decks.ahlak, ...post.decks.ticaret];
        // takas teklifi/olayı yalnız iki tarafa, masaya konan yol katkısı herkese açıktır (SPEC v5)
        const pd = post.pending, shown = new Set(pd?.kind === 'trade' && (seat === pd.from || seat === pd.to) ? [pd.give] : []);
        if (pd?.kind === 'road') pd.offers.forEach(of => of.cards.forEach(c => shown.add(c)));
        for (const e of room.game.log.slice(-6)) if (e.type === 'swap' && (seat === e.pIdx || seat === e.withPlayer)) shown.add(e.give).add(e.want);
        for (const id of secret) if (!shown.has(id)) assert.ok(!json.includes(`"${id}"`), `sızdı: ${id} -> koltuk ${seat}`);
      }
    }
  }
  assert.ok(steps >= 200);
});

test('game mesajı: seed ve rng görünmez, gameId görünür', () => {
  const { room, tokens, r } = startedRoom({ humans: 2 });
  const g = gameTo(r, tokens[0]), json = JSON.stringify(g);
  assert.equal(g.gameId, room.game.gameId);
  assert.equal(g.view.gameId, room.game.gameId);
  assert.equal(g.view.rng, 0);
  assert.ok(!('seed' in g.view));
  assert.ok(!json.includes(`"seed"`));
  assert.ok(!json.includes(String(room.game.state.seed)));
});

test('act: oyun bitince phase over ve sonraki act illegal', () => {
  const { room, tokens } = startedRoom({ humans: 2, bots: 2, options: opts0 });
  const rand = mkRand(21);
  playOut(room, T0, rand);
  assert.equal(room.phase, 'over');
  assert.equal(room.game.state.phase, 'over');
  assert.equal(errCode(act(room, tokens[0], { type: 'endTurn' }), tokens[0]), 'illegal');
});

test('emote: geçerli id herkese yayınlanır', () => {
  const { room, tokens } = startedRoom({ humans: 3 });
  const r = receive(room, tokens[1], msg('emote', { id: 'aferin' }), T0, mkRand(1));
  assert.equal(r.out.length, 3);
  for (const t of tokens) assert.deepEqual(sent(r, t), [{ v: 1, t: 'emote', seat: 1, id: 'aferin' }]);
});

test('emote: 2 sn sınırı ve geçersiz id', () => {
  const { room, tokens } = startedRoom({ humans: 2 });
  const e = (id, now) => receive(room, tokens[0], msg('emote', { id }), now, mkRand(1));
  assert.equal(e('selam', T0).out.length, 2);
  assert.deepEqual(e('selam', T0 + 1999), { out: [], changed: false });
  assert.equal(e('hadi', T0 + 2000).out.length, 2);
  assert.equal(errCode(e('küfür', T0 + 9000), tokens[0]), 'badMsg');
  assert.equal(receive(room, tokens[1], msg('emote', { id: 'olsun' }), T0 + 5, mkRand(1)).out.length, 2); // koltuk başına sayaç
});

test('rematch: oyun bitmeden illegal', () => {
  const { room, tokens } = startedRoom({ humans: 2 });
  assert.equal(errCode(receive(room, tokens[0], msg('rematch'), T0, mkRand(1)), tokens[0]), 'illegal');
});

function overRoom(humans = 2, bots = 2) {
  const x = startedRoom({ humans, bots, options: opts0 });
  x.room.game.state = fx('over'); x.room.phase = 'over';
  return x;
}

test('rematch: çoğunluk oyuyla yeni oyun (yeni gameId, version 1, başlayan koltuk kayar)', () => {
  const { room, tokens } = overRoom();
  const oldId = room.game.gameId, rand = mkRand(4);
  let r = receive(room, tokens[0], msg('rematch'), T0, rand);
  assert.deepEqual(gameTo(r, tokens[1]).rematch, { votes: [0], need: 2 });
  assert.equal(room.phase, 'over');
  r = receive(room, tokens[1], msg('rematch'), T0, rand);
  assert.equal(room.phase, 'game');
  assert.equal(room.game.version, 1);
  assert.notEqual(room.game.gameId, oldId);
  assert.equal(room.game.startIdx, 1);
  assert.equal(room.game.state.active, 1);
  assert.equal(room.seats.length, 4);
  assert.deepEqual(room.game.rematch, []);
  assert.equal(gameTo(r, tokens[0]).rematch, undefined);
});

test('rematch: aynı oy tekrar sayılmaz, çevrimiçi sayı düşünce eşik yeniden hesaplanır', () => {
  const { room, tokens } = overRoom(3, 1);
  const rand = mkRand(4);
  receive(room, tokens[0], msg('rematch'), T0, rand);
  const again = receive(room, tokens[0], msg('rematch'), T0, rand);
  assert.deepEqual(again, { out: [], changed: false });
  assert.deepEqual(room.game.rematch, [tokens[0]]);
  let r = disconnect(room, tokens[1], T0, rand); // 2 çevrimiçi, 1 oy: eşik 2
  assert.equal(room.phase, 'over');
  assert.deepEqual(gameTo(r, tokens[0]).rematch, { votes: [0], need: 2 });
  r = disconnect(room, tokens[2], T0, rand); // 1 çevrimiçi: 1 oy yeter
  assert.equal(room.phase, 'game');
  assert.equal(gameTo(r, tokens[0]).version, 1);
});

test('leave: oyunda koltuk kalıcı Orta bot olur ve token geçersizleşir', () => {
  const { room, tokens } = startedRoom({ humans: 3, options: opts0 });
  const r = receive(room, tokens[1], msg('leave'), T0, mkRand(1));
  assert.deepEqual(r.out[0], { to: tokens[1], msg: null, close: true });
  const s = room.seats[1];
  assert.deepEqual([s.bot, s.level, s.token], [true, 'medium', null]);
  assert.equal(room.game.state.players[1].bot, true);
  assert.equal(room.seats.length, 3);
  assert.equal(r.out.filter(o => o.msg?.t === 'game').length, 2);
  assert.equal(errCode(receive(room, tokens[1], msg('ready', { on: true }), T0, mkRand(1)), tokens[1]), 'illegal');
  assert.equal(join(room, { token: tokens[1], name: 'x', avatar: 0 }, T0, mkRand(1)).error.code, 'started');
  // host ayrılırsa devir
  receive(room, tokens[0], msg('leave'), T0, mkRand(1));
  assert.equal(room.hostToken, tokens[2]);
});

test('join: oyun sırasında geçerli token game mesajını alır, tokensiz started', () => {
  const { room, tokens } = startedRoom({ humans: 2, options: opts0 });
  act(room, tokens[0], { type: 'drawAhlak' });
  disconnect(room, tokens[1], T0 + 5);
  const j = join(room, { token: tokens[1], name: 'x', avatar: 0 }, T0 + 9, mkRand(1));
  assert.equal(j.ok, true);
  assert.equal(j.out[0].msg.t, 'welcome');
  const g = j.out.find(o => o.to === tokens[1] && o.msg.t === 'game').msg;
  assert.equal(g.version, 2);
  assert.ok(g.events.length >= 1 && g.events.length <= 20);
  assert.equal(room.seats[1].online, true);
  const late = join(room, { name: 'Geç', avatar: 0 }, T0, mkRand(1));
  assert.deepEqual([late.ok, late.error.code, late.close], [false, 'started', true]);
});

test('snapshot: JSON gidiş-dönüşü sonrası act çalışır', () => {
  const { room, tokens } = startedRoom({ humans: 2, bots: 1, options: opts0 });
  act(room, tokens[0], { type: 'drawAhlak' });
  const copy = JSON.parse(JSON.stringify(room));
  const r = act(copy, tokens[0], pick(copy), copy.game.version);
  assert.equal(r.changed, true);
  assert.equal(copy.game.version, 3);
});
