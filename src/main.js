import { newGame, legalActions, apply, score } from './game.js';
import { botAction } from './bot.js';
import { createScene } from './scene.js';
import { createUI } from './ui.js';

const BOT_DELAY = 700;
let state = null;
let highlight = [];
let botTimer = 0;

const scene = createScene(document.getElementById('board'), { onTileTap: idx => ui.tapTile(idx) });
const ui = createUI(document.getElementById('ui'), {
  onAction: act,
  onTileHighlight: idxs => { highlight = idxs; if (state) scene.render(state, { highlight }); },
});

function start(opts) {
  clearTimeout(botTimer);
  state = newGame({ ...opts, seed: (Math.random() * 2 ** 32) >>> 0 });
  update([]);
}

function act(action) {
  if (action.type === 'newGame') return ui.showStart(start);
  let res;
  try {
    res = apply(state, action);
  } catch (e) {
    console.error(e);
    return;
  }
  state = res.state;
  update(res.events);
}

function update(events) {
  const legal = legalActions(state);
  if (state.phase === 'over') state.__score = score(state);
  highlight = [];
  ui.render(state, legal, events);
  scene.render(state, { highlight });
  const p = state.players[state.active];
  if (state.phase !== 'over' && p.bot) botTimer = setTimeout(() => act(botAction(state)), BOT_DELAY);
}

ui.showStart(start);
