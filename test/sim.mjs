// Bot turnuvası: make sim. Kapıya girmez (olc/qa çalıştırmaz); PR'a önce/sonra tablosu eklenir.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { newGame, legalActions, apply, score, actor } from '../src/game.js';
import * as bot from '../src/bot.js';

export const LEVELS = bot.LEVELS ?? ['medium'];
// Tek karar noktası. N04 sonrası: bot.botAction(viewFor(s, actor(s), gameId), legalActions(s), level)
const decide = (s, level) => bot.botAction(s, level);

export function parseLineup(levels, players) {
  const l = levels.length === 1 ? Array(players).fill(levels[0]) : levels;
  if (l.length !== players) throw new Error(`--levels ${players} değer ister (ya da tek değer), ${l.length} verildi`);
  for (const x of l) if (!LEVELS.includes(x)) throw new Error(`bilinmeyen seviye "${x}" (geçerli: ${LEVELS.join(', ')})`);
  return l;
}

const REASONS = [['ahlak destesi bitti', 'ahlak'], ['ticaret destesi bitti', 'ticaret'], ['ödül havuzları boşaldı', 'ödül']];

export function runSim({ games = 2000, players = 4, levels = ['medium'], seed = 1 } = {}) {
  if (!(players >= 2 && players <= 6)) throw new Error('--players 2-6 olmalı');
  const lineup = parseLineup(levels, players);
  const P = players, unit = P * P, n = Math.ceil(games / unit) * unit; // koltuk x başlangıç dengesi için P^2 katı
  const names = [...new Set(lineup)];
  const by = Object.fromEntries(names.map((k) => [k, { seats: lineup.filter((x) => x === k).length, win: 0, total: 0, money: 0, badges: 0, trades: 0, rows: 0 }]));
  const pos = Array.from({ length: P }, () => ({ win: 0, draws: 0, paid: 0, money: 0, badges: 0 })); // başlayandan sayılan sıra
  const why = { ahlak: 0, ticaret: 0, ödül: 0 }, acts = {};
  let turns = 0, empty = 0;
  for (let g = 0; g < n; g++) {
    const lv = Array.from({ length: P }, (_, i) => lineup[(i + g) % P]); // seviyeler koltuklarda döner
    const startIdx = Math.floor(g / P) % P;                              // başlayan koltuk bağımsız döner
    let s = newGame({ players: lv.map((_, i) => ({ name: `B${i}`, bot: true })), seed: seed + g, startIdx });
    const rel = (i) => (i - startIdx + P) % P;
    while (s.phase !== 'over') {
      const a = decide(s, lv[actor(s)]);
      acts[a.type] = (acts[a.type] ?? 0) + 1;
      const r = apply(s, a);
      for (const e of r.events) {
        if (e.type === 'endgame') { const k = REASONS.find(([t]) => e.text.includes(t))?.[1]; if (k && !s.endgame) why[k]++; }
        else if (e.type === 'ahlak' && e.card) pos[rel(e.pIdx)].draws++;
        else if (e.type === 'ahlak' && e.empty) empty++; // deste boş: o tur ahlak kartı yok
        else if (e.type === 'close') pos[rel(e.pIdx)].paid += e.paid ?? 0;
      }
      s = r.state;
    }
    turns += s.turn;
    const rows = score(s), winners = rows.filter((r) => r.rank === 1);
    for (const r of rows) {
      const b = by[lv[r.pIdx]], w = r.rank === 1 ? 1 / winners.length : 0;
      b.win += w; b.total += r.total; b.money += r.money; b.badges += r.badges; b.trades += s.players[r.pIdx].trades.length; b.rows++;
      const q = pos[rel(r.pIdx)]; q.win += w; q.money += r.money; q.badges += r.badges;
    }
  }
  const pct = (x) => +(100 * x / n).toFixed(1);
  return {
    games: n, players: P, seed, lineup,
    levels: Object.fromEntries(names.map((k) => { const b = by[k], p = b.win / n;
      return [k, { seats: b.seats, fair: +(100 * b.seats / P).toFixed(1), win: pct(b.win), ci95: +(196 * Math.sqrt(p * (1 - p) / n)).toFixed(1),
        avgTotal: +(b.total / b.rows).toFixed(1), avgMoney: +(b.money / b.rows).toFixed(2), avgBadges: +(b.badges / b.rows).toFixed(2), avgTrades: +(b.trades / b.rows).toFixed(2) }]; })),
    seatsFromStart: pos.map((q) => ({ win: pct(q.win), draws: +(q.draws / n).toFixed(2), paid: +(q.paid / n).toFixed(2), money: +(q.money / n).toFixed(2), badges: +(q.badges / n).toFixed(2) })),
    endReason: Object.fromEntries(Object.entries(why).map(([k, v]) => [k, pct(v)])),
    avgTurns: +(turns / n).toFixed(1), emptyAhlakDraws: +(empty / n).toFixed(2),
    actionsPerGame: Object.fromEntries(Object.entries(acts).sort().map(([k, v]) => [k, +(v / n).toFixed(2)])),
  };
}

export function format(r) {
  const L = [`Ahilik Yolu sim: ${r.players} oyuncu, ${r.games} oyun, seed ${r.seed}, dizilim ${r.lineup.join(',')} (seviyeler koltukta döner)`, ''];
  L.push('seviye   kazanma%  ±95GA  adil%  ort.puan  ort.para  ort.rozet  ort.ticaret');
  for (const [k, v] of Object.entries(r.levels)) L.push(`${k.padEnd(8)} ${String(v.win).padStart(8)} ${String(v.ci95).padStart(6)} ${String(v.fair).padStart(6)} ${String(v.avgTotal).padStart(9)} ${String(v.avgMoney).padStart(9)} ${String(v.avgBadges).padStart(10)} ${String(v.avgTrades).padStart(12)}`);
  L.push('', 'başlayandan sıra: kazanma% | ahlak çekimi | ödenen rozet | para | rozet');
  r.seatsFromStart.forEach((q, i) => L.push(`  ${i}. ${String(q.win).padStart(6)} ${String(q.draws).padStart(6)} ${String(q.paid).padStart(6)} ${String(q.money).padStart(7)} ${String(q.badges).padStart(7)}`));
  L.push('', `bitiş nedeni %: ${Object.entries(r.endReason).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  L.push(`ortalama tur: ${r.avgTurns} (kişi başı ${(r.avgTurns / r.players).toFixed(1)}) · ahlak kartsız tur/oyun: ${r.emptyAhlakDraws}`);
  L.push(`aksiyon/oyun: ${Object.entries(r.actionsPerGame).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  return L.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values: v } = parseArgs({ options: { games: { type: 'string', default: '2000' }, players: { type: 'string', default: '4' }, levels: { type: 'string', default: 'medium' }, seed: { type: 'string', default: '1' }, json: { type: 'boolean', default: false } } });
  try {
    const t0 = Date.now();
    const r = runSim({ games: +v.games, players: +v.players, levels: v.levels.split(','), seed: +v.seed });
    console.log(v.json ? JSON.stringify(r, null, 1) : format(r));
    console.error(`süre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
  } catch (e) { console.error(`sim: ${e.message}`); process.exit(2); }
}
