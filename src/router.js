// Ekran durum makinesi + history. DOM/three yok; sahte history ile test edilir (test/router.test.js).
export const SCREENS = ['menu', 'profile', 'bots', 'local', 'friends', 'join', 'lobby', 'howto', 'settings', 'game', 'pause', 'end', 'error'];

const valid = s => !!s && s.ahilik === 1 && SCREENS.includes(s.name) && Number.isInteger(s.i) && s.i >= 0;

export function createRouter({ history = globalThis.history, win = globalThis, guards = {}, leaveGuards = {}, onBlockedBack } = {}) {
  let cur = null;
  const subs = [];
  const st = (name, params, i) => ({ ahilik: 1, i, name, params });

  function enter(name, params, i, mode, dir) {
    if (!SCREENS.includes(name)) throw new Error(`router: bilinmeyen ekran ${name}`);
    if (guards[name]?.(params) === false) { name = 'menu'; params = {}; mode = 'replace'; dir = 'replace'; }
    const s = st(name, params, i);
    if (mode === 'push') history.pushState(s, ''); else history.replaceState(s, '');
    const from = cur;
    cur = { name, params, i };
    subs.forEach(fn => fn({ name, params, dir, from }));
  }

  // Bu ekranda geri tuşu ekranı terk ettirmez mi?
  const blocked = () => cur.name === 'game' || (cur.name === 'profile' && cur.params.first) || leaveGuards[cur.name]?.() === false;

  function onPop(e) {
    if (!cur) return;
    const s = e.state ?? history.state;
    if (valid(s) && s.i >= cur.i && cur.name !== 'game') return enter(s.name, s.params ?? {}, s.i, 'replace', 'forward');
    if (blocked()) {
      // Tarayıcı geri gitti; ekranın kaydını geri koy.
      history.pushState(st(cur.name, cur.params, cur.i), '');
      if (cur.name === 'game') return enter('pause', {}, cur.i + 1, 'push', 'forward');
      return onBlockedBack?.(cur.name, cur.params);
    }
    if (!valid(s)) return enter('menu', {}, 0, 'replace', 'replace');
    enter(s.name, s.params ?? {}, s.i, 'replace', s.i < cur.i ? 'back' : 'forward');
  }
  win.addEventListener?.('popstate', onPop);

  return {
    // Yenilemede history.state kalır: initial verilmediyse oradan devam edilir (guard menüye çevirebilir).
    start(initial) {
      const s = history.state;
      if (!initial && valid(s)) return enter(s.name, s.params ?? {}, s.i, 'replace', 'replace');
      const { name = 'menu', params = {} } = initial || {};
      enter(name, params, 0, 'replace', 'replace');
    },
    go(name, params = {}, { replace = false } = {}) {
      if (replace) enter(name, params, cur.i, 'replace', 'replace');
      else enter(name, params, cur.i + 1, 'push', 'forward');
    },
    back() {
      if (cur.name === 'menu' || (cur.name === 'profile' && cur.params.first)) return;
      if (cur.name === 'game') return this.go('pause');
      if (cur.name === 'end' || cur.name === 'error') return this.go('menu', {}, { replace: true });
      if (leaveGuards[cur.name]?.() === false) return onBlockedBack?.(cur.name, cur.params);
      history.back();
    },
    get current() { return cur; },
    onChange(fn) { subs.push(fn); },
  };
}
