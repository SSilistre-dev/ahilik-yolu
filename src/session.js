// Session arayüzü (SPEC v5 / ARCHITECTURE §4): UI ve sahne motora ya da ağa değil buraya konuşur.
//   session = { mode, you, act(action), onUpdate(cb), undo?(), leave() }
//   cb({ view, legal, events, meta }) — view: gizli alanları boşaltılmış state (viewFor).
// Saf modül: DOM/three yok. Zamanlayıcı, bekleme kancaları ve ağ dışarıdan verilir.
import * as G from './game.js';
import { safeBotAction, fallbackAction } from './botstep.js';
import { viewFor } from './view.js';

const { newGame, legalActions, apply, score } = G;
const actor = G.actor || (s => s.active); // SPEC v4 actor(); eski motorda yok -> active.
const BOT_MIN_GAP = 150; // hızlandırmada animasyonlar okunabilir kalsın

// Yerel oyun (Botlarla Oyna / Aynı Telefonda): motor, bot zamanlayıcısı ve geri alma burada.
// opts: newGame girdisi ({players, startIdx, seed?}); seed yoksa rastgele.
// clock: createBotClock(); delays(): {bot, ahlak} ms; whenIdle(): Promise (sahne boşalınca);
// backlog(): ms (UI anlatım kuyruğu); botAct(events, who, view): UI bot adımı anlatımı (render'dan önce).
// fatal(e): bot üst üste 3 kez patlarsa. now: saat (test).
export function createLocalSession({ opts, clock, delays, whenIdle = () => Promise.resolve(), backlog = () => 0, botAct, fatal, now = Date.now, rand = Math.random }) {
  const seed = opts.seed ?? (rand() * 2 ** 32) >>> 0;
  let state = newGame({ ...opts, seed });
  const levels = (opts.players ?? []).map(p => p.level ?? 'medium'); // koltuk -> 'easy'|'medium'|'hard'
  let cb = null, undoStack = [], botFails = 0, botSeq = 0, lastBotAct = 0, seat = null, dead = false;

  const humans = () => state.players.map((p, i) => (p.bot ? -1 : i)).filter(i => i >= 0);
  // Telefonda eli görünen insan: karar veren insansa o; bot sırasındaysa son bakan (tek insanda hep o).
  function viewSeat() {
    const a = actor(state);
    if (!state.players[a].bot) seat = a;
    else if (seat == null || state.players[seat]?.bot) seat = humans()[0] ?? null;
    return seat;
  }

  const botNext = () => step(safeBotAction(state, levels[actor(state)] ?? 'medium', 'local'), true);

  function emit(events, botSeat) {
    clock.cancel(); botSeq++;
    const legal = legalActions(state);
    const p = state.players[state.active], who = state.players[actor(state)];
    if (undoStack.length && state.phase === 'move' && !state.pending && !p.bot) legal.push({ type: 'undo' });
    const view = viewFor(state, viewSeat(), String(seed));
    if (state.phase === 'over') view.__score = score(state);
    if (botSeat != null) botAct?.(events, botSeat, view); // render'dan ÖNCE; view henüz sonuç, aksiyonu yapan koltuk botSeat
    cb?.({ view, legal, events, meta: { conn: 'ok', deadline: null, seats: null, botSeat: botSeat ?? null } });
    if (dead) return;
    if (state.phase !== 'over' && who.bot) {
      const d = delays(); // ahlak sonrası reveal animasyonu görünsün diye uzun
      // Yürüyen piyon durmadan ve UI kuyruğundaki adımlar (ahlak/ticaret animasyonu dahil) bitmeden sıradaki bot aksiyonu başlamaz.
      const ms = events.some(e => e.type === 'ahlak' && !e.empty) ? d.ahlak : d.bot, mine = ++botSeq;
      whenIdle().then(() => { if (mine === botSeq && !dead) clock.schedule(botNext, Math.max(ms, backlog())); });
    }
  }

  function step(action, isBot) {
    if (dead) return;
    let res;
    try {
      res = apply(state, action);
    } catch (e) {
      console.error(e);
      if (isBot) {
        if (++botFails >= 3) return fatal?.(e);
        clock.schedule(() => { const a = fallbackAction(legalActions(state)); if (a) step(a, true); }, 300);
      }
      return;
    }
    if (isBot) { botFails = 0; lastBotAct = now(); }
    const by = actor(state); // aksiyonu yapan koltuk (state henüz eski)
    if (isBot || action.type !== 'move') undoStack = [];
    else if (res.events.some(e => e.type === 'trade')) undoStack = [];
    else undoStack.push(state);
    state = res.state;
    emit(res.events, isBot ? by : null);
  }

  const undo = () => {
    if (dead || !undoStack.length) return false;
    state = undoStack.pop();
    emit([]);
    return true;
  };

  return {
    mode: 'local',
    you: null,
    onUpdate(f) { cb = f; },
    start() { emit([]); },
    act(a) { return a.type === 'undo' ? undo() : step(a, false); },
    undo,
    // Bot sırasında dokununca sıradaki bot aksiyonu hemen gelir.
    skipWait() {
      if (dead || !clock.pending || !state.players[actor(state)].bot) return false;
      clock.schedule(botNext, Math.max(0, BOT_MIN_GAP - (now() - lastBotAct)));
      return true;
    },
    leave() { dead = true; botSeq++; clock.cancel(); },
    get state() { return state; }, // hata ayıklama (__ahilik.state)
  };
}

// Çevrimiçi oyun: sunucu otoriterdir, istemci yalnız view görür. net: createNet(); now: istemci saati.
export function createOnlineSession({ net, now = Date.now }) {
  let you = null, cb = null, lobbyCb = null, errorCb = null, last = null, version = null, conn = net.conn;
  const send = (t, f) => net.send(t, f);

  const offs = [
    net.on('welcome', m => { you = m.you.seat; }),
    net.on('lobby', m => lobbyCb?.(m)),
    net.on('error', m => errorCb?.(m)),
    net.on('game', m => {
      version = m.version;
      const view = { ...m.view, you };
      if (view.phase === 'over') view.__score = score(view);
      const skew = typeof m.now === 'number' ? m.now - now() : 0; // sunucu - istemci saati
      last = { view, legal: m.legal ?? [], events: m.events ?? [], meta: { conn, deadline: m.deadline == null ? null : m.deadline - skew, skew, seats: m.seats, rematch: m.rematch ?? null, version: m.version, gameId: m.gameId } };
      cb?.(last);
    }),
    net.on('conn', m => { // bağlantı durumu değişince son görüntü yeni meta ile yeniden yayılır
      conn = m.conn;
      if (last) { last = { ...last, events: [], meta: { ...last.meta, conn } }; cb?.(last); }
    }),
  ];

  return {
    mode: 'online',
    get you() { return you; },
    onUpdate(f) { cb = f; if (last) f(last); },
    onLobby(f) { lobbyCb = f; },
    onError(f) { errorCb = f; },
    act(action) { if (version != null) send('act', { action, base: version }); },
    emote: id => send('emote', { id }),
    rematch: () => send('rematch'),
    ready: on => send('ready', { on: !!on }),
    addBot: level => send('addBot', { level }),
    setBot: (seat, level) => send('setBot', { seat, level }),
    removeSeat: seat => send('removeSeat', { seat }),
    setOptions: o => send('setOptions', o),
    start: () => send('start'),
    leave() { send('leave'); net.close(); offs.forEach(o => o()); cb = lobbyCb = errorCb = null; },
  };
}
