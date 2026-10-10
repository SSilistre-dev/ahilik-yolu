// Denge ölçümü kilidi (AHI-027). 21 ahlak kartı oyuncu sayısına bölünmezse ilk koltuklar bir kart fazla çeker.
// Kural motoru bilerek değişmez (SPEC "Denge notu"); bu testler mekanizmayı kilitler. BALANCE_GAMES ile büyütülür (make qa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSim } from './sim.mjs';

const mul = +(process.env.BALANCE_GAMES_MUL ?? 1);
const draws = (players, games) => runSim({ games: games * mul, players, levels: ['medium'], seed: 1 }).seatsFromStart.map((q) => q.draws);

test('denge: 4 oyuncuda başlayan koltuk diğerlerinden ortalama en az 0,8 fazla ahlak kartı çeker', () => {
  const [first, ...rest] = draws(4, 64);
  for (const d of rest) assert.ok(first - d >= 0.8, `başlayan ${first}, diğeri ${d}`);
});

test('denge: 3 oyuncuda (21 üçe bölünür) koltuklar arasında fark 0,2 kartı geçmez', () => {
  const d = draws(3, 63);
  assert.ok(Math.max(...d) - Math.min(...d) <= 0.2, d.join(' '));
});
