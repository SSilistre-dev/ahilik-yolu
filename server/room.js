// Saf lobi mantığı: saat (now) ve rastgelelik (rand) dışarıdan gelir; ağ, disk ve ws yok.
// Oda düz JSON'dur (diske olduğu gibi yazılır). Dönüşler: { out:[{to, msg, close?}], changed }.
// msg:null + close:true = "bu token'ın soketini kapat" (mesajsız). Oyun döngüsü N07, zamanlayıcılar N08.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BOT_NAMES = ['Çırak', 'Kalfa', 'Usta', 'Yiğit', 'Kâtip', 'Hacı'];
export const LIMITS = { maxSeats: 6, minSeats: 2, nameMax: 16, msgBytes: 8192, lostMs: 30000 };
const LEVELS = ['easy', 'medium', 'hard'];
const TURN_SECONDS = [0, 30, 60, 120];

const ERR = {
  badMsg: 'Mesaj anlaşılamadı.', version: 'Oyun sürümü uyuşmuyor, sayfayı yenile.', notHost: 'Bunu yalnız oda kurucusu yapabilir.',
  illegal: 'Bu şimdi yapılamaz.', full: 'Oda dolu.', started: 'Oyun çoktan başlamış.', badName: 'Adın 1 ile 16 karakter arasında olmalı.',
  kicked: 'Odadan çıkarıldın.',
};
const CLOSING = new Set(['version', 'kicked', 'full', 'started']);

const m = (t, extra) => ({ v: 1, t, ...extra });
const err = (to, code, close = CLOSING.has(code)) => ({ to, msg: m('error', { code, msg: ERR[code] }), ...(close ? { close: true } : {}) });
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

export function createRoom({ code, now }) {
  return { code, createdAt: now, lastActivity: now, phase: 'lobby', options: { turnSeconds: 0, startSeat: 'random' }, hostToken: null, seats: [] };
}

// Ad doğrulama tek noktadır (N23 yasaklı kelime filtresini buraya bağlar). { ok, name }
export function cleanName(raw) {
  if (typeof raw !== 'string') return { ok: false };
  const name = raw.normalize('NFC').trim();
  const len = [...name].length;
  if (len < 1 || len > LIMITS.nameMax || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name)) return { ok: false };
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
    s.online = true; s.lostAt = null; room.lastActivity = now;
    return { ok: true, token, out: [welcome(room, token), ...broadcast(room)], changed: true };
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
  room.lastActivity = now;
  return { ok: true, token: t, out: [welcome(room, t), ...broadcast(room)], changed: true };
}

// Koltuğu kaldırır; kayan insanlara yeni welcome, startSeat ayarı. Çıkan insan için çağıran out ekler.
function dropSeat(room, idx) {
  const [gone] = room.seats.splice(idx, 1);
  const ss = room.options.startSeat;
  if (ss === idx) room.options.startSeat = 'random'; else if (typeof ss === 'number' && ss > idx) room.options.startSeat = ss - 1;
  if (!gone.bot && gone.token === room.hostToken) {
    const next = humans(room).find(s => s.online) ?? humans(room)[0] ?? null;
    room.hostToken = next ? next.token : null;
    if (next) next.ready = true;
  }
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
    const seatOk = startSeat === 'random' || (Number.isInteger(startSeat) && startSeat >= 0 && startSeat < LIMITS.maxSeats);
    if (room.phase !== 'lobby' || !TURN_SECONDS.includes(turnSeconds) || !seatOk) return 'illegal';
    room.options = { turnSeconds, startSeat };
    return { out: broadcast(room), changed: true };
  },
  leave(room, i) {
    if (room.phase !== 'lobby') return 'illegal'; // oyunda ayrılma (kalıcı bot) N07
    const token = room.seats[i].token;
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

export function disconnect(room, token, now) {
  const i = seatOf(room, token);
  if (i < 0 || !room.seats[i].online) return { out: [], changed: false };
  Object.assign(room.seats[i], { online: false, lostAt: now });
  room.lastActivity = now;
  return { out: broadcast(room), changed: true };
}
