// Çevrimiçi menü ekranları (OL-3/OL-4): Arkadaşlarla Oyna (friends), Koda Katıl (join), Lobi (lobby).
// Saf yardımcılar dışa açık (test/menu-online.test.js); ekranlar menu.js kitiyle çizilir. Oyun içi HUD burada değil.
import { AVATARS, AVATAR_IDS } from './data.js';
import { store as defaultStore, roomKey } from './store.js';
import { createNet, FATAL } from './net.js';
import { createOnlineSession } from './session.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- saf yardımcılar ----------
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_SEATS = 6;
export const TURN_OPTIONS = [0, 30, 60, 120];
export const LEVELS = [['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor']];
const levelText = l => LEVELS.find(x => x[0] === l)?.[1] ?? '';

// Büyük/küçük harf duyarsız, boşluklar atılır, en çok 6 karakter.
export const cleanCode = raw => String(raw ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 6);
export const isCode = c => typeof c === 'string' && c.length === 6 && [...c].every(ch => CODE_ALPHABET.includes(ch));
// Koda giremeyecek karakterler (tekrarsız, yazıldığı sırayla).
export const invalidChars = raw => [...new Set([...cleanCode(raw)].filter(ch => !CODE_ALPHABET.includes(ch)))];

// "?oda=abc def" -> 'ABCDEF' | null
export function parseRoomParam(search) {
  const c = cleanCode(new URLSearchParams(search).get('oda'));
  return isCode(c) ? c : null;
}

// Derin link: kodu okur ve adres çubuğundan ?oda'yı siler (state korunur). Geçersiz kod null döner.
export function takeRoomLink(loc = globalThis.location, hist = globalThis.history) {
  const code = parseRoomParam(loc.search);
  const u = new URL(loc.href);
  if (u.searchParams.has('oda')) {
    u.searchParams.delete('oda');
    try { hist.replaceState(hist.state, '', u.pathname + u.search + u.hash); } catch {}
  }
  return code;
}

export const shareLink = (origin, code) => `${origin}/?oda=${code}`;

// profile.js karakter id'si (string) <-> sunucu indeksi (0-3).
export const avatarIndex = id => Math.max(0, AVATAR_IDS.indexOf(id));
export const avatarById = i => AVATARS[Number.isInteger(i) && i >= 0 && i < AVATARS.length ? i : 0];

// POST /api/rooms hata metni.
export function createError(status) {
  if (status === 429) return 'Çok fazla oda kurdun. Biraz bekleyip tekrar dene.';
  if (status === 503) return 'Sunucu şu an dolu. Biraz sonra tekrar dene.';
  return 'Oda kurulamadı. Biraz sonra tekrar dene.';
}

// GET /api/rooms/<KOD> cevabı -> { ok } | { ok:false, msg }. Token sahibi başlamış/dolu odaya da döner.
export function joinCheck(status, body, hasToken) {
  if (status === 429) return { ok: false, msg: 'Çok hızlı deniyorsun. Biraz bekle.' };
  if (status === 400) return { ok: false, msg: 'Kod 6 harf ya da rakamdan oluşur.' };
  if (status !== 200 || !body) return { ok: false, msg: 'Odaya ulaşılamadı. Biraz sonra tekrar dene.' };
  if (!body.exists) return { ok: false, msg: 'Böyle bir oda yok. Kodu kontrol et.' };
  if (hasToken) return { ok: true };
  if (body.phase !== 'lobby') return { ok: false, msg: 'Bu odada oyun çoktan başladı.' };
  if (!body.joinable) return { ok: false, msg: 'Oda dolu.' };
  return { ok: true };
}

export const connText = c => (c === 'ok' ? '' : c === 'lost' ? 'Bağlantı kesildi.' : 'Bağlanıyor…');

// Lobi mesajı ({seats, options, phase}) + benim koltuğum -> ekran modeli.
export function lobbyModel({ lobby, you }) {
  const seats = lobby?.seats ?? [];
  const me = seats.find(s => s.seat === you);
  const isHost = !!me?.host;
  const waiting = seats.some(s => !s.bot && !s.host && !s.ready);
  const canStart = isHost && seats.length >= 2 && !waiting;
  return {
    isHost, canStart,
    hint: !isHost ? (me?.ready ? 'Kurucunun oyunu başlatması bekleniyor.' : 'Hazır olunca "Hazırım"a bas.')
      : seats.length < 2 ? 'Başlamak için en az 2 oyuncu gerekir. Bot ekleyebilirsin.' : waiting ? 'Herkes hazır olunca başlayabilirsin.' : '',
    canAddBot: isHost && seats.length < MAX_SEATS,
    myReady: !!me && (me.host || me.ready),
    options: lobby?.options ?? { turnSeconds: 0, startSeat: 'random' },
    seats: seats.map(s => ({
      ...s, isYou: s.seat === you, glyph: s.bot ? '🤖' : avatarById(s.avatar).glyph, color: s.bot ? '#6b7280' : avatarById(s.avatar).color,
      levelText: s.bot ? levelText(s.level) : '',
      canRemove: isHost && s.seat !== you, canSetLevel: isHost && !!s.bot,
    })),
  };
}

// ---------- ekranlar ----------
const head = (title, back = 'data-back') => `<header class="mn-head"><button type="button" class="mn-back" ${back} aria-label="Geri">&#8592;</button><h1>${title}</h1></header>`;

async function api(path, init) {
  try {
    const r = await fetch(path, { cache: 'no-store', ...init });
    let body = null;
    try { body = await r.json(); } catch {}
    return { status: r.status, body };
  } catch { return { status: 0, body: null }; }
}

// deps: { router, getProfile(), startOnline(session), store? }
export function registerOnlineScreens(menu, deps) {
  const { router } = deps;
  const st = deps.store ?? defaultStore;
  const needProfile = (el) => { // profil yoksa önce profil ekranı (kaydedince geri döner)
    if (deps.getProfile?.()) return false;
    menu.toast('Önce profilini oluştur.');
    queueMicrotask(() => router.go('profile'));
    return true;
  };
  const wireBack = (el) => el.addEventListener('click', e => { if (e.target.closest('[data-back]')) { menu.feedback('back'); router.back(); } });

  menu.define('friends', () => ({
    html: `${head('Arkadaşlarla Oyna')}
      <div class="mn-body mn-online">
        <p class="mn-lead">Oda kur, kodu arkadaşlarına gönder; her biri kendi telefonundan katılsın. Boş koltuklara bot ekleyebilirsin.</p>
        <div class="mn-card"><h2>Oda kur</h2><p class="mn-note">Sen oda kurucusu olursun, oyunu sen başlatırsın.</p>
          <button type="button" class="ay-btn big primary" data-new>Oda Kur</button></div>
        <div class="mn-card"><h2>Koda katıl</h2><p class="mn-note">Arkadaşından aldığın 6 harfli kodu gir.</p>
          <button type="button" class="ay-btn big" data-join>Koda Katıl</button></div>
      </div>`,
    onMount(el) {
      if (needProfile(el)) return;
      wireBack(el);
      const bNew = el.querySelector('[data-new]');
      bNew.onclick = async () => {
        menu.feedback('go');
        bNew.disabled = true;
        const r = await api('/api/rooms', { method: 'POST' });
        bNew.disabled = false;
        if (r.status === 201 && isCode(r.body?.code)) router.go('lobby', { code: r.body.code });
        else menu.toast(r.status === 0 ? 'Sunucuya ulaşılamadı. İnternetini kontrol et.' : createError(r.status));
      };
      el.querySelector('[data-join]').onclick = () => { menu.feedback('go'); router.go('join'); };
    },
  }));

  menu.define('join', (params) => {
    const pre = cleanCode(params.code);
    return {
      html: `${head('Koda Katıl')}
        <div class="mn-body mn-online">
          <div class="mn-card"><label class="pf-label" for="ol-code">Oda kodu</label>
            <input id="ol-code" class="ay-input ol-codein" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="12" placeholder="ABC234" aria-describedby="ol-err" value="${esc(pre)}">
            <p id="ol-err" class="mn-error" role="alert" hidden></p></div>
        </div>
        <div class="mn-foot"><button type="button" class="ay-btn big primary" data-ok disabled>Katıl</button></div>`,
      onMount(el) {
        if (needProfile(el)) return;
        wireBack(el);
        const input = el.querySelector('#ol-code'), ok = el.querySelector('[data-ok]'), err = el.querySelector('#ol-err');
        const sync = () => {
          const bad = invalidChars(input.value);
          const c = cleanCode(input.value);
          if (input.value !== c && !bad.length) input.value = c; // boşluk atılır, büyük harfe çevrilir
          err.hidden = !bad.length;
          err.textContent = bad.length ? `Kodda ${bad.join(' ')} olmaz. Harfler ve 2-9 arası rakamlar kullanılır.` : '';
          input.toggleAttribute('aria-invalid', !!bad.length);
          ok.disabled = !isCode(c);
        };
        const go = async () => {
          const c = cleanCode(input.value);
          if (!isCode(c) || ok.disabled) return;
          menu.feedback('go');
          ok.disabled = true;
          const r = await api(`/api/rooms/${c}`);
          const chk = joinCheck(r.status, r.body, st.get(roomKey(c), null, d => typeof d === 'string') !== null);
          if (chk.ok) return router.go('lobby', { code: c });
          err.hidden = false; err.textContent = r.status === 0 ? 'Sunucuya ulaşılamadı. İnternetini kontrol et.' : chk.msg;
          ok.disabled = false;
          input.focus();
        };
        input.addEventListener('input', sync);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        ok.onclick = go;
        sync();
        if (matchMedia('(pointer:fine)').matches || !pre) input.focus({ preventScroll: true });
      },
    };
  });

  menu.define('lobby', (params) => {
    const code = cleanCode(params.code);
    let dispose = null;
    const seatsHtml = (m) => m.seats.map(s => `<div class="ol-seat${s.isYou ? ' you' : ''}" style="--pc:${s.color}">
        <i class="ol-av" aria-hidden="true">${s.glyph}</i>
        <div class="ol-who"><b>${esc(s.name)}</b><small>${[
          s.isYou ? 'Sen' : '', s.host ? '<span aria-hidden="true">👑</span> Kurucu' : '', s.bot ? `Bot · ${esc(s.levelText)}` : '',
          !s.bot && (s.host || s.ready) ? 'Hazır' : !s.bot ? 'Bekliyor' : '', !s.bot && !s.online ? 'Çevrimdışı' : '',
        ].filter(Boolean).join(' · ')}</small></div>
        ${s.canSetLevel ? `<select class="ol-sel" data-key="lv${s.seat}" data-level="${s.seat}" aria-label="${esc(s.name)} seviyesi">${LEVELS.map(([v, t]) => `<option value="${v}"${v === s.level ? ' selected' : ''}>${t}</option>`).join('')}</select>` : ''}
        ${s.canRemove ? `<button type="button" class="ay-btn sm ghost" data-remove="${s.seat}" data-key="rm${s.seat}" aria-label="${s.bot ? 'Botu çıkar' : 'Oyuncuyu at'}: ${esc(s.name)}">${s.bot ? 'Çıkar' : 'At'}</button>` : ''}
      </div>`).join('') || '<p class="mn-note">Odaya bağlanılıyor…</p>';
    return {
      html: `${head('Oda', 'data-leave')}
        <div class="mn-body mn-online mn-lobby">
          <p class="ol-conn" role="status" hidden></p>
          <div class="mn-card ol-codecard"><small>Oda kodu</small><b class="ol-code" aria-label="Oda kodu: ${esc([...code].join(' '))}">${esc(code)}</b>
            <button type="button" class="ay-btn" data-share>Paylaş</button></div>
          <div class="mn-card"><h2>Oyuncular <small class="ol-count"></small></h2><div class="ol-seats"></div><div class="ol-add"></div></div>
          <div class="mn-card ol-opts"></div>
          <p class="mn-note ol-hint"></p>
        </div>
        <div class="mn-foot"><button type="button" class="ay-btn big primary" data-main disabled>Hazırım</button>
          <button type="button" class="ay-btn big ghost" data-leave>Odadan Ayrıl</button></div>`,
      onMount(el) {
        const profile = deps.getProfile?.();
        if (!isCode(code) || !profile) {
          if (!profile) menu.toast('Önce profilini oluştur.'); else menu.toast('Oda kodu geçersiz.');
          queueMicrotask(() => (profile ? router.back() : router.go('profile', {}, { replace: true })));
          return;
        }
        const net = createNet({ code, store: st });
        const session = createOnlineSession({ net });
        let model = null, handed = false, addLevel = 'medium', ready = false;
        const $ = q => el.querySelector(q);
        const cache = new Map();
        const put = (q, html) => { if (cache.get(q) !== html) { cache.set(q, html); $(q).innerHTML = html; } };

        const handoff = () => { if (handed) return; handed = true; deps.startOnline(session); };
        const paintConn = (c) => { const t = connText(c), b = $('.ol-conn'); b.hidden = !t; b.textContent = t; b.classList.toggle('lost', c === 'lost'); };
        const paint = () => {
          const m = model;
          if (!m) return;
          const focus = document.activeElement?.dataset?.key;
          put('.ol-seats', seatsHtml(m));
          $('.ol-count').textContent = `${m.seats.length}/${MAX_SEATS}`;
          put('.ol-add', m.canAddBot ? `<div class="ol-addrow"><select class="ol-sel" data-key="addlv" data-addlevel aria-label="Bot seviyesi">${LEVELS.map(([v, t]) => `<option value="${v}"${v === addLevel ? ' selected' : ''}>${t}</option>`).join('')}</select>
            <button type="button" class="ay-btn" data-addbot data-key="addbot">Bot Ekle</button></div>` : '');
          const o = m.options;
          put('.ol-opts', m.isHost ? `<h2>Ayarlar</h2><p class="ol-lbl">Tur süresi</p>
            <div class="ay-seg ol-seg" role="group" aria-label="Tur süresi">${TURN_OPTIONS.map(t => `<button type="button" data-turn="${t}" data-key="t${t}" class="${t === o.turnSeconds ? 'sel' : ''}" aria-pressed="${t === o.turnSeconds}">${t ? `${t} sn` : 'Süresiz'}</button>`).join('')}</div>
            <label class="ol-lbl" for="ol-start">Kim başlasın?</label>
            <select id="ol-start" class="ol-sel wide" data-key="start" data-start><option value="random"${o.startSeat === 'random' ? ' selected' : ''}>Rastgele</option>${m.seats.map(s => `<option value="${s.seat}"${o.startSeat === s.seat ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`
            : `<h2>Ayarlar</h2><p class="mn-note">Tur süresi: ${o.turnSeconds ? `${o.turnSeconds} sn` : 'süresiz'} · Başlayan: ${o.startSeat === 'random' ? 'rastgele' : esc(m.seats[o.startSeat]?.name ?? '?')}</p>`);
          $('.ol-hint').textContent = m.hint;
          const main = $('[data-main]');
          main.textContent = m.isHost ? 'Başlat' : m.myReady ? 'Hazır Değilim' : 'Hazırım';
          main.disabled = m.isHost ? !m.canStart : false;
          main.classList.toggle('sel', !m.isHost && m.myReady);
          if (focus) el.querySelector(`[data-key="${focus}"]`)?.focus();
        };

        net.on('conn', ({ conn }) => paintConn(conn));
        session.onLobby(l => {
          if (l.phase === 'game') return handoff();
          model = lobbyModel({ lobby: l, you: session.you });
          ready = model.myReady;
          paint();
        });
        session.onUpdate(handoff); // geri dönen oyuncu ya da başlayan oyun: ilk game mesajıyla oyuna geç
        session.onError(m => {
          menu.toast(m.msg || 'Bir sorun oldu.');
          if (FATAL.has(m.code)) router.back();
        });
        paintConn(net.conn);
        net.connect({ name: profile.name, avatar: avatarIndex(profile.avatar) });

        const leave = async () => {
          const yes = await menu.confirm({ title: 'Odadan ayrılacak mısın?', text: 'Koltuğun boşalır. Aynı kodla tekrar katılabilirsin.', ok: 'Evet, ayrıl', cancel: 'Kal', danger: true });
          if (yes) { st.remove(roomKey(code)); router.back(); }
        };
        const share = async () => {
          const url = shareLink(location.origin, code);
          menu.feedback('tap');
          if (navigator.share) {
            try { await navigator.share({ title: 'Ahilik Yolu', text: `Ahilik Yolu odama gel! Kod: ${code}`, url }); } catch {}
            return;
          }
          try { await navigator.clipboard.writeText(url); menu.toast('Bağlantı kopyalandı.'); } catch { menu.toast(`Kod: ${code}`); }
        };
        el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); leave(); } });
        el.addEventListener('change', e => {
          const t = e.target;
          if ('addlevel' in t.dataset) addLevel = t.value;
          else if ('level' in t.dataset) session.setBot(+t.dataset.level, t.value);
          else if ('start' in t.dataset) session.setOptions({ startSeat: t.value === 'random' ? 'random' : +t.value });
        });
        el.addEventListener('click', e => {
          const b = e.target.closest('button');
          if (!b) return;
          if ('leave' in b.dataset) leave();
          else if ('share' in b.dataset) share();
          else if ('addbot' in b.dataset) { menu.feedback('tap'); session.addBot(addLevel); }
          else if (b.dataset.remove) { menu.feedback('tap'); session.removeSeat(+b.dataset.remove); }
          else if (b.dataset.turn) { menu.feedback('tap'); session.setOptions({ turnSeconds: +b.dataset.turn }); }
          else if ('main' in b.dataset) {
            if (model?.isHost) { menu.feedback('start'); session.start(); } else { menu.feedback('tap'); session.ready(!ready); }
          }
        });
        dispose = () => { if (!handed) session.leave(); };
      },
      onUnmount() { dispose?.(); dispose = null; },
    };
  });
}
