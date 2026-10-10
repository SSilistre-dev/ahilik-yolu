// Test yardımcıları: tohumlu rastgele, sabit saat, hızlı katılım.
import { join } from '../../server/room.js';

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
