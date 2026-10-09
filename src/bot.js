import { legalActions } from './game.js';
import { CARDS, CITIES, neighbors } from './data.js';

// BFS over open ilke tiles to the tiles adjacent to the goal city (0 = already adjacent).
function distMap(s, city) {
  const open = (t) => s.tiles[t].kind === 'ilke' && !s.tiles[t].closed;
  const q = neighbors(CITIES[city].tile).filter(open), d = new Map(q.map((t) => [t, 0]));
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) if (open(n) && !d.has(n)) { d.set(n, d.get(q[i]) + 1); q.push(n); }
  }
  return d;
}
const cheb = (a, b) => Math.max(Math.abs((a % 5) - (b % 5)), Math.abs(Math.floor(a / 5) - Math.floor(b / 5)));

export function botAction(s) {
  const legal = legalActions(s), p = s.players[s.active];
  const find = (type) => legal.find((a) => a.type === type);
  if (s.phase === 'ahlak') return find('drawAhlak');
  const goal = p.task && CARDS[p.task].city;
  if (s.phase === 'close') { // tile farthest from own position and goal city
    const key = (a) => Math.min(cheb(a.tile, p.pos), goal ? cheb(a.tile, CITIES[goal].tile) : 9);
    return legal.reduce((b, a) => (key(a) > key(b) ? a : b));
  }
  if (find('readText')) return find('readText');
  const d = goal ? distMap(s, goal) : new Map();
  const dist = (t) => d.get(t) ?? Infinity;
  const cur = s.tiles[p.pos].kind === 'city' ? 1 + Math.min(...neighbors(p.pos).map(dist)) : dist(p.pos);
  const kargo = legal.find((a) => a.type === 'kargo' && a.city === goal);
  if (kargo && cur > 3) return kargo;
  const rank = (a) => dist(a.tile) - s.tiles[a.tile].badges * 0.1; // tie-break: more badges
  const moves = legal.filter((a) => a.type === 'move' && dist(a.tile) < cur);
  if (moves.length) return moves.reduce((b, a) => (rank(a) < rank(b) ? a : b));
  return find(s.movesThisTurn > 0 ? 'endTurn' : 'pass') || find('endTurn');
}
