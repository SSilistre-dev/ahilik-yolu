import * as G from './game.js';
const { newGame, legalActions, apply, score } = G;
// SPEC v4 actor(); eski motorda yok -> active.
const actor = G.actor || (s => s.active);
import { safeBotAction, fallbackAction } from './botstep.js';
import { createScene } from './scene.js';
import { createUI } from './ui.js';
import { createSfx } from './sfx.js';

import { goalTile, pathTo } from './path.js';
import { CARDS } from './data.js';

const BOT_DELAY = 700;
const BOT_DELAY_AHLAK = 1200; // reveal animasyonu görünsün
const BOT_MIN_GAP = 150;      // hızlandırmada animasyonlar okunabilir kalsın
let state = null;
let highlight = [];
let botTimer = 0;
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
  onTileTap: idx => ui.tapTile(idx),
  onProgress: p => { prog = p; if (started && !sceneReady) ui.setLoading?.(p); },
});
const ui = createUI(document.getElementById('ui'), {
  onAction: a => act(a, false),
  onTileHighlight: idxs => { highlight = idxs; if (state) renderScene(); },
  // #stage CSS already excludes the desktop sidebar, so the scene must not subtract it again.
  onLayout: ins => scene.setInsets?.({ ...ins, right: 0 }),
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
  clearTimeout(botTimer);
  started = true;
  if (!sceneReady) {
    ui.setLoading?.(prog);
    await readyP;
    ui.setLoading?.(1);
  }
  undoStack = [];
  highlight = [];
  botFails = 0;
  state = newGame({ ...opts, seed: (Math.random() * 2 ** 32) >>> 0 });
  update([]);
}

function act(action, isBot) {
  if (action.type === 'newGame') { clearTimeout(botTimer); sfx.play('click'); return ui.showStart(start); }
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
      clearTimeout(botTimer);
      botTimer = setTimeout(() => { const a = fallbackAction(legalActions(state)); if (a) act(a, true); }, 300);
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

const SOUND = { swap: 'trade', move: 'step', ahlak: 'card', close: 'close', openRoad: 'open', trade: 'trade', over: 'win' };
const BUZZ = { move: 10, badges: 30, trade: [20, 40, 20], over: [60, 40, 60] };

function effects(events) {
  let coin = false;
  for (const ev of events) {
    try {
      if (ev.type === 'badges') {
        const pt = scene.projectTile?.(ev.tile);
        if (pt) ui.flyCoins?.(pt, ev.pIdx, ev.n);
        coin = true;
      } else if (SOUND[ev.type]) sfx.play(SOUND[ev.type]);
      if (state.players[ev.pIdx ?? state.active]?.bot) continue;
      if (ev.type === 'ahlak' && CARDS[ev.card]?.negative) buzz([40, 60, 40]);
      else if (BUZZ[ev.type]) buzz(BUZZ[ev.type]);
    } catch (e) { console.error(e); }
  }
  if (coin) sfx.play('coin');
}

const botNext = () => act(safeBotAction(state), true);

function update(events) {
  clearTimeout(botTimer);
  botTimer = 0;
  const legal = legalActions(state);
  const p = state.players[state.active], who = state.players[actor(state)];
  if (undoStack.length && state.phase === 'move' && !state.pending && !p.bot) legal.push({ type: 'undo' });
  if (state.phase === 'over') state.__score = score(state);
  ui.render(state, legal, events);
  renderScene();
  effects(events);
  if (state.phase !== 'over' && who.bot) {
    const d = events.some(e => e.type === 'ahlak') ? BOT_DELAY_AHLAK : BOT_DELAY;
    botTimer = setTimeout(botNext, d);
  }
}

// Bot sırasında dokununca sıradaki bot aksiyonu hemen gelir.
addEventListener('pointerdown', () => {
  if (!botTimer || !state || !state.players[actor(state)].bot) return;
  clearTimeout(botTimer);
  botTimer = setTimeout(botNext, Math.max(0, BOT_MIN_GAP - (Date.now() - lastBotAct)));
}, true);

// Kart seçimi titreşimi.
document.getElementById('ui').addEventListener('click', e => { if (e.target.closest('.ay-card')) buzz(10); });

// Ses aç/kapa düğmesi (index.html'de #mute).
const mute = document.getElementById('mute');
if (mute) {
  const paint = () => { mute.textContent = sfx.muted ? '🔇' : '🔊'; mute.setAttribute('aria-pressed', String(sfx.muted)); };
  mute.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paint(); if (!sfx.muted) sfx.play('click'); });
  paint();
  // Sit in the UI side column (under the log button) so it never covers player chips.
  const side = document.querySelector(".ay-side");
  if (side) { mute.className = "ay-round ay-p"; side.prepend(mute); }
}

ui.showStart(start);

// Debug handle for manual/CDP testing.
window.__ahilik = { ui, scene, act, sfx, get state() { return state; }, get highlight() { return highlight; } };
