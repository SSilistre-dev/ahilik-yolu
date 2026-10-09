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
  // coins / badges
  coinSilver: m('coin_silver.gltf', 'board', 0.19, 'cylinder', [0.2, 0.04, 0.2], 0xc9ced4),
  coinGold: m('coin_gold.gltf', 'board', 0.19, 'cylinder', [0.2, 0.04, 0.2], 0xe8b923),
  // ilke props
  chest: m('ks/s_chest.glb', 'ks', 1.15, 'box', [0.3, 0.2, 0.3], 0x8a5a2b),
  journal: m('journal_open.gltf', 'tools', 0.3, 'box', [0.28, 0.04, 0.2], 0xe8dcc0, { rotation: [-Math.PI / 2, 0, 0], offset: [0, 0.02, 0.08] }),
  hourglass: m('hourglass.gltf', 'board', 0.12, 'cylinder', [0.12, 0.3, 0.12], 0xd9c9a0),
  lantern: m('lantern.gltf', 'tools', 0.3, 'box', [0.15, 0.28, 0.15], 0xf2c200),
  sack: m('sack.gltf', 'hex', 2.0, 'sphere', [0.18, 0.16, 0.18], 0xc9a96e),
  well: m('building_well_yellow.gltf', 'hex', 0.4, 'cylinder', [0.28, 0.3, 0.28], 0x9a8a6a),
  // city pieces
  towerBase: m('kc/c_tower-square-base.glb', 'kc', 1, 'box', [1, 1, 1], 0xc9b88a),
  towerMid: m('kc/c_tower-square-mid.glb', 'kc', 1, 'box', [1, 1, 1], 0xc9b88a),
  towerRoof: m('kc/c_tower-square-top-roof.glb', 'kc', 1, 'cone', [1, 1, 1], 0xa0452f),
  wall: m('kc/c_wall.glb', 'kc', 1, 'box', [1, 1.3, 0.3], 0xb9a87a),
  gate: m('kc/c_gate.glb', 'kc', 1, 'box', [0.2, 0.9, 0.7], 0x7a5a3a),
  hexBase: m('kc/c_tower-hexagon-base.glb', 'kc', 1, 'cylinder', [0.9, 1.3, 0.8], 0xc9b88a),
  hexRoof: m('kc/c_tower-hexagon-roof.glb', 'kc', 1, 'cone', [0.9, 0.8, 0.8], 0x2a9d8f),
  house: m('building_home_A_yellow.gltf', 'hex', 0.4, 'box', [0.32, 0.38, 0.32], 0xd9c08a),
  tent: m('ks/s_tent-canvas.glb', 'ks', 0.75, 'cone', [0.4, 0.4, 0.4], 0xe8dcc0),
  stallRed: m('kf/f_stall-red.glb', 'kf', 0.4, 'box', [0.4, 0.5, 0.4], 0xc0392b),
  stallGreen: m('kf/f_stall-green.glb', 'kf', 0.4, 'box', [0.4, 0.5, 0.4], 0x5aa832),
  cart: m('kf/f_cart.glb', 'kf', 0.4, 'box', [0.25, 0.22, 0.5], 0x8a5a2b),
  // barricade
  fence: m('ks/s_fence.glb', 'ks', [1.8, 0.7, 1.8], 'box', [0.9, 0.35, 0.06], 0x8a5a2b, { offset: [0, 0, 0.414] }),
  crate: m('crate_A_big.gltf', 'hex', 1.7, 'box', [0.37, 0.36, 0.37], 0xa9783b),
  barrel: m('barrel.gltf', 'hex', 1.5, 'cylinder', [0.3, 0.32, 0.3], 0x8a5a2b),
  // scatter
  palmTall: m('n_tree_palmTall.glb', 'kn', 0.5, 'cone', [0.3, 0.8, 0.3], 0x4f8a3a),
  palmShort: m('n_tree_palmDetailedShort.glb', 'kn', 0.6, 'cone', [0.3, 0.6, 0.3], 0x4f8a3a),
  cactus: m('n_cactus_short.glb', 'kn', 0.8, 'cylinder', [0.15, 0.4, 0.15], 0x4f8a3a),
  tree: m('tree_single_A.gltf', 'hex', 0.55, 'cone', [0.3, 0.6, 0.3], 0x4f8a3a),
  trees: m('trees_A_small.gltf', 'hex', 0.4, 'cone', [0.5, 0.45, 0.5], 0x4f8a3a),
  rockA: m('rock_single_C.gltf', 'hex', 1.2, 'sphere', [0.25, 0.2, 0.25], 0x9a9488),
  rockB: m('rock_single_E.gltf', 'hex', 1.1, 'sphere', [0.3, 0.2, 0.25], 0x9a9488),
  rockC: m('ks/s_rock-sand-a.glb', 'ks', 0.55, 'sphere', [0.3, 0.25, 0.3], 0xb09a74),
  rockD: m('n_rock_largeA.glb', 'kn', 0.4, 'sphere', [0.3, 0.2, 0.4], 0x9a9488),
  grass: m('n_grass_large.glb', 'kn', 1.1, 'cone', [0.2, 0.2, 0.2], 0x8a9a4a),
  wheelbarrow: m('wheelbarrow.gltf', 'hex', 1.3, 'box', [0.2, 0.2, 0.4], 0x8a5a2b),
};

// Printed card art (cardId e.g. 'ilke-comert' -> assets/cards/ilke-comert.jpg)
export const CARD_ART = (cardId) => new URL(`../assets/cards/${cardId}.jpg`, import.meta.url).href;
