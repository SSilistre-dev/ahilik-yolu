// 3D world: "Anatolian caravan diorama". Owner: scene agent. Contract: SPEC.md "v2".
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ILKELER, CITIES, BOARD, AVATARS } from './data.js';
import { pawnSlot, walkTiles, viewFlip } from './path.js';
import { MODELS, CARD_ART } from './assets.js';
import { reducedMotion } from './store.js';

const P = 1.1;                     // tile pitch
const HALF = 3.25;                 // terrain plate half size
const BASE_H = 0.1, CITY_H = 0.14; // tile top heights
const ART = 0.92;                  // printed art plate size (square art, shown whole, centred on the tile)
const PULSE_MS = 33;               // goal/highlight pulse redraw interval (~30 fps)
const IDLE_MS = 66;                // idle animation redraw interval (~15 fps)
const MEDAL_BASE = 0.5, MEDAL_BIG = 0.74; // badge medal size (world units)
const STEP_MS = 340, STEP_FAST_MS = 220; // one tile hop; long walks (cargo) hop faster
const IDLE_SLEEP_MS = 5000;        // ornamental loop (pulse, flag, breathing) stops after this long without input
const tileX = (c) => (c - 2) * P, tileZ = (r) => (r - 2) * P;
const topOf = (t) => (t.kind === 'city' ? CITY_H : BASE_H);
const IDENT = new THREE.Matrix4();
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- procedural textures ----------
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
function fitText(g, text, y, maxW, px, color) {
  g.font = `bold ${px}px sans-serif`;
  while (g.measureText(text).width > maxW && px > 12) { px -= 2; g.font = `bold ${px}px sans-serif`; }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, g.canvas.width / 2, y);
}
const fallbackArt = (ilke) => canvasTex(256, 256, (g, s) => {
  g.fillStyle = ILKELER[ilke].color; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(s / 2, 96, 74, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, 96, 40, 0, 7); g.fill();
  g.fillStyle = ILKELER[ilke].color; g.beginPath(); g.arc(s / 2, 96, 26, 0, 7); g.fill();
  fitText(g, ILKELER[ilke].name, 204, s - 30, 46, '#fff');
});
const sandTex = () => canvasTex(1024, 1024, (g, s) => {
  const r = mulberry(7);
  g.fillStyle = '#dcc088'; g.fillRect(0, 0, s, s);
  const grd = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s * 0.75);
  grd.addColorStop(0, 'rgba(255,238,190,.35)'); grd.addColorStop(1, 'rgba(150,105,55,.4)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(120,85,45,.16)' : 'rgba(255,240,200,.2)';
    const w = 1 + r() * 4; g.fillRect(r() * s, r() * s, w, w);
  }
  g.strokeStyle = 'rgba(130,95,55,.14)'; g.lineWidth = 3;
  for (let i = 0; i < 26; i++) { g.beginPath(); const y = r() * s, x = r() * s * 0.6; g.moveTo(x, y); g.bezierCurveTo(x + 80, y - 20, x + 160, y + 20, x + 100 + r() * 200, y); g.stroke(); }
});
const woodTex = () => canvasTex(512, 512, (g, s) => {
  const r = mulberry(3), n = 8, h = s / n;
  for (let i = 0; i < n; i++) {
    const l = 20 + r() * 6; g.fillStyle = `hsl(25 ${34 + r() * 8}% ${l}%)`; g.fillRect(0, i * h, s, h);
    g.strokeStyle = `rgba(15,8,2,${0.12 + r() * 0.1})`; g.lineWidth = 1;
    for (let k = 0; k < 14; k++) { const y = i * h + r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 5 - 2, s * 0.6, y + r() * 5 - 2, s, y); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, i * h, s, 2);
  }
}, 9);
const glowTex = () => canvasTex(128, 128, (g, s) => {
  g.shadowColor = '#ffe27a'; g.shadowBlur = 16; g.strokeStyle = '#fff2b0'; g.lineWidth = 9;
  g.beginPath(); g.roundRect(18, 18, s - 36, s - 36, 18); g.stroke(); g.stroke();
});
function labelSprite(text) {
  const t = canvasTex(256, 80, (g, w, h) => {
    g.fillStyle = 'rgba(34,22,12,.78)'; g.strokeStyle = '#e8c97a'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 22); g.fill(); g.stroke();
    fitText(g, text, h / 2 + 2, w - 40, 40, '#fff3d6');
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.72, 0.225, 1); s.renderOrder = 10; return s;
}

// gold medal with ribbon and a big count; Sprite so it always faces the camera
function medalTex(n) {
  return canvasTex(192, 192, (g, w) => {
    g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(58, 120); g.lineTo(34, 188); g.lineTo(70, 170); g.lineTo(92, 124); g.fill();
    g.fillStyle = '#9c2a1e'; g.beginPath(); g.moveTo(134, 120); g.lineTo(158, 188); g.lineTo(122, 170); g.lineTo(100, 124); g.fill();
    g.fillStyle = '#5a2e08'; g.beginPath(); g.arc(w / 2, 84, 80, 0, 7); g.fill();
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(w / 2, 84, 70, 0, 7); g.fill();
    g.strokeStyle = '#fff0a8'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, 84, 58, 0, 7); g.stroke();
    const t = String(n); let px = t.length > 1 ? 82 : 100;
    g.font = `bold ${px}px sans-serif`; while (g.measureText(t).width > 100 && px > 30) { px -= 4; g.font = `bold ${px}px sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#fff6c8'; g.strokeText(t, w / 2, 88);
    g.fillStyle = '#4a2600'; g.fillText(t, w / 2, 88);
  });
}

// ---------- geometry helpers ----------
function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// keep position/normal/uv(/color); non-indexed so everything merges
function norm(g, color) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k) && !(color && k === 'color')) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (color && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}
function paint(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// rounded slab, top at y=h, bottom at y=0, centred on xz. Sides = stone, lid = lidColor (vertex colours).
function slab(w, r, h, bev, lidColor, sideColor, lidUV) {
  const g = new THREE.ExtrudeGeometry(rrect(w - 2 * bev, w - 2 * bev, Math.max(0.01, r - bev)), { depth: h - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 });
  const pos = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(pos.count * 3), lc = new THREE.Color(lidColor), sc = new THREE.Color(sideColor);
  const topZ = h - 2 * bev + bev - 1e-4, W = w - 2 * bev;
  for (let i = 0; i < pos.count; i++) {
    const lid = pos.getZ(i) >= topZ && g.attributes.normal.getZ(i) > 0.99, c = lid ? lc : sc;
    col.set([c.r, c.g, c.b], i * 3);
    if (lidUV) uv.setXY(i, lid ? pos.getX(i) / W + 0.5 : 0.5, lid ? pos.getY(i) / W + 0.5 : 0.5);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
  return g;
}

// ---------- scene ----------
export function createScene(canvas, { onTileTap, onProgress, onContextLost } = {}) {
  THREE.Cache.enabled = true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // only pawns move; frame() requests a refresh when one does
  canvas.style.touchAction = 'none'; canvas.style.width = canvas.style.height = '100%'; canvas.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1d15);
  scene.fog = new THREE.Fog(0x2a1d15, 17, 40);
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x8c6a45, 1.35));
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.1); sun.position.set(-4, 7.5, 5); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const world = new THREE.Group(); scene.add(world); let fs = 1; // board + pieces; fs = -1 while turned; turned 180 degrees when the human starts on the far side
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  // ----- loading -----
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, done, total) => onProgress && onProgress(Math.min(0.99, done / Math.max(1, total)));
  const gltfLoader = new GLTFLoader(manager), texLoader = new THREE.TextureLoader(manager);
  const loaded = {}; // key -> gltf | null
  const jobs = Object.entries(MODELS).map(([key, cfg]) => new Promise((res) => {
    gltfLoader.load(cfg.url, (g) => { loaded[key] = g; res(); }, undefined, (e) => { console.warn('model failed', key, e && e.message); loaded[key] = null; res(); });
  }));

  // ----- shared materials -----
  const procMat = lam(0xffffff, { vertexColors: true });
  const kitMats = new Map();
  function kitMat(kit, orig, vc) {
    const k = `${kit}|${orig.name}|${vc}`;
    // Kenney nature kit ships teal factors; repaint to a warm Anatolian palette
    const KN = { leafsGreen: 0x6f9a3c, grass: 0x9aa84a, woodBark: 0x7a5535, dirt: 0xb08a5a };
    if (!kitMats.has(k)) kitMats.set(k, lam(kit === 'kn' && KN[orig.name] ? KN[orig.name] : orig.color || 0xffffff, { map: orig.map || null, vertexColors: vc }));
    return kitMats.get(k);
  }
  // baked, manifest-transformed geometry parts [{geo, mat}] per model key (fallback primitive if missing)
  const partsCache = {};
  function parts(key) {
    if (partsCache[key]) return partsCache[key];
    const cfg = MODELS[key], g = loaded[key], out = [];
    const s = [].concat(cfg.scale), sc = s.length === 3 ? s : [s[0], s[0], s[0]];
    const T = new THREE.Matrix4().compose(V3(...cfg.offset), new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.rotation)), V3(...sc));
    if (g) {
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh) return;
        const vc = !!o.geometry.attributes.color;
        out.push({ geo: norm(o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, o.matrixWorld)), vc), mat: kitMat(cfg.kit, [].concat(o.material)[0], vc) });
      });
    }
    if (!out.length) {
      const [w, h, d] = cfg.size || [0.2, 0.2, 0.2];
      const geo = { box: () => new THREE.BoxGeometry(w, h, d), cylinder: () => new THREE.CylinderGeometry(w / 2, w / 2, h, 12), cone: () => new THREE.ConeGeometry(w / 2, h, 12), sphere: () => new THREE.SphereGeometry(w / 2, 12, 8).scale(1, h / w, d / w) }[cfg.fallback || 'box']();
      geo.translate(0, h / 2, 0);
      out.push({ geo: paint(norm(geo, true), cfg.color || 0xb89a63), mat: procMat });
    }
    return (partsCache[key] = out);
  }
  const compose = (x, y, z, s = 1, ry = 0, rx = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), V3(...[].concat(s, s, s).slice(0, 3)));
  function Batch() {
    const by = new Map();
    return {
      add(ps, m = IDENT) { for (const { geo, mat } of ps) { if (!by.has(mat)) by.set(mat, []); by.get(mat).push(geo.clone().applyMatrix4(m)); } },
      put(key, x, y, z, s = 1, ry = 0, rx = 0) { this.add(parts(key), compose(x, y, z, s, ry, rx)); },
      build(cast, recv) {
        const out = [];
        for (const [mat, gs] of by) { const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = cast; m.receiveShadow = recv; world.add(m); out.push(m); }
        by.clear(); return out;
      },
    };
  }
  // procedural primitives in vertex colours
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl: (rt, rb, h, n = 14) => new THREE.CylinderGeometry(rt, rb, h, n),
    sph: (r) => new THREE.SphereGeometry(r, 14, 10), dome: (r) => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cone: (r, h) => new THREE.ConeGeometry(r, h, 14),
  };
  function piece(geo, color, x, y, z, o = {}) {
    const m = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), V3(...(o.s || [1, 1, 1])));
    return { geo: paint(norm(geo.clone().applyMatrix4(m), true), color), mat: procMat };
  }

  // ----- static world: table, terrain, tiles -----
  const statics = Batch(), lands = Batch();
  const table = new THREE.Mesh(new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), lam(0xffffff, { map: woodTex() }));
  table.position.y = -0.16; table.receiveShadow = true; world.add(table);
  const sandT = sandTex();
  const plate = new THREE.Mesh(slab(HALF * 2, 0.8, 0.16, 0.07, 0xffffff, 0xa07c4c, true).translate(0, -0.16, 0), lam(0xffffff, { map: sandT, vertexColors: true }));
  plate.receiveShadow = true; world.add(plate);

  const stone = 0xcbb78f, artMats = {}, artTex = {};
  for (const id in ILKELER) {
    artTex[id] = fallbackArt(id);
    artMats[id] = lam(0xffffff, { map: artTex[id], emissive: 0xffffff, emissiveMap: artTex[id], emissiveIntensity: 0.3 });
  }
  const artGeos = {};
  for (const t of BOARD) {
    const x = tileX(t.c), z = tileZ(t.r), top = topOf(t);
    statics.add([{ geo: norm(slab(1.0, 0.14, top, 0.03, t.kind === 'city' ? 0xe6d6aa : ILKELER[t.ilke].color, stone), true), mat: procMat }], compose(x, 0, z));
    if (t.kind === 'ilke') {
      const a = new THREE.ShapeGeometry(rrect(ART, ART, 0.06), 4), pos = a.attributes.position, uv = a.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / ART + 0.5, pos.getY(i) / ART + 0.5);
      a.rotateX(-Math.PI / 2); a.translate(x, top + 0.004, z);
      (artGeos[t.ilke] = artGeos[t.ilke] || []).push(a);
    }
  }
  for (const id in artGeos) { const m = new THREE.Mesh(mergeGeometries(artGeos[id]), artMats[id]); m.receiveShadow = true; world.add(m); }
  // art lies flat on the tile: when the board is turned 180 degrees the art is turned back so it reads upright
  function turnArt() { for (const id in artTex) { const t = artTex[id]; t.center.set(0.5, 0.5); t.rotation = fs < 0 ? Math.PI : 0; } }
  // swap in printed art when it loads; fallback canvas stays if the file is missing
  for (const id in ILKELER) {
    jobs.push(new Promise((res) => texLoader.load(CARD_ART('ilke-' + id), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      artTex[id].dispose(); artTex[id] = tex; artMats[id].map = artMats[id].emissiveMap = tex; artMats[id].needsUpdate = true; turnArt(); res(); kick();
    }, undefined, () => res())));
  }

  // highlight rings (one instanced mesh)
  const glow = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.14, 1.14).rotateX(-Math.PI / 2), glow, 25);
  rings.frustumCulled = false; rings.renderOrder = 5; world.add(rings);

  // ----- model-dependent world, built once loading settles -----
  let fenceM, crateM, built = false;
  const medals = [], medalCache = new Map(), emph = new Set(); // emph: tiles on the route / goal / legal targets get a bigger medal
  const medalTex_ = (n) => { n = Math.min(n, 99); if (!medalCache.has(n)) medalCache.set(n, medalTex(n)); return medalCache.get(n); };
  const cityLabels = [], pawns = [];
  // landmarks are built per board orientation: the far half of the tile (away from the camera) is theirs, pawns stand in front
  let cityMeshes = [];
  function buildCities() {
    for (const m of cityMeshes) { world.remove(m); m.geometry.dispose(); }
    for (const t of BOARD.filter((b) => b.kind === 'city')) {
      const x = tileX(t.c), z = tileZ(t.r) - 0.16 * fs, y = CITY_H, c = t.city; // landmark sits on the far half of its tile, pawns stand in front
      if (c === 'ankara') { // castle on a rocky mound: tall keep, two side towers
        lands.add([piece(G.cyl(0.38, 0.46, 0.1, 8), 0x8d7a5c, 0, 0.05, 0, { ry: 0.2 }), piece(G.cyl(0.3, 0.37, 0.1, 7), 0xa08c6a, 0, 0.15, 0, { ry: 0.5 })], compose(x, y - 0.02, z));
        const tw = (px, pz, n, s) => { let h = 0.23; lands.put('towerBase', x + px, y + h, z + pz, s); h += s; if (n > 1) { lands.put('towerMid', x + px, y + h, z + pz, s); h += s; } lands.put('towerRoof', x + px, y + h, z + pz, s); };
        tw(0, 0, 2, 0.36); tw(-0.3, 0, 1, 0.27); tw(0.3, 0, 1, 0.27);
      } else if (c === 'kirsehir') { // turbe: hexagonal tower + blue cone roof
        lands.put('hexBase', x, y, z, 0.58); lands.put('hexRoof', x, y + 1.31 * 0.58, z, 0.58);
      } else if (c === 'konya') { // dome (turquoise) + minaret
        const ps = [piece(G.cyl(0.26, 0.28, 0.06), 0xe6d6aa, 0, 0.03, 0), piece(G.cyl(0.21, 0.21, 0.24), 0xf1e6c8, 0, 0.18, 0), piece(G.dome(0.24), 0x23a6a0, 0, 0.3, 0),
          piece(G.cyl(0.012, 0.012, 0.12), 0xe0b23c, 0, 0.6, 0), piece(G.sph(0.025), 0xe0b23c, 0, 0.67, 0),
          piece(G.cyl(0.04, 0.055, 0.75), 0xf1e6c8, -0.34, 0.375, 0), piece(G.cyl(0.075, 0.075, 0.03), 0xd9c9a0, -0.34, 0.58, 0), piece(G.cone(0.06, 0.22), 0x23a6a0, -0.34, 0.86, 0)];
        lands.add(ps, compose(x + 0.1, y, z));
      } else { // kumbet: tall hexagonal tower with cone roof
        lands.put('hexBase', x, y, z, 0.5); lands.put('hexRoof', x, y + 1.31 * 0.5, z, 0.5);
      }
    }
    cityMeshes = lands.build(true, true);
  }
  function buildWorld() {
    const rnd = mulberry(11);
    // a few props outside the plate, left and right only: tile faces and pawns stay clear
    const kinds = ['palmTall', 'rockA', 'cactus', 'palmShort', 'rockC', 'rockD'];
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1, k = kinds[i % kinds.length];
      statics.put(k, side * (3.55 + rnd() * 0.15), -0.16, (Math.floor(i / 2) - 1.5) * 1.5 + rnd() * 0.3, 0.9 + rnd() * 0.3, rnd() * 6.28);
    }
    statics.build(false, true); buildCities();

    for (const [id, c] of Object.entries(CITIES)) {
      const t = BOARD[c.tile], s = labelSprite(c.name);
      s.position.set(tileX(t.c), { ankara: 1.5, kirsehir: 1.12, konya: 1.15, kayseri: 1.05 }[id], tileZ(t.r)); world.add(s); cityLabels.push(s);
    }
    // instanced coins + barricade pieces
    const inst = (key, n) => { const p = parts(key)[0], m = new THREE.InstancedMesh(p.geo, p.mat, n); m.frustumCulled = false; m.count = 0; world.add(m); return m; };
    fenceM = inst('fence', 25 * 6); crateM = inst('crate', 25);
    for (const t of BOARD) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true })); m.center.set(0.5, 0.05); m.renderOrder = 9; m.visible = false; world.add(m); medals[t.idx] = m; }
    built = true;
  }

  // ----- pawns -----
  const clips = {};
  const pawnKey = (i, avatar) => AVATARS.find((a) => a.id === avatar)?.model ?? 'pawn' + (i % 4); // karakter seçilmediyse koltuk sırası
  function makePawn(i, color, avatar) {
    const key = pawnKey(i, avatar);
    const root = new THREE.Group(), body = new THREE.Group(), cfg = MODELS[key], g = loaded[key], model = g && cloneSkinned(g.scene); // per-pawn clone: one Object3D has one parent
    const disc = new THREE.Mesh(mergeGeometries([paint(norm(new THREE.CylinderGeometry(0.25, 0.27, 0.06, 28), true), color), paint(norm(new THREE.TorusGeometry(0.26, 0.022, 6, 32).rotateX(Math.PI / 2).translate(0, 0.03, 0), true), 0xfff4d6)]), procMat);
    disc.receiveShadow = true; disc.position.y = 0.03; body.position.y = 0.05;
    // active-turn highlight: pulsing gold ring on the ground + bobbing arrow over the head
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.31, 0.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    ring.position.y = 0.075; ring.visible = false;
    const mark = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 4).rotateX(Math.PI).translate(0, 0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false }));
    mark.position.y = 1.0; mark.visible = false;
    const pw = { key, root, body, ring, mark, route: null, tile: -1, mixer: null, idle: null, walk: null, yaw: 0, yawT: 0, target: V3(), init: false, live: true };
    const characterOk = g && (() => {
      try {
        const skins = []; model.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
        if (!skins.length) return false;
        const geos = skins.map((s) => { const c = s.geometry.clone(); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) c.deleteAttribute(k); return c.index ? c.toNonIndexed() : c; });
        const mat = lam(0xffffff, { map: [].concat(skins[0].material)[0].map });
        const mesh = new THREE.SkinnedMesh(mergeGeometries(geos), mat);
        for (const s of skins) s.parent.remove(s);
        model.add(mesh); mesh.bind(skins[0].skeleton, skins[0].bindMatrix);
        mesh.castShadow = true; mesh.frustumCulled = false;
        model.scale.setScalar(cfg.scale); body.add(model);
        const a = loaded.anims;
        if (a && a.animations.length) {
          pw.mixer = new THREE.AnimationMixer(model);
          const find = (n) => a.animations.find((c) => c.name === n);
          if (find('Idle_A')) { pw.idle = pw.mixer.clipAction(find('Idle_A')); pw.idle.time = Math.random() * 2; pw.idle.play(); }
          if (find('Walking_A')) { pw.walk = pw.mixer.clipAction(find('Walking_A')); pw.walk.setEffectiveWeight(0); pw.walk.play(); }
        }
        return true;
      } catch (e) { console.warn('pawn model failed', e); return false; }
    })();
    if (!characterOk) {
      const m = lam(color), cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 14), m), ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), m);
      cone.position.y = 0.2; ball.position.y = 0.47; cone.castShadow = ball.castShadow = true; body.add(cone, ball);
    }
    root.add(disc, body, ring, mark); world.add(root); return pw;
  }
  const setWalk = (pw, on) => {
    if (!pw.walk || !pw.idle) return;
    const [a, b] = on ? [pw.walk, pw.idle] : [pw.idle, pw.walk];
    a.enabled = true; a.setEffectiveWeight(1); b.setEffectiveWeight(0);
    if (on) pw.walk.time = 0;
  };
  // Frees what a pawn owns: its geometries, skeleton bone texture, own materials. Never the shared procMat or the glTF texture.
  function disposePawn(pw) {
    world.remove(pw.root);
    if (pw.mixer) { pw.mixer.stopAllAction(); pw.mixer.uncacheRoot(pw.mixer.getRoot()); pw.mixer = null; }
    pw.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.skeleton) o.skeleton.dispose();
      for (const m of [].concat(o.material || [])) if (m !== procMat) m.dispose();
    });
  }
  // pawn stand point: front of its tile (the printed art stays visible), small slots when several pawns share a tile
  function pawnTarget(state, p) {
    const t = state.tiles[state.players[p].pos], n = t.occupants.length, sl = pawnSlot(Math.max(0, t.occupants.indexOf(p)), n);
    return V3(tileX(t.c) + sl.x * fs, topOf(t), tileZ(t.r) + sl.d * fs);
  }
  const pawnScale = (n) => (n <= 1 ? 1.25 : n === 2 ? 1.05 : n <= 4 ? 0.85 : 0.7);

  // ----- goal flag + path trail -----
  const GOLD = 0xffb000;
  const goalG = new THREE.Group(); goalG.visible = false; world.add(goalG);
  const POLE_H = 1.4, clothGeo = new THREE.PlaneGeometry(0.62, 0.38, 8, 2).translate(0.31, 0, 0), clothBase = clothGeo.attributes.position.array.slice();
  const flagMat = new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide, toneMapped: false });
  const cloth = new THREE.Mesh(clothGeo, flagMat); cloth.position.set(0.02, POLE_H - 0.21, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, POLE_H, 8).translate(0, POLE_H / 2, 0), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), flagMat); knob.position.y = POLE_H + 0.02;
  const ringTex = canvasTex(128, 128, (g, s) => { g.shadowColor = '#ffb000'; g.shadowBlur = 10; g.strokeStyle = '#f09a00'; g.lineWidth = 9; g.beginPath(); g.arc(s / 2, s / 2, 44, 0, 7); g.stroke(); });
  const goalRing = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
  goalRing.position.y = 0.04; goalRing.renderOrder = 4;
  const flagBase = new THREE.Group(); flagBase.add(pole, cloth, knob); goalG.add(flagBase, goalRing);
  let goalOn = false;
  function animGoal(now, still) {
    if (still) now = 0;
    const pa = clothGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = clothBase[i * 3]; pa.setZ(i, still ? 0 : Math.sin(x * 9 - now / 160) * 0.05 * (x / 0.62)); pa.setY(i, clothBase[i * 3 + 1] + (still ? 0 : Math.sin(x * 7 - now / 200) * 0.012 * x / 0.62)); }
    pa.needsUpdate = true;
    const k = still ? 0.5 : 0.5 + 0.5 * Math.sin(now / 330);
    goalRing.scale.setScalar(still ? 1 : 0.85 + 0.22 * k); goalRing.material.opacity = still ? 1 : 0.5 + 0.5 * (1 - k);
    flagBase.position.y = 0.02 + 0.03 * k;
  }
  function setGoal(idx) {
    goalOn = idx != null && idx >= 0 && idx < 25;
    goalG.visible = goalOn;
    if (goalOn) { const t = BOARD[idx]; goalG.position.set(tileX(t.c), CITY_H, tileZ(t.r)); flagBase.position.set(-0.34 * fs, flagBase.position.y, -0.34 * fs); flagBase.scale.x = fs; }
  }
  // route: pawn tile -> path tiles -> goal city. Every route tile glows; ribbons with direction arrows link them.
  const MAX_SEG = 12, ROUTE_Y = 0.02;
  const tri = (w, h, color, y) => paint(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-w, -h), new THREE.Vector2(w, -h), new THREE.Vector2(0, h)])).rotateX(Math.PI / 2).translate(0, y, 0), color);
  const routeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  const ribbonGeo = mergeGeometries([paint(new THREE.PlaneGeometry(0.16, 1).rotateX(-Math.PI / 2), 0x5a2e08), paint(new THREE.PlaneGeometry(0.1, 1).rotateX(-Math.PI / 2).translate(0, 0.002, 0), 0xffb52e)]);
  const arrowGeo = mergeGeometries([tri(0.2, 0.19, 0x5a2e08, 0.004), tri(0.13, 0.12, 0xfff0a0, 0.006)]);
  const routeMesh = new THREE.Mesh(new THREE.BufferGeometry(), routeMat); // rebuilt only when the route changes: one draw call
  routeMesh.frustumCulled = false; routeMesh.renderOrder = 4; routeMesh.visible = false; world.add(routeMesh);
  const routeGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.14, 1.14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xff9a1f, opacity: 0.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 25);
  routeGlow.frustumCulled = false; routeGlow.renderOrder = 4; world.add(routeGlow);
  let trailKey = '', routeSet = new Set();
  function setPath(state, path, goal) {
    const pts = path && path.length || goal != null ? [state.players[state.active].pos, ...(path || [])] : [];
    if (pts.length && goal != null && pts[pts.length - 1] !== goal) pts.push(goal);
    const key = pts.join(',');
    routeSet = new Set(pts.slice(1)); routeGlow.visible = routeSet.size > 0;
    if (key === trailKey) return;
    trailKey = key;
    const at = (i) => { const t = BOARD[i]; return V3(tileX(t.c), topOf(t) + ROUTE_Y, tileZ(t.r)); }, gs = [];
    for (let i = 0; i + 1 < pts.length && i < MAX_SEG; i++) {
      const a = at(pts[i]), b = at(pts[i + 1]), len = Math.hypot(b.x - a.x, b.z - a.z), mid = a.clone().add(b).multiplyScalar(0.5), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(b.x - a.x, b.z - a.z), 0));
      gs.push(ribbonGeo.clone().applyMatrix4(new THREE.Matrix4().compose(mid, q, V3(1, 1, Math.max(0.2, len - 0.5)))), arrowGeo.clone().applyMatrix4(new THREE.Matrix4().compose(mid, q, V3(1, 1, 1))));
    }
    routeMesh.geometry.dispose(); routeMesh.geometry = gs.length ? mergeGeometries(gs) : new THREE.BufferGeometry(); routeMesh.visible = gs.length > 0;
    routeGlow.visible = routeSet.size > 0;
  }

  // ----- camera: always frames the whole board inside the free area between UI insets -----
  const fitPts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { fitPts.push(V3(sx * HALF, -0.16, sz * HALF), V3(sx * 2.2, 1.65, sz * 2.2), V3(sx * 2.6, 1.65, sz * 2.2)); }
  const gridPts = []; // portrait: fit the 5x5 tile grid only (frame/decor may crop off-screen)
  for (const sx of [-1, 1]) { gridPts.push(V3(sx * 2.72, 0.14, 2.72), V3(sx * 2.72, 0.14, -2.72), V3(sx * 2.4, 1.0, -2.4)); }
  let pts = fitPts;
  const ins = { top: 0, bottom: 0, right: 0 }; // displayed (animated) insets, CSS px
  let vw = 1, vh = 1;
  const ndcBox = () => {
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const c of pts) { const p = c.clone().project(camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return [x0, x1, y0, y1];
  };
  function fitCamera() {
    const w = vw, h = vh, fw = Math.max(40, w - ins.right), fh = Math.max(40, h - ins.top - ins.bottom);
    const portrait = fw / fh < 1; pts = portrait ? gridPts : fitPts;
    const K = portrait ? 1 - 16 / fw : 0.92; // portrait: ~8px gutters
    const cx = fw / 2, cy = ins.top + fh / 2;
    const el = portrait ? 1.2 : 0.95 + 0.15 * THREE.MathUtils.clamp((0.95 - fw / fh) / 0.35, 0, 1); // portrait free area: steeper
    camera.aspect = w / h; camera.clearViewOffset();
    const dir = V3(0, Math.sin(el), Math.cos(el)); let d = 14, box;
    for (let i = 0; i < 6; i++) { // perspective is near-linear in distance: converges in a few steps
      camera.position.copy(dir).multiplyScalar(d); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      box = ndcBox();
      d *= Math.max((box[1] - box[0]) / (2 * K * fw / w), (box[3] - box[2]) / (2 * K * fh / h));
    }
    camera.position.copy(dir).multiplyScalar(d); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); box = ndcBox();
    const sx = cx - ((box[0] + box[1]) / 2 + 1) / 2 * w, sy = cy - (1 - (box[2] + box[3]) / 2) / 2 * h; // px to shift the board centre onto the free-area centre
    camera.setViewOffset(w, h, -sx, -sy, w, h); camera.updateMatrixWorld();
  }
  let insTo = { top: 0, bottom: 0, right: 0 }, camReady = false;
  function setInsets({ top = 0, bottom = 0, right = 0 } = {}) {
    const to = { top: Math.max(0, top), bottom: Math.max(0, bottom), right: Math.max(0, right) };
    if (to.top === insTo.top && to.bottom === insTo.bottom && to.right === insTo.right) return;
    insTo = to;
    wake();
    if (!camReady || first || calm) { Object.assign(ins, to); fitCamera(); return; }
    const from = { ...ins };
    anim('ins', 300, (u) => { const e = u * u * (3 - 2 * u); for (const k in to) ins[k] = from[k] + (to[k] - from[k]) * e; fitCamera(); });
  }

  // ----- animation loop (on demand; throttled idle loop only while character animations exist) -----
  const anims = new Map();
  let raf = 0, timer = 0, pulse = false, lastT = 0, disposed = false, lost = false, activeIdx = 0, shadowDirty = true, lastActivity = performance.now();
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let calm = reducedMotion(); // reduced motion (OS or settings): snap instead of animating, no ornamental loop
  const onMotion = () => { calm = reducedMotion(); wake(); };
  mq.addEventListener('change', onMotion);
  const motionObs = new MutationObserver(onMotion); // settings screen toggles <html data-motion>
  motionObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  const anim = (key, dur, fn) => { anims.set(key, { t0: performance.now(), dur, fn }); wake(); };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const yawBusy = () => pawns.some((p) => Math.abs(wrap(p.yawT - p.yaw)) > 0.01);
  // per-tile dynamic state
  const coins = BOARD.map(() => ({ n: 0, pop: 1 })), closedU = BOARD.map(() => 0), closedWant = BOARD.map(() => false);
  let hl = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
  function layout(now, still) {
    // rings
    for (let i = 0; i < 25; i++) {
      const on = hl.includes(i), t = BOARD[i];
      M.compose(V3(tileX(t.c), topOf(t) + 0.025 + (on && !still ? 0.012 * Math.sin(now / 280 + i) : 0), tileZ(t.r)), Q.identity(), on ? V3(1, 1, 1) : V3(0, 0, 0));
      rings.setMatrixAt(i, M);
    }
    rings.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 25; i++) {
      const on = routeSet.has(i), t = BOARD[i], k = on && !still ? 0.96 + 0.04 * Math.sin(now / 300) : 1;
      M.compose(V3(tileX(t.c), topOf(t) + 0.02, tileZ(t.r)), Q.identity(), on ? V3(k, 1, k) : V3(0, 0, 0)); routeGlow.setMatrixAt(i, M);
    }
    routeGlow.instanceMatrix.needsUpdate = true;
    if (!built) return;
    let nf = 0, nc = 0;
    for (const t of BOARD) {
      const x = tileX(t.c), z = tileZ(t.r), top = topOf(t), c = coins[t.idx];
      const m = medals[t.idx];
      m.visible = c.n > 0;
      if (c.n > 0) {
        if (m.userData.n !== c.n) { m.userData.n = c.n; m.material.map = medalTex_(c.n); m.material.needsUpdate = true; }
        const e = emph.has(t.idx), k = (e ? MEDAL_BIG : MEDAL_BASE) * c.pop * (e && !still ? 1 + 0.06 * Math.sin(now / 260) : 1);
        m.scale.set(k, k, 1); m.position.set(x + 0.28 * fs, top + 0.03, z - 0.28 * fs);
      }
      const u = closedU[t.idx];
      if (u > 0) {
        const drop = (1 - u) * 0.5, sc = V3(u, u, u);
        for (let k = 0; k < 4; k++) { M.compose(V3(x + Math.sin(k * Math.PI / 2) * 0.45 * u, top + drop, z + Math.cos(k * Math.PI / 2) * 0.45 * u), Q.setFromEuler(new THREE.Euler(0, k * Math.PI / 2, 0)), sc); fenceM.setMatrixAt(nf++, M); }
        for (const a of [Math.PI / 4, -Math.PI / 4]) { M.compose(V3(x, top + drop + 0.03, z), Q.setFromEuler(new THREE.Euler(0, a, 0)), V3(u * 1.4, u, u)); fenceM.setMatrixAt(nf++, M); }
        M.compose(V3(x, top + drop + 0.06, z), Q.setFromEuler(new THREE.Euler(0, 0.4, 0)), V3(u * 0.6, u * 0.6, u * 0.6)); crateM.setMatrixAt(nc++, M);
      }
    }
    fenceM.count = nf; crateM.count = nc;
    for (const m of [fenceM, crateM]) m.instanceMatrix.needsUpdate = true;
  }
  function schedule(wait) { if (!raf && !timer) timer = setTimeout(() => { timer = 0; kick(); }, wait); }
  function frame(now) {
    raf = 0;
    if (disposed || lost) return;
    const busy = anims.size > 0 || yawBusy(), act = pawns[activeIdx];
    const ornament = !calm && (pulse || goalOn || !!act);
    const asleep = !busy && ornament && performance.now() - lastActivity > IDLE_SLEEP_MS;
    const wait = (pulse || goalOn ? PULSE_MS : IDLE_MS) - (now - lastT);
    if (!busy && !asleep && wait > 0) { schedule(wait); return; }
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
    const still = calm || asleep; // static pose: no pulse, no flag wave
    for (const [k, a] of anims) { const u = Math.min(1, Math.max(0, (now - a.t0) / a.dur)); a.fn(u); if (u >= 1) anims.delete(k); }
    flushIdle();
    let moved = shadowDirty || anims.size > 0;
    pawns.forEach((p, i) => {
      p.yaw += wrap(p.yawT - p.yaw) * Math.min(1, dt * 14); p.body.rotation.y = p.yaw;
      if (p.ring.visible) { p.ring.scale.setScalar(still ? 1 : 1 + 0.1 * Math.sin(now / 240)); p.mark.position.y = still ? 1.0 : 1.0 + 0.07 * Math.sin(now / 210); p.mark.rotation.y = still ? 0 : now / 600; }
      if (!p.mixer) return;
      const walking = anims.has('p' + i), run = walking || (i === activeIdx && !still);
      if (run) { p.mixer.update(dt); p.live = moved = true; }
      else if (p.live && !(i === activeIdx && asleep)) { if (p.idle) p.idle.time = 0; p.mixer.update(0); p.live = false; moved = true; } // inactive pawn: rewind and freeze
    });
    if (yawBusy()) moved = true;
    if (moved) renderer.shadowMap.needsUpdate = true;
    shadowDirty = false;
    glow.opacity = pulse && !still ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 220)) : 1;
    if (goalOn) animGoal(now, still);
    layout(now, still);
    renderer.render(scene, camera);
    if (anims.size || yawBusy() || (ornament && !asleep)) kick();
  }
  function kick() { clearTimeout(timer); timer = 0; if (!raf && !disposed) raf = requestAnimationFrame(frame); }
  function wake() { lastActivity = performance.now(); kick(); }
  const onVisible = () => { if (!document.hidden) wake(); };
  document.addEventListener('visibilitychange', onVisible);

  // ----- state sync -----
  let first = true, pending = null, seedSeen = null;
  // Pawns never teleport: a move walks tile by tile (cargo flights too), each tile one hop. Back-to-back moves extend the queued route.
  const rest = () => (fs < 0 ? Math.PI : 0); // idle facing: toward the camera
  function place(pw, to, tile, n) {
    anims.delete('p' + pw.i); pw.way = null; setWalk(pw, false);
    pw.root.position.copy(to); pw.target.copy(to); pw.tile = tile; pw.yaw = pw.yawT = rest(); pw.root.scale.setScalar(pawnScale(n));
  }
  function walkTo(pw, i, tile, to) {
    const tiles = walkTiles(pw.tile, tile);
    pw.tile = tile; pw.target.copy(to);
    if (calm) { anims.delete('p' + i); pw.way = null; pw.root.position.copy(to); pw.yaw = pw.yawT = rest(); return; }
    const mid = tiles.slice(0, -1).map((t) => { const b = BOARD[t], sl = pawnSlot(0, 1); return V3(tileX(b.c) + sl.x * fs, topOf(b), tileZ(b.r) + sl.d * fs); });
    const way = [...(pw.way ? pw.way.slice(Math.max(0, pw.segIdx)) : []), ...mid, to.clone()];
    const start = pw.root.position.clone(), ms = way.length > 1 ? STEP_FAST_MS : start.distanceTo(way[0]) < 0.5 ? 200 : STEP_MS;
    pw.way = way; pw.segIdx = -1; setWalk(pw, way.length > 1 || start.distanceTo(way[0]) >= 0.5);
    anim('p' + i, ms * way.length, (u) => {
      const n = way.length, tt = Math.min(n - 1e-6, u * n), k = Math.floor(tt), lu = tt - k, a = k ? way[k - 1] : start, b = way[k], e = lu * lu * (3 - 2 * lu), d = a.distanceTo(b);
      if (pw.segIdx !== k) { pw.segIdx = k; if (d > 0.3) pw.yawT = Math.atan2(b.x - a.x, b.z - a.z); }
      pw.root.position.lerpVectors(a, b, e); pw.root.position.y += Math.sin(Math.PI * lu) * (d < 0.5 ? 0.03 : 0.16);
      if (u >= 1) { pw.root.position.copy(way[n - 1]); pw.yawT = rest(); pw.way = null; setWalk(pw, false); }
    });
  }
  // resolves once every pawn stands still (calm / hidden tab / maxMs: immediately or after the cap, so a stalled frame loop never freezes the game)
  const idleWaiters = [];
  const anyWalking = () => pawns.some((_, i) => anims.has('p' + i));
  function whenIdle(maxMs = 3000) {
    if (calm || disposed || lost || document.hidden || !anyWalking()) return Promise.resolve();
    return new Promise((res) => { const w = { res, t: setTimeout(() => { idleWaiters.splice(idleWaiters.indexOf(w), 1); res(); }, maxMs) }; idleWaiters.push(w); });
  }
  const flushIdle = () => { if (idleWaiters.length && !anyWalking()) for (const w of idleWaiters.splice(0)) { clearTimeout(w.t); w.res(); } };
  // the human's start side goes to the bottom of the screen: the board turns 180 degrees when it starts on the far rows
  function setView(state, viewer) {
    const nfs = viewFlip(state.players[viewer]?.pos) ? -1 : 1;
    if (nfs !== fs) { fs = nfs; world.rotation.y = fs < 0 ? Math.PI : 0; world.updateMatrixWorld(true); if (built) { buildCities(); shadowDirty = true; } }
    turnArt();
  }
  let lastRender = null;
  function render(state, { highlight = [], goal = null, path = [], viewer = null } = {}) { // any `focus` option is ignored: camera always frames the board
    lastRender = [state, { highlight, goal, path, viewer }]; activeIdx = state.active; shadowDirty = true;
    if (!built) { pending = [state, { highlight, goal, path, viewer }]; hl = highlight; pulse = highlight.length > 0; wake(); return; }
    const gid = state.gameId ?? state.seed, fresh = gid !== seedSeen; seedSeen = gid; // new game: snap, no animations
    if (fresh) { first = true; anims.clear(); setView(state, viewer); }
    emph.clear(); for (const i of [...highlight, ...(path || []), ...(goal != null ? [goal] : [])]) emph.add(i);
    setGoal(goal); setPath(state, path, goal);
    state.players.forEach((pl, i) => {
      const to = pawnTarget(state, i), n = state.tiles[pl.pos].occupants.length;
      let pw = pawns[i];
      if (pw && fresh && pw.key !== pawnKey(i, pl.avatar)) { disposePawn(pw); pw = pawns[i] = null; } // yeni oyunda karakter değiştiyse model yenilenir
      if (!pw) { pw = pawns[i] = makePawn(i, pl.color, pl.avatar); pw.i = i; place(pw, to, pl.pos, n); }
      else if (fresh) place(pw, to, pl.pos, n);
      else if (pw.tile !== pl.pos || !pw.target.equals(to)) walkTo(pw, i, pl.pos, to);
      pw.root.scale.setScalar(pawnScale(n)); pw.ring.visible = pw.mark.visible = i === state.active;
    });
    while (pawns.length > state.players.length) disposePawn(pawns.pop());

    for (const t of state.tiles) {
      const c = coins[t.idx];
      if (t.badges !== c.n) {
        c.n = t.badges;
        if (!first && !calm) anim('b' + t.idx, 320, (u) => { c.pop = 1 + 0.5 * Math.sin(Math.PI * u); });
      }
      if (t.closed !== closedWant[t.idx]) {
        closedWant[t.idx] = t.closed;
        const from = closedU[t.idx], to = t.closed ? 1 : 0;
        if (first || calm) { anims.delete('c' + t.idx); closedU[t.idx] = to; } else anim('c' + t.idx, 320, (u) => { closedU[t.idx] = from + (to - from) * u * u * (3 - 2 * u); });
      }
    }
    hl = highlight; pulse = highlight.length > 0;
    first = false; wake();
  }

  // ----- resize -----
  const parent = canvas.parentElement || canvas;
  function resize() {
    const w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    renderer.setSize(w, h, false); vw = w; vh = h; fitCamera(); wake();
  }
  const ro = new ResizeObserver(resize); ro.observe(parent); resize(); camReady = true;
  layout(0);

  // ----- picking: pointerdown/up closer than 8px = tap; pawns/cities get a screen-space proxy, otherwise ground plane -----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(V3(0, 1, 0), -0.12), hitP = V3();
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved >= 8 || !onTileTap) return;
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const scr = (v) => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height]; };
    let best = null, bd = 1e9;
    const probe = (v, rad, idx) => { const [px, py] = scr(v), d = Math.hypot(px - sx, py - sy); if (d < rad && d < bd) { bd = d; best = idx; } };
    pawns.forEach((p) => { const idx = tileAt(p.target.x, p.target.z); if (idx >= 0) probe(world.localToWorld(p.root.position.clone().add(V3(0, 0.3, 0))), 24, idx); });
    for (const c of Object.values(CITIES)) { const t = BOARD[c.tile]; probe(world.localToWorld(V3(tileX(t.c), 0.5, tileZ(t.r))), 30, c.tile); }
    if (best === null) {
      ndc.set((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hitP)) { world.worldToLocal(hitP); const i = tileAt(hitP.x, hitP.z); if (i >= 0) best = i; }
    }
    if (best !== null) onTileTap(best);
  };
  function tileAt(x, z) {
    const c = Math.floor(x / P + 2.5), r = Math.floor(z / P + 2.5);
    return c >= 0 && c < 5 && r >= 0 && r < 5 ? r * 5 + c : -1;
  }
  const onCancel = () => { down = null; };
  canvas.addEventListener('pointerdown', wake); canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);

  function projectTile(idx) {
    const t = BOARD[idx], r = canvas.getBoundingClientRect(), v = V3(tileX(t.c), topOf(t), tileZ(t.r));
    world.localToWorld(v); camera.updateMatrixWorld(); v.project(camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  // ----- WebGL context loss: three.js re-inits its GPU state itself; we redraw and tell the player if it never returns -----
  let lostTimer = 0;
  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert'); notice.hidden = true;
  notice.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;max-width:min(88vw,340px);padding:16px;border-radius:12px;background:#2a1d15;color:#fff0d8;text-align:center;font:16px/1.4 sans-serif;box-shadow:0 4px 24px #0008';
  notice.innerHTML = '<p style="margin:0 0 12px">Ekran bir an dondu. Biraz bekle; düzelmezse Yeniden Yükle\'ye bas.</p><button type="button" style="min-height:44px;padding:0 20px;border:0;border-radius:10px;background:#ffb000;color:#2a1d15;font:bold 16px sans-serif">Yeniden Yükle</button>';
  notice.querySelector('button').addEventListener('click', () => location.reload());
  (canvas.parentElement || document.body).appendChild(notice);
  const onLost = (e) => {
    e.preventDefault(); lost = true; onContextLost && onContextLost(true);
    lostTimer = setTimeout(() => { notice.hidden = false; }, 3000);
  };
  const onRestored = () => {
    clearTimeout(lostTimer); notice.hidden = true; lost = false; onContextLost && onContextLost(false);
    first = true; shadowDirty = true; // badge pops must not replay
    if (lastRender) render(...lastRender); else wake();
  };
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored);

  const ready = Promise.all(jobs).then(() => {
    try { if (pending) setView(pending[0], pending[1].viewer); buildWorld(); } catch (e) { console.error('buildWorld failed', e); }
    if (pending) { const p = pending; pending = null; render(...p); }
    onProgress && onProgress(1); shadowDirty = true; wake();
  }).catch((e) => { console.error(e); onProgress && onProgress(1); });

  function dispose() {
    disposed = true; cancelAnimationFrame(raf); raf = 0; clearTimeout(timer); timer = 0; clearTimeout(lostTimer); notice.remove();
    mq.removeEventListener('change', onMotion); motionObs.disconnect(); document.removeEventListener('visibilitychange', onVisible);
    for (const w of idleWaiters.splice(0)) { clearTimeout(w.t); w.res(); }
    canvas.removeEventListener('pointerdown', wake); canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); anims.clear(); pulse = goalOn = false;
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
    pawns.forEach(disposePawn);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose(); m.dispose(); }
      if (o.isInstancedMesh) o.dispose();
    });
    scene.clear(); renderer.dispose();
  }
  const pawnInfo = () => pawns.map((p, i) => {
    let skinned = 0; p.body.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    return { i, key: p.key, skinned, mixer: p.mixer ? p.mixer.getRoot().uuid : null, idle: !!p.idle && p.idle.isRunning(), x: +p.root.position.x.toFixed(3), z: +p.root.position.z.toFixed(3), moving: anims.has('p' + i), tile: p.tile, flip: fs < 0 };
  });
  const info = () => ({ frames: renderer.info.render.frame, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  return { ready, render, setInsets, projectTile, whenIdle, dispose, info, pawnInfo }; // info(): dev-only stats
}
