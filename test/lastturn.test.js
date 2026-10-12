// AHI-012: "Son hamle" uyarısı — bitiş nedeni ve UI satırı (2026-10-12: sıra sayacı kalktı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, apply, endReason } from '../src/game.js';
import { safeBotAction } from '../src/botstep.js';
import { lastRound } from '../src/ui.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8'));
const SEEDS = Number(process.env.LASTTURN_SEEDS ?? 40); // make qa: 300 (1500 oyun)
test('lastturn: bitiş aşaması açılınca tetikleyen turun sonunda oyun biter (bot oyunları)', () => {
  let opened = 0;
  for (let n = 2; n <= 6; n++) for (let seed = 1; seed <= SEEDS; seed++) {
    let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed, startIdx: seed % n });
    let trigger = null, turns = 0;
    for (let i = 0; i < 20000 && s.phase !== 'over'; i++) {
      const r = apply(s, safeBotAction(s));
      const was = s.endgame, before = s.active;
      s = r.state;
      if (trigger !== null) turns += r.events.filter((e) => e.type === 'endTurn').length;
      if (!was && s.endgame) { opened++; trigger = before; turns = r.events.filter((e) => e.type === 'endTurn').length; }
    }
    assert.equal(s.phase, 'over', `n=${n} seed=${seed}`);
    if (trigger !== null) assert.equal(turns, 1, `n=${n} seed=${seed}: tetikleyen turdan sonra tam bir endTurn`);
  }
  assert.ok(opened > SEEDS * 5 * 0.66, `bitiş aşaması ${opened} oyunda açıldı`);
});

test('lastturn: endReason', () => {
  const s = newGame({ players: [{ name: 'a' }, { name: 'b' }], seed: 1 });
  assert.equal(endReason(s), null);
  s.endgame = true;
  assert.equal(endReason(s), null); // hiçbiri tükenmedi
  const a = structuredClone(s); a.decks.ahlak = []; assert.equal(endReason(a), 'ahlak');
  const t = structuredClone(s); t.decks.ticaret = []; assert.equal(endReason(t), 'ticaret');
  const o = structuredClone(s); for (const k of Object.keys(o.awards)) o.awards[k] = 0; assert.equal(endReason(o), null); // ödül havuzu bitiş nedeni değil
  a.endgame = false; assert.equal(endReason(a), null);
});

test('lastturn: lastRound null cases', () => {
  assert.equal(lastRound(fx('mid')), null);
  assert.equal(lastRound(fx('over')), null); // endgame:true ama phase over
  const m = fx('mid'); m.endgame = true; m.decks.ahlak = [];
  assert.deepEqual(lastRound(m), { reason: 'ahlak' });
});
