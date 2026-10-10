import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, apply, legalActions, actor } from '../src/game.js';
import { botAction } from '../src/bot.js';
import { viewFor, eventsFor } from '../src/view.js';

const decide = (s) => botAction(viewFor(s, actor(s), 't'), legalActions(s));

const GAMES = Number(process.env.VIEW_FUZZ_GAMES ?? 100); // make qa: 500
const ID = /\b(?:yol|ahlak|ticaret)-[a-z]+-(?:\d+|neg)\b/g;
const rng = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const newMatch = (seed) => { const n = 2 + (seed % 5); return newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed, startIdx: seed % n }); };
// Bu oyuncunun görmesine izin verilen kart kimlikleri (gerçek state'ten hesaplanır).
function allowed(s, seat) {
  const ok = new Set([
    ...s.decks.yolDiscard, ...s.decks.ahlakDiscard,
    ...s.tiles.flatMap((t) => (t.closedBy ? [t.closedBy] : [])),
    ...s.players.flatMap((p) => [...p.trades, ...(p.task ? [p.task] : []), ...(p.pendingText ? [p.pendingText] : [])]),
  ]);
  if (s.phase === 'close') ok.add(`ahlak-${s.pendingClose}-neg`);
  if (seat != null) s.players[seat].hand.forEach((id) => ok.add(id));
  const pd = s.pending;
  if (pd?.kind === 'road') pd.offers.forEach((o) => o.cards.forEach((id) => ok.add(id)));
  if (pd?.kind === 'trade' && (seat === pd.from || seat === pd.to)) ok.add(pd.give);
  return ok;
}

test('view: sızıntı fuzz. Her adımda her koltuğun view ve olayları yalnız izinli kart kimliklerini içerir', () => {
  for (let seed = 1; seed <= GAMES; seed++) {
    let s = newMatch(seed);
    const seats = [...s.players.keys(), null];
    while (s.phase !== 'over') {
      const r = apply(s, decide(s));
      for (const seat of seats) {
        const v = viewFor(s, seat, `g${seed}`), ok = allowed(s, seat);
        for (const id of JSON.stringify(v).match(ID) ?? []) assert.ok(ok.has(id), `seed ${seed} koltuk ${seat}: view sızdırdı ${id}`);
        assert.ok(!('seed' in v) && v.rng === 0 && v.gameId === `g${seed}`);
        for (const k of ['yol', 'ahlak', 'ticaret']) assert.ok(v.decks[k].every((x) => x === null), `${k} destesi açık`);
        v.players.forEach((p, i) => assert.ok(i === seat || p.hand.every((x) => x === null), `koltuk ${i} eli açık`));
        const ok2 = new Set([...ok, ...allowed(r.state, seat)]);
        for (const e of eventsFor(r.events, seat)) for (const id of JSON.stringify(e).match(ID) ?? []) assert.ok(ok2.has(id), `seed ${seed} koltuk ${seat}: ${e.type} olayı sızdırdı ${id}`);
      }
      s = r.state;
    }
  }
});

test('view: gizli bilgiyi değiştirmek view\'ı değiştirmez (diferansiyel)', () => {
  const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (let seed = 1; seed <= 30; seed++) {
    let s = newMatch(seed); const r = rng(seed);
    while (s.phase !== 'over') {
      if (s.pending?.kind !== 'trade') for (const seat of [...s.players.keys(), null]) {
        const t = structuredClone(s); t.seed = 999999; t.rng = 12345;
        const others = t.players.map((_, i) => i).filter((i) => i !== seat);
        const pool = shuffle([...others.flatMap((i) => t.players[i].hand), ...t.decks.yol], r);
        for (const i of others) t.players[i].hand = pool.splice(0, t.players[i].hand.length);
        t.decks.yol = pool; shuffle(t.decks.ahlak, r); shuffle(t.decks.ticaret, r);
        assert.deepEqual(viewFor(s, seat, 'g'), viewFor(t, seat, 'g'), `seed ${seed} koltuk ${seat}`);
      }
      s = apply(s, decide(s)).state;
    }
  }
});

test('view: kendi elin ve ıskarta açık, state değişmez, bekleyen takasın verilen kartı yalnız iki tarafa açık', () => {
  let s = newMatch(4); const before = JSON.stringify(s);
  const v = viewFor(s, 1, 'x');
  assert.equal(JSON.stringify(s), before, 'viewFor girdiyi değiştirmemeli');
  assert.deepEqual(v.players[1].hand, s.players[1].hand);
  assert.equal(v.players[0].hand.length, s.players[0].hand.length);
  s = newGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 7 });
  s.phase = 'move';
  const give = s.players[0].hand[0], want = 'ahievran';
  s.pending = { kind: 'trade', from: 0, to: 1, give, want };
  assert.equal(viewFor(s, 0).pending.give, give);
  assert.equal(viewFor(s, 1).pending.give, give);
  assert.equal(viewFor(s, 2).pending.give, null);
  assert.equal(viewFor(s, null).pending.give, null);
});

test('eventsFor: swap ve tradeOffer kart kimliklerini üçüncü kişiden gizler', () => {
  const ev = [{ type: 'swap', pIdx: 0, withPlayer: 1, give: 'yol-comert-1', want: 'yol-bilgili-2', text: 'x' }, { type: 'tradeOffer', from: 0, to: 1, give: 'yol-comert-1', want: 'bilgili', text: 'y' }, { type: 'move', pIdx: 0, card: 'yol-comert-1', tile: 7, text: 'z' }];
  assert.deepEqual(eventsFor(ev, 0), ev);
  assert.deepEqual(eventsFor(ev, 1), ev);
  const out = eventsFor(ev, 2);
  assert.equal(out[0].give, null); assert.equal(out[0].want, null);
  assert.equal(out[1].give, null); assert.equal(out[1].want, 'bilgili');
  assert.equal(out[2].card, 'yol-comert-1', 'oynanan kart ıskartaya düşer, herkese açık');
  assert.equal(ev[0].give, 'yol-comert-1', 'girdi değişmez');
});

test('view: sızıntı fuzz\'ı gerçekten yakalar (tradeOffer maskesi kalkarsa kırmızı)', () => {
  // Kapının dişi var mı? Maskesiz bir eventsFor taklidiyle aynı denetim kırmızı olmalı.
  const leaky = (events) => events;
  let caught = false;
  for (let seed = 1; seed <= 20 && !caught; seed++) {
    let s = newMatch(seed);
    while (s.phase !== 'over' && !caught) {
      const r = apply(s, decide(s)), ok = new Set([...allowed(s, 2), ...allowed(r.state, 2)]);
      if (r.events.some((e) => e.type === 'tradeOffer' && e.from !== 2 && e.to !== 2)) caught = leaky(r.events).some((e) => (JSON.stringify(e).match(ID) ?? []).some((id) => !ok.has(id)));
      s = r.state;
    }
  }
  assert.ok(caught, 'maskesiz olay listesi yakalanmadı: fuzz kapısı zayıf');
});
