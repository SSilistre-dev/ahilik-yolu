// Profil (M04): ad + karakter. Kayıt: store.profile = { name, avatar }. Ekran menü kitiyle çizilir (menu.define('profile')).
import { AVATARS, AVATAR_IDS, NAME_MAX, cleanName } from './data.js';
import { store, KEYS } from './store.js';

const byId = id => AVATARS.find(a => a.id === id) ?? AVATARS[0];

// Geçerli profil ya da null (hiç yok / bozuk). Bilinmeyen karakter varsayılana düşer.
export function getProfile(s = store) {
  const p = s.get(KEYS.profile, null, d => !!d && typeof d === 'object' && cleanName(d.name) !== null);
  return p ? { name: cleanName(p.name), avatar: byId(p.avatar).id } : null;
}

// Geçerli ad yoksa false (yazmaz). Depolama yazılamasa bile bellekte tutulur; true döner.
export function setProfile({ name, avatar }, s = store) {
  const n = cleanName(name);
  if (!n) return false;
  s.set(KEYS.profile, { name: n, avatar: byId(avatar).id });
  return true;
}

const disc = a => `<span class="pf-disc" style="--c:${a.color}" aria-hidden="true">${a.glyph}</span>`;

// deps = { router, store? }
export function defineProfile(menu, { router, store: s = store }) {
  menu.define('profile', (params) => {
    const first = !!params.first;
    let avatar = getProfile(s)?.avatar ?? AVATAR_IDS[0];
    const html = `<header class="mn-head">${first ? '' : '<button type="button" class="mn-back" aria-label="Geri">&#8592;</button>'}<h1>${first ? 'Hoş geldin!' : 'Profilin'}</h1></header>
      <div class="mn-body mn-prof">
        ${first ? '<p class="pf-sub">Önce kendini tanıtalım.</p>' : ''}
        <div class="pf-hero"><div class="pf-big"></div><b class="pf-bigname"></b></div>
        <div class="pf-side">
          <div class="mn-card"><label class="pf-label" for="pf-name">Adın ne?</label>
            <div class="pf-inrow"><input id="pf-name" class="pf-input" type="text" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false" placeholder="Adını yaz" aria-describedby="pf-err"><span class="pf-count" aria-hidden="true">0/${NAME_MAX}</span></div>
            <p id="pf-err" class="mn-error" role="alert" hidden>Bir ad yazman gerek.</p></div>
          <div class="mn-card"><h2 id="pf-avl">Karakterini seç</h2>
            <div class="pf-grid" role="radiogroup" aria-labelledby="pf-avl">${AVATARS.map(a => `<button type="button" class="pf-card" role="radio" data-id="${a.id}" aria-checked="false" tabindex="-1">${disc(a)}<span class="pf-cn">${a.name}</span></button>`).join('')}</div></div>
        </div>
      </div>
      <div class="mn-foot"><button type="button" class="ay-btn big primary" id="pf-ok" disabled>${first ? 'Başla!' : 'Kaydet'}</button></div>`;

    return { html, onMount(el) {
      const $ = q => el.querySelector(q);
      const input = $('#pf-name'), ok = $('#pf-ok'), err = $('#pf-err'), cards = [...el.querySelectorAll('.pf-card')], big = $('.pf-big');
      input.value = getProfile(s)?.name ?? '';

      const paintAvatar = (swap) => {
        const a = byId(avatar);
        cards.forEach(c => { const on = c.dataset.id === a.id; c.setAttribute('aria-checked', on); c.tabIndex = on ? 0 : -1; });
        big.innerHTML = disc(a);
        $('.pf-bigname').textContent = a.name;
        if (swap) { big.classList.remove('swap'); void big.offsetWidth; big.classList.add('swap'); }
      };
      const sync = () => {
        const v = input.value;
        if ([...v].length > NAME_MAX) input.value = [...v].slice(0, NAME_MAX).join('');
        $('.pf-count').textContent = `${[...input.value].length}/${NAME_MAX}`;
        const has = cleanName(input.value) !== null;
        ok.disabled = !has;
        if (has) { err.hidden = true; input.removeAttribute('aria-invalid'); }
      };
      const need = () => { err.hidden = false; input.setAttribute('aria-invalid', 'true'); };
      const pick = (id, focus) => {
        if (id === avatar) return;
        avatar = id; menu.feedback('tap'); paintAvatar(true);
        if (focus) cards.find(c => c.dataset.id === id).focus();
      };
      const save = () => {
        const name = cleanName(input.value);
        if (!name) { need(); input.focus(); return; }
        setProfile({ name, avatar }, s);
        menu.feedback('ok');
        menu.toast(first ? `Hoş geldin, ${name}!` : 'Kaydedildi.');
        if (first) router.go('menu', {}, { replace: true }); else router.back();
      };

      input.addEventListener('input', sync);
      input.addEventListener('blur', () => { if (cleanName(input.value) === null) need(); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      ok.onclick = save;
      $('.mn-back')?.addEventListener('click', () => { menu.feedback('back'); router.back(); });
      $('.pf-grid').addEventListener('click', e => { const c = e.target.closest('.pf-card'); if (c) pick(c.dataset.id); });
      $('.pf-grid').addEventListener('keydown', e => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        pick(AVATAR_IDS[(AVATAR_IDS.indexOf(avatar) + d + AVATAR_IDS.length) % AVATAR_IDS.length], true);
      });
      paintAvatar(false);
      sync();
    } };
  });
}
