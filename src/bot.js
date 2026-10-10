import { actor, wantKind } from './game.js';
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

// Bot's view of its own route: distance fn, current distance, ilke kinds that step closer.
function route(s, pi) {
  const p = s.players[pi], goal = p.task && CARDS[p.task].city;
  const d = goal ? distMap(s, goal) : new Map();
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

// view: viewFor çıktısı (gizli bilgi yok), legal: tam durumdan hesaplanan yasal aksiyonlar.
// ponytail: easy AHI-021'de; hard şimdilik yalnız AHI-025 kargo zamanlaması farkıyla medium.
export function botAction(s, legal, level = 'medium') {
  if (level !== 'medium' && level !== 'hard') throw new Error(`bilinmeyen bot seviyesi: ${level}`);
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
  if (kargo && (level === 'hard' ? !reachable(s, p, r) : r.cur > 3)) return kargo; // [AHI-025] hard: eldeki kartlarla varılamıyorsa
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
