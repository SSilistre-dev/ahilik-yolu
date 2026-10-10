// AHI-012: "Son tur" uyarısı — saf sıra sayacı, bitiş nedeni ve UI satırı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, apply, legalActions, turnsLeft, endReason } from '../src/game.js';
import { safeBotAction } from '../src/botstep.js';
import { lastRound } from '../src/ui.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8'));
const mk = (n, startIdx, active) => ({ startIdx, active, players: Array.from({ length: n }) });

test('lastturn: formula table', () => {
  for (const [active, want] of [[0, 4], [1, 3], [2, 2], [3, 1]]) assert.equal(turnsLeft(mk(4, 0, active)), want);
  assert.equal(turnsLeft(mk(3, 2, 2)), 3);
  assert.equal(turnsLeft(mk(3, 2, 0)), 2);
  assert.equal(turnsLeft(mk(3, 2, 1)), 1);
});

const SEEDS = Number(process.env.LASTTURN_SEEDS ?? 40); // make qa: 300 (1500 oyun)
test('lastturn: turnsLeft matches bot games', () => {
  let opened = 0;
  for (let n = 2; n <= 6; n++) for (let seed = 1; seed <= SEEDS; seed++) {
    let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed, startIdx: seed % n });
    let want = null, ends = 0, extra = 0;
    for (let i = 0; i < 20000 && s.phase !== 'over'; i++) {
      const r = apply(s, safeBotAction(s));
      const was = s.endgame;
      s = r.state;
      if (want !== null) ends += r.events.filter((e) => e.type === 'endTurn').length;
      if (!was && s.endgame) {
        opened++;
        if (s.phase === 'over') { want = null; break; } // tetikleyen hamle oyunu da bitirdi
        want = turnsLeft(s);
        extra = r.events.filter((e) => e.type === 'endTurn').length; // tetikleyen hamle endTurn ise sayaç onu içermez
      }
    }
    if (want !== null) {
      assert.equal(s.phase, 'over', `n=${n} seed=${seed} bitmedi`);
      assert.equal(ends, want, `n=${n} seed=${seed}`);
      assert.ok(extra <= 1);
    }
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
  const o = structuredClone(s); for (const k of Object.keys(o.awards)) o.awards[k] = 0; assert.equal(endReason(o), 'odul');
  a.endgame = false; assert.equal(endReason(a), null);
});

test('lastturn: lastRound null cases', () => {
  assert.equal(lastRound(fx('mid')), null);
  assert.equal(lastRound(fx('over')), null); // endgame:true ama phase over
  const m = fx('mid'); m.endgame = true; m.decks.ahlak = [];
  assert.deepEqual(lastRound(m), { left: turnsLeft(m), reason: 'ahlak' });
});
