// İnce adaptör: soket, zamanlayıcı, disk. Oyun/lobi mantığı room.js'tedir (burada yok). ws yalnız burada içe aktarılır.
import { WebSocketServer } from 'ws';
import { randomInt } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as R from './room.js';

const CLOSE = { badMsg: 4000, full: 4001, started: 4002, notFound: 4003, version: 4005, kicked: 4006, replaced: 4007, rate: 4008, expired: 4010, tooBig: 1009 };
const FILE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}\.json$/;
const MAX_SOCKETS_PER_ROOM = 12, HELLO_MS = 10_000, PING_MS = 15_000, RATE_PER_S = 20, IDLE_MS = 24 * 3600_000, EMPTY_MS = 3600_000;
const cryptoRand = () => randomInt(0, 2 ** 32) / 2 ** 32;
const errMsg = (code, msg) => JSON.stringify({ v: 1, t: 'error', code, msg });

export function createHub({ dir, now = Date.now, rand = cryptoRand, env = process.env } = {}) {
  const roomsDir = path.join(dir, 'rooms');
  const maxRooms = Number(env.MAX_ROOMS ?? 500);
  const timing = Object.fromEntries([['botDelayMs', env.BOT_DELAY_MS], ['disconnectGraceMs', env.DISCONNECT_GRACE_MS], ['roomIdleMs', env.ROOM_IDLE_MS]]
    .filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, Number(v)]));
  const idleMs = Number(env.ROOM_IDLE_MS || IDLE_MS);
  const rooms = new Map(); // kod -> { room, sockets:Set<ws>, timer }
  const conns = new WeakMap(); // ws -> { entry, token, alive, missed, win, count, badJson, helloTimer }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const file = code => path.join(roomsDir, code + '.json');

  // --- disk ---
  function save(e) {
    const tmp = file(e.room.code) + '.tmp';
    try { writeFileSync(tmp, JSON.stringify({ schema: 1, savedAt: now(), room: e.room })); renameSync(tmp, file(e.room.code)); }
    catch (err) { console.error('snapshot yazılamadı', e.room.code, err.code ?? err.message); } // ponytail: senkron yazma; p99 bozulursa 250 ms gecikmeli yazma
  }
  // ponytail: tick yoksa (N08 öncesi) yalnız boşta/boş oda süpürmesi; tick varsa o karar verir.
  const resume = R.resumeRoom ?? ((room, t) => { for (const s of room.seats) if (!s.bot) { s.online = false; s.lostAt = t; } });

  mkdirSync(roomsDir, { recursive: true });
  for (const f of readdirSync(roomsDir)) {
    if (f.endsWith('.tmp')) { rmSync(path.join(roomsDir, f), { force: true }); continue; }
    if (!FILE_RE.test(f)) continue;
    try {
      const snap = JSON.parse(readFileSync(path.join(roomsDir, f), 'utf8'));
      if (snap?.schema !== 1 || snap.room?.code !== f.slice(0, 6)) { console.warn('bilinmeyen şema, atlandı', f); continue; }
      resume(snap.room, now());
      const e = { room: snap.room, sockets: new Set(), timer: null };
      rooms.set(snap.room.code, e);
    } catch { renameSync(path.join(roomsDir, f), path.join(roomsDir, f + '.bozuk')); console.warn('bozuk anlık görüntü', f); }
  }

  // --- yayın ---
  function dispatch(e, out) {
    for (const { to, msg, close } of out) {
      const data = msg ? JSON.stringify(msg) : null;
      for (const ws of e.sockets) {
        if (conns.get(ws).token !== to || ws.readyState !== ws.OPEN) continue;
        if (data) ws.send(data);
        if (close) ws.close(CLOSE[msg?.code] ?? 1000);
      }
    }
  }
  function remove(e, code = 4010) {
    clearTimeout(e.timer);
    rooms.delete(e.room.code);
    rmSync(file(e.room.code), { force: true });
    for (const ws of e.sockets) ws.close(code);
  }
  function schedule(e) {
    clearTimeout(e.timer);
    const t = typeof R.nextDeadline === 'function' ? R.nextDeadline(e.room) : null;
    if (t == null) return;
    e.timer = setTimeout(() => fire(e), Math.max(0, t - now()));
  }
  function fire(e) {
    if (!rooms.has(e.room.code)) return;
    const r = R.tick(e.room, now(), rand);
    if (r.expired) return remove(e);
    if (r.changed) save(e);
    dispatch(e, r.out ?? []);
    schedule(e);
  }
  // r = { out, changed } (join'de ayrıca ok/token/error)
  function commit(e, r) {
    if (r.changed) save(e); // yaz, sonra yayınla: istemcinin gördüğü sürüm diskte de var
    dispatch(e, r.out ?? []);
    schedule(e);
  }

  // --- soket ---
  function attach(ws, e) {
    const st = { entry: e, token: null, alive: true, missed: 0, win: 0, count: 0, badJson: 0, helloTimer: setTimeout(() => ws.close(4000), HELLO_MS) };
    conns.set(ws, st); e.sockets.add(ws);
    ws.on('pong', () => { st.alive = true; st.missed = 0; });
    ws.on('message', (data, isBinary) => onMessage(ws, st, e, data, isBinary));
    ws.on('close', () => {
      clearTimeout(st.helloTimer); e.sockets.delete(ws);
      if (st.token === null || !rooms.has(e.room.code)) return;
      if ([...e.sockets].some(o => conns.get(o).token === st.token)) return; // koltuk başka sokete geçti
      commit(e, R.disconnect(e.room, st.token, now()));
    });
    ws.on('error', () => {});
  }
  function onMessage(ws, st, e, data, isBinary) {
    if (isBinary) return ws.close(1003);
    const t = now();
    if (t - st.win >= 1000) { st.win = t; st.count = 0; }
    if (++st.count > RATE_PER_S) { ws.send(errMsg('rate', 'Çok hızlı mesaj gönderiyorsun.')); return ws.close(CLOSE.rate); }
    let msg;
    try { msg = JSON.parse(data.toString()); } catch {
      ws.send(errMsg('badMsg', 'Mesaj anlaşılamadı.'));
      if (++st.badJson >= 3) ws.close(CLOSE.badMsg);
      return;
    }
    st.badJson = 0;
    if (st.token === null) {
      if (msg?.t !== 'hello') { ws.send(errMsg('badMsg', 'Önce hello gönder.')); return; }
      if (msg.v !== 1) { ws.send(errMsg('version', 'Oyun sürümü uyuşmuyor, sayfayı yenile.')); return ws.close(CLOSE.version); }
      const r = R.join(e.room, msg, now(), rand);
      if (!r.ok) { ws.send(errMsg(r.error.code, r.error.msg)); if (r.close) ws.close(CLOSE[r.error.code] ?? 1000); return; }
      st.token = r.token; clearTimeout(st.helloTimer);
      for (const o of e.sockets) {
        if (o === ws || conns.get(o).token !== r.token) continue;
        o.send(errMsg('replaced', 'Başka bir pencerede açıldı.')); o.close(CLOSE.replaced);
      }
      return commit(e, r);
    }
    if (msg?.t === 'hello') { ws.send(errMsg('badMsg', 'Zaten bağlısın.')); return; }
    commit(e, R.receive(e.room, st.token, msg, now(), rand));
  }

  const ping = setInterval(() => {
    for (const e of rooms.values()) for (const ws of e.sockets) {
      const st = conns.get(ws);
      if (!st.alive && ++st.missed >= 2) { ws.terminate(); continue; }
      st.alive = false; ws.ping();
    }
    if (typeof R.tick !== 'function') for (const e of [...rooms.values()]) { // süpürme
      const hasHuman = e.room.seats.some(s => !s.bot);
      if (e.sockets.size === 0 && now() - e.room.lastActivity > (hasHuman ? idleMs : EMPTY_MS)) remove(e);
    }
  }, PING_MS);
  ping.unref();
  for (const e of rooms.values()) schedule(e);

  const reject = (socket, line) => { socket.write(`HTTP/1.1 ${line}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  return {
    create(code) {
      if (rooms.has(code)) return 'exists';
      if (rooms.size >= maxRooms) return 'full';
      const e = { room: R.createRoom({ code, now: now(), ...(Object.keys(timing).length ? { timing } : {}) }), sockets: new Set(), timer: null };
      rooms.set(code, e); save(e); schedule(e);
      return 'created';
    },
    has: code => rooms.has(code),
    info(code) {
      const e = rooms.get(code);
      if (!e) return { exists: false };
      const humans = e.room.seats.filter(s => !s.bot).length;
      return { exists: true, phase: e.room.phase, humans, capacity: R.LIMITS.maxSeats, joinable: e.room.phase === 'lobby' && e.room.seats.length < R.LIMITS.maxSeats };
    },
    handleUpgrade(req, socket, head, code) {
      const e = rooms.get(code);
      if (!e) return reject(socket, '404 Not Found');
      if (e.sockets.size >= MAX_SOCKETS_PER_ROOM) return reject(socket, '503 Service Unavailable');
      wss.handleUpgrade(req, socket, head, ws => attach(ws, e));
    },
    stats: () => ({ rooms: rooms.size, sockets: [...rooms.values()].reduce((n, e) => n + e.sockets.size, 0) }),
    close() {
      clearInterval(ping);
      for (const e of rooms.values()) { clearTimeout(e.timer); save(e); for (const ws of e.sockets) ws.close(1001); }
      wss.close();
    },
  };
}
