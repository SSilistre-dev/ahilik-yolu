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

// Karede n piyon varsa i'inci piyonun ofseti: x sağa, d kameraya doğru (kare kenarı 1). Piyonlar üst üste binmez.
export function pawnSlot(i, n) {
  const cols = n <= 2 ? n : Math.ceil(n / 2), row = n <= 2 || i < cols ? 0 : 1, cnt = row ? n - cols : cols, k = row ? i - cols : i;
  return { x: (k - (cnt - 1) / 2) * (cols === 3 ? 0.3 : 0.5), d: n <= 2 ? 0.15 : row ? -0.15 : 0.2 };
}

// a'dan b'ye 8 yönlü komşu adımlarla ara kareler (a hariç, b dahil): piyon ışınlanmaz, kare kare yürür.
export function walkTiles(a, b) {
  let r = Math.floor(a / 5), c = a % 5;
  const rb = Math.floor(b / 5), cb = b % 5, out = [];
  while (r !== rb || c !== cb) { r += Math.sign(rb - r); c += Math.sign(cb - c); out.push(r * 5 + c); }
  return out;
}

// İnsan oyuncunun başlangıç karesi üst satırdaysa tahta 180° döner: kendi tarafı ekranın altında (yakında) olur.
export const viewFlip = (startTile) => startTile != null && Math.floor(startTile / 5) < 2;
