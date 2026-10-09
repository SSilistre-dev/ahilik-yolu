import { CARDS, CITIES, neighbors } from './data.js';

export function goalTile(s, pIdx) {
  const t = s.players[pIdx]?.task;
  return t ? CITIES[CARDS[t].city].tile : null;
}

// BFS over open ilke tiles (8 dirs) from pos to the first tile adjacent to the goal city.
export function pathTo(s, pIdx) {
  const goal = goalTile(s, pIdx);
  if (goal == null) return [];
  const open = (t) => s.tiles[t].kind === 'ilke' && !s.tiles[t].closed;
  const adj = new Set(neighbors(goal));
  const start = s.players[pIdx].pos;
  if (adj.has(start)) return [];
  const prev = new Map([[start, null]]), q = [start];
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) {
      if (!open(n) || prev.has(n)) continue;
      prev.set(n, q[i]);
      if (adj.has(n)) {
        const out = [];
        for (let t = n; t !== start; t = prev.get(t)) out.unshift(t);
        return out;
      }
      q.push(n);
    }
  }
  return [];
}
