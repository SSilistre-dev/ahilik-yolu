// Çevrimiçi WebSocket istemcisi (SPEC v5 "Protokol v1"). DOM yok; WebSocket, store ve zamanlayıcı enjekte edilir (test/net.test.js).
// conn: 'ok' | 'reconnecting' | 'lost'. Olaylar: welcome, lobby, game, emote, error, conn (dinleyiciler on() ile).
import { roomKey } from './store.js';

export const PING_MS = 25000;
export const BACKOFF = [500, 1000, 2000, 4000, 8000, 10000]; // sondaki değer üst sınır
// Sunucunun bağlantıyı kapattığı hatalar: yeniden bağlanma yok.
export const FATAL = new Set(['full', 'started', 'notFound', 'rate', 'tooBig', 'version', 'kicked', 'replaced', 'expired']);
const DROP_TOKEN = new Set(['expired', 'notFound', 'kicked']); // oda/koltuk artık yok: saklı token işe yaramaz

export function createNet({ code, WebSocket = globalThis.WebSocket, store, url, setTimer = setTimeout, clearTimer = clearTimeout }) {
  code = String(code).toUpperCase();
  const wsUrl = url ?? `${globalThis.location?.protocol === 'https:' ? 'wss' : 'ws'}://${globalThis.location?.host}/ws/${code}`;
  const key = roomKey(code);
  const subs = {};
  let ws = null, who = null, conn = 'reconnecting', lastError = null, closed = false, attempt = 0, pingT = null, retryT = null;

  const emit = (type, msg) => { for (const cb of subs[type] ?? []) { try { cb(msg); } catch (e) { console.error(e); } } };
  const setConn = (c) => { if (c === conn) return; conn = c; emit('conn', { conn, error: lastError }); };
  const stopPing = () => { if (pingT !== null) clearTimer(pingT); pingT = null; };
  const send = (t, fields = {}) => {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify({ ...fields, v: 1, t }));
    return true;
  };
  const ping = () => { send('ping'); pingT = setTimer(ping, PING_MS); };

  function open() {
    retryT = null;
    try { ws = new WebSocket(wsUrl); } catch { return retry(); }
    const mine = ws;
    mine.onopen = () => {
      if (mine !== ws) return;
      const token = store?.get(key, null, d => typeof d === 'string');
      send('hello', { ...(token ? { token } : {}), name: who.name, avatar: who.avatar });
      stopPing(); pingT = setTimer(ping, PING_MS);
    };
    mine.onmessage = (ev) => {
      if (mine !== ws) return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'welcome') { store?.set(key, msg.you.token); attempt = 0; lastError = null; setConn('ok'); }
      else if (msg.t === 'error' && (FATAL.has(msg.code) || (msg.code === 'badMsg' && conn !== 'ok'))) { // welcome öncesi badMsg: hello reddedildi, tekrar denemek boşuna
        if (DROP_TOKEN.has(msg.code)) store?.remove(key);
        lastError = { code: msg.code, msg: msg.msg };
        closed = true; stopPing(); // sunucu zaten kapatır; onclose yeniden bağlanmasın
        emit('error', msg); setConn('lost');
        try { mine.close(); } catch {}
        return;
      }
      emit(msg.t, msg);
    };
    mine.onclose = () => { if (mine === ws) { ws = null; stopPing(); if (!closed) retry(); } };
    mine.onerror = () => {}; // onclose zaten gelir
  }

  function retry() {
    setConn('reconnecting');
    const ms = BACKOFF[Math.min(attempt++, BACKOFF.length - 1)];
    retryT = setTimer(open, ms);
  }

  return {
    get code() { return code; },
    get conn() { return conn; },
    get lastError() { return lastError; },
    // Adı/avatarı hello'ya koyar. Tekrar çağrılırsa yok sayılır.
    connect({ name, avatar }) { if (who) return; who = { name, avatar }; open(); },
    send,
    on(type, cb) { (subs[type] ??= new Set()).add(cb); return () => subs[type].delete(cb); },
    // Bilerek kapatma: yeniden bağlanma yok.
    close() {
      closed = true; stopPing();
      if (retryT !== null) clearTimer(retryT);
      retryT = null;
      const w = ws; ws = null;
      try { w?.close(); } catch {}
    },
  };
}
