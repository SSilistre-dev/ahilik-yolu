// Ayarlar (AHI-051): satırlar veriyle üretilir. Değişiklik anında kaydedilir ve deps.onSettings ile uygulanır (main.js).
import { store, KEYS, getSettings, setSettings } from './store.js';

export const SETTINGS_ROWS = [
  { id: 'sound', label: 'Ses', type: 'switch', group: 'Ses ve titreşim' },
  { id: 'vibrate', label: 'Titreşim', type: 'switch', group: 'Ses ve titreşim', needs: 'vibrate' }, // iOS'ta navigator.vibrate yok
  { id: 'botSpeed', label: 'Botlar ne kadar hızlı oynasın?', type: 'seg', group: 'Oyun', options: [['slow', 'Yavaş'], ['normal', 'Normal'], ['fast', 'Hızlı']] },
  { id: 'textScale', label: 'Yazı boyutu', type: 'seg', group: 'Oyun', options: [['normal', 'Normal'], ['large', 'Büyük']] },
  { id: 'motion', label: 'Animasyonlar', type: 'seg', group: 'Oyun', options: [['auto', 'Cihaza göre'], ['on', 'Açık'], ['off', 'Kapalı']] },
];
export const settingsRows = (nav = globalThis.navigator) => SETTINGS_ROWS.filter(r => !r.needs || r.needs in (nav ?? {}));

// <html> öznitelikleri: data-text (yalnız büyükte), data-motion (yalnız auto dışında).
export const domSettings = s => ({ text: s.textScale === 'large' ? 'large' : null, motion: s.motion === 'auto' ? null : s.motion });
export function applyDom(settings, el = document.documentElement) {
  const d = domSettings(settings);
  for (const [k, v] of [['text', d.text], ['motion', d.motion]]) v ? el.setAttribute(`data-${k}`, v) : el.removeAttribute(`data-${k}`);
}

const VERSION = /[?&]v=(\w+)/.exec(import.meta.url)?.[1] ?? 'dev';

// deps = { router, onSettings(settings), tutorial: () => ({ reset }) | null, store?, nav? }
export function defineSettings(menu, { router, onSettings, tutorial = () => null, store: s = store, nav }) {
  menu.define('settings', () => {
    const rows = settingsRows(nav);
    const groups = [...new Set(rows.map(r => r.group))];
    const cur = getSettings(s);
    const row = r => r.type === 'switch'
      ? `<div class="mn-row"><span id="st-${r.id}">${r.label}</span><button type="button" class="mn-switch" role="switch" data-k="${r.id}" aria-checked="${!!cur[r.id]}" aria-labelledby="st-${r.id}"></button></div>`
      : `<div class="mn-row st-seg-row"><span id="st-${r.id}">${r.label}</span><div class="st-seg" role="radiogroup" aria-labelledby="st-${r.id}">${r.options.map(([v, t]) =>
        `<button type="button" role="radio" class="ay-btn st-opt${cur[r.id] === v ? ' sel' : ''}" data-k="${r.id}" data-v="${v}" aria-checked="${cur[r.id] === v}" tabindex="${cur[r.id] === v ? 0 : -1}">${t}</button>`).join('')}</div></div>`;
    const html = `<header class="mn-head"><button type="button" class="mn-back" aria-label="Geri">&#8592;</button><h1>Ayarlar</h1></header>
      <div class="mn-body mn-settings">
        <p class="mn-error" role="alert" ${s.persistent === false ? '' : 'hidden'}>Ayarların bu cihazda saklanamıyor. Oyun yine de çalışır.</p>
        ${groups.map(g => `<div class="mn-card"><h2>${g}</h2>${rows.filter(r => r.group === g).map(row).join('')}</div>`).join('')}
        <div class="mn-card"><h2>Rehber</h2><button type="button" class="ay-btn big" data-a="tutorial">Rehberi baştan göster</button></div>
        <div class="mn-card"><h2>Verilerim</h2>
          <div class="mn-row"><span>Kayıtlı oyun<small class="st-save-note"></small></span><button type="button" class="ay-btn" data-a="saveDel">Kayıtlı oyunu sil</button></div>
          <div class="mn-row"><span>Tüm veriler</span><button type="button" class="ay-btn danger" data-a="allDel">Tüm verilerimi sil</button></div></div>
        <p class="st-foot">Ahilik Yolu · sürüm ${VERSION}<br>ssilistre.dev tarafından geliştirildi.</p>
      </div>`;

    return { html, onMount(el) {
      const $ = q => el.querySelector(q);
      const saveBtn = $('[data-a="saveDel"]');
      const paintSave = () => {
        const has = s.get(KEYS.save) !== null;
        saveBtn.disabled = !has;
        $('.st-save-note').textContent = has ? '' : 'Kayıtlı oyun yok.';
      };
      const change = (k, v) => {
        setSettings({ [k]: v }, s);
        onSettings(getSettings(s));
        menu.feedback('tap');
        $('.mn-error').hidden = s.persistent !== false;
      };
      el.addEventListener('click', async e => {
        const t = e.target.closest('button');
        if (!t || t.disabled) return;
        if (t.classList.contains('mn-back')) { menu.feedback('back'); return router.back(); }
        if (t.classList.contains('mn-switch')) {
          const on = t.getAttribute('aria-checked') !== 'true';
          t.setAttribute('aria-checked', on);
          return change(t.dataset.k, on);
        }
        if (t.classList.contains('st-opt')) {
          for (const b of t.parentElement.children) { const on = b === t; b.classList.toggle('sel', on); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; }
          return change(t.dataset.k, t.dataset.v);
        }
        const a = t.dataset.a;
        if (a === 'tutorial') { tutorial()?.reset(); menu.feedback('tap'); menu.toast('Sonraki oyunda rehber yeniden başlayacak.'); }
        else if (a === 'saveDel') {
          if (!await menu.confirm({ title: 'Kayıtlı oyun silinsin mi?', text: 'Kaldığın oyuna bir daha dönemezsin.', ok: 'Evet, sil', cancel: 'Vazgeç', danger: true })) return;
          s.remove(KEYS.save); paintSave(); menu.toast('Silindi.');
        } else if (a === 'allDel') {
          if (!await menu.confirm({ title: 'Tüm verilerin silinsin mi?', text: 'Adın, karakterin, ayarların ve kayıtlı oyunun silinir. Uygulama baştan başlar.', ok: 'Evet, hepsini sil', cancel: 'Vazgeç', danger: true })) return;
          s.clearAll(); onSettings(getSettings(s)); tutorial()?.reset();
          menu.toast('Silindi.');
          router.go('profile', { first: true }, { replace: true });
        }
      });
      el.addEventListener('keydown', e => { // seçici: ←/→ komşu seçeneğe taşır ve seçer
        const t = e.target.closest?.('.st-opt');
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!t || !d) return;
        e.preventDefault();
        const o = [...t.parentElement.children];
        const n = o[(o.indexOf(t) + d + o.length) % o.length];
        n.focus(); n.click();
      });
      paintSave();
    } };
  });
}
