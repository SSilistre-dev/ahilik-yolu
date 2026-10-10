// Pure rules engine. No DOM, no three. State is plain JSON (see SPEC.md contract, v4).
import { ILKELER, ILKE_IDS, CITIES, BOARD, neighbors, CARDS, HAND_SIZE, AWARD_START, PLAYER_COLORS } from './data.js';

// ---- rng (mulberry32, state.rng is the internal uint32) ----
function rnd(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ids = (type) => Object.values(CARDS).filter((c) => c.type === type).map((c) => c.id);
const cityTile = (city) => CITIES[city].tile;
const need = (ok, msg = 'yasadışı aksiyon') => { if (!ok) throw new Error(msg); };
const log = (ev, type, text, extra = {}) => ev.push({ type, text, ...extra });
// distinct kind of a yol card: ilke (+text variant), joker, kargo
const kind = (id) => { const c = CARDS[id]; return c.joker ? 'joker' : c.kargo ? 'kargo' : c.ilke + (c.hasText ? '*' : ''); };
const dedupe = (cards) => { const seen = new Set(); return cards.filter((id) => !seen.has(kind(id)) && seen.add(kind(id))); };
// what a trade offer asks for: an ilke id, 'ahievran' or 'kargo'
export const WANT_KINDS = [...ILKE_IDS, 'ahievran', 'kargo'];
export const wantKind = (id) => { const c = CARDS[id]; return c.joker ? 'ahievran' : c.kargo ? 'kargo' : c.ilke; };
// cards that count for a closed road of this ilke: own ilke first, then jokers (deterministic order)
const roadCards = (hand, ilke) => [...hand.filter((id) => CARDS[id].ilke === ilke), ...hand.filter((id) => CARDS[id].joker)];
// All card sets (1..max cards) a player may put on a closed road: any count per kind (ilke / written ilke / joker).
// Per size the default set (ilke cards in hand order, jokers last) comes first; cards stay in roadCards order.
function roadVariants(hand, ilke, max) {
  const own = roadCards(hand, ilke), groups = new Map();
  for (const id of own) groups.set(kind(id), [...(groups.get(kind(id)) ?? []), id]);
  let combos = [[]];
  for (const g of groups.values()) combos = combos.flatMap((c) => Array.from({ length: Math.min(g.length, max - c.length) + 1 }, (_, n) => [...c, ...g.slice(0, n)]));
  const isDefault = (c) => c.every((id, i) => id === own[i]);
  return combos.filter((c) => c.length).map((c) => c.sort((x, y) => own.indexOf(x) - own.indexOf(y)))
    .sort((x, y) => x.length - y.length || isDefault(y) - isDefault(x));
}

export function newGame({ players, seed = 1, startIdx = 0 }) {
  need(players.length >= 2 && players.length <= 6, '2-6 oyuncu gerekli');
  need(startIdx >= 0 && startIdx < players.length, 'geçersiz başlangıç oyuncusu');
  const s = {
    seed, rng: seed >>> 0, phase: 'ahlak', turn: 0, active: startIdx, startIdx, endgame: false,
    movesThisTurn: 0, pendingClose: null, moveDone: false, // moveDone: set after a trade ends movement
    pending: null, declined: [], // SPEC v4
    offersThisTurn: 0, roadTries: 0, // extra per-turn counters (bot loop guards), reset in endTurn
    tiles: BOARD.map((t) => ({ ...t, closed: false, closedBy: null, badges: 0, occupants: [] })),
    awards: Object.fromEntries(ILKE_IDS.map((i) => [i, AWARD_START])),
    players: [], decks: { yol: [], yolDiscard: [], ahlak: [], ahlakDiscard: [], ticaret: [] },
  };
  s.decks.yol = shuffle(s, ids('yol'));
  s.decks.ahlak = shuffle(s, ids('ahlak'));
  s.decks.ticaret = shuffle(s, ids('ticaret'));
  players.forEach((pl, i) => {
    const task = s.decks.ticaret.pop();
    const p = { name: pl.name, color: PLAYER_COLORS[i], bot: !!pl.bot, pos: cityTile(CITIES[CARDS[task].city].opposite),
      hand: [], task, trades: [], badges: 0, pendingText: null };
    s.players.push(p);
    s.tiles[p.pos].occupants.push(i);
    drawYol(s, p, HAND_SIZE);
  });
  return s;
}

function drawYol(s, p, n) {
  for (; n > 0; n--) {
    if (!s.decks.yol.length) s.decks.yol = shuffle(s, s.decks.yolDiscard.splice(0));
    if (!s.decks.yol.length) return;
    p.hand.push(s.decks.yol.pop());
  }
}

function refill(s, pi, ev) {
  const p = s.players[pi], before = p.hand.length;
  drawYol(s, p, HAND_SIZE - before);
  const n = p.hand.length - before;
  if (n > 0) log(ev, 'refill', `${p.name} eline ${n} kart çekti.`, { pIdx: pi, n });
}

function setEnd(s, ev, why) {
  if (s.endgame) return;
  s.endgame = true;
  log(ev, 'endgame', `Oyun bitiş aşamasına girdi (${why}). Tur ilk oyuncuya kadar tamamlanacak.`);
}

// Bitiş aşamasından sonra, şu anki oyuncu dahil oynanacak sıra sayısı (AHI-012).
export const turnsLeft = (s) => ((s.startIdx - s.active + s.players.length - 1) % s.players.length) + 1;
// Bitiş aşamasını açan neden; durumdan türer (kayıttan devamda da çalışır).
export function endReason(s) {
  if (!s.endgame) return null;
  if (!s.decks.ahlak.length) return 'ahlak';
  if (!s.decks.ticaret.length) return 'ticaret';
  return Object.values(s.awards).every((n) => n === 0) ? 'odul' : null;
}

function moveTo(s, pi, tile) {
  const p = s.players[pi];
  const from = s.tiles[p.pos].occupants;
  from.splice(from.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi);
  p.pos = tile;
}

function enter(s, pi, tile, ev) {
  moveTo(s, pi, tile);
  const t = s.tiles[tile], p = s.players[pi];
  if (t.badges) {
    p.badges += t.badges;
    log(ev, 'badges', `${p.name} karedeki ${t.badges} rozeti aldı.`, { pIdx: pi, tile, n: t.badges });
    t.badges = 0;
  }
}

// Pawn stands on one of the 3 tiles next to its task city (rule 20): it may enter the city.
const nearGoal = (s, p) => !!p.task && neighbors(p.pos).includes(cityTile(CARDS[p.task].city));

// Complete the task (pawn goes to the city), draw next; same-city tasks complete immediately.
function deliver(s, pi, ev) {
  const p = s.players[pi];
  let c = CARDS[p.task];
  const city = c.city;
  moveTo(s, pi, cityTile(city));
  for (;;) {
    p.trades.push(c.id);
    log(ev, 'trade', `${p.name} ${CITIES[c.city].name} ticaretini tamamladı (${c.value}M).`, { pIdx: pi, card: c.id, city: c.city, value: c.value });
    p.task = s.decks.ticaret.pop() ?? null;
    if (!s.decks.ticaret.length) setEnd(s, ev, 'ticaret destesi bitti');
    if (!p.task) { log(ev, 'task', `${p.name} için yeni görev yok.`, { pIdx: pi }); break; }
    c = CARDS[p.task];
    log(ev, 'task', `${p.name} yeni görev aldı: ${CITIES[c.city].name} (${c.value}M).`, { pIdx: pi, card: c.id });
    if (c.city !== city) break;
  }
  s.moveDone = true;
}

function endTurn(s, ev) {
  const p = s.players[s.active];
  if (!s.moveDone && nearGoal(s, p)) deliver(s, s.active, ev); // book s.4: trade is won at the end of the turn
  refill(s, s.active, ev);
  const next = (s.active + 1) % s.players.length;
  log(ev, 'endTurn', `${p.name} turunu bitirdi.`, { pIdx: s.active });
  s.turn++; s.movesThisTurn = 0; s.moveDone = false; s.pendingClose = null; p.pendingText = null;
  s.pending = null; s.declined = []; s.offersThisTurn = 0; s.roadTries = 0;
  s.active = next;
  if (next === s.startIdx && s.endgame) { s.phase = 'over'; log(ev, 'over', 'Oyun bitti.'); }
  else {
    refill(s, next, ev); // rule 26: top up to 6 before the ahlak card
    if (s.decks.ahlak.length) s.phase = 'ahlak';
    else { s.phase = 'move'; log(ev, 'ahlak', 'Ahlak destesi bitti. Bu tur ahlak kartı yok.', { pIdx: next, empty: true }); }
  }
}

const moveTargets = (s, p, id) => {
  const c = CARDS[id];
  if (c.kargo) return [];
  return neighbors(p.pos).filter((t) => { const T = s.tiles[t]; return T.kind === 'ilke' && !T.closed && (c.joker || T.ilke === c.ilke); });
};

// legal move + kargo actions of the active player (empty => pass is allowed)
function moveOptions(s, p) {
  const out = [];
  for (const card of dedupe(p.hand)) for (const tile of moveTargets(s, p, card)) out.push({ type: 'move', card, tile });
  return [...out, ...kargoOptions(s, p)];
}
// kargo may be played before any move of the turn, even before the ahlak card (AHI-005)
function kargoOptions(s, p) {
  const kargo = p.hand.find((id) => CARDS[id].kargo);
  return kargo && s.movesThisTurn === 0 && !s.moveDone ? Object.keys(CITIES).filter((city) => cityTile(city) !== p.pos).map((city) => ({ type: 'kargo', card: kargo, city })) : [];
}
const canPass = (s, p) => s.phase === 'move' && !s.moveDone && s.movesThisTurn === 0 && !moveOptions(s, p).length;

export function actor(s) {
  const pd = s.pending;
  return pd ? (pd.kind === 'trade' ? pd.to : pd.ask) : s.active;
}

export function legalActions(s) {
  if (s.phase === 'over') return [];
  const pd = s.pending, out = [];
  if (pd?.kind === 'trade') {
    const hand = s.players[pd.to].hand;
    for (const card of dedupe(hand.filter((id) => wantKind(id) === pd.want))) out.push({ type: 'respondTrade', accept: true, card });
    out.push({ type: 'respondTrade', accept: false });
    return out;
  }
  if (pd?.kind === 'road') {
    out.push({ type: 'contribute', cards: [] });
    for (const cards of roadVariants(s.players[pd.ask].hand, pd.ilke, pd.need)) out.push({ type: 'contribute', cards });
    return out;
  }
  const p = s.players[s.active];
  if (s.phase === 'ahlak') return [{ type: 'drawAhlak' }, ...kargoOptions(s, p)];
  if (s.phase === 'close') {
    return s.tiles.filter((t) => t.ilke === s.pendingClose && !t.closed && !t.occupants.length).map((t) => ({ type: 'closeTile', tile: t.idx }));
  }
  if (p.pendingText) out.push({ type: 'readText' });
  if (!s.moveDone) {
    if (nearGoal(s, p)) out.push({ type: 'enterCity' });
    const mv = moveOptions(s, p);
    out.push(...mv);
    s.players.forEach((o, withPlayer) => {
      if (withPlayer === s.active) return;
      for (const give of dedupe(p.hand)) for (const want of WANT_KINDS) {
        if (want !== wantKind(give) && !s.declined.some((d) => d.to === withPlayer && d.want === want)) out.push({ type: 'offerTrade', withPlayer, give, want });
      }
    });
    for (const t of s.tiles) {
      if (!t.closed || s.roadTries >= MAX_ROAD_CALLS) continue;
      out.push({ type: 'openRoad', tile: t.idx, cards: [] }); // AHI-008: others may complete it
      for (const cards of roadVariants(p.hand, t.ilke, 4)) out.push({ type: 'openRoad', tile: t.idx, cards });
    }
    if (!mv.length && s.movesThisTurn === 0) out.push({ type: 'pass' });
  }
  if (s.movesThisTurn > 0 || s.moveDone) out.push({ type: 'endTurn' });
  return out;
}

// Road opens: discard cards + the negative ahlak card, award badges per contributed card.
function roadOpened(s, ev, me, T, offers) {
  for (const { pIdx, cards } of offers) {
    const q = s.players[pIdx], n = Math.min(cards.length, s.awards[T.ilke]);
    for (const id of cards) { q.hand.splice(q.hand.indexOf(id), 1); s.decks.yolDiscard.push(id); }
    s.awards[T.ilke] -= n; q.badges += n;
  }
  s.decks.ahlakDiscard.push(T.closedBy);
  T.closed = false; T.closedBy = null;
  s.pending = null;
  log(ev, 'openRoad', `${s.players[me].name} ${ILKELER[T.ilke].name} yolunu açtı (${offers.map((x) => `${s.players[x.pIdx].name}: ${x.cards.length}`).join(', ')}).`, { pIdx: me, tile: T.idx, contrib: offers });
  if (ILKE_IDS.every((i) => s.awards[i] === 0)) setEnd(s, ev, 'ödül havuzları boşaldı');
}

const MAX_ROAD_CALLS = 2; // per turn; digital guard against pestering online players (AHI-008)
const askNext = (s, ev, tile, ask, needN) => {
  s.pending.ask = ask; s.pending.need = needN;
  log(ev, 'roadAsk', `${s.players[ask].name}, yolu açmak için ${needN} kart daha gerekiyor. Katkı verir misin?`, { tile, ask, need: needN });
};

export function apply(state, a) {
  const s = structuredClone(state), ev = [], p = s.players[s.active], me = s.active;
  need(s.phase !== 'over', 'oyun bitti');
  const resp = a.type === 'respondTrade' || a.type === 'contribute';
  need(resp ? s.pending?.kind === (a.type === 'respondTrade' ? 'trade' : 'road') : !s.pending, 'bekleyen cevap var');
  if (a.type === 'move') p.pendingText = null; // reading stays open until the next move or end of turn (AHI-007)
  const inMove = () => need(s.phase === 'move');
  const free = () => { inMove(); need(!s.moveDone); };
  const discard = (id) => { p.hand.splice(p.hand.indexOf(id), 1); s.decks.yolDiscard.push(id); };
  const uniq = (c) => Array.isArray(c) && new Set(c).size === c.length;

  switch (a.type) {
    case 'drawAhlak': {
      need(s.phase === 'ahlak');
      const id = s.decks.ahlak.pop();
      if (!id) { s.phase = 'move'; log(ev, 'ahlak', 'Ahlak destesi bitti. Bu tur ahlak kartı yok.', { pIdx: me, empty: true }); break; }
      const c = CARDS[id], ad = ILKELER[c.ilke];
      if (!s.decks.ahlak.length) setEnd(s, ev, 'ahlak destesi bitti');
      if (!c.negative) {
        s.decks.ahlakDiscard.push(id);
        log(ev, 'ahlak', `${p.name} olumlu ahlak kartı açtı: ${ad.name}. Açık karelere rozet konuyor.`, { pIdx: me, card: id, ilke: c.ilke });
        for (const t of s.tiles) {
          if (t.ilke !== c.ilke || t.closed) continue;
          t.badges++;
          if (t.occupants.length) {
            const o = s.players[t.occupants[0]];
            o.badges += t.badges;
            log(ev, 'badges', `${o.name}, ${t.badges} rozet aldı (${ad.name} karesi).`, { pIdx: t.occupants[0], tile: t.idx, n: t.badges });
            t.badges = 0;
          } else log(ev, 'badgePlaced', `${ad.name} karesine rozet kondu.`, { tile: t.idx });
        }
        s.phase = 'move';
      } else if (s.tiles.some((t) => t.ilke === c.ilke && !t.closed && !t.occupants.length)) {
        log(ev, 'ahlak', `${p.name} olumsuz ahlak kartı açtı: ${ad.neg}. Bir ${ad.name} karesi kapatılmalı.`, { pIdx: me, card: id, ilke: c.ilke });
        s.phase = 'close'; s.pendingClose = c.ilke;
      } else {
        s.decks.ahlakDiscard.push(id);
        log(ev, 'ahlak', `${p.name} olumsuz kart açtı (${ad.neg}) ama kapatılacak boş kare yok.`, { pIdx: me, card: id, ilke: c.ilke });
        s.phase = 'move';
      }
      break;
    }
    case 'closeTile': {
      need(s.phase === 'close');
      const t = s.tiles[a.tile];
      need(t && t.ilke === s.pendingClose && !t.closed && !t.occupants.length);
      const pay = Math.min(2, p.badges);
      t.closed = true; t.closedBy = `ahlak-${t.ilke}-neg`; t.badges = 0; p.badges -= pay;
      s.pendingClose = null; s.phase = 'move';
      log(ev, 'close', `${p.name} ${ILKELER[t.ilke].name} karesini kapattı${pay ? ` ve ${pay} rozet ödedi` : ''}.`, { pIdx: me, tile: t.idx, paid: pay });
      break;
    }
    case 'move': {
      free();
      need(p.hand.includes(a.card) && moveTargets(s, p, a.card).includes(a.tile), 'geçersiz hamle');
      const c = CARDS[a.card];
      discard(a.card);
      enter(s, me, a.tile, ev);
      s.movesThisTurn++;
      log(ev, 'move', `${p.name} piyonunu ${ILKELER[s.tiles[a.tile].ilke].name} karesine taşıdı.`, { pIdx: me, card: a.card, tile: a.tile });
      if (c.hasText) { p.pendingText = c.id; log(ev, 'text', `${p.name} kart yazısını okuyabilir (+1 rozet).`, { pIdx: me }); }
      if (nearGoal(s, p)) log(ev, 'nearCity', `${p.name} görev şehrine komşu kareye geldi.`, { pIdx: me, city: CARDS[p.task].city });
      break;
    }
    case 'enterCity': {
      free();
      need(nearGoal(s, p), 'şehre komşu değilsin');
      deliver(s, me, ev);
      break;
    }
    case 'kargo': {
      need(s.phase === 'ahlak' || s.phase === 'move'); need(!s.moveDone);
      need(s.movesThisTurn === 0 && p.hand.includes(a.card) && CARDS[a.card].kargo && CITIES[a.city] && cityTile(a.city) !== p.pos, 'geçersiz kargo');
      discard(a.card);
      moveTo(s, me, cityTile(a.city));
      s.movesThisTurn++;
      log(ev, 'kargo', `${p.name} kargo ile ${CITIES[a.city].name} şehrine uçtu.`, { pIdx: me, city: a.city });
      if (p.task && CARDS[p.task].city === a.city) deliver(s, me, ev);
      endTurn(s, ev);
      break;
    }
    case 'readText': {
      inMove(); need(p.pendingText);
      p.pendingText = null; p.badges++;
      log(ev, 'read', `${p.name} yazıyı okudu, +1 rozet.`, { pIdx: me });
      break;
    }
    case 'offerTrade': {
      free();
      const o = s.players[a.withPlayer];
      need(o && a.withPlayer !== me && p.hand.includes(a.give) && WANT_KINDS.includes(a.want) && wantKind(a.give) !== a.want, 'geçersiz teklif');
      need(!s.declined.some((d) => d.to === a.withPlayer && d.want === a.want), 'teklif daha önce reddedildi');
      s.pending = { kind: 'trade', from: me, to: a.withPlayer, give: a.give, want: a.want };
      s.offersThisTurn++;
      log(ev, 'tradeOffer', `${p.name}, ${o.name} oyuncusuna takas teklif etti.`, { from: me, to: a.withPlayer, give: a.give, want: a.want });
      break;
    }
    case 'respondTrade': {
      const pd = s.pending, o = s.players[pd.to];
      if (a.accept) {
        need(o.hand.includes(a.card) && wantKind(a.card) === pd.want, 'geçersiz takas kartı');
        p.hand[p.hand.indexOf(pd.give)] = a.card; o.hand[o.hand.indexOf(a.card)] = pd.give;
        log(ev, 'swap', `${p.name} ile ${o.name} kart takas etti.`, { pIdx: me, withPlayer: pd.to, give: pd.give, want: a.card });
      } else {
        s.declined.push({ to: pd.to, want: pd.want });
        log(ev, 'tradeDeclined', `${o.name} takas teklifini reddetti.`, { pIdx: pd.to, from: me, want: pd.want });
      }
      s.pending = null;
      break;
    }
    case 'openRoad': {
      free();
      const T = s.tiles[a.tile];
      need(T && T.closed, 'yol açılamaz');
      const own = roadCards(p.hand, T.ilke);
      need(uniq(a.cards) && a.cards.length <= 4 && a.cards.every((id) => own.includes(id)), 'geçersiz kart');
      need(s.roadTries < MAX_ROAD_CALLS, 'bu turda çok fazla yol çağrısı');
      s.roadTries++;
      const offers = a.cards.length ? [{ pIdx: me, cards: [...a.cards] }] : [];
      if (a.cards.length === 4) { roadOpened(s, ev, me, T, offers); break; }
      s.pending = { kind: 'road', tile: a.tile, ilke: T.ilke, offers, ask: null, need: null };
      askNext(s, ev, a.tile, (me + 1) % s.players.length, 4 - a.cards.length);
      break;
    }
    case 'contribute': {
      const pd = s.pending, q = s.players[pd.ask], T = s.tiles[pd.tile];
      need(uniq(a.cards) && a.cards.length <= pd.need && a.cards.every((id) => roadCards(q.hand, pd.ilke).includes(id)), 'geçersiz katkı');
      if (a.cards.length) { pd.offers.push({ pIdx: pd.ask, cards: [...a.cards] }); pd.need -= a.cards.length; }
      if (pd.need === 0) { roadOpened(s, ev, me, T, pd.offers); break; }
      const next = (pd.ask + 1) % s.players.length;
      if (next === me) {
        s.pending = null;
        log(ev, 'roadFailed', `${ILKELER[T.ilke].name} yolu açılamadı; kimse kart kaybetmedi.`, { tile: pd.tile });
      } else askNext(s, ev, pd.tile, next, pd.need);
      break;
    }
    case 'pass': {
      need(canPass(s, p), 'pas geçilemez');
      s.decks.yolDiscard.push(...p.hand.splice(0));
      log(ev, 'pass', `${p.name} pas geçti, elini yeniledi.`, { pIdx: me });
      endTurn(s, ev);
      break;
    }
    case 'endTurn': inMove(); need(s.movesThisTurn > 0 || s.moveDone, 'önce piyon ilerletilmeli'); endTurn(s, ev); break;
    default: throw new Error('bilinmeyen aksiyon');
  }
  return { state: s, events: ev };
}

export function score(s) {
  const rows = s.players.map((p, pIdx) => {
    const money = p.trades.reduce((n, id) => n + CARDS[id].value, 0);
    const mult = Math.min(5, Math.floor(p.badges / 5) + 1);
    return { pIdx, money, badges: p.badges, mult, total: money * mult, trades: p.trades.length };
  });
  rows.sort((x, y) => y.total - x.total || y.badges - x.badges || y.trades - x.trades || x.pIdx - y.pIdx);
  let rank = 0;
  return rows.map(({ trades, ...r }, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.total !== r.total || prev.badges !== r.badges || prev.trades !== trades) rank = i + 1;
    return { ...r, rank };
  });
}
