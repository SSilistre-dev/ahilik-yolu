// WebAudio efektleri. Eksik/bozuk dosya sessiz geçer, asla throw etmez.
const VOL = { click: 0.5, card: 0.7, coin: 0.6, step: 0.35, close: 0.8, open: 0.7, trade: 0.7, win: 0.8 };
const PITCH = { step: 0.12, coin: 0.08 };
const KEY = 'ahilik-muted';

export function createSfx() {
  let ctx = null;
  const bufs = {};
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch {}
  // ponytail: yalnız ogg gönderiyoruz (afconvert ogg okuyamadı); m4a eklenirse ext otomatik seçer.
  let ext = 'ogg';
  try { if (!new Audio().canPlayType('audio/ogg; codecs="vorbis"')) ext = 'm4a'; } catch {}

  function context() {
    if (!ctx) {
      try { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); } catch {}
    }
    return ctx;
  }
  function load(name) {
    if (!bufs[name]) {
      bufs[name] = fetch(`assets/sfx/${name}.${ext}`)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then(b => new Promise((ok, no) => context().decodeAudioData(b, ok, no)))
        .catch(() => null);
    }
    return bufs[name];
  }
  return {
    get muted() { return muted; },
    unlock() {
      try { const c = context(); if (c && c.state !== 'running') c.resume(); } catch {}
    },
    play(name) {
      try {
        if (muted || !(name in VOL) || !context()) return;
        load(name).then(buf => {
          try {
            const c = ctx;
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
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
    },
  };
}
