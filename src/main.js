import { newGame, legalActions, apply, score } from './game.js';
import { botAction } from './bot.js';
import { createScene } from './scene.js';
import { createUI } from './ui.js';
import { createSfx } from './sfx.js';

const BOT_DELAY = 700;
const BOT_DELAY_AHLAK = 1200; // reveal animasyonu görünsün
let state = null;
let highlight = [];
let botTimer = 0;

const sfx = createSfx();
['pointerdown', 'touchend', 'keydown'].forEach(t => addEventListener(t, () => sfx.unlock(), { passive: true }));

const scene = createScene(document.getElementById('board'), {
  onTileTap: idx => ui.tapTile(idx),
  onProgress: p => ui.setLoading?.(p),
});
const ui = createUI(document.getElementById('ui'), {
  onAction: a => act(a, false),
  onTileHighlight: idxs => { highlight = idxs; if (state) scene.render(state, { highlight, focus: focusOf() }); },
});
scene.ready?.then(() => ui.setLoading?.(1), () => ui.setLoading?.(1));

// Kamera odağı: yalnız insan oyuncunun hamle/kapatma aşamasında.
function focusOf() {
  if (!state || (state.phase !== 'move' && state.phase !== 'close')) return null;
  const p = state.players[state.active];
  return p && !p.bot ? p.pos : null;
}

function start(opts) {
  clearTimeout(botTimer);
  state = newGame({ ...opts, seed: (Math.random() * 2 ** 32) >>> 0 });
  update([]);
}

function act(action, isBot) {
  if (action.type === 'newGame') { clearTimeout(botTimer); sfx.play('click'); return ui.showStart(start); }
  let res;
  try {
    res = apply(state, action);
  } catch (e) {
    console.error(e);
    return;
  }
  if (!isBot) sfx.play('click');
  state = res.state;
  update(res.events);
}

const SOUND = { move: 'step', ahlak: 'card', close: 'close', openRoad: 'open', trade: 'trade', over: 'win' };

function effects(events) {
  let coin = false;
  for (const ev of events) {
    try {
      if (ev.type === 'badges') {
        const pt = scene.projectTile?.(ev.tile);
        if (pt) ui.flyCoins?.(pt, ev.pIdx, ev.n);
        coin = true;
      } else if (SOUND[ev.type]) sfx.play(SOUND[ev.type]);
    } catch (e) { console.error(e); }
  }
  if (coin) sfx.play('coin');
}

function update(events) {
  clearTimeout(botTimer);
  const legal = legalActions(state);
  if (state.phase === 'over') state.__score = score(state);
  highlight = [];
  ui.render(state, legal, events);
  scene.render(state, { highlight, focus: focusOf() });
  effects(events);
  const p = state.players[state.active];
  if (state.phase !== 'over' && p.bot) {
    const d = events.some(e => e.type === 'ahlak') ? BOT_DELAY_AHLAK : BOT_DELAY;
    botTimer = setTimeout(() => act(botAction(state), true), d);
  }
}

// Ses aç/kapa düğmesi (index.html'de #mute).
const mute = document.getElementById('mute');
if (mute) {
  const paint = () => { mute.textContent = sfx.muted ? '🔇' : '🔊'; mute.setAttribute('aria-pressed', String(sfx.muted)); };
  mute.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paint(); if (!sfx.muted) sfx.play('click'); });
  paint();
}

ui.showStart(start);

// Debug handle for manual/CDP testing.
window.__ahilik = { ui, scene, act, sfx, get state() { return state; } };
