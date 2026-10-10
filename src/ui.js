import { ILKELER, ILKE_IDS, CARDS, CITIES, PLAYER_COLORS } from './data.js';
import { createTutorial } from './tutorial.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PHASE = { ahlak: 'Ahlak kartı aç', close: 'Kapatılacak parlayan kareye dokun', move: 'Yol kartıyla ilerle', over: 'Oyun bitti' };
// tapTile card preference: plain ilke card, then text card, then joker.
const rank = id => (CARDS[id]?.joker ? 3 : CARDS[id]?.hasText ? 2 : 1);
const money = p => p.trades.reduce((s, id) => s + CARDS[id].value, 0);
const cityName = id => CITIES[id]?.name ?? id;
// Engine dedupes identical cards in legalActions; compare cards by kind, not id.
const kind = id => { const c = CARDS[id]; return c?.joker ? 'J' : c?.kargo ? 'K' : `${c?.ilke}${c?.hasText ? 'T' : ''}`; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Card art (own mapping; does not depend on src/assets.js). Resolved relative to this module.
const ART = new URL('../assets/cards/', import.meta.url).href;
export const cardArt = id => {
  const c = CARDS[id];
  const f = !c ? id : c.joker ? 'yol-ahievran' : c.kargo ? 'yol-kargo'
    : c.type === 'yol' ? `yol-${c.ilke}${c.hasText ? '-text' : ''}`
    : c.type === 'ahlak' ? `ahlak-${c.ilke}${c.negative ? '-neg' : ''}`
    : `ticaret-${c.city}-${c.value}`;
  return `${ART}${f}.jpg`;
};
const url = f => `${ART}${f}.jpg`;
const img = (src, cls = '', eager = false) =>
  `<img class="${cls}" src="${src}" alt="" ${eager ? '' : 'loading="lazy"'} decoding="async" draggable="false">`;
const cardName = id => { const c = CARDS[id]; return c?.joker ? 'Ahi Evran' : c?.kargo ? 'Kargo' : ILKELER[c?.ilke]?.name ?? id; };
const ilkeOrCard = w => ILKELER[w]?.name ?? (CARDS[w] ? cardName(w) : w);
const coin = '<i class="ay-coin"></i>';
// Rozet puanı: altın = 5 puan, gümüş = 1 puan (kural 29).
const badgeHtml = b => `<span class="ay-stat ay-bdg" title="${b} rozet puanı"><b>${b}</b><i class="ay-coin xs"></i>${Math.floor(b / 5)}<i class="ay-coin xs silver"></i>${b % 5}</span>`;
const pcolor = i => PLAYER_COLORS[i % PLAYER_COLORS.length] ?? '#888';
const WANTS = [...ILKE_IDS, 'ahievran', 'kargo'];
const wantName = w => ILKELER[w]?.name ?? (w === 'ahievran' ? 'Ahi Evran' : w === 'kargo' ? 'Kargo' : w);
const wantArt = w => url(ILKELER[w] ? `ilke-${w}` : `yol-${w}`);
const wantColor = w => ILKELER[w]?.color ?? '#e8a21a';
const sig = cards => cards.map(kind).sort().join();
const uniqBy = (arr, f) => { const seen = new Set(); return arr.filter(x => { const k = f(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
// Karar verecek oyuncu (SPEC v4 actor): bekleyen takas -> to, bekleyen yol -> ask, yoksa active.
const actorOf = s => s.pending?.kind === 'trade' ? s.pending.to : s.pending?.kind === 'road' ? s.pending.ask : s.active;

const cardHtml = (id, extra = '', attrs = '', style = '') =>
  `<button class="ay-card ${extra}" ${attrs} style="${style}" aria-label="${esc(cardName(id))}">${img(cardArt(id))}${CARDS[id]?.hasText ? '<span class="ay-scroll">📜</span>' : ''}</button>`;

const SLIDES = [
  { t: '1 · Ahlak kartı aç', imgs: ['ahlak-back', 'ahlak-adaletli'], p: 'Her tur başında bir ahlak kartı çekersin. Olumluysa o ilkenin karelerine rozet konur, olumsuzsa bir kare kapanır.' },
  { t: '2 · Yol kartıyla ilerle', imgs: ['yol-comert', 'yol-ahievran', 'yol-kargo'], p: 'Kartın ilkesiyle eşleşen komşu kareye git. Ahi Evran joker, Kargo seni istediğin şehre uçurur.' },
  { t: '3 · Şehre ulaş, rozet topla', imgs: ['city-ankara', 'ticaret-ankara-2'], p: 'Görev şehrine komşu kareye varınca ticareti tamamlarsın. Kazanç = para × rozet çarpanı.' },
];

// onLayout({top, bottom, right}) — all CSS px, measured against the viewport:
//   top    = px from the viewport TOP covered by the HUD (chips + hint pill + goal band). The toast overlays just below it and is not counted.
//   bottom = px from the viewport BOTTOM covered by the dock (hand + buttons) = innerHeight - dock visible top.
//            On desktop (>900px) the dock is a right sidebar, so bottom = 0.
//   right  = px from the viewport RIGHT covered by the sidebar (desktop only, else 0); #stage{right} CSS already accounts for it.
// Called only when a value changed by >= 2px.
export function createUI(root, { onAction, onTileHighlight, onLayout }) {
  root.classList.add('ay-root');
  root.innerHTML = `<div class="ay-hud"><div class="ay-chips ay-p"></div><div class="ay-pill"></div>
      <div class="ay-row2"><div class="ay-goal"></div><div class="ay-side"><button class="ay-slot ay-p" data-a="slot" hidden aria-label="Son ahlak kartı"></button><button class="ay-round ay-p" data-a="help" aria-label="Nasıl oynanır?">?</button><button class="ay-round ay-p" data-a="log" aria-label="Kayıt">☰</button></div></div>
      <div class="ay-toasts"></div></div>
    <div class="ay-dock"><div class="ay-handle ay-p" data-a="fold"></div><div class="ay-sub ay-p"></div><div class="ay-acts ay-p"></div><div class="ay-fan"></div></div>
    <div class="ay-modal" hidden></div><div class="ay-modal ay-sheetwrap" hidden></div><div class="ay-drawer" hidden></div><div class="ay-fx"></div><div class="ay-curtain ay-p" hidden></div>`;
  const $ = s => root.querySelector(s);
  const hudEl = $('.ay-hud'), goalEl = $('.ay-goal'), chipsEl = $('.ay-chips'), pillEl = $('.ay-pill'), slotEl = $('.ay-slot'), toastEl = $('.ay-toasts'), dockEl = $('.ay-dock'),
    handleEl = $('.ay-handle'), subEl = $('.ay-sub'), actsEl = $('.ay-acts'), fanEl = $('.ay-fan'),
    modalEl = $('.ay-modal'), sheetEl = $('.ay-sheetwrap'), curtainEl = $('.ay-curtain'), drawerEl = $('.ay-drawer'), fxEl = $('.ay-fx');

  let st = null, legal = [], selected = null, passAsk = false, sheet = null, trade = {}, viewer = null;
  let wiggled = false, seed = null, celebrate = 0, toastTimer = 0, cel = '';
  let log = [], lastActive = -1, startEl = null, loadEl = null, handOpen = true, lastHl = '', lastAhlakId = null;

  const tut = createTutorial(root, { art: cardArt, url });
  const tutEls = { hud: hudEl, dock: dockEl, fan: fanEl, acts: actsEl, selected: () => selected, blocked: () => !!st && (needCurtain() || !!st.pending || !!sheet) };
  const act = a => { if (a.type === 'move' || a.type === 'kargo') wiggled = true; passAsk = false; sheet = null; trade = {}; selected = null; onAction(a); };
  const has = t => legal.some(a => a.type === t);
  const actorIdx = () => actorOf(st);
  const humans = () => st.players.filter(p => !p.bot).length;
  // Telefon şu an bu insan oyuncuda mı? (tek insanda hep evet; çok insanda perde kalkınca)
  const ready = i => !st.players[i].bot && viewer === i;
  // Aktif insan, bekleyen soru yok, perde kalkık: hamle yapabilir.
  const human = () => !!st && st.phase !== 'over' && !st.pending && ready(st.active);
  // Bana soru soruldu mu (takas cevabı / yol katkısı)?
  const asked = () => !!st && st.phase !== 'over' && !!st.pending && ready(actorIdx());
  const needCurtain = () => st.phase !== 'over' && humans() > 1 && !st.players[actorIdx()].bot && viewer !== actorIdx();
  const origin = () => root.getBoundingClientRect();
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  function highlight() {
    let tiles = [];
    if (human() && st.phase === 'close') tiles = legal.filter(a => a.type === 'closeTile').map(a => a.tile);
    else if (human() && st.phase === 'move') {
      tiles = legal.filter(a => a.type === 'move' && (!selected || kind(a.card) === kind(selected))).map(a => a.tile);
      tiles.push(...legal.filter(a => a.type === 'openRoad').map(a => a.tile));
    }
    tiles = [...new Set(tiles)];
    const key = tiles.join();
    if (key !== lastHl) { lastHl = key; onTileHighlight?.(tiles); }
  }

  // ---------- HUD ----------
  function hint() {
    if (st.phase === 'over') return PHASE.over;
    const pd = st.pending, ap = st.players[actorIdx()], p = st.players[st.active];
    if (pd) {
      if (ap.bot) return pd.kind === 'trade' ? `${ap.name} takas teklifine bakıyor…` : `${ap.name} yol katkısına karar veriyor…`;
      return pd.kind === 'trade' ? 'Takas teklifine cevap ver' : 'Yol açmaya katılmak ister misin?';
    }
    if (p.bot) return `${p.name} oynuyor… (dokun: hızlandır)`;
    if (!human()) return `Sıra ${p.name} oyuncusunda`;
    if (has('readText') && p.pendingText) return 'Kartı sesli oku, +1 rozet';
    if (st.phase !== 'move') return PHASE[st.phase] ?? st.phase;
    if (sheet?.kind === 'trade') return 'Takas: verdiğin kartı, oyuncuyu ve istediğini seç';
    if (sheet?.kind === 'road') return 'Kapalı yol: kaç kart koyacaksın?';
    if (selected) return CARDS[selected]?.kargo ? 'Uçmak istediğin şehri seç' : 'Parlayan kareye dokun';
    if (legal.some(a => a.type === 'move' || a.type === 'kargo')) return 'Bir yol kartı seç ya da parlayan kareye dokun';
    return has('endTurn') ? 'Hamle kalmadı → Turu Bitir' : has('pass') ? 'Hareket edecek kartın yok: takas dene ya da Pas de' : PHASE.move;
  }
  function renderPill() {
    pillEl.textContent = hint();
    pillEl.classList.toggle('bot', !human() && !asked() && st.phase !== 'over');
  }
  function renderGoal() {
    const hp = viewer != null ? st.players[viewer] : st.players.find(p => !p.bot), t = hp?.task ? CARDS[hp.task] : null;
    goalEl.classList.toggle('win', !!cel);
    goalEl.hidden = !cel && !t;
    goalEl.innerHTML = cel ? `<span class="gt">🎉 ${esc(cel)}</span>`
      : t ? `${img(url(`city-${t.city}`), 'gimg', true)}<span class="gt">Hedef: ${esc(cityName(t.city))} · ${t.value}M</span>` : '';
  }
  function renderHud() {
    const act_ = actorIdx(), many = st.players.length > 4; // 5-6 oyuncu: tüm çipler kompakt, HUD tahtayı yemesin
    chipsEl.classList.toggle('many', many);
    chipsEl.innerHTML = st.players.map((p, i) => {
      const t = p.task ? CARDS[p.task] : null, full = !many && (i === st.active || !p.bot), cur = i === act_ && st.pending;
      const stats = `<span class="ay-stat ay-hc" title="Elinde ${p.hand.length} kart"><i class="ay-mc"></i>${p.hand.length}</span>${badgeHtml(p.badges)}<span class="ay-stat ay-mny">${money(p)}M</span>`;
      if (!full) return `<div class="ay-chip mini ${i === st.active ? 'active' : ''} ${cur ? 'asked' : ''}" data-p="${i}" style="--pc:${p.color}"><div class="r1"><i class="dot"></i><span class="ay-name">${esc(p.name)}</span></div><div class="r2">${stats}</div></div>`;
      return `<div class="ay-chip ${i === st.active ? 'active' : ''} ${cur ? 'asked' : ''}" data-p="${i}" style="--pc:${p.color}">
        <div class="r1"><span class="ay-ring">${esc([...p.name][0]?.toUpperCase() ?? '?')}</span><span class="ay-name">${esc(p.name)}</span></div>
        <div class="r2">${stats}${t
          ? img(cardArt(p.task), 'ay-note', true).replace('alt=""', `alt="Görev" title="Görev: ${esc(cityName(t.city))} ${t.value}M"`) : '<span class="ay-note none">–</span>'}</div></div>`;
    }).join('');
    renderPill(); renderGoal();
  }
  const bump = pIdx => {
    for (const s of ['.ay-bdg', '.ay-mny']) {
      const el = chipsEl.querySelector(`[data-p="${pIdx}"] ${s}`);
      if (el && !reduced()) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', filter: 'brightness(1.5)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
    }
  };

  // ---------- Dock (hand + actions) ----------
  function renderActs() {
    const mine = human(), btn = [];
    if (mine) {
      if (has('undo')) btn.push('<button class="ay-btn sm" data-a="undo" aria-label="Geri Al"><span class="ico">↶</span>Geri Al</button>');
      if (has('drawAhlak')) btn.push(`<button class="ay-btn primary big pulse" data-a="draw">${img(url('ahlak-back'), 'ico', true)}<span>Ahlak Kartı Aç</span></button>`);
      if (has('endTurn')) {
        const moves = legal.some(a => a.type === 'move' || a.type === 'kargo');
        btn.push(`<button class="ay-btn big ${moves ? '' : 'primary pulse'}" data-a="end"><span class="ico">➜</span><span>Turu Bitir</span></button>`);
      }
      if (has('offerTrade')) btn.push(`<button class="ay-btn ${sheet?.kind === 'trade' ? 'sel' : ''}" data-a="trade"><span class="ico">⇄</span>Takas</button>`);
      if (has('openRoad')) btn.push(`<button class="ay-btn ${sheet?.kind === 'road' ? 'sel' : ''}" data-a="road"><span class="ico">🚧</span>Yol Aç</button>`);
      if (has('pass')) btn.push(passAsk
        ? '<span class="ay-ask">Elini at, 6 yeni kart çek, sıra bitsin?</span><button class="ay-btn danger" data-a="pass-yes">Evet, pas</button><button class="ay-btn" data-a="pass-no">Vazgeç</button>'
        : '<button class="ay-btn" data-a="pass"><span class="ico">⏭</span>Pas</button>');
    }
    actsEl.innerHTML = btn.join('');
    actsEl.hidden = !btn.length;
  }

  function renderSub() {
    const mine = human();
    const kargo = mine && selected && CARDS[selected]?.kargo
      ? `<div class="ay-row"><span class="ay-ask">Kargo ile uç:</span>${legal.filter(a => a.type === 'kargo' && kind(a.card) === kind(selected))
        .map(a => `<button class="ay-btn" data-a="kargo" data-city="${a.city}"><span class="ico">✈</span>${esc(cityName(a.city))}</button>`).join('')}</div>` : '';
    subEl.innerHTML = kargo;
    subEl.hidden = !subEl.innerHTML;
  }

  function renderHand() {
    // Gizli el: yalnız telefonu tutan insanın eli çizilir; başkasının eli asla.
    const p = viewer != null ? st.players[viewer] : null, mine = human(), hand = p ? p.hand : [], n = hand.length;
    dockEl.classList.toggle('readonly', !mine);
    dockEl.classList.toggle('closed', !handOpen);
    handleEl.innerHTML = `<span>${p ? `${esc(p.name)} · ${n} kart${mine ? '' : ' (bekle)'}` : 'Eller gizli'}</span><span>${handOpen ? '▾' : '▴'}</span>`;
    const moveOk = new Set(legal.filter(a => a.type === 'move' || a.type === 'kargo').map(a => kind(a.card)));
    const mid = (n - 1) / 2;
    fanEl.style.setProperty('--n', n);
    fanEl.style.setProperty('--step', n > 6 ? .6 : .74); // 7+ cards: overlap more so the fan fits 360px
    const wig = mine && !wiggled && st.phase === 'move';
    fanEl.innerHTML = hand.map((id, i) => cardHtml(id, `${id === selected ? 'sel' : ''} ${mine && st.phase === 'move' && !moveOk.has(kind(id)) ? 'dim' : ''} ${wig && moveOk.has(kind(id)) ? 'wig' : ''}`,
      `data-card="${id}"`, `--i:${i};--r:${((i - mid) * (n > 6 ? 3 : 4.2)).toFixed(1)}deg;--y:${(((i - mid) ** 2) * (n > 6 ? .8 : 1.7)).toFixed(1)}px`)).join('');
  }

  // ---------- Perde: "Telefonu X'e ver" ----------
  function renderCurtain() {
    if (!needCurtain()) { curtainEl.hidden = true; return; }
    const i = actorIdx(), p = st.players[i];
    if (curtainEl.dataset.p === String(i) && !curtainEl.hidden) return;
    curtainEl.dataset.p = i;
    curtainEl.style.setProperty('--pc', p.color);
    curtainEl.innerHTML = `<div class="cu-box"><span class="ay-ring big">${esc([...p.name][0]?.toUpperCase() ?? '?')}</span>
      <h2>Telefonu <b>${esc(p.name)}</b> oyuncusuna ver</h2>
      <p>Başkaları ekrana bakmasın, kartlar gizli kalsın.</p>
      <button class="ay-btn primary big" data-a="ready">Hazırım</button></div>`;
    curtainEl.hidden = false;
  }

  // ---------- Takas / yol açma sayfası (aktif insan) ----------
  const thumbs = cards => cards.map(id => img(cardArt(id), 'ay-th', true)).join('');
  function tradeSheet() {
    const ts = legal.filter(a => a.type === 'offerTrade'), hand = st.players[st.active].hand;
    const kinds = new Set(ts.map(a => kind(a.give)));
    const gives = uniqBy(hand.filter(id => kinds.has(kind(id))), kind);
    const byGive = ts.filter(a => trade.give != null && kind(a.give) === kind(trade.give));
    const players = [...new Set(byGive.map(a => a.withPlayer))];
    const wants = new Set(byGive.filter(a => a.withPlayer === trade.withPlayer).map(a => a.want));
    const full = byGive.find(a => a.withPlayer === trade.withPlayer && a.want === trade.want);
    const step = (n, t) => `<div class="ay-step"><b>${n}</b> ${t}</div>`;
    return `<div class="ay-sheet ay-p ay-compose"><div class="ay-sheethead"><b>⇄ Takas Teklifi</b><button class="ay-btn sm" data-a="sheet-x">Kapat</button></div>
      <div class="ay-sbody">
      ${step(1, 'Vereceğin kart')}
      <div class="ay-picks">${gives.map(id => `<button class="ay-pick ${trade.give != null && kind(id) === kind(trade.give) ? 'sel' : ''}" data-a="tr" data-k="give" data-v="${id}" aria-label="${esc(cardName(id))}">${img(cardArt(id), '', true)}</button>`).join('')}</div>
      ${trade.give != null ? step(2, 'Kiminle takas?') + `<div class="ay-row">${players.map(i => `<button class="ay-btn sm ${trade.withPlayer === i ? 'sel' : ''}" data-a="tr" data-k="withPlayer" data-v="${i}" style="border-color:${pcolor(i)}"><i class="dot" style="background:${st.players[i].color}"></i>${esc(st.players[i].name)}</button>`).join('')}</div>` : ''}
      ${trade.withPlayer != null ? step(3, 'İstediğin kart') + `<div class="ay-wants">${WANTS.map(w => `<button class="ay-want ${trade.want === w ? 'sel' : ''}" data-a="tr" data-k="want" data-v="${w}" ${wants.has(w) ? '' : 'disabled'} style="--c:${wantColor(w)}">${img(wantArt(w), '', true)}<span>${esc(wantName(w))}</span></button>`).join('')}</div>` : ''}
      </div>
      <button class="ay-btn primary big" data-a="tr-go" ${full ? '' : 'disabled'}>Teklif Gönder</button></div>`;
  }
  function roadSheet() {
    const rs = legal.filter(a => a.type === 'openRoad');
    const tiles = [...new Set(rs.map(a => a.tile))];
    if (sheet.tile == null && tiles.length === 1) sheet.tile = tiles[0];
    if (sheet.tile == null) return `<div class="ay-sheet ay-p ay-compose"><div class="ay-sheethead"><b>🚧 Hangi yolu açacaksın?</b><button class="ay-btn sm" data-a="sheet-x">Kapat</button></div>
      <div class="ay-row">${tiles.map(t => `<button class="ay-btn" data-a="road-tile" data-v="${t}" style="border-color:${ILKELER[st.tiles[t].ilke]?.color}">${esc(ILKELER[st.tiles[t].ilke]?.name ?? 'Kare')}</button>`).join('')}</div></div>`;
    const vs = uniqBy(rs.filter(a => a.tile === sheet.tile), a => sig(a.cards)).sort((x, y) => x.cards.length - y.cards.length);
    const il = ILKELER[st.tiles[sheet.tile]?.ilke];
    return `<div class="ay-sheet ay-p ay-compose"><div class="ay-sheethead"><b>🚧 ${esc(il?.name ?? '')} yolunu aç</b><button class="ay-btn sm" data-a="sheet-x">Kapat</button></div>
      <p class="ay-ask">Yolu açmak için <b>4 kart</b> gerekir. Kaç kartını koyacaksın? Eksik kalırsa arkadaşların tamamlayabilir. Her kart = 1 rozet.</p>
      <div class="ay-opts">${vs.map(a => `<button class="ay-opt" data-a="road-go" data-i="${legal.indexOf(a)}"><b>${a.cards.length} kart</b><span class="ths">${thumbs(a.cards)}</span></button>`).join('')}</div></div>`;
  }
  function renderSheet() {
    if (sheet && !(human() && st.phase === 'move' && has(sheet.kind === 'trade' ? 'offerTrade' : 'openRoad'))) sheet = null;
    if (!sheet) { sheetEl.hidden = true; sheetEl.innerHTML = ''; return; }
    const scroll = sheetEl.querySelector('.ay-sbody')?.scrollTop ?? 0;
    sheetEl.innerHTML = sheet.kind === 'trade' ? tradeSheet() : roadSheet();
    sheetEl.hidden = false;
    const b = sheetEl.querySelector('.ay-sbody'); if (b) b.scrollTop = scroll;
  }

  // Gelen takas teklifi: istenen tür + karşılığında verilen kart; kabulde hangi kartı vereceğini seçer.
  function tradeAskHtml() {
    const pd = st.pending, from = st.players[pd.from], acc = uniqBy(legal.filter(a => a.type === 'respondTrade' && a.accept), a => kind(a.card));
    const btns = !acc.length ? '<p class="ay-ask">Elinde istenen kart yok.</p>'
      : acc.length === 1 ? `<button class="ay-btn primary big" data-a="resp" data-i="${legal.indexOf(acc[0])}">Kabul (${esc(cardName(acc[0].card))} ver)</button>`
      : `<div class="ay-ask">Kabul et: hangi kartı vereceksin?</div><div class="ay-opts">${acc.map(a => `<button class="ay-opt" data-a="resp" data-i="${legal.indexOf(a)}"><b>Kabul · ${esc(cardName(a.card))} ver</b><span class="ths">${thumbs([a.card])}</span></button>`).join('')}</div>`;
    const no = legal.findIndex(a => a.type === 'respondTrade' && !a.accept);
    return `<div class="ay-dialog ay-p ask" style="--pc:${from.color}"><h2>⇄ Takas teklifi</h2>
      <p class="ay-line"><b>${esc(from.name)}</b> senden <b style="color:${wantColor(pd.want)}">${esc(wantName(pd.want))}</b> kartı istiyor, karşılığında <b>${esc(cardName(pd.give))}</b> veriyor.</p>
      <div class="ay-swap"><figure>${img(cardArt(pd.give), '', true)}<figcaption>Alacağın</figcaption></figure><span class="arr">⇄</span>
        <figure><span class="wnt" style="--c:${wantColor(pd.want)}">${img(wantArt(pd.want), '', true)}</span><figcaption>İstenen: ${esc(wantName(pd.want))}</figcaption></figure></div>
      ${btns}<button class="ay-btn danger" data-a="resp" data-i="${no}">Reddet</button></div>`;
  }
  // Ortak yol açma: kaç kart katılacak?
  function roadAskHtml() {
    const pd = st.pending, act = st.players[st.active], il = ILKELER[pd.ilke];
    const cs = uniqBy(legal.filter(a => a.type === 'contribute'), a => sig(a.cards)).sort((x, y) => x.cards.length - y.cards.length);
    const have = 4 - pd.need;
    return `<div class="ay-dialog ay-p ask" style="--pc:${act.color}"><h2>🚧 Ortak yol</h2>
      <p class="ay-line"><b>${esc(act.name)}</b> <b style="color:${il?.color}">${esc(il?.name ?? '')}</b> yolunu açıyor, <b>${pd.need} kart eksik</b>. Ortak olmak ister misin? Her kart = 1 rozet.</p>
      <div class="ay-slots">${[0, 1, 2, 3].map(i => `<i class="${i < have ? 'on' : ''}"></i>`).join('')}</div>
      <div class="ay-opts">${cs.map(a => `<button class="ay-opt ${a.cards.length ? '' : 'no'}" data-a="resp" data-i="${legal.indexOf(a)}">${a.cards.length
        ? `<b>${a.cards.length} kart · +${a.cards.length} ${coin}</b><span class="ths">${thumbs(a.cards)}</span>` : '<b>Katılmıyorum</b>'}</button>`).join('')}</div></div>`;
  }

  function renderModal() {
    const p = st.players[st.active];
    if (st.phase === 'over') {
      const sc = st.__score;
      const rows = sc ? sc.map(s => `<div class="ay-score ${s.rank === 1 ? 'win' : ''}" style="--pc:${st.players[s.pIdx].color}">
        <span class="rk">${s.rank === 1 ? '👑' : s.rank}</span><span class="ay-ring">${esc([...st.players[s.pIdx].name][0]?.toUpperCase() ?? '?')}</span>
        <span class="nm">${esc(st.players[s.pIdx].name)}<small>${coin}${s.badges} rozet</small></span>
        <span class="eq">${s.money}M × ${s.mult}</span><b class="tt">${s.total}</b></div>`).join('') : '';
      const ws = sc ? sc.filter(s => s.rank === 1).map(s => st.players[s.pIdx]) : [];
      const wtxt = ws.length > 1 ? `🤝 Berabere — ${ws.length === 2 ? 'ikisi' : 'hepsi'} de kazandı!` : ws[0] ? `🏆 ${esc(ws[0].name)} kazandı!` : '';
      modalEl.innerHTML = `<div class="ay-dialog ay-p over"><h2>Oyun Bitti</h2>${wtxt ? `<div class="ay-winner">${wtxt}</div>` : ''}${ws.length > 1 ? `<div class="ay-ask">${ws.map(w => esc(w.name)).join(' ve ')}</div>` : ''}
        <div class="ay-scores">${rows}</div><div class="ay-ask">Kazanç = para × rozet çarpanı</div>
        <button class="ay-btn primary big" data-a="new">Yeni Oyun</button></div>`;
      modalEl.hidden = false;
    } else if (asked()) {
      modalEl.innerHTML = st.pending.kind === 'trade' ? tradeAskHtml() : roadAskHtml();
      modalEl.hidden = false;
    } else if (human() && has('readText') && p.pendingText) {
      const il = ILKELER[CARDS[p.pendingText].ilke];
      modalEl.innerHTML = `<div class="ay-dialog ay-p read"><div class="ay-readrow">${img(cardArt(p.pendingText), 'ay-readcard', true)}
        <div><h2 style="color:${il.color}">${esc(il.name)}</h2><p class="ay-text">${esc(il.text)}</p></div></div>
        <p class="ay-ask">Yazıyı sesli oku, +1 rozet kazan.</p><button class="ay-btn primary big" data-a="read">Okudum (+1 ${coin})</button></div>`;
      modalEl.hidden = false;
    } else modalEl.hidden = true;
  }

  // ---------- Toasts + log drawer ----------
  function toast(text) {
    log.push(text); log = log.slice(-80);
    const t = document.createElement('div');
    t.className = 'ay-toast'; t.textContent = text;
    toastEl.replaceChildren(t); // one toast at a time, newest wins
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2500);
  }
  function renderDrawer() {
    drawerEl.innerHTML = `<div class="ay-sheet ay-p"><div class="ay-sheethead"><b>Oyun kaydı</b><button class="ay-btn sm" data-a="log">Kapat</button></div>
      <div class="ay-logs">${log.map(t => `<div>${esc(t)}</div>`).reverse().join('') || '<div>Henüz kayıt yok.</div>'}</div></div>`;
  }

  // ---------- Effects ----------
  let rv = null; // active ahlak reveal
  function setSlot(id) {
    lastAhlakId = id;
    slotEl.hidden = !id;
    if (id) { slotEl.innerHTML = img(cardArt(id), '', true); slotEl.classList.toggle('neg', !!CARDS[id].negative); }
  }
  function reveal(id, { flip = true, caption = '' } = {}) {
    rv?.finish(true);
    const c = CARDS[id]; if (!c) return;
    const neg = !!c.negative, rm = reduced();
    const el = document.createElement('div');
    el.className = 'ay-rv';
    el.innerHTML = `<div class="rv-card ay-p ${neg ? 'neg' : ''}"><div class="rv-in">${img(url('ahlak-back'), 'rv-face rv-back', true)}${img(cardArt(id), 'rv-face rv-front', true)}</div></div>
      ${caption ? `<div class="rv-cap">${esc(caption)}</div>` : ''}`;
    fxEl.append(el);
    const card = el.querySelector('.rv-card'), inner = el.querySelector('.rv-in'), timers = [];
    let done = false;
    const finish = instant => {
      if (done) return; done = true; timers.forEach(clearTimeout); rv = null;
      const end = () => { el.remove(); setSlot(id); slotEl.style.visibility = ''; if (!rm) slotEl.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 300 }); };
      if (instant || rm || !flip) return end();
      if (slotEl.hidden) { setSlot(id); slotEl.style.visibility = 'hidden'; }
      const a = card.getBoundingClientRect(), b = slotEl.getBoundingClientRect(), s = (b.width || 40) / a.width;
      const dx = center(b).x - center(a).x, dy = center(b).y - center(a).y;
      el.querySelector('.rv-cap')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
      card.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .9 }], { duration: 450, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).onfinish = end;
    };
    rv = { finish };
    card.addEventListener('click', () => finish(false));
    if (!flip || rm) {
      inner.style.transform = 'none';
      if (neg && !rm) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 400 });
      timers.push(setTimeout(() => finish(false), flip ? 1600 : 1800));
      return;
    }
    card.animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 250, easing: 'ease-out', fill: 'backwards' });
    inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 600, delay: 250, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' })
      .onfinish = () => {
        if (done) return;
        if (neg) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px) rotate(-2deg)' }, { transform: 'translateX(12px) rotate(2deg)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 450 });
        timers.push(setTimeout(() => finish(false), 1000));
      };
  }

  function tradeFx(ev, delay) {
    const c = CARDS[ev.card]; if (!c) return;
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'ay-tr';
      el.innerHTML = `${img(cardArt(ev.card), 'tr-note', true)}<div class="tr-txt">+${ev.value ?? c.value} Milyon Lira</div>`;
      fxEl.append(el);
      if (reduced()) return setTimeout(() => { el.remove(); bump(ev.pIdx); }, 1400);
      el.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, easing: 'ease-out', fill: 'both' }).onfinish = () => {
        setTimeout(() => {
          const chip = chipsEl.querySelector(`[data-p="${ev.pIdx}"]`) ?? chipsEl;
          const a = el.getBoundingClientRect(), b = chip.getBoundingClientRect();
          el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${center(b).x - center(a).x}px,${center(b).y - center(a).y}px) scale(.12)`, opacity: .6 }],
            { duration: 550, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' }).onfinish = () => { el.remove(); bump(ev.pIdx); };
        }, 800);
      };
    }, delay);
  }

  function flyCoins(pt, pIdx, n = 1) {
    const o = origin(), chip = chipsEl.querySelector(`[data-p="${pIdx}"] .ay-bdg`) ?? chipsEl;
    if (reduced()) return setTimeout(() => bump(pIdx), 100);
    const t = center(chip.getBoundingClientRect());
    const sx = pt.x - o.left, sy = pt.y - o.top, dx = t.x - pt.x, dy = t.y - pt.y;
    n = Math.max(1, Math.min(n, 8));
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'ay-coin fly'; c.style.left = `${sx - 9}px`; c.style.top = `${sy - 9}px`;
      fxEl.append(c);
      const bow = (i % 2 ? 1 : -1) * (30 + i * 6);
      c.animate([
        { transform: 'translate(0,0) scale(.6)', opacity: 0 },
        { transform: `translate(${dx * .15}px,${-50}px) scale(1.2)`, opacity: 1, offset: .25 },
        { transform: `translate(${dx * .5 + bow}px,${dy * .45 - 70}px) scale(1)`, offset: .6 },
        { transform: `translate(${dx}px,${dy}px) scale(.7)`, opacity: .9 }],
        { duration: 750, delay: i * 80, easing: 'cubic-bezier(.4,.1,.4,1)', fill: 'both' })
        .onfinish = () => { c.remove(); if (i === n - 1) bump(pIdx); };
    }
  }

  // ---------- Events ----------
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a],[data-card]');
    if (!t || !st) return;
    if (t.dataset.card) {
      if (!human()) return;
      selected = selected === t.dataset.card ? null : t.dataset.card;
      passAsk = false;
      fanEl.querySelectorAll('.ay-card').forEach(b => b.classList.toggle('sel', b.dataset.card === selected));
      if (selected) wiggled = true;
      fanEl.querySelectorAll('.wig').forEach(b => b.classList.remove('wig'));
      renderPill(); renderSub(); renderActs(); highlight(); tut.update(st, legal, [], tutEls); return;
    }
    const a = t.dataset.a, redo = () => { renderActs(); renderSub(); highlight(); };
    if (a === 'draw') act({ type: 'drawAhlak' });
    else if (a === 'undo') act({ type: 'undo' });
    else if (a === 'end') act({ type: 'endTurn' });
    else if (a === 'read') act({ type: 'readText' });
    else if (a === 'new') act({ type: 'newGame' });
    else if (a === 'pass') { passAsk = true; redo(); }
    else if (a === 'pass-no') { passAsk = false; redo(); }
    else if (a === 'pass-yes') act({ type: 'pass' });
    else if (a === 'kargo') act({ type: 'kargo', card: selected, city: t.dataset.city });
    else if (a === 'trade') { sheet = sheet?.kind === 'trade' ? null : { kind: 'trade' }; trade = {}; selected = null; renderAll(); }
    else if (a === 'road') { sheet = sheet?.kind === 'road' ? null : { kind: 'road', tile: null }; selected = null; renderAll(); }
    else if (a === 'sheet-x') { sheet = null; renderAll(); }
    else if (a === 'road-tile') { sheet.tile = +t.dataset.v; renderAll(); }
    else if (a === 'road-go') act(legal[+t.dataset.i]);
    else if (a === 'resp') act(legal[+t.dataset.i]);
    else if (a === 'ready') { viewer = actorIdx(); renderAll(); tut.update(st, legal, [], tutEls); }
    else if (a === 'fold') { handOpen = !handOpen; dockEl.classList.toggle('closed', !handOpen); renderHand(); setTimeout(measure, 350); }
    else if (a === 'help') tut.openHelp();
    else if (a === 'log') { drawerEl.hidden = !drawerEl.hidden; if (!drawerEl.hidden) renderDrawer(); }
    else if (a === 'slot') { if (lastAhlakId) reveal(lastAhlakId, { flip: false }); }
    else if (a === 'tr') {
      const k = t.dataset.k, raw = t.dataset.v, v = k === 'withPlayer' ? +raw : raw;
      trade = k === 'give' ? { give: raw } : k === 'withPlayer' ? { give: trade.give, withPlayer: v } : { ...trade, want: v };
      renderAll();
    } else if (a === 'tr-go') {
      const x = legal.find(l => l.type === 'offerTrade' && kind(l.give) === kind(trade.give) && l.withPlayer === trade.withPlayer && l.want === trade.want);
      if (x) act(x);
    }
  });
  drawerEl.addEventListener('click', e => { if (e.target === drawerEl) drawerEl.hidden = true; });
  sheetEl.addEventListener('click', e => { if (e.target === sheetEl) { sheet = null; renderAll(); } });

  function renderAll() {
    renderSheet(); renderHud(); renderHand(); renderActs(); renderSub(); renderModal(); renderCurtain(); highlight();
    if (!drawerEl.hidden) renderDrawer();
    measure();
  }
  const nm = i => st.players[i]?.name ?? '?';
  // Event -> toast metni (null = toast yok, yalnız kayıt). Modal/perde zaten gösteriyorsa tekrar etme.
  function evText(ev) {
    const human_ = i => !st.players[i]?.bot;
    if (ev.type === 'badgePlaced') return null;
    if (ev.type === 'refill') return human_(ev.pIdx) && ev.n > 0 ? (humans() > 1 ? `${nm(ev.pIdx)} eli 6 karta tamamlandı (+${ev.n})` : `Elin 6 karta tamamlandı (+${ev.n})`) : null;
    if (ev.type === 'tradeDeclined') return `${nm(ev.pIdx)} takası kabul etmedi`;
    if (ev.type === 'tradeOffer') return human_(ev.to) ? null : (ev.text ?? `${nm(ev.from)}, ${nm(ev.to)} ile takas teklif etti`);
    if (ev.type === 'roadAsk') return human_(ev.ask) ? null : (ev.text ?? `${nm(ev.ask)} yola katılmak ister mi?`);
    if (ev.type === 'roadFailed') return 'Yol açılamadı: kart eksik kaldı, kimse kart kaybetmedi';
    return ev.text || null;
  }

  // ---------- Layout report ----------
  let last = { top: -9, bottom: -9, right: -9 };
  function measure() {
    if (!onLayout || !st) return;
    const H = innerHeight, top = Math.round(hudEl.getBoundingClientRect().bottom);
    let bottom = 0, right = 0;
    if (innerWidth > 900) right = Math.round(dockEl.getBoundingClientRect().width);
    else {
      let t = H;
      for (const el of [handleEl, subEl, actsEl, fanEl]) if (!el.hidden && el.offsetParent !== null) t = Math.min(t, el.getBoundingClientRect().top + (el === fanEl ? 20 : 0));
      bottom = Math.round(Math.max(0, H - t));
    }
    const v = { top, bottom, right };
    if (Math.abs(v.top - last.top) >= 2 || Math.abs(v.bottom - last.bottom) >= 2 || Math.abs(v.right - last.right) >= 2) { last = v; onLayout(v); }
  }
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(measure);
    [hudEl, dockEl, handleEl, subEl, actsEl, fanEl].forEach(e => ro.observe(e));
  }
  addEventListener('resize', measure);

  return {
    render(state, legalActions = [], events = []) {
      st = state; legal = legalActions;
      if (st.seed !== seed) {
        seed = st.seed; wiggled = false; cel = ''; viewer = null; sheet = null; trade = {};
        rv?.finish(true); setSlot(null); // finish writes the old card to the slot, so clear after
        log = []; lastActive = -1; lastHl = ''; handOpen = true; selected = null; passAsk = false;
        clearTimeout(celebrate); clearTimeout(toastTimer);
        toastEl.replaceChildren(); fxEl.replaceChildren(); drawerEl.hidden = true;
      }
      // Tek insan varsa telefon hep onda; çok insanda perde kalkınca viewer atanır.
      const hs = st.players.map((p, i) => p.bot ? -1 : i).filter(i => i >= 0);
      if (hs.length === 1) viewer = hs[0];
      else if (viewer != null && st.players[viewer]?.bot) viewer = null;
      if (st.active !== lastActive) { lastActive = st.active; selected = null; passAsk = false; sheet = null; trade = {}; }
      if (selected && (st.phase !== 'move' || !st.players[viewer ?? -1]?.hand.includes(selected))) selected = null;
      let k = 0;
      for (const ev of events) {
        { const tx = evText(ev); if (tx) toast(tx); else if (ev.text && ev.type !== 'badgePlaced') log.push(ev.text); }
        if (ev.type === 'ahlak') {
          const id = ev.empty ? null : (ev.card || st.decks?.ahlakDiscard?.at(-1));
          if (id) reveal(id, { caption: ev.text });
        } else if (ev.type === 'trade') {
          tradeFx(ev, 300 + 1500 * k++);
          if (!st.players[ev.pIdx]?.bot) {
            cel = `Ticaret tamam! +${ev.value ?? CARDS[ev.card]?.value ?? ''}M`;
            clearTimeout(celebrate); celebrate = setTimeout(() => { cel = ''; if (st) renderGoal(); measure(); }, 2800);
          }
        }
      }
      renderAll();
      tut.update(st, legal, events, tutEls);
    },
    tutorial: tut,
    // Board tap forwarded by integrator. Returns true if it triggered an action.
    tapTile(idx) {
      if (!st || !human() || sheet) return false;
      let a;
      if (st.phase === 'close') a = legal.find(l => l.type === 'closeTile' && l.tile === idx);
      else if (st.phase === 'move') {
        if (st.tiles[idx]?.closed) {
          if (!legal.some(l => l.type === 'openRoad' && l.tile === idx)) return false;
          sheet = { kind: 'road', tile: idx }; trade = {}; selected = null; renderAll(); return true;
        } else if (selected) {
          a = legal.find(l => l.type === 'move' && kind(l.card) === kind(selected) && l.tile === idx);
          if (a) a = { ...a, card: selected };
        } else { // tile-first: pick the card for the child (plain ilke > text card > joker)
          const hand = st.players[viewer].hand;
          const opts = legal.filter(l => l.type === 'move' && l.tile === idx)
            .map(l => ({ l, id: hand.find(h => kind(h) === kind(l.card)) })).filter(o => o.id).sort((x, y) => rank(x.id) - rank(y.id));
          if (opts[0]) a = { ...opts[0].l, card: opts[0].id };
        }
      }
      if (!a) return false;
      act(a); return true;
    },
    setLoading(p) {
      p = Math.max(0, Math.min(1, +p || 0));
      if (!loadEl) {
        if (p >= 1) return;
        loadEl = document.createElement('div');
        loadEl.className = 'ay-loading ay-p';
        loadEl.innerHTML = `${img(url('board'), 'ay-bgimg', true)}<div class="ay-lbox">${img(url('logo'), 'ay-logo', true)}<div class="ay-bar"><i></i></div><small>Yükleniyor… %0</small></div>`;
        root.append(loadEl);
      }
      loadEl.classList.remove('hide');
      loadEl.querySelector('.ay-bar i').style.width = `${p * 100}%`;
      loadEl.querySelector('small').textContent = `Yükleniyor… %${Math.round(p * 100)}`;
      if (p >= 1) {
        const el = loadEl; loadEl = null;
        el.classList.add('hide'); setTimeout(() => el.remove(), 500);
      }
    },
    flyCoins,
    showStart(onStart) {
      startEl?.remove();
      startEl = document.createElement('div');
      startEl.className = 'ay-start ay-p';
      let n = 2, first = 0;
      const rows = Array.from({ length: 6 }, (_, i) => `<div class="ay-prow" data-i="${i}" style="--pc:${pcolor(i)}" ${i >= n ? 'hidden' : ''}>
        <span class="ay-ring">${i + 1}</span><input class="ay-input" maxlength="16" value="${i ? `Bot ${i}` : 'Sen'}" autocomplete="off" aria-label="${i + 1}. oyuncunun adı">
        <div class="ay-seg" role="group" aria-label="İnsan mı bot mu"><button type="button" data-h="1" class="${i ? '' : 'sel'}">İnsan</button><button type="button" data-h="0" class="${i ? 'sel' : ''}">Bot</button></div></div>`).join('');
      startEl.innerHTML = `${img(url('board'), 'ay-bgimg', true)}<div class="ay-sbox">
        ${img(url('logo'), 'ay-logo', true)}
        <div class="ay-field">Oyuncu sayısı</div>
        <div class="ay-toggles five">${[2, 3, 4, 5, 6].map(k => `<button class="ay-tg ${k === n ? 'sel' : ''}" data-n="${k}"><b>${k}</b><small>kişi</small></button>`).join('')}</div>
        <div class="ay-players">${rows}</div>
        <div class="ay-field">İlk kim başlar? <small>(yaşı en küçük)</small></div>
        <div class="ay-starters"></div>
        <div class="ay-warn" hidden>En az bir insan oyuncu olmalı.</div>
        <button class="ay-btn primary big go" data-go>Oyuna Başla</button>
        <div class="ay-how"><h3>Nasıl oynanır?</h3>
          <div class="ay-car">${SLIDES.map(s => `<div class="ay-slide"><b>${s.t}</b><div class="imgs">${s.imgs.map(f => img(url(f), '', true)).join('')}</div><p>${s.p}</p></div>`).join('')}</div>
          <div class="ay-dots">${SLIDES.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div></div>`;
      const car = startEl.querySelector('.ay-car'), dots = [...startEl.querySelectorAll('.ay-dots i')];
      car.addEventListener('scroll', () => { const i = Math.round(car.scrollLeft / car.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
      const prow = i => startEl.querySelector(`.ay-prow[data-i="${i}"]`);
      const isBot = i => prow(i).querySelector('[data-h="0"]').classList.contains('sel');
      const nameOf = i => prow(i).querySelector('input').value.trim() || (isBot(i) ? `Bot ${i}` : `Oyuncu ${i + 1}`);
      const paint = () => {
        if (first >= n) first = 0;
        startEl.querySelector('.ay-starters').innerHTML = Array.from({ length: n }, (_, i) =>
          `<button type="button" class="ay-st ${i === first ? 'sel' : ''}" data-s="${i}" style="--pc:${pcolor(i)}"><i class="dot"></i>${esc(nameOf(i))}</button>`).join('');
        const ok = Array.from({ length: n }, (_, i) => i).some(i => !isBot(i));
        startEl.querySelector('.ay-warn').hidden = ok;
        startEl.querySelector('[data-go]').disabled = !ok;
      };
      startEl.addEventListener('input', paint);
      startEl.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.n) {
          n = +b.dataset.n;
          startEl.querySelectorAll('[data-n]').forEach(x => x.classList.toggle('sel', x === b));
          for (let i = 0; i < 6; i++) prow(i).hidden = i >= n;
          paint();
        } else if (b.dataset.h) {
          const row = b.closest('.ay-prow'), i = +row.dataset.i, input = row.querySelector('input'), bot = b.dataset.h === '0';
          row.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('sel', x === b));
          if (bot && /^Oyuncu \d+$/.test(input.value)) input.value = `Bot ${i}`;
          else if (!bot && /^Bot \d+$/.test(input.value)) input.value = `Oyuncu ${i + 1}`;
          paint();
        } else if (b.dataset.s) { first = +b.dataset.s; paint(); }
        else if (b.hasAttribute('data-go')) {
          const players = Array.from({ length: n }, (_, i) => ({ name: nameOf(i), bot: isBot(i) }));
          startEl.remove(); startEl = null;
          // Preload: 7 ilke yol cards + card backs.
          for (const f of [...ILKE_IDS.map(i => `yol-${i}`), 'yol-back', 'ahlak-back', 'ticaret-back']) new Image().src = url(f);
          onStart({ players, startIdx: first });
        }
      });
      paint();
      root.appendChild(startEl);
    },
  };
}
