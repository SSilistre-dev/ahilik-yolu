// WebAudio efektleri. Eksik/bozuk dosya sessiz geçer, asla throw etmez.
import { getSettings, setSettings } from './store.js';
const VOL = { click: 0.5, card: 0.7, coin: 0.6, step: 0.35, close: 0.8, open: 0.7, trade: 0.7, win: 0.8, nope: 0.3 };
const PITCH = { step: 0.12, coin: 0.08 };
const ALIAS = { nope: 'close' }; // yeni ses dosyası yok: hafif tok tıkırtı
const MAX_TRIES = 3, RETRY_MS = 2000;

// 0,1 sn sessiz WAV (8-bit mono 8 kHz, 844 bayt): iOS'ta sayfanın ses oturumunu "playback"e alır.
function silentWav() {
  const n = 800, b = new Uint8Array(44 + n).fill(128), v = new DataView(b.buffer);
  const tag = (o, s) => [...s].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  tag(0, 'RIFF'); v.setUint32(4, 36 + n, true); tag(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); tag(36, 'data'); v.setUint32(40, n, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
}

// Bağımlılıklar parametre: node:test'te sahteleri verilir, tarayıcıda varsayılanlar gerçek olanlardır.
export function createSfx({
  fetch: fetchFn = (...a) => globalThis.fetch(...a),
  AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext,
  Audio: AudioEl = globalThis.Audio,
  now = Date.now,
  doc = globalThis.document,
  nav = globalThis.navigator,
} = {}) {
  let ctx = null, unlocked = false;
  const bufs = {}, fails = {};
  let muted = !getSettings().sound;
  // iOS Safari Ogg çalmaz: AAC (m4a) destekleniyorsa onu, yoksa ogg.
  let ext = 'ogg';
  try { if (new AudioEl().canPlayType('audio/mp4; codecs="mp4a.40.2"')) ext = 'm4a'; } catch {}

  function context() {
    if (!ctx) { try { if (AudioCtx) ctx = new AudioCtx(); } catch {} }
    return ctx;
  }
  // Başarısız yükleme önbelleğe yazılmaz: 2 sn sonra yeniden denenir, 3 denemeden sonra vazgeçilir.
  function load(name) {
    const file = ALIAS[name] ?? name, f = fails[file];
    if (bufs[file]) return bufs[file];
    if (f && (f.n >= MAX_TRIES || now() - f.at < RETRY_MS)) return null;
    bufs[file] = fetchFn(`assets/sfx/${file}.${ext}`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then(b => new Promise((ok, no) => context().decodeAudioData(b, ok, no)))
      .then(buf => { delete fails[file]; return buf; })
      .catch(() => { delete bufs[file]; fails[file] = { n: (fails[file]?.n || 0) + 1, at: now() }; return null; });
    return bufs[file];
  }
  // iOS arka plana gidince/arama sonrası context 'suspended'/'interrupted' olur.
  doc?.addEventListener('visibilitychange', () => {
    try { if (!doc.hidden && ctx && ctx.state !== 'running') ctx.resume(); } catch {}
  });
  return {
    get muted() { return muted; },
    unlock() {
      try {
        const c = context();
        if (c && c.state !== 'running') { // iOS: jest içinde resume + sessiz buffer sesi kilitten çıkarır
          c.resume();
          const s = c.createBufferSource();
          s.buffer = c.createBuffer(1, 1, 22050);
          s.connect(c.destination);
          s.start(0);
        }
      } catch {}
      if (unlocked) return;
      unlocked = true;
      // iOS sessiz anahtarı WebAudio'yu susturur: ses oturumunu "playback"e al.
      try { if (nav?.audioSession) nav.audioSession.type = 'playback'; } catch {}
      try { // API yoksa/ek olarak: sessiz bir <audio> bir kez çalınır
        const a = new AudioEl(silentWav());
        a.playsInline = true; a.loop = false;
        a.play()?.catch?.(() => {});
      } catch {}
    },
    play(name) {
      try {
        if (muted || !(name in VOL) || !context()) return;
        const c = ctx;
        if (c.state === 'suspended' || c.state === 'interrupted') { c.resume(); return; } // bu çalma atlanır, sonraki dokunuşta çalışır
        load(name)?.then(buf => {
          try {
            if (!buf || muted || c.state !== 'running') return;
            const src = c.createBufferSource();
            src.buffer = buf;
            const p = PITCH[name];
            if (p) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * p;
            const g = c.createGain();
            g.gain.value = VOL[name];
            src.connect(g).connect(c.destination);
            src.start();
          } catch {}
        });
      } catch {}
    },
    setMuted(m) {
      muted = !!m;
      setSettings({ sound: !muted });
    },
  };
}
