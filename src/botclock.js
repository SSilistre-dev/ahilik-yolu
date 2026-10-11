import { ILKELER, CITIES, CARDS } from './data.js';
// Bot hamle zamanlayıcısı (M09). Duraklatınca bekleyen iş iptal edilir, devamda tam bekleme yeniden başlar.
// DOM yok; zamanlayıcı enjekte edilir (test/pause.test.js).
export function createBotClock({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let task = null, id = null, paused = false;
  const stop = () => { if (id !== null) clearTimer(id); id = null; };
  const arm = () => { id = setTimer(() => { id = null; const t = task; task = null; t.fn(); }, task.ms); };
  return {
    schedule(fn, ms) { stop(); task = { fn, ms }; if (!paused) arm(); },
    pause() { paused = true; stop(); },
    resume() { paused = false; if (task && id === null) arm(); },
    cancel() { stop(); task = null; },
    get pending() { return !!task && !paused; },
    get paused() { return paused; },
  };
}

// Bot aksiyonlarını ekranda tek tek anlatan adımlar (saf; DOM yok). `who` = aksiyonu yapan koltuk.
// Yalnız botun kendi aksiyonu anlatılır; insanın aksiyonu için boş döner. Her adım: { type, who, text, card?, ev }.
const ilkeAd = (st, tile) => ILKELER[st.tiles[tile]?.ilke]?.name ?? 'Kare';
const wantAd = w => ILKELER[w]?.name ?? (w === 'ahievran' ? 'Ahi Evran' : w === 'kargo' ? 'Kargo' : String(w));
export function botSteps(events, who, st) {
  if (!st.players[who]?.bot) return [];
  const nm = i => st.players[i]?.name ?? '?', out = [];
  for (const ev of events) {
    let text = null, card;
    switch (ev.type) {
      case 'ahlak':
        if (ev.empty) text = 'Ahlak destesi bitti, bu tur kart yok';
        else { card = ev.card; const il = ILKELER[ev.ilke]?.name ?? ''; text = CARDS[ev.card]?.negative ? `Olumsuz ahlak kartı açtı: ${ILKELER[ev.ilke].neg}` : `Ahlak kartı açtı: ${il}`; }
        break;
      case 'close': text = `${ilkeAd(st, ev.tile)} karesini kapattı${ev.paid ? ` (${ev.paid} rozet ödedi)` : ''}`; break;
      case 'move': text = `${ilkeAd(st, ev.tile)} karesine ilerledi`; break;
      case 'kargo': text = `Kargo ile ${CITIES[ev.city]?.name ?? ''} şehrine uçtu`; break;
      case 'tradeOffer': text = `${nm(ev.to)} oyuncusundan ${wantAd(ev.want)} kartı istedi`; break;
      case 'swap': text = `${nm(ev.pIdx)} ile ${nm(ev.withPlayer)} kart takas etti`; break;
      case 'tradeDeclined': text = `${nm(ev.from)} oyuncusunun takasını reddetti`; break;
      case 'openRoad': text = ev.pIdx === who ? `${ilkeAd(st, ev.tile)} yolunu açtı` : `${ilkeAd(st, ev.tile)} yoluna kart verdi`; break;
      case 'roadAsk': text = `${ilkeAd(st, ev.tile)} yolu için ${ev.need} kart daha istedi`; break;
      case 'roadFailed': text = `${ilkeAd(st, ev.tile)} yolu açılamadı`; break;
      case 'read': text = 'Kart yazısını okudu (+1 rozet)'; break;
      case 'trade': text = `${CITIES[ev.city]?.name ?? ''} ticaretini tamamladı (${ev.value}M)`; break;
      case 'endTurn': text = 'Turunu bitirdi'; break;
      case 'pass': text = 'Pas geçti, elini yeniledi'; break;
    }
    if (text) out.push({ type: ev.type, who, text, card, ev });
  }
  return out;
}

// Adım kuyruğu: her adım en az `hold` ms görünür, sırayla; boşken hemen gösterir. Zamanlayıcı enjekte edilir.
const QMAX = 8;
export function createStepQueue({ onShow, onIdle, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  let q = [], cur = null, id = null, until = 0;
  const run = () => {
    id = null; cur = q.shift() ?? null;
    if (!cur) return onIdle?.();
    until = now() + cur.hold; onShow?.(cur.step); id = setTimer(run, cur.hold);
  };
  return {
    push(step, hold) { q.push({ step, hold }); if (q.length > QMAX) q.shift(); if (!cur) run(); },
    skip() { if (id !== null) { clearTimer(id); run(); } },
    clear() { if (id !== null) clearTimer(id); id = null; cur = null; q = []; },
    backlog() { return (cur ? Math.max(0, until - now()) : 0) + q.reduce((a, x) => a + x.hold, 0); },
  };
}
