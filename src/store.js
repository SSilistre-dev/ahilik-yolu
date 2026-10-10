// Tarayıcı depolaması tek yerden: anahtarlar, şema zarfı {v,d}, bozuk veri ve erişim hatası davranışı.
// Depolama kapalı/dolu ise değerler oturum boyunca bellekte tutulur; oyun asla bu yüzden çökmez.
export const SCHEMA = 1;
export const PREFIX = 'ahilik.';
export const KEYS = {
  profile: 'ahilik.profile', settings: 'ahilik.settings', flags: 'ahilik.flags',
  save: 'ahilik.save', stats: 'ahilik.stats',
};
export const roomKey = code => `ahilik.room.${code}`;
export const DEFAULT_SETTINGS = {
  sound: true, vibrate: true, botSpeed: 'normal', textScale: 'normal', motion: 'auto', lastBots: null,
};
const MIGRATIONS = {}; // eski şema numarası -> d => yeni d (SCHEMA artınca satır eklenir)

const safeLocalStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createStore(storage = safeLocalStorage()) {
  const mem = new Map(); // anahtar -> ham dize (yazılamayan değerler)
  let persistent = !!storage;
  const raw = k => {
    if (mem.has(k)) return mem.get(k);
    try { return storage ? storage.getItem(k) : null; } catch { persistent = false; return null; }
  };
  const drop = k => { mem.delete(k); try { storage?.removeItem(k); } catch {} };
  const bad = k => { console.warn('store: bozuk veri', k); drop(k); };

  return {
    get persistent() { return persistent; },
    get(key, fallback = null, validate = null) {
      const r = raw(key);
      if (r == null) return fallback;
      let env;
      try { env = JSON.parse(r); } catch { bad(key); return fallback; }
      if (!env || typeof env !== 'object' || typeof env.v !== 'number' || !('d' in env)) { bad(key); return fallback; }
      if (env.v > SCHEMA) return fallback; // yeni sürüm yazmış: silme
      let d = env.d;
      if (env.v < SCHEMA) {
        const mig = MIGRATIONS[env.v];
        if (!mig) { bad(key); return fallback; }
        try { d = mig(d); } catch { bad(key); return fallback; }
      }
      if (validate) { let ok = false; try { ok = validate(d); } catch {} if (!ok) { bad(key); return fallback; } }
      return d;
    },
    set(key, value) {
      const s = JSON.stringify({ v: SCHEMA, d: value });
      try {
        if (!storage) throw 0;
        storage.setItem(key, s);
        mem.delete(key);
        return true;
      } catch { persistent = false; mem.set(key, s); return false; }
    },
    remove: drop,
    keys() {
      const out = new Set([...mem.keys()]);
      try { for (let i = 0; storage && i < storage.length; i++) out.add(storage.key(i)); } catch {}
      return [...out].filter(k => typeof k === 'string' && k.startsWith(PREFIX));
    },
    clearAll() { this.keys().forEach(drop); },
  };
}

export const store = createStore();

const isBool = v => typeof v === 'boolean';
const oneOf = (...l) => v => l.includes(v);
const SETTING_OK = {
  sound: isBool, vibrate: isBool,
  botSpeed: oneOf('slow', 'normal', 'fast'),
  textScale: oneOf('normal', 'large'),
  motion: oneOf('auto', 'on', 'off'),
  lastBots: v => v === null || (!!v && typeof v === 'object' && Number.isFinite(v.count)
    && Array.isArray(v.levels) && v.levels.every(x => typeof x === 'string')),
};
const clean = o => {
  const out = { ...DEFAULT_SETTINGS };
  if (o && typeof o === 'object') for (const k in SETTING_OK) if (k in o && SETTING_OK[k](o[k])) out[k] = o[k];
  return out;
};

export const getSettings = (s = store) => clean(s.get(KEYS.settings));
export const setSettings = (patch, s = store) => s.set(KEYS.settings, clean({ ...getSettings(s), ...patch }));

export function reducedMotion(s = store) {
  const m = getSettings(s).motion;
  if (m !== 'auto') return m === 'off';
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// Eski anahtarlar -> yeni zarflar. Yeni anahtar varsa eskisine bakılmaz. Her durumda eski anahtar silinir.
export function migrateLegacy(s = store, storage = safeLocalStorage()) {
  if (!storage) return;
  const old = k => { try { return storage.getItem(k); } catch { return null; } };
  const del = k => { try { storage.removeItem(k); } catch {} };
  if (old('ahilik-muted') !== null) {
    if (old('ahilik-muted') === '1' && s.get(KEYS.settings) === null) setSettings({ sound: false }, s);
    del('ahilik-muted');
  }
  if (old('ahilik.tutorial.done') !== null) {
    if (old('ahilik.tutorial.done') === '1' && s.get(KEYS.flags) === null) s.set(KEYS.flags, { tutorialDone: true });
    del('ahilik.tutorial.done');
  }
}
try { migrateLegacy(); } catch {}
