import { ILKELER, CARDS, CITIES } from './data.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PHASE = { ahlak: 'Ahlak kartı aç', close: 'Kapatılacak kare seç', move: 'Piyonunu ilerlet', over: 'Oyun bitti' };
const money = p => p.trades.reduce((s, id) => s + CARDS[id].value, 0);
const cityName = id => CITIES[id]?.name ?? id;
// Engine dedupes identical cards in legalActions; compare cards by kind, not id.
const kind = id => { const c = CARDS[id]; return c?.joker ? "J" : c?.kargo ? "K" : `${c?.ilke}${c?.hasText ? "T" : ""}`; };

function cardView(id) {
  const c = CARDS[id];
  if (c?.joker) return { cls: 'joker', name: 'Ahi Evran', sub: 'Joker', bg: 'linear-gradient(160deg,#ffd75e,#c9971c)', fg: '#2b2000' };
  if (c?.kargo) return { cls: 'kargo', name: 'Kargo', sub: '✈', bg: 'linear-gradient(160deg,#7fd4ff,#2f9fd8)', fg: '#05212f' };
  const il = ILKELER[c?.ilke];
  return { cls: '', name: il?.name ?? id, sub: '', bg: il?.color ?? '#555', fg: '#fff' };
}
const cardHtml = (id, extra = '', attrs = '') => {
  const v = cardView(id);
  return `<button class="ay-card ${v.cls} ${extra}" ${attrs} style="background:${v.bg};color:${v.fg}"><b>${esc(v.name)}</b>${v.sub ? `<i>${v.sub}</i>` : ''}${CARDS[id]?.hasText ? '<span class="ay-scroll">📜</span>' : ''}</button>`;
};
const ilkeOrCard = w => ILKELER[w]?.name ?? (CARDS[w] ? cardView(w).name : w);

export function createUI(root, { onAction, onTileHighlight }) {
  root.classList.add('ay-root');
  root.innerHTML = `<div class="ay-top ay-panel"></div><div class="ay-info"></div>
    <div class="ay-hand ay-panel"></div><div class="ay-modal" hidden></div>`;
  const [topEl, infoEl, handEl, modalEl] = root.children;

  let st = null, legal = [], selected = null, passAsk = false, tradeOpen = false, trade = {};
  let log = [], lastAhlak = null, lastActive = -1, startEl = null, handOpen = true;
  let lastHl = '';

  const act = a => { passAsk = false; tradeOpen = false; trade = {}; selected = null; onAction(a); };
  const has = t => legal.some(a => a.type === t);
  const human = () => st && !st.players[st.active].bot;

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

  function renderTop() {
    const chips = st.players.map((p, i) => {
      const task = p.task ? cityName(CARDS[p.task].city) : '-';
      return `<div class="ay-chip ${i === st.active ? 'active' : ''}"><span class="ay-dot" style="background:${p.color}"></span>
        <span class="ay-name">${esc(p.name)}</span><span>🏅${p.badges}</span><span>${money(p)}M</span><span class="ay-task">📍${esc(task)}</span></div>`;
    }).join('');
    topEl.innerHTML = `<div class="ay-chips">${chips}</div><div class="ay-phase">${PHASE[st.phase] ?? st.phase}</div>`;
  }

  function renderInfo() {
    infoEl.innerHTML = (lastAhlak ? `<div class="ay-banner ay-panel">🎴 ${esc(lastAhlak)}</div>` : '') +
      (log.length ? `<div class="ay-log ay-panel">${log.map(t => `<div>${esc(t)}</div>`).join('')}</div>` : '');
    const l = infoEl.querySelector('.ay-log'); if (l) l.scrollTop = l.scrollHeight;
  }

  function renderHand() {
    const p = st.players[st.active], mine = human(), btn = [];
    if (mine) {
      if (has('drawAhlak')) btn.push('<button class="ay-btn primary" data-a="draw">Ahlak Kartı Aç</button>');
      if (has('endTurn')) btn.push('<button class="ay-btn primary" data-a="end">Turu Bitir</button>');
      if (has('trade')) btn.push('<button class="ay-btn" data-a="trade">Takas</button>');
      if (has('pass')) btn.push(passAsk
        ? '<span class="ay-ask">Elini at, sıra bitsin?</span><button class="ay-btn danger" data-a="pass-yes">Evet, pas</button><button class="ay-btn" data-a="pass-no">Vazgeç</button>'
        : '<button class="ay-btn" data-a="pass">Pas</button>');
    }
    const kargo = mine && selected && CARDS[selected]?.kargo
      ? `<div class="ay-row"><span class="ay-ask">Kargo ile uç:</span>${legal.filter(a => a.type === 'kargo' && kind(a.card) === kind(selected))
        .map(a => `<button class="ay-btn" data-a="kargo" data-city="${a.city}">✈ ${esc(cityName(a.city))}</button>`).join('')}</div>` : '';
    const moveOk = new Set(legal.filter(a => a.type === 'move' || a.type === 'kargo').map(a => kind(a.card)));
    const cards = p.hand.map(id => cardHtml(id, `${id === selected ? 'sel' : ''} ${mine && !moveOk.has(kind(id)) ? 'dim' : ''}`, `data-card="${id}"`)).join('');
    handEl.className = `ay-hand ay-panel ${mine ? '' : 'readonly'} ${handOpen ? '' : 'closed'}`;
    handEl.innerHTML = `<div class="ay-handle" data-a="fold"><span>${esc(p.name)}${mine ? '' : ' (bot, salt okunur)'} · ${p.hand.length} kart</span><span>${handOpen ? '▾' : '▴'}</span></div>
      <div class="ay-body"><div class="ay-row">${btn.join('')}</div>${kargo}${mine && tradeOpen ? tradeHtml() : ''}<div class="ay-cards">${cards}</div></div>`;
  }

  function tradeHtml() {
    const ts = legal.filter(a => a.type === 'trade');
    const uniq = (arr, f) => [...new Set(arr.map(f))];
    const sub = k => ts.filter(a => (trade.withPlayer == null || k === 'withPlayer' || a.withPlayer === trade.withPlayer) &&
      (trade.give == null || k !== 'want' || a.give === trade.give));
    const row = (label, k, vals, fmt) => `<div class="ay-row"><span class="ay-ask">${label}</span>${vals.map(v =>
      `<button class="ay-btn ${trade[k] === v ? 'sel' : ''}" data-a="tr" data-k="${k}" data-v="${esc(v)}">${fmt(v)}</button>`).join('')}</div>`;
    const full = ts.find(a => a.withPlayer === trade.withPlayer && a.give === trade.give && a.want === trade.want);
    return `<div class="ay-trade">${row('Oyuncu:', 'withPlayer', uniq(ts, a => a.withPlayer), v => esc(st.players[v].name))}
      ${trade.withPlayer != null ? row('Verdiğin:', 'give', uniq(sub('give'), a => a.give), v => esc(ilkeOrCard(v))) : ''}
      ${trade.give != null ? row('İstediğin:', 'want', uniq(sub('want'), a => a.want), v => esc(ilkeOrCard(v))) : ''}
      <div class="ay-row"><button class="ay-btn primary" data-a="tr-go" ${full ? '' : 'disabled'}>Takas Et</button><button class="ay-btn" data-a="trade">Kapat</button></div></div>`;
  }

  function renderModal() {
    const p = st.players[st.active];
    if (st.phase === 'over') {
      const sc = st.__score;
      const rows = sc ? sc.map(s => `<tr><td>${s.rank}</td><td>${esc(st.players[s.pIdx].name)}</td><td>${s.money}M</td><td>${s.badges}</td><td>×${s.mult}</td><td><b>${s.total}</b></td></tr>`).join('') : '';
      modalEl.innerHTML = `<div class="ay-dialog ay-panel"><h2>Oyun bitti</h2>${sc
        ? `<div class="ay-scroll-x"><table><tr><th>#</th><th>Oyuncu</th><th>Para</th><th>🏅</th><th>Çarpan</th><th>Kazanç</th></tr>${rows}</table></div>` : ''}
        <button class="ay-btn primary" data-a="new">Yeni Oyun</button></div>`;
      modalEl.hidden = false;
    } else if (has('readText') && p.pendingText) {
      const il = ILKELER[CARDS[p.pendingText].ilke];
      modalEl.innerHTML = `<div class="ay-dialog ay-panel"><h2 style="color:${il.color}">${esc(il.name)}</h2><p class="ay-text">${esc(il.text)}</p>
        <p class="ay-ask">Yazıyı sesli oku.</p><button class="ay-btn primary" data-a="read">Okudum (+1 🏅)</button></div>`;
      modalEl.hidden = false;
    } else modalEl.hidden = true;
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('[data-a],[data-card]');
    if (!t || !st) return;
    if (t.dataset.card) {
      if (!human()) return;
      selected = selected === t.dataset.card ? null : t.dataset.card;
      passAsk = false; renderHand(); highlight(); return;
    }
    const a = t.dataset.a, redo = () => { renderHand(); highlight(); };
    if (a === 'draw') act({ type: 'drawAhlak' });
    else if (a === 'end') act({ type: 'endTurn' });
    else if (a === 'read') act({ type: 'readText' });
    else if (a === 'new') act({ type: 'newGame' });
    else if (a === 'pass') { passAsk = true; redo(); }
    else if (a === 'pass-no') { passAsk = false; redo(); }
    else if (a === 'pass-yes') act({ type: 'pass' });
    else if (a === 'kargo') act({ type: 'kargo', card: selected, city: t.dataset.city });
    else if (a === 'trade') { tradeOpen = !tradeOpen; trade = {}; redo(); }
    else if (a === 'fold') { handOpen = !handOpen; redo(); }
    else if (a === 'tr') {
      const k = t.dataset.k, raw = t.dataset.v, v = k === 'withPlayer' ? +raw : raw;
      trade = k === 'withPlayer' ? { withPlayer: v } : k === 'give' ? { withPlayer: trade.withPlayer, give: v } : { ...trade, want: v };
      redo();
    } else if (a === 'tr-go') {
      const x = legal.find(l => l.type === 'trade' && l.withPlayer === trade.withPlayer && l.give === trade.give && l.want === trade.want);
      if (x) act(x);
    }
  });

  return {
    render(state, legalActions = [], events = []) {
      st = state; legal = legalActions;
      if (st.active !== lastActive) { lastActive = st.active; selected = null; passAsk = false; tradeOpen = false; trade = {}; }
      if (selected && (st.phase !== 'move' || !st.players[st.active].hand.includes(selected))) selected = null;
      for (const ev of events) {
        if (ev.text) log.push(ev.text);
        if (ev.type === 'ahlak') lastAhlak = ev.text;
      }
      log = log.slice(-6);
      renderTop(); renderInfo(); renderHand(); renderModal(); highlight();
    },
    // Board tap forwarded by integrator. Returns true if it triggered an action.
    tapTile(idx) {
      if (!st || !human()) return false;
      const a = st.phase === 'close' ? legal.find(l => l.type === 'closeTile' && l.tile === idx)
        : st.phase === 'move' ? (st.tiles[idx]?.closed
          ? legal.find(l => l.type === 'openRoad' && l.tile === idx)
          : selected && legal.find(l => l.type === 'move' && kind(l.card) === kind(selected) && l.tile === idx)) : null;
      if (!a) return false;
      act(a.type === 'move' ? { ...a, card: selected } : a); return true;
    },
    showStart(onStart) {
      startEl?.remove();
      startEl = document.createElement('div');
      startEl.className = 'ay-modal';
      let n = 2;
      startEl.innerHTML = `<div class="ay-dialog ay-panel"><h2>Ahilik Yolu</h2>
        <label class="ay-ask">Adın<input class="ay-input" maxlength="16" value="Sen"></label>
        <div class="ay-ask">Oyuncu sayısı (sen + botlar)</div>
        <div class="ay-row">${[2, 3, 4].map(k => `<button class="ay-btn ${k === n ? 'sel' : ''}" data-n="${k}">${k}</button>`).join('')}</div>
        <button class="ay-btn primary" data-go>Başla</button></div>`;
      startEl.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.n) { n = +b.dataset.n; startEl.querySelectorAll('[data-n]').forEach(x => x.classList.toggle('sel', x === b)); }
        else if (b.hasAttribute('data-go')) {
          const name = startEl.querySelector('input').value.trim() || 'Sen';
          const players = [{ name, bot: false }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `Bot ${i + 1}`, bot: true }))];
          startEl.remove(); startEl = null; onStart({ players });
        }
      });
      root.appendChild(startEl);
    },
  };
}
