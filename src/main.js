import { createLocalSession } from './session.js';
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
import { registerOnlineScreens, takeRoomLink } from './menu-online.js';
import { getSettings, botDelays } from './store.js';
import { defineProfile, getProfile } from './profile.js';
import { defineSettings, applyDom } from './settings.js';

let state = null; // Session'ın verdiği view (gizli alanlar boş); motor state'ini main görmez
let session = null;
let highlight = [];
const clock = createBotClock();
let sceneReady = false;
let prog = 0;
let started = false;

const sfx = createSfx();
['pointerdown', 'touchend', 'keydown'].forEach(t => addEventListener(t, () => sfx.unlock(), { passive: true }));

const buzz = p => { try { if (getSettings().vibrate) navigator.vibrate?.(p); } catch {} };

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
  onAction: a => act(a),
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
  const show = !p.bot && (state.you == null || state.you === state.active) && ['ahlak', 'close', 'move'].includes(state.phase);
  scene.render(state, { highlight, goal: show ? goalTile(state, state.active) : null, path: show ? pathTo(state, state.active) : [], viewer: state.you ?? state.players.findIndex(q => !q.bot) });
}

// Oyuna geçiş ortak hazırlığı: sahne yüklensin, kart görselleri önden gelsin.
async function begin() {
  session?.leave();
  clock.cancel(); clock.resume();
  started = true;
  if (!sceneReady) {
    ui.setLoading?.(prog);
    await readyP;
    ui.setLoading?.(1);
  }
  // Kart görselleri önden yüklenir (ilk el açılırken boş görünmesin).
  for (const f of [...ILKE_IDS.map(i => `yol-${i}`), 'yol-back', 'ahlak-back', 'ticaret-back']) new Image().src = `assets/cards/${f}.jpg`;
  highlight = [];
}

function attach(s) {
  session = s;
  s.onUpdate(({ view, legal, events }) => {
    if (s !== session) return;
    state = view;
    ui.render(view, legal, events);
    renderScene();
    effects(events);
  });
}

async function start(opts) {
  await begin();
  attach(createLocalSession({
    opts, clock,
    delays: () => botDelays(getSettings()),
    whenIdle: () => scene.whenIdle(),
    backlog: () => ui.botBacklog?.() ?? 0,
    botAct: (events, who, view) => ui.botStep?.(events, who, view),
    fatal: e => window.__ahiFatal?.('Oyunda bir sorun oldu', 'Yeniden başlatmak ister misin?', e),
  }));
  session.start();
}

// Çevrimiçi oturumu (session.createOnlineSession) oyuna bağlar; lobi/menü ekranları bunu çağırır.
async function startOnline(s) {
  await begin();
  attach(s);
  router.go('game');
}

function act(action) {
  if (!session) return;
  if (action.type === 'newGame') { sfx.play('click'); return toMenu(); }
  if (action.type === 'undo') { if (session.undo?.()) { sfx.play('click'); buzz(10); } return; }
  sfx.play('click');
  session.act(action);
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

// Bot sırasında dokununca sıradaki bot aksiyonu hemen gelir.
addEventListener('pointerdown', () => { if (session?.skipWait?.()) ui.botSkip?.(); }, true);

// Kart seçimi titreşimi.
document.getElementById('ui').addEventListener('click', e => { if (e.target.closest('.ay-card')) buzz(10); });

// Ekran yönlendirici + menü ekranları (M03/M06/M09). Oyundayken geri tuşu/Escape Duraklat'ı açar, Duraklat'ta Devam eder.
// Ayar değişince tek yerden uygulanır (DOM öznitelikleri, ses).
const onSettings = s => { applyDom(s); sfx.setMuted(!s.sound, false); };
onSettings(getSettings());
applyTokens();
const menu = createMenu(document.body, { sfx, buzz });
const router = createRouter({ guards: { game: () => started, pause: () => started } });
function toMenu() {
  session?.leave(); session = null; // bekleyen whenIdle eski oyunun bot zamanlayıcısını kurmasın
  clock.cancel(); clock.resume();
  started = false; state = null;
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
  startGame: opts => { start(opts); router.go('game'); }, startOnline,
});
registerOnlineScreens(menu, { router, getProfile, startOnline });
defineProfile(menu, { router });
defineSettings(menu, { router, onSettings, tutorial: () => ui.tutorial });
router.onChange(({ name, params, dir }) => {
  if (name !== 'pause') pause.hide();
  document.getElementById('ui').classList.toggle('idle', name !== 'game' && name !== 'pause');
  if (name === 'game') { menu.hide(); clock.resume(); }
  else if (name === 'pause') { clock.pause(); menu.hide(); pause.show(params); }
  else if (menu.has(name)) menu.show(name, params, dir);
  else { menu.toast('Yakında'); router.back(); }
});
// Derin link (?oda=KOD): profil varsa menüye gelince Koda Katıl kod dolu açılır (ilk açılışta önce profil).
let roomLink = takeRoomLink();
router.onChange(({ name }) => {
  if (name !== 'menu' || !roomLink || !getProfile()) return;
  const code = roomLink; roomLink = null;
  router.go('join', { code });
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest?.('input,textarea')) router.back(); });
// Profil yoksa ilk açılış ekranı; profil varken yenilemede eski "ilk açılış" kaydı menüye döner.
const hs = history.state;
router.start(!getProfile() ? { name: 'profile', params: { first: true } } : hs?.name === 'profile' && hs.params?.first ? { name: 'menu' } : undefined);

// Debug handle for manual/CDP testing.
window.__ahilik = { clock, router, ui, scene, act, sfx, startOnline, get state() { return state; }, get highlight() { return highlight; } };

initPwa();
