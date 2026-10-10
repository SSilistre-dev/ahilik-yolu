// Saf lobi mantığı: saat (now) ve rastgelelik (rand) dışarıdan gelir; ağ, disk ve ws yok.
// Oda düz JSON'dur (diske olduğu gibi yazılır). Dönüşler: { out:[{to, msg, close?}], changed }.
// msg:null + close:true = "bu token'ın soketini kapat" (mesajsız). Oyun döngüsü (N07) ve zamanlayıcılar (N08) da burada.
import { isDeepStrictEqual } from 'node:util';
import { newGame, apply, actor, legalActions } from '../src/game.js';
import { viewFor, eventsFor } from '../src/view.js';
import { botAction } from '../src/bot.js';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BOT_NAMES = ['Çırak', 'Kalfa', 'Usta', 'Yiğit', 'Kâtip', 'Hacı'];
export const LIMITS = { maxSeats: 6, minSeats: 2, nameMax: 16, msgBytes: 8192, lostMs: 30000 };
const LEVELS = ['easy', 'medium', 'hard'];
const TURN_SECONDS = [0, 30, 60, 120];
// Süreler (ms). createRoom({timing}) ile geçersiz kılınır; room.timing JSON'dur.
export const TIMING = { botMs: 700, botAhlakMs: 1200, answerMs: 20000, graceMs: 30000, idleMs: 86400000, abandonedMs: 3600000, minTurnLeftMs: 10000 };
const tm = room => ({ ...TIMING, ...room.timing });
const ACT_TYPES = new Set(['drawAhlak', 'closeTile', 'move', 'kargo', 'readText', 'offerTrade', 'respondTrade', 'openRoad', 'contribute', 'pass', 'endTurn', 'enterCity']);
const EMOTES = new Set(['selam', 'aferin', 'olsun', 'tesekkurler', 'hadi', 'dusunuyorum']);
const EMOTE_GAP_MS = 2000;
const GAME_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ILLEGAL_ACT = 'Bu hamle şimdi yapılamaz.';

const ERR = {
  badMsg: 'Mesaj anlaşılamadı.', version: 'Oyun sürümü uyuşmuyor, sayfayı yenile.', notHost: 'Bunu yalnız oda kurucusu yapabilir.',
  illegal: 'Bu şimdi yapılamaz.', full: 'Oda dolu.', started: 'Oyun çoktan başlamış.', badName: 'Adın 1 ile 16 karakter arasında olmalı.',
  kicked: 'Odadan çıkarıldın.', notYourTurn: 'Sıra sende değil.', stale: 'Oyun ilerledi, güncel durum gönderildi.', expired: 'Oda süresi doldu.',
};
const CLOSING = new Set(['version', 'kicked', 'full', 'started', 'expired']);

const m = (t, extra) => ({ v: 1, t, ...extra });
const err = (to, code, close = CLOSING.has(code), text = ERR[code]) => ({ to, msg: m('error', { code, msg: text }), ...(close ? { close: true } : {}) });
const isHuman = s => !s.bot;
const humans = room => room.seats.filter(isHuman);
const seatOf = (room, token) => room.seats.findIndex(s => s.token !== null && s.token === token);

export function makeCode(rand) {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return c;
}

export function normalizeCode(s) {
  if (typeof s !== 'string') return null;
  const c = s.replace(/\s+/g, '').toUpperCase();
  return c.length === 6 && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null;
}

export function createRoom({ code, now, timing }) {
  const room = { code, createdAt: now, lastActivity: now, phase: 'lobby', options: { turnSeconds: 0, startSeat: 'random' }, hostToken: null, seats: [] };
  if (timing) room.timing = { ...TIMING, ...timing };
  return room;
}

// Ad doğrulama tek noktadır (N23 yasaklı kelime filtresini buraya bağlar). { ok, name }
export function cleanName(raw) {
  if (typeof raw !== 'string') return { ok: false };
  const name = raw.normalize('NFC').trim();
  const len = [...name].length;
  // Görünmez dolgu karakterleri (Hangul filler, Braille boşluk) harf/işaret sayılmaz; en az bir görünür karakter şart.
  if (len < 1 || len > LIMITS.nameMax || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u3164\u2800\u115F\u1160\uFFA0]/u.test(name)
    || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(name)) return { ok: false };
  return { ok: true, name };
}

// Aynı ad (büyük/küçük harf duyarsız) varsa " (2)", " (3)" ekler; toplam 16 karaktere kırpılır.
function uniqueName(room, name) {
  const taken = new Set(room.seats.map(s => s.name.toLowerCase()));
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    out = [...name].slice(0, LIMITS.nameMax - suffix.length).join('') + suffix;
  }
  return out;
}

function makeToken(room, rand) {
  for (;;) {
    let t = '';
    for (let i = 0; i < 4; i++) t += Math.floor(rand() * 4294967296).toString(16).padStart(8, '0');
    if (seatOf(room, t) < 0) return t;
  }
}

const welcome = (room, token) => ({ to: token, msg: m('welcome', { code: room.code, you: { seat: seatOf(room, token), token } }) });

// Herkese açık lobi görünümü; token içermez.
function lobbyMsg(room) {
  return m('lobby', {
    seats: room.seats.map((s, seat) => ({ seat, name: s.name, avatar: s.avatar, bot: s.bot, level: s.level, ready: s.ready, online: s.online,
      host: !s.bot && s.token === room.hostToken })),
    options: { ...room.options }, phase: room.phase,
  });
}
function broadcast(room) {
  const msg = lobbyMsg(room);
  return humans(room).map(s => ({ to: s.token, msg }));
}


export function join(room, { token, name, avatar } = {}, now, rand) {
  const known = typeof token === 'string' ? seatOf(room, token) : -1;
  if (known >= 0) {
    const s = room.seats[known];
    s.online = true; s.lostAt = null; room.lastActivity = now; room.joined = true;
    if (room.phase === 'lobby' || !room.game) return { ok: true, token, out: [welcome(room, token), ...broadcast(room)], changed: true };
    s.takeover = false; // koltuğu geri alır
    reschedule(room, now);
    const others = gameOut(room, [], now).filter(o => o.to !== token);
    const mine = { to: token, msg: gameMsg(room, known, room.game.log.slice(-20), now) };
    return { ok: true, token, out: [welcome(room, token), mine, ...others], changed: true };
  }
  const fail = (code, close) => ({ ok: false, error: { code, msg: ERR[code] }, close: close ?? CLOSING.has(code) });
  if (room.phase !== 'lobby') return fail('started');
  if (room.seats.length >= LIMITS.maxSeats) return fail('full');
  const n = cleanName(name);
  if (!n.ok) return fail('badName', false);
  if (!Number.isInteger(avatar) || avatar < 0 || avatar > 7) return fail('badMsg', false);
  const t = makeToken(room, rand);
  const host = room.hostToken === null;
  room.seats.push({ token: t, name: uniqueName(room, n.name), avatar, bot: false, level: null, ready: host, online: true, lostAt: null });
  if (host) room.hostToken = t;
  room.lastActivity = now; room.joined = true;
  return { ok: true, token: t, out: [welcome(room, t), ...broadcast(room)], changed: true };
}

function passHost(room) {
  const next = humans(room).find(s => s.online) ?? humans(room)[0] ?? null;
  room.hostToken = next ? next.token : null;
  if (next) next.ready = true;
}

// Koltuğu kaldırır; kayan insanlara yeni welcome, startSeat ayarı. Çıkan insan için çağıran out ekler.
function dropSeat(room, idx) {
  const [gone] = room.seats.splice(idx, 1);
  const ss = room.options.startSeat;
  if (ss === idx) room.options.startSeat = 'random'; else if (typeof ss === 'number' && ss > idx) room.options.startSeat = ss - 1;
  if (!gone.bot && gone.token === room.hostToken) passHost(room);
  return room.seats.slice(idx).filter(isHuman).map(s => welcome(room, s.token));
}

const HANDLERS = {
  ready(room, i, msg) {
    if (room.phase !== 'lobby') return 'illegal';
    if (typeof msg.on !== 'boolean') return 'badMsg';
    if (msg.seat !== undefined && msg.seat !== i) return 'illegal'; // başkasının (özellikle botun) koltuğu
    const s = room.seats[i];
    if (s.token === room.hostToken) return { out: [], changed: false }; // host her zaman hazır
    s.ready = msg.on;
    return { out: broadcast(room), changed: true };
  },
  addBot(room, i, msg) {
    if (room.seats[i].token !== room.hostToken) return 'notHost';
    if (room.phase !== 'lobby') return 'illegal';
    const level = msg.level ?? 'medium';
    if (!LEVELS.includes(level)) return 'illegal';
    if (room.seats.length >= LIMITS.maxSeats) return { out: [err(room.hostToken, 'full', false)], changed: false };
    const used = new Set(room.seats.map(s => s.name.toLowerCase()));
    const name = BOT_NAMES.find(n => !used.has(n.toLowerCase())) ?? uniqueName(room, BOT_NAMES[0]);
    room.seats.push({ token: null, name, avatar: 0, bot: true, level, ready: true, online: true, lostAt: null });
    return { out: broadcast(room), changed: true };
  },
  setBot(room, i, msg) {
    if (room.seats[i].token !== room.hostToken) return 'notHost';
    const b = room.seats[msg.seat];
    if (room.phase !== 'lobby' || !Number.isInteger(msg.seat) || !b?.bot || !LEVELS.includes(msg.level)) return 'illegal';
    b.level = msg.level;
    return { out: broadcast(room), changed: true };
  },
  removeSeat(room, i, msg) {
    if (room.seats[i].token !== room.hostToken) return 'notHost';
    const idx = msg.seat;
    if (room.phase !== 'lobby' || !Number.isInteger(idx) || !room.seats[idx] || idx === i) return 'illegal';
    const kicked = room.seats[idx];
    const shifted = dropSeat(room, idx);
    return { out: [...(kicked.bot ? [] : [err(kicked.token, 'kicked')]), ...shifted, ...broadcast(room)], changed: true };
  },
  setOptions(room, i, msg) {
    if (room.seats[i].token !== room.hostToken) return 'notHost';
    const { turnSeconds = room.options.turnSeconds, startSeat = room.options.startSeat } = msg;
    const seatOk = startSeat === 'random' || (Number.isInteger(startSeat) && startSeat >= 0 && startSeat < room.seats.length);
    if (room.phase !== 'lobby' || !TURN_SECONDS.includes(turnSeconds) || !seatOk) return 'illegal';
    room.options = { turnSeconds, startSeat };
    return { out: broadcast(room), changed: true };
  },
  start(room, i, msg, now, rand) {
    if (room.seats[i].token !== room.hostToken) return 'notHost';
    if (room.phase !== 'lobby') return 'illegal';
    const deny = text => ({ out: [err(room.hostToken, 'illegal', false, text)], changed: false });
    const n = room.seats.length, ss = room.options.startSeat;
    if (n < LIMITS.minSeats) return deny('En az 2 oyuncu gerekir.');
    if (humans(room).some(s => s.token !== room.hostToken && !s.ready)) return deny('Herkes hazır değil.');
    if (ss !== 'random' && !(Number.isInteger(ss) && ss < n)) return deny('Başlangıç koltuğu geçersiz.');
    startGame(room, ss, now, rand);
    return { out: gameOut(room, [], now), changed: true };
  },
  act(room, i, msg, now) {
    if (room.phase !== 'game') return 'illegal';
    const g = room.game, token = room.seats[i].token, who = actor(g.state);
    if (who !== i || botControlled(room, who)) return 'notYourTurn';
    if (msg.base !== g.version) return { out: [err(token, 'stale', false), { to: token, msg: gameMsg(room, i, [], now) }], changed: false };
    const a = msg.action;
    if (a === null || typeof a !== 'object' || Array.isArray(a) || !ACT_TYPES.has(a.type)) return { out: [err(token, 'illegal', false, ILLEGAL_ACT)], changed: false };
    let r;
    try { r = apply(g.state, a); } catch { return { out: [err(token, 'illegal', false, ILLEGAL_ACT)], changed: false }; }
    const events = settle(room, r, now);
    return { out: gameOut(room, events, now), changed: true };
  },
  emote(room, i, msg, now) {
    if (room.phase === 'lobby') return 'illegal';
    if (!EMOTES.has(msg.id)) return 'badMsg';
    const g = room.game, token = room.seats[i].token;
    if (now - (g.emoteAt[token] ?? -Infinity) < EMOTE_GAP_MS) return { out: [], changed: false }; // sessizce atılır
    g.emoteAt[token] = now;
    const out = onlineHumans(room).map(s => ({ to: s.token, msg: m('emote', { seat: i, id: msg.id }) }));
    return { out, changed: true };
  },
  rematch(room, i, msg, now, rand) {
    if (room.phase !== 'over') return 'illegal';
    const g = room.game, token = room.seats[i].token;
    if (g.rematch.includes(token)) return { out: [], changed: false };
    g.rematch.push(token);
    return { out: maybeRematch(room, now, rand) ?? gameOut(room, [], now), changed: true };
  },
  leave(room, i, msg, now, rand) {
    const token = room.seats[i].token;
    if (room.phase !== 'lobby') { // oyunda koltuk kalıcı Orta bot olur
      const s = room.seats[i], g = room.game;
      Object.assign(s, { bot: true, level: 'medium', token: null, online: true, lostAt: null, takeover: false, ready: true });
      g.state.players[i].bot = true;
      g.rematch = g.rematch.filter(t => t !== token);
      delete g.emoteAt[token];
      if (token === room.hostToken) passHost(room);
      const ev = [{ type: 'leave', pIdx: i, text: `${s.name} ayrıldı, bot devraldı.` }];
      pushLog(g, ev);
      reschedule(room, now, ev);
      return { out: [{ to: token, msg: null, close: true }, ...(maybeRematch(room, now, rand) ?? gameOut(room, ev, now))], changed: true };
    }
    const shifted = dropSeat(room, i);
    return { out: [{ to: token, msg: null, close: true }, ...shifted, ...broadcast(room)], changed: true };
  },
};

export function receive(room, token, msg, now, rand) {
  const i = seatOf(room, token);
  if (i < 0) return { out: [err(token, 'illegal', true)], changed: false };
  const bad = code => ({ out: [err(token, code)], changed: false });
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return bad('badMsg');
  if (msg.v !== 1) return bad('version');
  if (msg.t === 'ping') return { out: [{ to: token, msg: m('pong') }], changed: false };
  const h = Object.hasOwn(HANDLERS, msg.t) ? HANDLERS[msg.t] : null;
  if (!h) return bad('badMsg');
  room.lastActivity = now;
  const r = h(room, i, msg, now, rand);
  return typeof r === 'string' ? bad(r) : r;
}

// rand isteğe bağlı: verilirse kopma sonrası rematch eşiği hemen kontrol edilir, verilmezse bir sonraki tick'te.
export function disconnect(room, token, now, rand) {
  const i = seatOf(room, token);
  if (i < 0 || !room.seats[i].online) return { out: [], changed: false };
  Object.assign(room.seats[i], { online: false, lostAt: now });
  room.lastActivity = now;
  if (room.phase === 'lobby') return { out: broadcast(room), changed: true };
  reschedule(room, now);
  return { out: maybeRematch(room, now, rand) ?? gameOut(room, [], now), changed: true };
}

// ---- Oyun döngüsü (N07) ----
const onlineHumans = room => humans(room).filter(s => s.online);
const pushLog = (g, events) => { g.log.push(...events); if (g.log.length > 200) g.log.splice(0, g.log.length - 200); };
const turnKey = s => `${s.turn}:${s.active}`;

// Her insan için AYRI üretilir: paylaşılan tek nesne gizli alan sızdırır.
export function gameMsg(room, seat, events, now) {
  const g = room.game, t = room.timers ?? {}, over = room.phase === 'over';
  const votes = over ? g.rematch.map(tok => seatOf(room, tok)).filter(i => i >= 0) : null;
  return m('game', {
    version: g.version, gameId: g.gameId,
    view: viewFor(g.state, seat, g.gameId),
    legal: seat === actor(g.state) ? legalActions(g.state) : [],
    events: eventsFor(events, seat),
    deadline: t.answerAt ?? t.turnAt ?? null,
    now,
    seats: room.seats.map((s, i) => ({ seat: i, name: s.name, avatar: s.avatar, bot: s.bot, level: s.level, online: s.online, takeover: !!s.takeover })),
    ...(over ? { rematch: { votes, need: Math.floor(onlineHumans(room).length / 2) + 1 } } : {}),
  });
}

function gameOut(room, events, now) {
  return room.seats.flatMap((s, i) => isHuman(s) && s.online ? [{ to: s.token, msg: gameMsg(room, i, events, now) }] : []);
}

function startGame(room, startSeat, now, rand) {
  const n = room.seats.length;
  const seed = Math.floor(rand() * 2 ** 32);
  const startIdx = startSeat === 'random' ? Math.floor(rand() * n) : startSeat;
  let gameId = '';
  for (let k = 0; k < 12; k++) gameId += GAME_ID_ALPHABET[Math.floor(rand() * GAME_ID_ALPHABET.length)];
  room.game = { state: newGame({ players: room.seats.map(s => ({ name: s.name, bot: s.bot })), seed, startIdx }), gameId, version: 1, startIdx, log: [], emoteAt: {}, rematch: [] };
  room.phase = 'game';
  for (const s of room.seats) { s.ready = false; s.takeover = false; }
  room.timers = { botAt: null, turnAt: null, answerAt: null, turnKey: null, autoKey: null, answerKey: null };
  reschedule(room, now, []);
}

// Oy çoğunluğa ulaştıysa yeni oyun başlatır (aynı koltuklar, başlangıç bir kayar); yayını döner.
function maybeRematch(room, now, rand) {
  if (room.phase !== 'over' || !rand) return null;
  const votes = room.game.rematch.filter(t => seatOf(room, t) >= 0).length, online = onlineHumans(room).length;
  if (!online || votes * 2 <= online) return null;
  startGame(room, (room.game.startIdx + 1) % room.seats.length, now, rand);
  return gameOut(room, [], now);
}

// Başarılı apply sonucunu odaya işler; ortak yol (insan act, bot, zaman aşımı).
function settle(room, r, now, pre = []) {
  const g = room.game, events = [...pre, ...r.events];
  g.state = r.state; g.version++;
  pushLog(g, events);
  if (g.state.phase === 'over') room.phase = 'over';
  reschedule(room, now, events);
  return events;
}

// ---- Zamanlayıcılar (N08) ----
const botControlled = (room, who) => {
  const s = room.seats[who], st = room.game.state;
  return s.bot || !!s.takeover || (who === st.active && room.timers.autoKey === turnKey(st));
};

// Her durum değişiminde çağrılır: botAt/turnAt/answerAt'i günceller.
function reschedule(room, now, events = []) {
  const t = room.timers, tmg = tm(room);
  if (room.phase !== 'game' || !onlineHumans(room).length) { // oyun durur, biri bağlanınca yeniden kurulur
    Object.assign(t, { botAt: null, turnAt: null, answerAt: null, turnKey: null, answerKey: null });
    return;
  }
  const g = room.game, s = g.state, who = actor(s), key = turnKey(s);
  if (t.autoKey && t.autoKey !== key) t.autoKey = null;
  const wasPending = t.answerKey !== null;
  if (botControlled(room, who)) {
    t.answerAt = null; t.answerKey = s.pending ? String(g.version) : null;
    if (who === s.active) { t.turnAt = null; t.turnKey = null; }
    if (t.botAt === null) t.botAt = now + (events.some(e => e.type === 'ahlak') ? tmg.botAhlakMs : tmg.botMs);
    return;
  }
  t.botAt = null;
  if (s.pending) {
    if (t.answerKey !== String(g.version)) { t.answerKey = String(g.version); t.answerAt = now + tmg.answerMs; }
  } else { t.answerAt = null; t.answerKey = null; }
  const secs = room.options.turnSeconds;
  if (!secs || botControlled(room, s.active)) { t.turnAt = null; t.turnKey = null; return; }
  if (t.turnKey !== key) { t.turnKey = key; t.turnAt = now + secs * 1000; }
  else if (wasPending && !s.pending) t.turnAt = Math.max(t.turnAt, now + tmg.minTurnLeftMs);
}

// Bot (ya da zaman aşımında Orta bot) kararı: view alır; geçersiz/fırlatan bot yedek yasal aksiyona düşer.
function pickBot(room, who, level, deps) {
  const s = room.game.state, legal = legalActions(s);
  let a = null;
  try { a = deps.bot(viewFor(s, who, room.game.gameId), legal, level); } catch { /* yedek aksiyon */ }
  if (a && legal.some(l => isDeepStrictEqual(l, a))) return a;
  return legal.find(l => l.type === 'respondTrade' && !l.accept) ?? legal.find(l => l.type === 'contribute' && !l.cards.length)
    ?? ['endTurn', 'pass', 'drawAhlak'].map(type => legal.find(l => l.type === type)).find(Boolean) ?? legal[0];
}

const isExpired = (room, now) => now - room.lastActivity >= tm(room).idleMs || (!room.joined && now - room.createdAt >= tm(room).abandonedMs);
const lostSeat = (room, now) => room.seats.findIndex(s => isHuman(s) && !s.online && s.lostAt !== null && s.lostAt + tm(room).graceMs <= now
  && (room.phase === 'lobby' || (room.phase === 'game' && !s.takeover)));

// Vadesi gelen işler; her çağrıda en çok 20 iş. Dönüş: { out, changed, expired }.
export function tick(room, now, rand, deps = { bot: botAction }) {
  if (isExpired(room, now)) return { out: humans(room).map(s => err(s.token, 'expired')), changed: false, expired: true };
  const out = []; let changed = false;
  for (let n = 0; n < 20; n++) {
    const step = dueStep(room, now, rand, deps);
    if (!step) break;
    out.push(...step); changed = true;
  }
  return { out, changed, expired: false };
}

function dueStep(room, now, rand, deps) {
  const lost = lostSeat(room, now);
  if (lost >= 0) {
    const s = room.seats[lost];
    if (room.phase === 'lobby') return [{ to: s.token, msg: null, close: true }, ...dropSeat(room, lost), ...broadcast(room)];
    s.takeover = true;
    const ev = [{ type: 'takeover', pIdx: lost, text: `${s.name} bağlantısını kaybetti, bot devraldı.` }];
    pushLog(room.game, ev);
    reschedule(room, now, ev);
    return gameOut(room, ev, now);
  }
  const rm = maybeRematch(room, now, rand);
  if (rm) return rm;
  if (room.phase !== 'game') return null;
  const t = room.timers, st = room.game.state, who = actor(st), name = room.seats[who].name;
  const play = (a, pre) => {
    if (!a) return [];
    const events = settle(room, apply(st, a), now, pre);
    return gameOut(room, events, now);
  };
  if (t.botAt !== null && t.botAt <= now) {
    t.botAt = null;
    const a = pickBot(room, who, room.seats[who].bot ? room.seats[who].level : 'medium', deps);
    if (!a) { t.botAt = now + tm(room).botMs; return []; }
    return play(a, []);
  }
  if (t.answerAt !== null && t.answerAt <= now) {
    t.answerAt = null;
    const a = st.pending?.kind === 'trade' ? { type: 'respondTrade', accept: false } : { type: 'contribute', cards: [] };
    return play(a, [{ type: 'timeout', pIdx: who, text: `${name} cevap vermedi, otomatik cevaplandı.` }]);
  }
  if (!st.pending && t.turnAt !== null && t.turnAt <= now) {
    t.turnAt = null; t.autoKey = turnKey(st);
    return play(pickBot(room, who, 'medium', deps), [{ type: 'timeout', pIdx: who, text: 'Süre doldu, otomatik oynandı.' }]);
  }
  return null;
}

// En yakın vade (epoch ms). Oda silinene kadar hep bir vade vardır (ömür).
export function nextDeadline(room) {
  const t = room.timers ?? {}, tmg = tm(room), c = [room.lastActivity + tmg.idleMs];
  if (!room.joined) c.push(room.createdAt + tmg.abandonedMs);
  if (room.phase === 'game') {
    c.push(t.botAt, t.answerAt);
    if (!room.game.state.pending) c.push(t.turnAt);
  }
  for (const s of room.seats) if (isHuman(s) && !s.online && s.lostAt !== null && (room.phase === 'lobby' || (room.phase === 'game' && !s.takeover))) c.push(s.lostAt + tmg.graceMs);
  const v = c.filter(x => typeof x === 'number');
  return v.length ? Math.min(...v) : null;
}
