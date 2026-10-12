// Ana menü, Aynı Telefonda/Botlarla kurulum ve Duraklat penceresi (M03/M06/M09) + künye (X02).
// Saf yardımcılar dışa açık (test/menu.test.js, test/localsetup.test.js); ekranlar menu.js kitiyle çizilir.
import { VERSION } from './version.js';
import { PLAYER_COLORS, AVATARS, assignAvatars } from './data.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lower = s => s.toLocaleLowerCase('tr');
const pcolor = i => PLAYER_COLORS[i % PLAYER_COLORS.length] ?? '#888';

// ---------- saf yardımcılar ----------
export function timeAgo(ms, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h} saat önce`;
  if (h < 48) return 'dün';
  return `${Math.floor(h / 24)} gün önce`;
}

// Kayıt biçimi (AHI-015 bağlanınca bu şekle uyar): { n | players[], turn, at }.
export function continueLabel(save, now = Date.now()) {
  const n = save?.n ?? save?.players?.length;
  if (!Number.isInteger(n) || n < 1) return null;
  const turn = Number.isInteger(save.turn) ? save.turn : 1;
  return `${n} oyuncu · ${turn}. tur · ${timeAgo(Number.isFinite(save.at) ? save.at : now, now)}`;
}

const BUTTONS = [
  { id: 'continue', t: 'Devam Et' },
  { id: 'bots', t: 'Botlarla Oyna', s: 'Bilgisayara karşı oyna' },
  { id: 'friends', t: 'Arkadaşlarla Oyna', s: 'Davet koduyla uzaktan oyna' },
  { id: 'local', t: 'Aynı Telefonda', s: 'Telefonu elden ele ver' },
  { id: 'howto', t: 'Nasıl Oynanır?', s: 'Kuralları öğren' },
  { id: 'settings', t: 'Ayarlar', s: 'Ses, yazı boyutu ve daha fazlası' },
];

// has(ekranAdı): ekran tanımlı mı. Arkadaşlarla Oyna ekranı yokken Yakında rozetiyle devre dışı.
export function mainButtons({ save, has = () => false, now = Date.now() }) {
  const label = save ? continueLabel(save, now) : null;
  const list = BUTTONS.filter(b => b.id !== 'continue' || label).map(b => ({
    ...b, s: b.id === 'continue' ? label : b.s,
    primary: b.id === (label ? 'continue' : 'bots'),
    disabled: b.id === 'friends' && !has('friends'),
  }));
  return list;
}

// Aynı ad (Türkçe büyük/küçük harf farkıyla) iki kişide olmasın: sonrakine " 2", " 3"… eklenir.
export function uniqueNames(names) {
  const seen = new Set();
  return names.map(name => {
    let c = name, k = 2;
    while (seen.has(lower(c))) c = `${name} ${k++}`;
    seen.add(lower(c));
    return c;
  });
}

// rows: [{ name, bot }], starter: indeks | 'random'. Dönen: newGame girdisi.
export function buildLocalGame({ profile, rows, starter = 0 }, rand = Math.random) {
  const names = uniqueNames(rows.map((r, i) => String(r.name ?? '').trim().slice(0, 16)
    || (i === 0 && !r.bot && profile?.name) || (r.bot ? `Bot ${i}` : `Oyuncu ${i + 1}`)));
  const avatars = assignAvatars(rows.length, profile?.avatar); // 1. oyuncu profil karakteri, diğerleri sırayla
  const players = rows.map((r, i) => ({ name: names[i], bot: !!r.bot, avatar: avatars[i] }));
  const n = players.length;
  const startIdx = starter === 'random' ? Math.min(n - 1, Math.floor(rand() * n)) : Number.isInteger(starter) && starter >= 0 && starter < n ? starter : 0;
  return { players, startIdx };
}

// ---------- ekranlar ----------
const btn = (b) => `<button type="button" class="ay-btn big${b.primary ? ' primary' : ''}" data-go="${b.id}"${b.disabled ? ' disabled' : ''}>
    <span class="t">${esc(b.t)}${b.disabled ? ' <span class="mn-badge">Yakında</span>' : ''}</span>${b.s ? `<small>${esc(b.s)}</small>` : ''}</button>`;

// deps: { router, getProfile(), loadSave?(), resume?(), openHelp(), startGame(opts) }
export function registerMainScreens(menu, deps) {
  const { router } = deps;

  menu.define('menu', (_params, api) => {
    const profile = deps.getProfile?.() ?? null;
    const save = deps.loadSave?.() ?? null;
    const name = profile?.name ? esc(profile.name) : '';
    const av = AVATARS.find(a => a.id === profile?.avatar);
    const list = mainButtons({ save, has: api.has });
    return {
      html: `<div class="mn-body mn-menu">
        <div class="mn-side"><img class="mn-logo" src="assets/cards/logo.jpg" alt="Ahilik Yolu" draggable="false">
          <button type="button" class="mn-chip" data-go="profile" aria-label="Profili düzenle"><i class="av" aria-hidden="true"${av ? ` style="background:${av.color}"` : ''}>${av ? av.glyph : esc([...(profile?.name ?? '?')][0]?.toLocaleUpperCase('tr') ?? '?')}</i><span>Merhaba${name ? `, ${name}` : ''}!</span></button></div>
        <div class="mn-list">${list.map(btn).join('')}</div></div>
        <footer class="mn-credit"><span>İGİAD · Ahilik Yolu</span><a class="kv-credit" href="https://ssilistre.dev" target="_blank" rel="noopener" aria-label="Made by ssilistre.dev"><span aria-hidden="true"><img src="assets/brand/mark-white.webp" alt="" width="12" height="16" decoding="async">Made by <b>ssilistre.dev</b></span><span aria-hidden="true"><img src="assets/brand/wordmark-light-text.webp" alt="" width="68" height="20" decoding="async"></span></a><small>sürüm ${VERSION}</small></footer>`,
      onMount(el) {
        const items = () => [...el.querySelectorAll('.mn-list button:not(:disabled)')];
        el.addEventListener('click', e => {
          const b = e.target.closest('[data-go]');
          if (!b) return;
          const go = (name, params) => (api.has(name) ? (api.feedback('go'), router.go(name, params)) : api.toast('Yakında'));
          switch (b.dataset.go) {
            case 'continue': api.feedback('go'); return deps.resume?.();
            case 'bots': return api.has('bots') ? go('bots') : (api.feedback('go'), router.go('local', { preset: 'bots' }));
            case 'local': return (api.feedback('go'), router.go('local', { preset: 'local' }));
            case 'howto': return api.has('howto') ? go('howto') : (api.feedback('go'), deps.openHelp());
            default: return go(b.dataset.go);
          }
        });
        el.addEventListener('keydown', e => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          const l = items(), i = l.indexOf(document.activeElement);
          e.preventDefault();
          l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]?.focus();
        });
        if (matchMedia('(pointer:fine)').matches) items()[0]?.focus({ preventScroll: true });
      },
    };
  });

  menu.define('local', (params, api) => {
    const bots = params.preset === 'bots';
    const profile = deps.getProfile?.() ?? null;
    let n = 2, first = 0;
    const title = bots ? 'Botlarla Oyna' : 'Aynı Telefonda';
    const rows = Array.from({ length: 6 }, (_, i) => {
      const bot = bots && i > 0;
      const val = i === 0 ? (profile?.name ?? (bots ? 'Sen' : 'Oyuncu 1')) : bot ? `Bot ${i}` : `Oyuncu ${i + 1}`;
      return `<div class="ay-prow" data-i="${i}" style="--pc:${pcolor(i)}" ${i >= n ? 'hidden' : ''}>
        <span class="ay-ring">${i + 1}</span><input class="ay-input" maxlength="16" value="${esc(val)}" autocomplete="off" aria-label="${i + 1}. oyuncunun adı">
        <div class="ay-seg" role="group" aria-label="İnsan mı bot mu"><button type="button" data-h="1" class="${bot ? '' : 'sel'}">İnsan</button><button type="button" data-h="0" class="${bot ? 'sel' : ''}">Bot</button></div></div>`;
    }).join('');
    return {
      html: `<header class="mn-head"><button type="button" class="mn-back" data-back aria-label="Geri">&#8592;</button><h1>${title}</h1></header>
        <div class="mn-body mn-local">
          <p class="mn-lead">${bots ? 'Bilgisayara karşı oyna; istersen yanına başka insanlar da ekle.' : 'Telefonu elden ele vereceksiniz. Herkes kendi sırasında kartlarına bakar.'}</p>
          <div class="mn-card"><h2>${bots ? 'Kaç oyuncu?' : 'Kaç kişisiniz?'}</h2>
            <div class="ay-toggles five">${[2, 3, 4, 5, 6].map(k => `<button type="button" class="ay-tg ${k === n ? 'sel' : ''}" data-n="${k}"><b>${k}</b><small>kişi</small></button>`).join('')}</div></div>
          <div class="mn-card"><div class="ay-players">${rows}</div>
            <p class="mn-note" data-dirnote hidden>Masada kural kitabındaki gibi sağdan sola oturun. Sıra bu listedeki gibi gider.</p></div>
          <div class="mn-card"><h2>Kim başlasın? <small>(yaşça en küçük)</small></h2><div class="ay-starters"></div></div>
          <p class="mn-error" data-warn role="alert" hidden>En az bir insan oyuncu olmalı.</p></div>
        <div class="mn-foot"><button type="button" class="ay-btn big primary" data-go>Oyuna Başla</button></div>`,
      onMount(el) {
        const prow = i => el.querySelector(`.ay-prow[data-i="${i}"]`);
        const isBot = i => prow(i).querySelector('[data-h="0"]').classList.contains('sel');
        const nameOf = i => prow(i).querySelector('input').value.trim() || (isBot(i) ? `Bot ${i}` : `Oyuncu ${i + 1}`);
        const idx = () => Array.from({ length: n }, (_, i) => i);
        const paint = () => {
          if (first !== 'random' && first >= n) first = 0;
          el.querySelector('.ay-starters').innerHTML = idx().map(i =>
            `<button type="button" class="ay-st ${i === first ? 'sel' : ''}" data-s="${i}" style="--pc:${pcolor(i)}"><i class="dot"></i>${esc(nameOf(i))}</button>`).join('')
            + `<button type="button" class="ay-st ${first === 'random' ? 'sel' : ''}" data-s="random">Rastgele</button>`;
          const ok = idx().some(i => !isBot(i));
          el.querySelector('[data-warn]').hidden = ok;
          el.querySelector('[data-dirnote]').hidden = idx().filter(i => !isBot(i)).length < 2;
          el.querySelector('.mn-foot [data-go]').disabled = !ok;
        };
        const start = () => {
          const g = buildLocalGame({ profile, rows: idx().map(i => ({ name: prow(i).querySelector('input').value, bot: isBot(i) })), starter: first });
          api.feedback('start');
          deps.startGame(g);
        };
        el.addEventListener('input', paint);
        el.addEventListener('keydown', e => {
          if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
          e.preventDefault();
          const ins = [...el.querySelectorAll('.ay-prow:not([hidden]) input')], i = ins.indexOf(e.target);
          if (i < ins.length - 1) ins[i + 1].focus();
          else if (!el.querySelector('.mn-foot [data-go]').disabled) start();
        });
        el.addEventListener('click', e => {
          const b = e.target.closest('button');
          if (!b) return;
          if ('back' in b.dataset) { api.feedback('back'); router.back(); }
          else if (b.dataset.n) {
            api.feedback('tap');
            n = +b.dataset.n;
            el.querySelectorAll('[data-n]').forEach(x => x.classList.toggle('sel', x === b));
            for (let i = 0; i < 6; i++) prow(i).hidden = i >= n;
            paint();
          } else if (b.dataset.h) {
            api.feedback('tap');
            const row = b.closest('.ay-prow'), i = +row.dataset.i, input = row.querySelector('input'), bot = b.dataset.h === '0';
            row.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('sel', x === b));
            if (bot && /^Oyuncu \d+$/.test(input.value)) input.value = `Bot ${i}`;
            else if (!bot && /^Bot \d+$/.test(input.value)) input.value = `Oyuncu ${i + 1}`;
            paint();
          } else if (b.dataset.s) { api.feedback('tap'); first = b.dataset.s === 'random' ? 'random' : +b.dataset.s; paint(); }
          else if (b.hasAttribute('data-go')) start();
        });
        paint();
      },
    };
  });
}

// ---------- Duraklat penceresi (M09) ----------
// Menü ekranlarından bağımsız bir katman: canlı oyunun üstünde kararır, ekran geçişi/animasyon yığınına girmez.
// d: { router, sfx, openHelp(), openLog(), exit(), canSave }
export function createPause(menu, d) {
  let wrap = null, poll = 0;
  const opened = { help: () => !!document.querySelector('.ay-tut.help'), log: () => document.querySelector('.ay-drawer')?.hidden === false };
  const hide = () => { clearInterval(poll); wrap?.remove(); wrap = null; };

  // Yardım/kayıt penceresi pencerenin üstünde açılsın: pencereyi gizle, kapanınca geri getir.
  function park(kind, open) {
    wrap.hidden = true;
    open();
    clearInterval(poll);
    poll = setInterval(() => {
      if (opened[kind]()) return;
      clearInterval(poll);
      if (wrap) { wrap.hidden = false; wrap.querySelector('[data-p="resume"]').focus(); }
    }, 150);
  }

  function show({ mode = 'local' } = {}) {
    hide();
    menu.feedback('tap');
    wrap = document.createElement('div');
    wrap.className = 'mn-pausewrap';
    const on = !d.sfx.muted;
    wrap.innerHTML = `<div class="ay-dialog mn-pausebox" role="dialog" aria-modal="true" aria-labelledby="mn-pause-t"><h2 id="mn-pause-t">Oyun Durdu</h2>
      <button type="button" class="ay-btn big primary" data-p="resume">Devam Et</button>
      <button type="button" class="ay-btn big" data-p="help">Nasıl Oynanır?</button>
      <button type="button" class="ay-btn big" data-p="log">Oyun Kaydı</button>
      <button type="button" class="ay-btn big" data-p="settings">Ayarlar</button>
      <div class="mn-row"><span>Ses</span><button type="button" class="mn-switch" role="switch" aria-checked="${on}" aria-label="Ses" data-p="sound"></button></div>
      <button type="button" class="ay-btn big ghost mn-exit" data-p="exit">Oyundan Çık</button></div>`;
    wrap.addEventListener('click', async e => {
      const p = e.target.closest('[data-p]')?.dataset.p;
      if (!p) return;
      if (p === 'resume') { menu.feedback('back'); d.router.back(); }
      else if (p === 'help') park('help', d.openHelp);
      else if (p === 'log') park('log', d.openLog);
      else if (p === 'settings') { if (menu.has('settings')) { menu.feedback('go'); d.router.go('settings', { from: 'pause' }); } else menu.toast('Yakında'); }
      else if (p === 'sound') {
        d.sfx.setMuted(!d.sfx.muted);
        e.target.closest('[data-p]').setAttribute('aria-checked', String(!d.sfx.muted));
        if (!d.sfx.muted) menu.feedback('tap');
      } else if (p === 'exit') {
        const text = mode === 'online' ? 'Odadan ayrılırsan sırana botlar bakar. Aynı cihazdan geri dönebilirsin.'
          : d.canSave ? 'Oyunun kaydedilir. Menüdeki Devam Et ile kaldığın yerden oynayabilirsin.' : 'Bu oyun kaydedilmez; çıkarsan oyun silinir.';
        if (await menu.confirm({ title: 'Oyundan çıkılsın mı?', text, ok: 'Evet, çık', cancel: 'Vazgeç', danger: true })) d.exit();
      }
    });
    wrap.addEventListener('keydown', e => { // odak pencere içinde kalır (Escape: pencere dışındaki ortak dinleyici)
      if (e.key !== 'Tab') return;
      const f = [...wrap.querySelectorAll('button')];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    });
    document.body.append(wrap);
    wrap.querySelector('[data-p="resume"]').focus();
  }
  return { show, hide, get open() { return !!wrap; } };
}
