// Model manifest (owner: scene). All files are CC0, see assets/LICENSES.md.
// url is resolved against this module so it works from /index.html and /dev/*.html.
// scale: number; rotation: [x,y,z] radians; offset: [x,y,z] applied after scale/rotation.
// fallback + size/color: primitive drawn if the file fails to load. kit: shared-material group.
const u = (f) => new URL(`../assets/models/${f}`, import.meta.url).href;
const m = (f, kit, scale, fallback, size, color, extra = {}) =>
  ({ url: u(f), kit, scale, rotation: [0, 0, 0], offset: [0, 0, 0], fallback, size, color, ...extra });

export const MODELS = {
  // pawns (KayKit Adventurers, rigged). scale gives ~0.55 world units tall.
  pawn0: m('Rogue_Hooded.glb', 'adv', 0.25, 'cone', [0.2, 0.5, 0.2], 0xd0302b),
  pawn1: m('Knight.glb', 'adv', 0.215, 'cone', [0.2, 0.5, 0.2], 0x2f5fb3),
  pawn2: m('Barbarian.glb', 'adv', 0.23, 'cone', [0.2, 0.5, 0.2], 0x5aa832),
  pawn3: m('Mage.glb', 'adv', 0.205, 'cone', [0.2, 0.5, 0.2], 0xf5c518),
  anims: { url: u('anims.glb') },
  // barricade
  fence: m('ks/s_fence.glb', 'ks', [1.8, 0.7, 1.8], 'box', [0.9, 0.35, 0.06], 0x8a5a2b, { offset: [0, 0, 0.414] }),
  crate: m('crate_A_big.gltf', 'hex', 1.7, 'box', [0.37, 0.36, 0.37], 0xa9783b),
};

// Printed card art (cardId e.g. 'ilke-comert' -> assets/cards/ilke-comert.jpg)
export const CARD_ART = (cardId) => new URL(`../assets/cards/${cardId}.jpg`, import.meta.url).href;
