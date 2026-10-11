// Test yardımcıları: tohumlu rastgele, sabit saat, hızlı katılım.
import { actor, legalActions } from '../../src/game.js';
import { viewFor } from '../../src/view.js';
import { botAction } from '../../src/bot.js';
import { join, createRoom, receive, tick, nextDeadline } from '../../server/room.js';

// mulberry32: rand() -> [0,1)
export function mkRand(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sabit/ilerletilebilir saat: clock() -> ms, clock.tick(ms)
export function mkClock(start = 1_000_000) {
  let t = start;
  const c = () => t;
  c.tick = ms => (t += ms);
  return c;
}

// Odaya bir insan katar, token döner (başarısızsa fırlatır).
export function fakeJoin(room, name, now = 0, rand = mkRand(7), avatar = 0) {
  const r = join(room, { name, avatar }, now, rand);
  if (!r.ok) throw new Error('fakeJoin: ' + r.error.code);
  return r.token;
}

// Başlamış oda: humans insan (ilki host) + bots bot. { room, tokens, r } döner (r = start sonucu).
export function startedRoom({ humans = 2, bots = 0, now = 1_000_000, rand = mkRand(7), timing, options } = {}) {
  const room = createRoom({ code: 'K7M2QX', now, timing });
  const tokens = Array.from({ length: humans }, (_, i) => fakeJoin(room, `Oyuncu${i}`, now, rand, i));
  const send = (tok, t, extra) => receive(room, tok, { v: 1, t, ...extra }, now, rand);
  for (let i = 0; i < bots; i++) send(tokens[0], 'addBot', { level: 'medium' });
  if (options) send(tokens[0], 'setOptions', options);
  for (const t of tokens.slice(1)) send(t, 'ready', { on: true });
  const r = send(tokens[0], 'start');
  return { room, tokens, r };
}

// Sanal saat: nextDeadline'a atlayarak until'e kadar tick çağırır. { out, now } döner.
export function runUntil(room, now, until, rand, deps) {
  const out = [];
  for (let n = 0; n < 100000; n++) {
    const d = nextDeadline(room);
    if (d === null || d > until) break;
    now = Math.max(now, d);
    const r = tick(room, now, rand, deps);
    out.push(...r.out);
    if (r.expired) return { out, now, expired: true };
    if (!r.changed) throw new Error('runUntil takıldı: vade var ama tick iş yapmadı');
  }
  return { out, now: Math.max(now, until) };
}

// Oyunu 'over'a kadar oynatır: insan koltukları botAction ile act gönderir, botlar sanal saatle tick'ten oynar.
// onOut(out) her yayın için çağrılır. { now, steps } döner.
export function playOut(room, now, rand, { max = 20000, onOut = () => {} } = {}) {
  let steps = 0;
  while (room.phase === 'game') {
    if (++steps > max) throw new Error(`playOut: ${max} adımda bitmedi`);
    const st = room.game.state, who = actor(st), seat = room.seats[who];
    if (!seat.bot && !seat.takeover) {
      const action = botAction(viewFor(st, who, room.game.gameId), legalActions(st), 'medium');
      const r = receive(room, seat.token, { v: 1, t: 'act', action, base: room.game.version }, now, rand);
      if (!r.changed) throw new Error(`playOut: act reddedildi ${JSON.stringify(r.out[0]?.msg)}`);
      onOut(r.out);
    } else {
      const r = runUntil(room, now, nextDeadline(room), rand);
      now = r.now; onOut(r.out);
    }
  }
  return { now, steps };
}
