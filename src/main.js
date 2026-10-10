import * as G from './game.js';
const { newGame, legalActions, apply, score } = G;
// SPEC v4 actor(); eski motorda yok -> active.
const actor = G.actor || (s => s.active);
import { safeBotAction, fallbackAction } from './botstep.js';
import { createScene } from './scene.js';
import { createUI } from './ui.js';
import { createSfx } from './sfx.js';

import { goalTile, pathTo } from './path.js';
import { CARDS, ILKE_IDS } from './data.js';
import { initPwa } from './pwa.js';
import { createRouter } from './router.js';
import { createBotClock } from './botclock.js';
import { applyTokens, createMenu } from './menu.js';
import { registerMainScreens, createPause } from './menu-main.js';
import { store, KEYS } from './store.js';

const BOT_DELAY = 700;
const BOT_DELAY_AHLAK = 1200; // reveal animasyonu görünsün
const BOT_MIN_GAP = 150;      // hızlandırmada animasyonlar okunabilir kalsın
let state = null;
let highlight = [];
const clock = createBotClock();
let botLevels = []; // koltuk -> 'easy'|'medium'|'hard'
let lastBotAct = 0;
let undoStack = [];
let sceneReady = false;
let prog = 0;
let started = false;
let botFails = 0;

const sfx = createSfx();
['pointerdown', 'touchend', 'keydown'].forEach(t => addEventListener(t, () => sfx.unlock(), { passive: true }));

const buzz = p => { try { navigator.vibrate?.(p); } catch {} };

const scene = createScene(document.getElementById('board'), {
  onTileTap: idx => {
    if (ui.tapTile(idx)) return true;
    const why = ui.rejectReason(idx);
    if (why && ui.reject(idx, why, scene.projectTile?.(idx))) { sfx.play('nope'); buzz([15, 30, 15]); }
    return false;
  },
  onProgress: p => { prog = p; if (started && !sceneReady) ui.setLoading?.(p); },
});
const ui = createUI(document.getElementById('ui'), {
  onAction: a => act(a, false),
  onTileHighlight: idxs => { highlight = idxs; if (state) renderScene(); },
  // #stage CSS already excludes the desktop sidebar, so the scene must not subtract it again.
  onLayout: ins => scene.setInsets?.({ ...ins, right: 0 }),
  onPause: () => { if (router.current?.name === 'game') router.go('pause'); },
});
const readyP = scene.ready ? Promise.resolve(scene.ready).catch(() => {}) : Promise.resolve();
readyP.then(() => { sceneReady = true; });

// Hedef/yol yalnız insan oyuncunun kendi sırasında gösterilir.
function renderScene() {
  const p = state.players[state.active];
  const show = !p.bot && ['ahlak', 'close', 'move'].includes(state.phase);
  scene.render(state, { highlight, goal: show ? goalTile(state, state.active) : null, path: show ? pathTo(state, state.active) : [] });
}

async function start(opts) {
  clock.cancel(); clock.resume();
  started = true;
  if (!sceneReady) {
    ui.setLoading?.(prog);
    await readyP;
    ui.setLoading?.(1);
  }
  // Kart görselleri önden yüklenir (ilk el açılırken boş görünmesin).
  for (const f of [...ILKE_IDS.map(i => `yol-${i}`), 'yol-back', 'ahlak-back', 'ticaret-back']) new Image().src = `assets/cards/${f}.jpg`;
  undoStack = [];
  highlight = [];
  botFails = 0;
  state = newGame({ ...opts, seed: (Math.random() * 2 ** 32) >>> 0 });
  botLevels = (opts.players ?? []).map((p) => p.level ?? 'medium');
  update([]);
}

function act(action, isBot) {
  if (!state) return;
  if (action.type === 'newGame') { sfx.play('click'); return toMenu(); }
  if (action.type === 'undo') {
    if (isBot || !undoStack.length) return;
    sfx.play('click'); buzz(10);
    state = undoStack.pop();
    return update([]);
  }
  let res;
  try {
    res = apply(state, action);
  } catch (e) {
    console.error(e);
    if (isBot) {
      if (++botFails >= 3) return window.__ahiFatal?.('Oyunda bir sorun oldu', 'Yeniden başlatmak ister misin?', e);
      clock.schedule(() => { const a = fallbackAction(legalActions(state)); if (a) act(a, true); }, 300);
    }
    return;
  }
  if (isBot) botFails = 0;
  if (!isBot) sfx.play('click');
  if (isBot) lastBotAct = Date.now();
  if (isBot || action.type !== 'move') undoStack = [];
  else if (res.events.some(e => e.type === 'trade')) undoStack = [];
  else undoStack.push(state);
  state = res.state;
  update(res.events);
}

const SOUND = { endgame: 'close', swap: 'trade', move: 'step', ahlak: 'card', close: 'close', openRoad: 'open', trade: 'trade', over: 'win' };
const BUZZ = { endgame: [30, 40, 30], move: 10, badges: 30, trade: [20, 40, 20], over: [60, 40, 60] };

function effects(events) {
  let coin = false;
  for (const ev of events) {
    try {
      if (ev.type === 'badges') {
        const pt = scene.projectTile?.(ev.tile);
        if (pt) ui.flyCoins?.(pt, ev.pIdx, ev.n);
        coin = true;
      } else if (SOUND[ev.type] && !ev.empty) sfx.play(SOUND[ev.type]);
      if (state.players[ev.pIdx ?? state.active]?.bot) continue;
      if (ev.type === 'ahlak' && CARDS[ev.card]?.negative) buzz([40, 60, 40]);
      else if (BUZZ[ev.type]) buzz(BUZZ[ev.type]);
    } catch (e) { console.error(e); }
  }
  if (coin) sfx.play('coin');
}

const botNext = () => act(safeBotAction(state, botLevels[actor(state)] ?? 'medium', 'local'), true);

function update(events) {
  clock.cancel();
  const legal = legalActions(state);
  const p = state.players[state.active], who = state.players[actor(state)];
  if (undoStack.length && state.phase === 'move' && !state.pending && !p.bot) legal.push({ type: 'undo' });
  if (state.phase === 'over') state.__score = score(state);
  ui.render(state, legal, events);
  renderScene();
  effects(events);
  if (state.phase !== 'over' && who.bot) {
    const d = events.some(e => e.type === 'ahlak' && !e.empty) ? BOT_DELAY_AHLAK : BOT_DELAY;
    clock.schedule(botNext, d);
  }
}

// Bot sırasında dokununca sıradaki bot aksiyonu hemen gelir.
addEventListener('pointerdown', () => {
  if (!clock.pending || !state || !state.players[actor(state)].bot) return;
  clock.schedule(botNext, Math.max(0, BOT_MIN_GAP - (Date.now() - lastBotAct)));
}, true);

// Kart seçimi titreşimi.
document.getElementById('ui').addEventListener('click', e => { if (e.target.closest('.ay-card')) buzz(10); });

// Ekran yönlendirici + menü ekranları (M03/M06/M09). Oyundayken geri tuşu/Escape Duraklat'ı açar, Duraklat'ta Devam eder.
applyTokens();
const menu = createMenu(document.body, { sfx, buzz });
const router = createRouter({ guards: { game: () => started, pause: () => started } });
const getProfile = () => { const p = store.get(KEYS.profile); return p && typeof p === 'object' ? p : null; };
function toMenu() {
  clock.cancel(); clock.resume();
  started = false; state = null; undoStack = [];
  // Geçmişi menü kaydına (i=0) sar: çıkış sonrası geri tuşu eski kurulum/oyun kayıtlarında dolaşmasın.
  const i = router.current?.i ?? 0;
  if (i > 0) history.go(-i); else router.go('menu', {}, { replace: true });
}
const pause = createPause(menu, {
  router, sfx, exit: toMenu, canSave: false, // canSave: kayıt (AHI-015) gelince true
  openHelp: () => ui.tutorial.openHelp(), openLog: () => ui.openLog(),
});
registerMainScreens(menu, {
  router, getProfile, openHelp: () => ui.tutorial.openHelp(),
  startGame: opts => { start(opts); router.go('game'); },
});
router.onChange(({ name, params, dir }) => {
  if (name !== 'pause') pause.hide();
  document.getElementById('ui').classList.toggle('idle', name !== 'game' && name !== 'pause');
  if (name === 'game') { menu.hide(); clock.resume(); }
  else if (name === 'pause') { clock.pause(); menu.hide(); pause.show(params); }
  else if (menu.has(name)) menu.show(name, params, dir);
  else { menu.toast('Yakında'); router.back(); }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest?.('input,textarea')) router.back(); });
router.start();

// Debug handle for manual/CDP testing.
window.__ahilik = { router, ui, scene, act, sfx, get state() { return state; }, get highlight() { return highlight; } };

initPwa();
