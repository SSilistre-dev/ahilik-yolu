import { actor, wantKind } from './game.js';
import { CARDS, CITIES, neighbors } from './data.js';

// BFS over open ilke tiles to the tiles adjacent to the goal city (0 = already adjacent).
function distMap(s, city, closedExtra = -1) {
  const open = (t) => s.tiles[t].kind === 'ilke' && !s.tiles[t].closed && t !== closedExtra; // closedExtra: varsayımsal kapalı kare
  const q = neighbors(CITIES[city].tile).filter(open), d = new Map(q.map((t) => [t, 0]));
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) if (open(n) && !d.has(n)) { d.set(n, d.get(q[i]) + 1); q.push(n); }
  }
  return d;
}
const cheb = (a, b) => Math.max(Math.abs((a % 5) - (b % 5)), Math.abs(Math.floor(a / 5) - Math.floor(b / 5)));

// Bot's view of its own route: distance fn, current distance, ilke kinds that step closer.
function route(s, pi, closedExtra = -1) {
  const p = s.players[pi], goal = p.task && CARDS[p.task].city;
  const d = goal ? distMap(s, goal, closedExtra) : new Map();
  const dist = (t) => d.get(t) ?? Infinity;
  const cur = s.tiles[p.pos].kind === 'city' ? 1 + Math.min(...neighbors(p.pos).map(dist)) : dist(p.pos);
  const next = new Set(neighbors(p.pos).filter((t) => dist(t) < cur).map((t) => s.tiles[t].ilke));
  return { goal, dist, cur, next };
}

// How much a card is worth to its owner right now (joker 2, route ilke 2, kargo 1, rest 0).
const useful = (r, kindOfWant) => (kindOfWant === 'ahievran' || r.next.has(kindOfWant) ? 2 : kindOfWant === 'kargo' ? 1 : 0);

// AHI-025: açgözlü plan, bu turda eldeki kartlarla (kargo hariç) şehre varılır mı? Yalnız ilk hamlede sorulur.
function reachable(s, p, r) {
  if (s.movesThisTurn > 0 || s.moveDone) return true; // kargo artık yasal değil; zaten sorulmaz
  let pos = p.pos, d = r.cur;
  const hand = [...p.hand];
  for (let i = 0; i < 8 && d > 0; i++) {
    const opts = [];
    for (const id of hand) {
      const c = CARDS[id]; if (c.kargo) continue;
      for (const n of neighbors(pos)) {
        const T = s.tiles[n];
        if (T.kind === 'ilke' && !T.closed && (c.joker || T.ilke === c.ilke) && r.dist(n) < d) opts.push({ id, n, d: r.dist(n), joker: c.joker ? 1 : 0 });
      }
    }
    if (!opts.length) return false;
    opts.sort((x, y) => x.d - y.d || x.joker - y.joker);
    hand.splice(hand.indexOf(opts[0].id), 1); pos = opts[0].n; d = opts[0].d;
  }
  return d === 0;
}

export const LEVELS = ['easy', 'medium', 'hard'];

const moneyOf = (p) => p.trades.reduce((n, id) => n + CARDS[id].value, 0);
const mult = (b) => Math.min(5, Math.floor(b / 5) + 1);
const kindKey = (id) => { const c = CARDS[id]; return c.joker ? 'j' : c.kargo ? 'k' : c.ilke + (c.hasText ? '*' : ''); };

// Rastgelelik view'dan türer: aynı view -> aynı karar (sunucu yeniden oynatma ve testler buna dayanır).
function hash32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rngOf = (v) => mulberry32(hash32([v.gameId, v.turn, v.phase, v.movesThisTurn, v.offersThisTurn, v.roadTries, v.pending?.kind ?? '', v.declined.length, v.players[actor(v)].hand.join(',')].join('|')));

// view: viewFor çıktısı (gizli bilgi yok), legal: tam durumdan hesaplanan yasal aksiyonlar. Aynı girdi, aynı çıktı.
export function botAction(view, legal, level = 'medium') {
  if (level === 'medium') return medium(view, legal);
  if (level === 'easy') return easy(view, legal, rngOf(view));
  if (level === 'hard') return hard(view, legal);
  throw new Error(`bilinmeyen bot seviyesi: ${level}`);
}

// ---- Orta: bot v4 (referans; davranışı değişmez) ----
function medium(s, legal) {
  const who = actor(s), p = s.players[who], pd = s.pending;
  const find = (type) => legal.find((a) => a.type === type);
  const r = route(s, who);

  if (pd?.kind === 'trade') { // accept if what I get is at least as useful as what I give up
    const accept = legal.filter((a) => a.accept);
    return accept.length && useful(r, wantKind(pd.give)) >= useful(r, pd.want) ? accept[0] : legal.find((a) => !a.accept);
  }
  if (pd?.kind === 'road') { // give for badges, but keep one card that serves my own next step
    const rows = legal.filter((a) => a.cards.length);
    const mine = p.hand.filter((id) => (CARDS[id].ilke === pd.ilke || CARDS[id].joker));
    const keep = mine.some((id) => useful(r, wantKind(id)) === 2) ? 1 : 0;
    const n = s.awards[pd.ilke] > 0 ? mine.length - keep : 0;
    const fit = rows.filter((a) => a.cards.length <= n); // default (first) variant of the largest size
    return fit.reduce((b, a) => (a.cards.length > b.cards.length ? a : b), fit[0]) || legal.find((a) => !a.cards.length);
  }

  if (s.phase === 'ahlak') return find('drawAhlak');
  if (s.phase === 'close') { // tile farthest from own position and goal city
    const key = (a) => Math.min(cheb(a.tile, p.pos), r.goal ? cheb(a.tile, CITIES[r.goal].tile) : 9);
    return legal.reduce((b, a) => (key(a) > key(b) ? a : b));
  }
  if (find('readText')) return find('readText');
  if (find('enterCity')) return find('enterCity');

  if (!r.goal) { // [AHI-024] görev yok: rozet toplama modu; takas isteme ve hedefsiz kargo yok
    const mv = legal.filter((a) => a.type === 'move');
    const gain = (a) => s.tiles[a.tile].badges + (CARDS[a.card].hasText ? 1 : 0);
    const top = mv.length ? mv.reduce((b, a) => (gain(a) > gain(b) ? a : b)) : null;
    if (s.movesThisTurn > 0 || s.moveDone) return top && gain(top) > 0 ? top : find('endTurn');
    if (top) return top;
    if (s.roadTries === 0) {
      const road = legal.filter((a) => a.type === 'openRoad' && a.cards.length >= 2 && s.awards[s.tiles[a.tile].ilke] > 0);
      if (road.length) return road.reduce((b, a) => (a.cards.length > b.cards.length ? a : b));
    }
    return find('kargo') || find('pass');
  }

  const kargo = legal.find((a) => a.type === 'kargo' && a.city === r.goal);
  if (kargo && r.cur > 3) return kargo;
  const rank = (a) => r.dist(a.tile) - s.tiles[a.tile].badges * 0.1; // tie-break: more badges
  const moves = legal.filter((a) => a.type === 'move');
  const best = (list) => list.reduce((b, a) => (rank(a) < rank(b) ? a : b));
  const progress = moves.filter((a) => r.dist(a.tile) < r.cur);
  if (progress.length) return best(progress);

  // stuck: ask for the missing kind (give a card my route does not need), at most 2 offers per turn
  if (s.offersThisTurn < 2) {
    const offer = legal.find((a) => a.type === 'offerTrade' && (r.next.has(a.want) || (!r.next.size && a.want === 'ahievran')) && useful(r, wantKind(a.give)) === 0);
    if (offer) return offer;
  }
  // open a closed road with at least 2 cards, once per turn
  if (s.roadTries === 0) {
    const road = legal.filter((a) => a.type === 'openRoad' && a.cards.length >= 2 && s.awards[s.tiles[a.tile].ilke] > 0);
    if (road.length) return road.reduce((b, a) => (a.cards.length > b.cards.length ? a : b));
  }
  // movement is mandatory while any move/kargo is legal
  if (s.movesThisTurn === 0 && moves.length) return best(moves);
  if (s.movesThisTurn > 0 || s.moveDone) return find('endTurn');
  return find('kargo') ? legal.find((a) => a.type === 'kargo' && a.city === r.goal) || find('kargo') : find('pass') || find('endTurn');
}

// ---- Kolay ----
export const EASY = { progress: 0.6, accept: 0.5, read: 0.7, contribute: 0.5 };
function easy(s, legal, rnd) {
  const who = actor(s), pd = s.pending, r = route(s, who);
  const find = (type) => legal.find((a) => a.type === type);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  if (pd?.kind === 'trade') {
    const yes = legal.find((a) => a.accept);
    return yes && rnd() < EASY.accept ? yes : legal.find((a) => !a.accept);
  }
  if (pd?.kind === 'road') {
    const rows = legal.filter((a) => a.cards.length);
    return rows.length && rnd() < EASY.contribute ? rows[rows.length - 1] : legal[0]; // legal[0] = katkı yok
  }
  if (s.phase === 'ahlak') return find('drawAhlak');
  if (s.phase === 'close') return pick(legal);
  if (find('readText') && rnd() < EASY.read) return find('readText');
  if (find('enterCity')) return find('enterCity');
  if (rnd() < EASY.progress) { // yaklaştıran hamle varsa en yakın olanı
    const prog = legal.filter((a) => a.type === 'move' && r.dist(a.tile) < r.cur);
    if (prog.length) return prog.reduce((b, a) => (r.dist(a.tile) < r.dist(b.tile) ? a : b));
  }
  const pool = legal.filter((a) => a.type === 'move' || a.type === 'endTurn' || a.type === 'pass'); // takas ve yol açma yok
  if (pool.length) return pick(pool);
  const flights = legal.filter((a) => a.type === 'kargo'); // başka yasal şey kalmadıysa zorunlu kargo
  return flights.find((a) => a.city === r.goal) || (flights.length ? pick(flights) : legal[0]);
}

// ---- Zor ----
// Ağırlıklar ölçümle seçildi (docs/ARCHITECTURE.md §9). SV: bir adımın değeri, DL: teslim çarpanı, HW: eldeki hazır tür başına,
// JP: joker harcama cezası, F: ileride kazanılacak para tahmini, DEPTH: tur içi arama derinliği, STOP: hamleyi bırakma eşiği.
export const HARD = { SV: 0.45, DL: 1, HW: 0.12, JP: 0.2, F: 2, DEPTH: 5, STOP: 0.02 };
// Çarpan basamaklıdır (5/10/15/20); sürekli yaklaşım eşiğe yaklaşmayı ödüllendirir. 5'in katlarında gerçek çarpana eşittir.
export const smooth = (b) => (b >= 20 ? 5 : 1 + 0.4 * (b / 5) + 0.6 * Math.floor(b / 5)); // [AHI-022]

function hard(v, legal) {
  const me = actor(v), p = v.players[me], r = route(v, me), H = HARD;
  const find = (t) => legal.find((a) => a.type === t);
  if (v.pending) return medium(v, legal);                 // takas ve yol katkısı cevabı: Orta ile aynı
  if (v.phase === 'ahlak') return find('drawAhlak');
  if (v.phase === 'close') return closeChoice(v, legal, me, r); // [AHI-023]
  if (find('readText')) return find('readText');
  if (find('enterCity')) return find('enterCity');
  if (!r.goal) return medium(v, legal);                   // görev yok: Orta'nın rozet toplama modu

  const M = moneyOf(p) + H.F;                           // rozetin değeri = M x çarpan farkı
  const bv = (n) => M * (smooth(p.badges + n) - smooth(p.badges));
  const val = CARDS[p.task].value;
  const nextKinds = (tile, hand, d) => {                  // eldeki kaç tür bir sonraki adımı atar (en çok 2)
    if (v.tiles[tile].kind !== 'ilke') return 0;
    const seen = new Set();
    for (const id of hand) {
      const c = CARDS[id]; if (c.kargo) continue;
      const k = c.joker ? 'j' : c.ilke; if (seen.has(k)) continue;
      if (neighbors(tile).some((n) => v.tiles[n].kind === 'ilke' && !v.tiles[n].closed && r.dist(n) < d && (c.joker || v.tiles[n].ilke === c.ilke))) seen.add(k);
    }
    return Math.min(2, seen.size);
  };
  const vpos = (tile, hand, d) => -H.SV * (d === Infinity ? 12 : d) + H.HW * nextKinds(tile, hand, d);
  const memo = new Map();
  // Turun geri kalanı için en iyi toplam değer. Durmak her zaman serbesttir (vpos). got: bu turda rozeti alınmış kareler.
  const dfs = (pos, hand, d, got, depth) => {
    const key = `${pos}|${hand.map(kindKey).sort()}|${[...got].sort()}`;
    if (memo.has(key)) return memo.get(key);
    let best = vpos(pos, hand, d);
    if (depth > 0) {
      const tried = new Set();
      for (const id of hand) {
        const c = CARDS[id], k = kindKey(id); if (c.kargo || tried.has(k)) continue; tried.add(k);
        for (const n of neighbors(pos)) {
          const T = v.tiles[n]; if (T.kind !== 'ilke' || T.closed || !(c.joker || T.ilke === c.ilke)) continue;
          const nd = r.dist(n); if (nd > d && !(T.badges > 0 && !got.has(n))) continue; // geri adım yalnız alınmamış rozet için
          const bad = (got.has(n) ? 0 : T.badges) + (c.hasText ? 1 : 0);                   // yazı kartı: +1 rozet
          let g = bv(bad) - (c.joker ? H.JP : 0);
          if (nd === 0) g += H.DL * val * mult(p.badges + bad) + H.SV * d;                 // şehre varış
          else g += dfs(n, hand.filter((x, i) => i !== hand.indexOf(id)), nd, new Set(got).add(n), depth - 1);
          best = Math.max(best, g);
        }
      }
    }
    memo.set(key, best); return best;
  };

  const first = v.movesThisTurn === 0 && !v.moveDone;
  const V0 = vpos(p.pos, p.hand, r.cur);
  const scored = legal.filter((a) => a.type === 'move').map((a) => {
    const T = v.tiles[a.tile], c = CARDS[a.card], d = r.dist(a.tile), bad = T.badges + (c.hasText ? 1 : 0);
    let g = bv(bad) - (c.joker ? H.JP : 0);
    if (d === 0) g += H.DL * val * mult(p.badges + bad) + H.SV * r.cur;
    else g += dfs(a.tile, p.hand.filter((x, i) => i !== p.hand.indexOf(a.card)), d, new Set([a.tile]), H.DEPTH);
    return { a, g: g - V0 };
  });
  const top = scored.reduce((b, x) => (!b || x.g > b.g ? x : b), null);
  if (!first) return top && top.g > H.STOP ? top.a : find('endTurn');

  const kargo = legal.find((a) => a.type === 'kargo' && a.city === r.goal);
  if (kargo && !reachable(v, p, r)) return kargo;         // [AHI-025] bu turda eldeki kartlarla şehre varılamıyorsa kargo
  const prog = scored.filter((x) => r.dist(x.a.tile) < r.cur);
  if (prog.length) return prog.reduce((b, x) => (x.g > b.g ? x : b)).a;
  return medium(v, legal); // tıkalı: takas teklifi, yol açma, pas (Orta ile aynı)
}

// [AHI-023] Kare kapatma: rakibin kalan yolunu uzatan, kendi yolumu uzatmayan kare; lider (para x çarpan) daha ağır sayılır.
function closeChoice(v, legal, me, r) {
  const p = v.players[me], opps = v.players.map((_, i) => i).filter((i) => i !== me);
  const total = (i) => moneyOf(v.players[i]) * mult(v.players[i].badges);
  const leader = opps.reduce((b, i) => (total(i) > total(b) ? i : b), opps[0]);
  const base = new Map(v.players.map((_, i) => [i, route(v, i).cur]));
  const cap = (c) => (c === Infinity ? 3 : c);
  const harm = (tile, i) => Math.min(3, cap(route(v, i, tile).cur) - cap(base.get(i)));
  const far = (a) => Math.min(cheb(a.tile, p.pos), r.goal ? cheb(a.tile, CITIES[r.goal].tile) : 9);
  let best = null, bs = -Infinity;
  for (const a of legal) {
    let sc = 0.1 * far(a) - 2 * harm(a.tile, me);
    for (const i of opps) sc += (i === leader ? 1 : 0.4) * harm(a.tile, i);
    if (sc > bs) { bs = sc; best = a; }
  }
  return best;
}
