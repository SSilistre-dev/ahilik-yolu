// Pure rules engine. No DOM, no three. State is plain JSON (see SPEC.md contract).
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

export function newGame({ players, seed = 1 }) {
  need(players.length >= 2 && players.length <= 4, '2-4 oyuncu gerekli');
  const s = {
    seed, rng: seed >>> 0, phase: 'ahlak', turn: 0, active: 0, startIdx: 0, endgame: false,
    movesThisTurn: 0, pendingClose: null, moveDone: false, // moveDone: additive field, set after a trade ends movement
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

function setEnd(s, ev, why) {
  if (s.endgame) return;
  s.endgame = true;
  log(ev, 'endgame', `Oyun bitiş aşamasına girdi (${why}). Tur ilk oyuncuya kadar tamamlanacak.`);
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
  drawYol(s, p, HAND_SIZE - p.hand.length);
  const next = (s.active + 1) % s.players.length;
  log(ev, 'endTurn', `${p.name} turunu bitirdi.`, { pIdx: s.active });
  s.turn++; s.movesThisTurn = 0; s.moveDone = false; s.pendingClose = null; p.pendingText = null;
  s.active = next;
  if (next === s.startIdx && s.endgame) { s.phase = 'over'; log(ev, 'over', 'Oyun bitti.'); }
  else s.phase = 'ahlak';
}

const moveTargets = (s, p, id) => {
  const c = CARDS[id];
  if (c.kargo) return [];
  return neighbors(p.pos).filter((t) => { const T = s.tiles[t]; return T.kind === 'ilke' && !T.closed && (c.joker || T.ilke === c.ilke); });
};

// Deterministic contribution for openRoad: active first (ilke cards, then jokers), then others by seat order.
function contribution(s, tile) {
  const T = s.tiles[tile];
  if (!T || !T.closed) return null;
  const out = [];
  let left = 4;
  for (let k = 0; k < s.players.length && left; k++) {
    const pi = (s.active + k) % s.players.length, hand = s.players[pi].hand;
    const cards = [...hand.filter((id) => CARDS[id].ilke === T.ilke), ...hand.filter((id) => CARDS[id].joker)].slice(0, left);
    if (cards.length) { out.push({ pIdx: pi, cards }); left -= cards.length; }
  }
  return left === 0 && out[0].pIdx === s.active ? out : null;
}

export function legalActions(s) {
  const p = s.players[s.active], out = [];
  if (s.phase === 'ahlak') return [{ type: 'drawAhlak' }];
  if (s.phase === 'close') {
    return s.tiles.filter((t) => t.ilke === s.pendingClose && !t.closed && !t.occupants.length).map((t) => ({ type: 'closeTile', tile: t.idx }));
  }
  if (s.phase !== 'move') return out;
  if (p.pendingText) out.push({ type: 'readText' });
  if (!s.moveDone) {
    for (const card of dedupe(p.hand)) for (const tile of moveTargets(s, p, card)) out.push({ type: 'move', card, tile });
    const kargo = p.hand.find((id) => CARDS[id].kargo);
    if (kargo && s.movesThisTurn === 0) for (const city of Object.keys(CITIES)) if (cityTile(city) !== p.pos) out.push({ type: 'kargo', card: kargo, city });
    s.players.forEach((o, withPlayer) => {
      if (withPlayer !== s.active) for (const give of dedupe(p.hand)) for (const want of dedupe(o.hand)) out.push({ type: 'trade', withPlayer, give, want });
    });
    for (const t of s.tiles) if (contribution(s, t.idx)) out.push({ type: 'openRoad', tile: t.idx });
    out.push({ type: 'pass' });
  }
  out.push({ type: 'endTurn' });
  return out;
}

export function apply(state, a) {
  const s = structuredClone(state), ev = [], p = s.players[s.active], me = s.active;
  need(s.phase !== 'over', 'oyun bitti');
  if (a.type !== 'readText') p.pendingText = null;
  const inMove = () => need(s.phase === 'move');
  const free = () => { inMove(); need(!s.moveDone); };
  const discard = (id) => { p.hand.splice(p.hand.indexOf(id), 1); s.decks.yolDiscard.push(id); };

  switch (a.type) {
    case 'drawAhlak': {
      need(s.phase === 'ahlak');
      const id = s.decks.ahlak.pop();
      if (!id) { s.phase = 'move'; log(ev, 'ahlak', 'Ahlak destesi boş.'); break; }
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
      if (p.task && neighbors(a.tile).includes(cityTile(CARDS[p.task].city))) deliver(s, me, ev);
      break;
    }
    case 'kargo': {
      free();
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
    case 'trade': {
      free();
      const o = s.players[a.withPlayer];
      need(o && a.withPlayer !== me && p.hand.includes(a.give) && o.hand.includes(a.want), 'geçersiz takas');
      p.hand[p.hand.indexOf(a.give)] = a.want; o.hand[o.hand.indexOf(a.want)] = a.give;
      log(ev, 'swap', `${p.name} ile ${o.name} kart takas etti.`, { pIdx: me, withPlayer: a.withPlayer, give: a.give, want: a.want });
      break;
    }
    case 'openRoad': {
      free();
      const con = contribution(s, a.tile);
      need(con, 'yol açılamaz');
      const T = s.tiles[a.tile];
      for (const { pIdx, cards } of con) {
        const q = s.players[pIdx], n = Math.min(cards.length, s.awards[T.ilke]);
        for (const id of cards) { q.hand.splice(q.hand.indexOf(id), 1); s.decks.yolDiscard.push(id); }
        s.awards[T.ilke] -= n; q.badges += n;
      }
      s.decks.ahlakDiscard.push(T.closedBy);
      T.closed = false; T.closedBy = null;
      log(ev, 'openRoad', `${p.name} ${ILKELER[T.ilke].name} yolunu açtı (${con.map((x) => `${s.players[x.pIdx].name}: ${x.cards.length}`).join(', ')}).`, { pIdx: me, tile: a.tile, contrib: con });
      if (ILKE_IDS.every((i) => s.awards[i] === 0)) setEnd(s, ev, 'ödül havuzları boşaldı');
      break;
    }
    case 'pass': {
      free();
      s.decks.yolDiscard.push(...p.hand.splice(0));
      log(ev, 'pass', `${p.name} pas geçti, elini yeniledi.`, { pIdx: me });
      endTurn(s, ev);
      break;
    }
    case 'endTurn': inMove(); endTurn(s, ev); break;
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
  return rows.map(({ trades, ...r }, i) => ({ ...r, rank: i + 1 }));
}
