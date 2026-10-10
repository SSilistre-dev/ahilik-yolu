import { legalActions, actor } from './game.js';
import { botAction } from './bot.js';
import { viewFor } from './view.js';

// Her fazda ilerleme sağlayan yasal aksiyon; legal boşsa null.
export function fallbackAction(legal) {
  const first = (f) => legal.find(f);
  return first((a) => a.type === 'respondTrade' && !a.accept) || first((a) => a.type === 'contribute' && !a.cards.length)
    || first((a) => a.type === 'drawAhlak') || first((a) => a.type === 'endTurn') || first((a) => a.type === 'pass')
    || first((a) => a.type === 'closeTile') || legal[0] || null;
}

// Bot fırlatırsa ya da yasadışı aksiyon dönerse yedeğe düşer.
export function safeBotAction(s, level = 'medium', gameId = 'local', pick = botAction) {
  const legal = legalActions(s);
  let a;
  try { a = pick(viewFor(s, actor(s), gameId), legal, level); } catch (e) { console.error('bot', e); }
  const key = a === undefined ? '' : JSON.stringify(a);
  return key && legal.some((l) => JSON.stringify(l) === key) ? a : fallbackAction(legal);
}
