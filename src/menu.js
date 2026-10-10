// Menü kiti (M02): token yazımı, ekran geçişleri, onay penceresi, toast, ses+titreşim.
// Ekran içeriği (html) çağıranın sorumluluğundadır: kullanıcı metnini escape et. Stil: style.css "menü kiti".
import { ILKELER, PLAYER_COLORS } from './data.js';

// pc-* / il-* renkleri data.js'ten tek kaynak olarak :root'a yazılır.
export function applyTokens(el = document.documentElement) {
  PLAYER_COLORS.forEach((c, i) => el.style.setProperty(`--pc-${i}`, c));
  for (const [id, v] of Object.entries(ILKELER)) el.style.setProperty(`--il-${id}`, v.color);
}

const FEEDBACK = {
  tap: ['click', 10], go: ['click', 10], back: ['click', 5],
  ok: ['coin', [20]], warn: ['close', [40, 60, 40]], start: ['open', [20, 30, 20]],
};
const FOCUSABLE = 'button:not(:disabled),[href],input:not(:disabled),[tabindex]:not([tabindex="-1"])';

// deps = { sfx, buzz } (router yönü show(..., dir) ile verilir). Dönen: { define, show, hide, confirm, toast, feedback }
export function createMenu(root, deps = {}) {
  const defs = {};
  const host = document.createElement('div');
  host.className = 'mn-root';
  root.append(host);
  let cur = null; // { el, ui }
  let bg = null;
  let toastEl = null, toastT = 0;

  const feedback = (kind) => {
    const f = FEEDBACK[kind];
    if (!f) return;
    try { deps.sfx?.play(f[0]); deps.buzz?.(f[1]); } catch {}
  };

  // reduced-motion / animasyon kapalıyken animasyon yok: animationend gelmez, anında kaldır.
  const animated = (el) => getComputedStyle(el).animationName !== 'none';
  function drop(el, ui) {
    try { ui?.onUnmount?.(); } catch {}
    if (!animated(el)) return el.remove();
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }

  const api = {
    define(name, build) { defs[name] = build; },
    show(name, params = {}, dir = 'forward') {
      const build = defs[name];
      if (!build) throw new Error(`menu: tanımsız ekran ${name}`);
      const first = !cur;
      const prev = cur;
      const ui = build(params, api);
      const el = document.createElement('section');
      el.className = `mn-screen ${dir === 'back' ? 'back' : dir === 'replace' ? 'replace' : ''}${first || dir === 'forward' ? ' first' : ''}`;
      el.innerHTML = ui.html;
      [...(el.querySelector('.mn-body')?.children ?? [])].forEach((c, i) => c.style.setProperty('--i', i));
      if (!bg) { bg = document.createElement('div'); bg.className = 'mn-bg'; host.prepend(bg); }
      if (prev) { prev.el.classList.remove('back', 'replace'); prev.el.classList.add(dir === 'back' ? 'back' : dir === 'replace' ? 'replace' : 'fwd'); drop(prev.el, prev.ui); }
      host.append(el);
      cur = { el, ui };
      ui.onMount?.(el);
      const h = el.querySelector('h1');
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      return el;
    },
    hide() {
      if (cur) drop(cur.el, cur.ui);
      cur = null;
      bg?.remove();
      bg = null;
    },
    // confirm({ title, text, ok, cancel, danger }) -> Promise<boolean>
    confirm({ title, text = '', ok = 'Tamam', cancel = 'Vazgeç', danger = false }) {
      const opener = document.activeElement;
      const m = document.createElement('div');
      m.className = 'ay-modal mn-modal';
      const id = `mn-dlg-${Math.random().toString(36).slice(2, 7)}`;
      m.innerHTML = `<div class="ay-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}"><h2 id="${id}"></h2><p></p>`
        + '<div class="mn-btns"><button type="button" class="ay-btn big ok"></button><button type="button" class="ay-btn big cancel"></button></div></div>';
      m.querySelector('h2').textContent = title;
      m.querySelector('p').textContent = text;
      const bOk = m.querySelector('.ok'), bNo = m.querySelector('.cancel');
      bOk.textContent = ok; bNo.textContent = cancel;
      bOk.classList.add(danger ? 'danger' : 'primary');
      host.append(m);
      if (danger) feedback('warn');
      return new Promise((res) => {
        const done = (v) => { m.remove(); try { opener?.focus?.(); } catch {} feedback(v ? 'ok' : 'back'); res(v); };
        bOk.onclick = () => done(true);
        bNo.onclick = () => done(false);
        m.addEventListener('click', (e) => { if (e.target === m) done(false); });
        m.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); done(false); }
          else if (e.key === 'Tab') { // odak pencere içinde kalır
            const f = [...m.querySelectorAll(FOCUSABLE)];
            const i = f.indexOf(document.activeElement);
            const n = f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length];
            e.preventDefault(); n.focus();
          }
        });
        (danger ? bNo : bOk).focus();
      });
    },
    toast(text) {
      clearTimeout(toastT);
      toastEl?.remove();
      toastEl = document.createElement('div');
      toastEl.className = 'mn-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.textContent = text;
      host.append(toastEl);
      const el = toastEl;
      toastT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), animated(el) ? 200 : 0); }, 2200);
    },
    feedback,
  };
  return api;
}
