// 3D world: "Anatolian caravan diorama". Owner: scene agent. Contract: SPEC.md "v2".
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ILKELER, CITIES, BOARD, neighbors } from './data.js';
import { MODELS, CARD_ART } from './assets.js';

const P = 1.1;                     // tile pitch
const HALF = 3.25;                 // terrain plate half size
const BASE_H = 0.1, CITY_H = 0.14; // tile top heights
const ART = 0.7, ART_OFF = 0.07;   // printed art plate size and shift toward the camera
const PULSE_MS = 33;               // goal/highlight pulse redraw interval (~30 fps)
const IDLE_MS = 66;                // idle animation redraw interval (~15 fps)
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
export function createScene(canvas, { onTileTap, onProgress } = {}) {
  THREE.Cache.enabled = true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
        for (const [mat, gs] of by) { const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); }
        by.clear();
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
  table.position.y = -0.16; table.receiveShadow = true; scene.add(table);
  const sandT = sandTex();
  const plate = new THREE.Mesh(slab(HALF * 2, 0.8, 0.16, 0.07, 0xffffff, 0xa07c4c, true).translate(0, -0.16, 0), lam(0xffffff, { map: sandT, vertexColors: true }));
  plate.receiveShadow = true; scene.add(plate);

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
      a.rotateX(-Math.PI / 2); a.translate(x + ART_OFF * 0.6, top + 0.004, z + ART_OFF);
      (artGeos[t.ilke] = artGeos[t.ilke] || []).push(a);
    }
  }
  for (const id in artGeos) { const m = new THREE.Mesh(mergeGeometries(artGeos[id]), artMats[id]); m.receiveShadow = true; scene.add(m); }
  // swap in printed art when it loads; fallback canvas stays if the file is missing
  for (const id in ILKELER) {
    jobs.push(new Promise((res) => texLoader.load(CARD_ART('ilke-' + id), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      artTex[id].dispose(); artTex[id] = tex; artMats[id].map = artMats[id].emissiveMap = tex; artMats[id].needsUpdate = true; res(); kick();
    }, undefined, () => res())));
  }

  // highlight rings (one instanced mesh)
  const glow = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.14, 1.14).rotateX(-Math.PI / 2), glow, 25);
  rings.frustumCulled = false; rings.renderOrder = 5; scene.add(rings);

  // ----- model-dependent world, built once loading settles -----
  let coinS, coinG, fenceM, crateM, built = false;
  const cityLabels = [], pawns = [];
  const ILKE_PROP_SPOT = { x: -0.32, z: -0.32 };
  function buildWorld() {
    const rnd = mulberry(11);
    // ilke props at the back-left corner of every ilke tile
    for (const t of BOARD) {
      if (t.kind !== 'ilke') continue;
      const x = tileX(t.c) + ILKE_PROP_SPOT.x, z = tileZ(t.r) + ILKE_PROP_SPOT.z, y = BASE_H, ry = (t.idx % 3 - 1) * 0.45;
      const loc = (px, pz) => [x + px, y, z + pz];
      switch (t.ilke) {
        case 'comert': statics.put('chest', ...loc(0, 0), 1, ry); statics.put('coinGold', ...loc(0.19, 0.08), 0.8); statics.put('coinGold', x + 0.19, y + 0.032, z + 0.08, 0.8, 0.5); break;
        case 'bilgili': statics.put('journal', ...loc(0.02, 0.02), 1, ry); break;
        case 'disiplinli': statics.put('hourglass', ...loc(0, 0), 1, ry); break;
        case 'durust': statics.put('lantern', ...loc(0, 0), 1, ry); break;
        case 'merhametli': statics.put('well', ...loc(0, 0), 1, ry); break;
        case 'adaletli': { // procedural scales
          const ps = [piece(G.cyl(0.075, 0.085, 0.03), 0x7a5a3a, 0, 0.015, 0), piece(G.cyl(0.014, 0.018, 0.27), 0xe0b23c, 0, 0.165, 0),
            piece(G.box(0.3, 0.024, 0.024), 0xe0b23c, 0, 0.29, 0), piece(G.sph(0.02), 0xe0b23c, 0, 0.31, 0)];
          for (const s of [-1, 1]) ps.push(piece(G.cyl(0.07, 0.055, 0.016), 0xd9d2c0, s * 0.14, 0.15, 0), piece(G.cyl(0.003, 0.003, 0.13), 0x8a7a50, s * 0.14, 0.22, 0));
          statics.add(ps, compose(x, y, z, 1, ry)); break;
        }
        case 'tokgozlu': { // plate with bread + sack
          const ps = [piece(G.cyl(0.1, 0.085, 0.018), 0xe8dcc0, 0, 0.009, 0), piece(G.sph(0.07), 0xc98a3c, -0.025, 0.04, 0.0, { s: [1.1, 0.6, 0.8], ry: 0.4 }), piece(G.sph(0.05), 0xb8782e, 0.04, 0.036, 0.03, { s: [1, 0.6, 0.8], ry: -0.5 })];
          statics.add(ps, compose(x, y, z, 1, ry)); statics.put('sack', x + 0.2, y, z + 0.1, 1, 0.5); break;
        }
      }
    }
    // cities
    for (const t of BOARD.filter((b) => b.kind === 'city')) {
      const x = tileX(t.c), z = tileZ(t.r), y = CITY_H, c = t.city;
      if (c === 'ankara') {
        // castle on a rocky mound: tall keep behind, gate towers + gate wall in front
        lands.add([piece(G.cyl(0.42, 0.5, 0.1, 8), 0x8d7a5c, 0, 0.05, 0, { ry: 0.2 }), piece(G.cyl(0.33, 0.4, 0.1, 7), 0xa08c6a, 0, 0.15, 0, { ry: 0.5 })], compose(x, y - 0.02, z));
        const tw = (px, pz, n, s) => { let h = 0.23; lands.put('towerBase', x + px, y + h, z + pz, s); h += s; if (n > 1) { lands.put('towerMid', x + px, y + h, z + pz, s); h += s; } lands.put('towerRoof', x + px, y + h, z + pz, s); };
        tw(0, -0.14, 2, 0.36); tw(-0.3, 0.2, 1, 0.27); tw(0.3, 0.2, 1, 0.27);
        lands.put('wall', x, y + 0.23, z + 0.2, [0.4, 0.22, 0.26], 0); lands.put('gate', x, y + 0.23, z + 0.2, [0.7, 0.45, 0.45], Math.PI / 2);
        lands.put('wall', x - 0.15, y + 0.23, z + 0.03, [0.4, 0.22, 0.26], 0.9); lands.put('wall', x + 0.15, y + 0.23, z + 0.03, [0.4, 0.22, 0.26], -0.9);
      } else if (c === 'kirsehir') { // turbe: hexagonal tower + blue cone roof, tent beside it
        lands.put('hexBase', x - 0.05, y, z - 0.08, 0.58); lands.put('hexRoof', x - 0.05, y + 1.31 * 0.58, z - 0.08, 0.58);
        statics.put('tent', x + 0.3, y, z + 0.3, 0.8, -0.5); statics.put('palmShort', x - 0.36, y, z + 0.3, 0.8);
      } else if (c === 'konya') { // dome (turquoise) + minaret + small house
        const ps = [piece(G.cyl(0.26, 0.28, 0.06), 0xe6d6aa, 0, 0.03, 0), piece(G.cyl(0.21, 0.21, 0.24), 0xf1e6c8, 0, 0.18, 0), piece(G.dome(0.24), 0x23a6a0, 0, 0.3, 0),
          piece(G.cyl(0.012, 0.012, 0.12), 0xe0b23c, 0, 0.6, 0), piece(G.sph(0.025), 0xe0b23c, 0, 0.67, 0),
          piece(G.cyl(0.04, 0.055, 0.75), 0xf1e6c8, -0.34, 0.375, 0.14), piece(G.cyl(0.075, 0.075, 0.03), 0xd9c9a0, -0.34, 0.58, 0.14), piece(G.cone(0.06, 0.22), 0x23a6a0, -0.34, 0.86, 0.14)];
        lands.add(ps, compose(x + 0.08, y, z - 0.06));
        statics.put('house', x + 0.3, y, z + 0.32, 0.7, 0.3);
      } else { // kumbet: tall hexagonal tower with cone roof, two market stalls in front
        lands.put('hexBase', x, y, z - 0.14, 0.5); lands.put('hexRoof', x, y + 1.31 * 0.5, z - 0.14, 0.5);
        statics.put('stallRed', x - 0.28, y, z + 0.3, 0.8, 0.2); statics.put('stallGreen', x + 0.28, y, z + 0.3, 0.8, -0.2);
      }
    }
    // desert dressing around the plate edge
    const kinds = ['palmTall', 'palmShort', 'cactus', 'rockA', 'rockB', 'rockC', 'rockD', 'grass', 'grass', 'tree', 'trees', 'palmTall'];
    const low = ['cactus', 'rockA', 'rockB', 'rockC', 'rockD', 'grass', 'grass', 'grass'];
    for (let i = 0; i < 44; i++) {
      const side = Math.floor(rnd() * 4), t = (rnd() * 2 - 1) * 3.0, d = 2.98 + rnd() * 0.12;
      const pool = side === 1 ? low : kinds, k = pool[Math.floor(rnd() * pool.length)]; // front edge stays low so tiles stay readable
      const [px, pz] = side < 2 ? [t, d * (side ? 1 : -1)] : [d * (side === 2 ? 1 : -1), t];
      statics.put(k, px, 0, pz, 0.85 + rnd() * 0.4, rnd() * 6.28);
    }
    statics.put('wheelbarrow', 0.9, 0, 3.0, 1, 0.4); statics.put('crate', 1.3, 0, 3.02, 1, 0.2); statics.put('barrel', -1.2, 0, 3.02, 1, 0); statics.put('sack', -0.9, 0, 3.05, 1, 1); statics.put('cart', -2.6, 0, 3.0, 1.2, 1.7);
    statics.build(false, true); lands.build(true, true);

    for (const [id, c] of Object.entries(CITIES)) {
      const t = BOARD[c.tile], s = labelSprite(c.name);
      s.position.set(tileX(t.c), { ankara: 1.5, kirsehir: 1.12, konya: 1.15, kayseri: 1.05 }[id], tileZ(t.r)); scene.add(s); cityLabels.push(s);
    }
    // instanced coins + barricade pieces
    const inst = (key, n) => { const p = parts(key)[0], m = new THREE.InstancedMesh(p.geo, p.mat, n); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
    coinS = inst('coinSilver', 25 * 5); coinG = inst('coinGold', 25 * 5); fenceM = inst('fence', 25 * 6); crateM = inst('crate', 25);
    built = true;
  }

  // ----- pawns -----
  const clips = {};
  function makePawn(i, color) {
    const root = new THREE.Group(), body = new THREE.Group(), cfg = MODELS['pawn' + (i % 4)], g = loaded['pawn' + (i % 4)], model = g && cloneSkinned(g.scene); // per-pawn clone: one Object3D has one parent
    const disc = new THREE.Mesh(mergeGeometries([paint(norm(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 24), true), color), paint(norm(new THREE.TorusGeometry(0.205, 0.014, 6, 28).rotateX(Math.PI / 2).translate(0, 0.025, 0), true), 0xfff4d6)]), procMat);
    disc.receiveShadow = true; disc.position.y = 0.025; body.position.y = 0.04;
    const pw = { root, body, mixer: null, idle: null, walk: null, yaw: 0, yawT: 0, target: V3(), init: false };
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
    root.add(disc, body); scene.add(root); return pw;
  }
  const setWalk = (pw, on) => {
    if (!pw.walk || !pw.idle) return;
    const [a, b] = on ? [pw.walk, pw.idle] : [pw.idle, pw.walk];
    a.enabled = true; a.setEffectiveWeight(1); b.setEffectiveWeight(0);
    if (on) pw.walk.time = 0;
  };
  function pawnTarget(state, p) {
    const t = state.tiles[state.players[p].pos], n = t.occupants.length, i = Math.max(0, t.occupants.indexOf(p));
    const bx = tileX(t.c) + ART_OFF * 0.6, bz = tileZ(t.r) + ART_OFF + (t.kind === 'city' ? 0.06 : 0);
    const a = (2 * Math.PI * i) / n - Math.PI / 2 + 0.4, r = n > 1 ? 0.2 : 0;
    return V3(bx + Math.cos(a) * r, topOf(t), bz + Math.sin(a) * r);
  }

  // ----- goal flag + path trail -----
  const GOLD = 0xffb000;
  const goalG = new THREE.Group(); goalG.visible = false; scene.add(goalG);
  const POLE_H = 1.4, clothGeo = new THREE.PlaneGeometry(0.62, 0.38, 8, 2).translate(0.31, 0, 0), clothBase = clothGeo.attributes.position.array.slice();
  const flagMat = new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide, toneMapped: false });
  const cloth = new THREE.Mesh(clothGeo, flagMat); cloth.position.set(0.02, POLE_H - 0.21, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, POLE_H, 8).translate(0, POLE_H / 2, 0), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), flagMat); knob.position.y = POLE_H + 0.02;
  const ringTex = canvasTex(128, 128, (g, s) => { g.shadowColor = '#ffb000'; g.shadowBlur = 10; g.strokeStyle = '#f09a00'; g.lineWidth = 9; g.beginPath(); g.arc(s / 2, s / 2, 44, 0, 7); g.stroke(); });
  const goalRing = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
  goalRing.position.y = 0.04; goalRing.renderOrder = 4;
  const flagBase = new THREE.Group(); flagBase.position.set(0, 0.0, 0.42); flagBase.add(pole, cloth, knob); goalG.add(flagBase, goalRing);
  let goalOn = false;
  function animGoal(now) {
    const pa = clothGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = clothBase[i * 3]; pa.setZ(i, Math.sin(x * 9 - now / 160) * 0.05 * (x / 0.62)); pa.setY(i, clothBase[i * 3 + 1] + Math.sin(x * 7 - now / 200) * 0.012 * x / 0.62); }
    pa.needsUpdate = true;
    const k = 0.5 + 0.5 * Math.sin(now / 330);
    goalRing.scale.setScalar(0.85 + 0.22 * k); goalRing.material.opacity = 0.5 + 0.5 * (1 - k);
    flagBase.position.y = 0.02 + 0.03 * k;
  }
  function setGoal(idx) {
    goalOn = idx != null && idx >= 0 && idx < 25;
    goalG.visible = goalOn;
    if (goalOn) { const t = BOARD[idx]; goalG.position.set(tileX(t.c), CITY_H, tileZ(t.r)); }
  }
  // dotted trail: pawn tile -> path tiles -> goal city, one InstancedMesh of flat discs
  const MAX_DOTS = 120, DOT_STEP = 0.32;
  const dotGeo = mergeGeometries([paint(new THREE.CircleGeometry(0.1, 14).rotateX(-Math.PI / 2), 0x6b3a0c), paint(new THREE.CircleGeometry(0.068, 14).rotateX(-Math.PI / 2).translate(0, 0.003, 0), 0xffb52e)]);
  const trail = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }), MAX_DOTS);
  trail.frustumCulled = false; trail.count = 0; trail.renderOrder = 3; scene.add(trail);
  let trailKey = '';
  function setPath(state, path, goal) {
    const pts = (path || []).slice();
    if (pts.length && goal != null && pts[pts.length - 1] !== goal) pts.push(goal);
    let from = null;
    if (pts.length) { // trail starts at the pawn standing next to the first path tile (active player preferred)
      const nb = neighbors(pts[0]), order = [state.active, ...state.players.map((_, i) => i)];
      for (const p of order) if (state.players[p] && nb.includes(state.players[p].pos)) { from = state.players[p].pos; break; }
      if (from !== null) pts.unshift(from);
    }
    const key = pts.join(',');
    if (key === trailKey) return;
    trailKey = key; let n = 0;
    const at = (i) => { const t = BOARD[i]; return [tileX(t.c), tileZ(t.r), topOf(t) + 0.012]; };
    for (let i = 0; i + 1 < pts.length && n < MAX_DOTS; i++) {
      const [x0, z0, y0] = at(pts[i]), [x1, z1, y1] = at(pts[i + 1]), len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.round(len / DOT_STEP));
      for (let k = i ? 1 : 0; k <= steps && n < MAX_DOTS; k++) {
        const u = k / steps, big = k === steps ? 1.5 : 1; // tile-centre dots slightly bigger
        M.compose(V3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u), Q.identity(), V3(big, 1, big)); trail.setMatrixAt(n++, M);
      }
    }
    trail.count = n; trail.instanceMatrix.needsUpdate = true;
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
    if (!camReady || first) { Object.assign(ins, to); fitCamera(); kick(); return; }
    const from = { ...ins };
    anim('ins', 300, (u) => { const e = u * u * (3 - 2 * u); for (const k in to) ins[k] = from[k] + (to[k] - from[k]) * e; fitCamera(); });
  }

  // ----- animation loop (on demand; throttled idle loop only while character animations exist) -----
  const anims = new Map();
  let raf = 0, pulse = false, lastT = 0, disposed = false;
  const anim = (key, dur, fn) => { anims.set(key, { t0: performance.now(), dur, fn }); kick(); };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const yawBusy = () => pawns.some((p) => Math.abs(wrap(p.yawT - p.yaw)) > 0.01);
  const idleLoop = () => pawns.some((p) => p.mixer);
  // per-tile dynamic state
  const coins = BOARD.map(() => ({ s: 0, g: 0, pop: 1 })), closedU = BOARD.map(() => 0), closedWant = BOARD.map(() => false);
  let hl = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
  function layout(now) {
    // rings
    for (let i = 0; i < 25; i++) {
      const on = hl.includes(i), t = BOARD[i];
      M.compose(V3(tileX(t.c), topOf(t) + 0.025 + (on ? 0.012 * Math.sin(now / 280 + i) : 0), tileZ(t.r)), Q.identity(), on ? V3(1, 1, 1) : V3(0, 0, 0));
      rings.setMatrixAt(i, M);
    }
    rings.instanceMatrix.needsUpdate = true;
    if (!built) return;
    let ns = 0, ng = 0, nf = 0, nc = 0;
    for (const t of BOARD) {
      const x = tileX(t.c), z = tileZ(t.r), top = topOf(t), c = coins[t.idx];
      for (let k = 0; k < c.s; k++) { M.compose(V3(x + 0.36, top + k * 0.04, z - 0.36), Q.identity(), V3(c.pop, c.pop, c.pop)); coinS.setMatrixAt(ns++, M); }
      for (let k = 0; k < c.g; k++) { M.compose(V3(x + 0.17, top + k * 0.04, z - 0.4), Q.identity(), V3(c.pop, c.pop, c.pop)); coinG.setMatrixAt(ng++, M); }
      const u = closedU[t.idx];
      if (u > 0) {
        const drop = (1 - u) * 0.5, sc = V3(u, u, u);
        for (let k = 0; k < 4; k++) { M.compose(V3(x + Math.sin(k * Math.PI / 2) * 0.45 * u, top + drop, z + Math.cos(k * Math.PI / 2) * 0.45 * u), Q.setFromEuler(new THREE.Euler(0, k * Math.PI / 2, 0)), sc); fenceM.setMatrixAt(nf++, M); }
        for (const a of [Math.PI / 4, -Math.PI / 4]) { M.compose(V3(x, top + drop + 0.03, z), Q.setFromEuler(new THREE.Euler(0, a, 0)), V3(u * 1.4, u, u)); fenceM.setMatrixAt(nf++, M); }
        M.compose(V3(x, top + drop + 0.06, z), Q.setFromEuler(new THREE.Euler(0, 0.4, 0)), V3(u * 0.6, u * 0.6, u * 0.6)); crateM.setMatrixAt(nc++, M);
      }
    }
    coinS.count = ns; coinG.count = ng; fenceM.count = nf; crateM.count = nc;
    for (const m of [coinS, coinG, fenceM, crateM]) m.instanceMatrix.needsUpdate = true;
  }
  function frame(now) {
    raf = 0;
    if (disposed) return;
    const busy = anims.size > 0 || yawBusy();
    if (!busy && now - lastT < (pulse || goalOn ? PULSE_MS : IDLE_MS)) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
    for (const [k, a] of anims) { const u = Math.min(1, Math.max(0, (now - a.t0) / a.dur)); a.fn(u); if (u >= 1) anims.delete(k); }
    for (const p of pawns) { p.yaw += wrap(p.yawT - p.yaw) * Math.min(1, dt * 14); p.body.rotation.y = p.yaw; if (p.mixer) p.mixer.update(dt); }
    if (pulse) glow.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 220)); else glow.opacity = 1;
    if (goalOn) animGoal(now);
    layout(now);
    renderer.render(scene, camera);
    if (anims.size || pulse || goalOn || yawBusy() || idleLoop()) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !disposed) raf = requestAnimationFrame(frame); }

  // ----- state sync -----
  let first = true, pending = null, seedSeen = null;
  function hop(pw, i, to) {
    const from = pw.root.position.clone(), d = from.distanceTo(to);
    const dur = d < 0.5 ? 220 : d < 1.8 ? 400 : Math.min(900, 400 + d * 120), h = d < 0.5 ? 0.03 : d < 1.8 ? 0.14 : Math.min(0.8, 0.3 + d * 0.18), walk = d >= 0.5;
    if (d > 0.3) pw.yawT = Math.atan2(to.x - from.x, to.z - from.z);
    if (walk) setWalk(pw, true);
    pw.target.copy(to);
    anim('p' + i, dur, (u) => {
      const e = u * u * (3 - 2 * u); pw.root.position.lerpVectors(from, to, e); pw.root.position.y += Math.sin(Math.PI * u) * h;
      if (u >= 1) { pw.root.position.copy(to); pw.yawT = 0; if (walk) setWalk(pw, false); }
    });
  }
  function render(state, { highlight = [], goal = null, path = [] } = {}) { // any `focus` option is ignored: camera always frames the board
    if (!built) { pending = [state, { highlight, goal, path }]; hl = highlight; pulse = highlight.length > 0; kick(); return; }
    const fresh = state.seed !== seedSeen; seedSeen = state.seed; // new game: snap, no animations
    if (fresh) { first = true; anims.clear(); }
    setGoal(goal); setPath(state, path, goal);
    state.players.forEach((pl, i) => {
      const to = pawnTarget(state, i);
      let pw = pawns[i];
      if (!pw) { pw = pawns[i] = makePawn(i, pl.color); pw.root.position.copy(to); pw.target.copy(to); }
      else if (fresh) { setWalk(pw, false); pw.yaw = pw.yawT = 0; pw.root.position.copy(to); pw.target.copy(to); }
      else if (!pw.target.equals(to)) hop(pw, i, to);
    });
    while (pawns.length > state.players.length) { const p = pawns.pop(); scene.remove(p.root); p.mixer && p.mixer.stopAllAction(); }

    for (const t of state.tiles) {
      const c = coins[t.idx], s = Math.min(4, t.badges % 5), g = Math.min(5, Math.floor(t.badges / 5));
      if (s !== c.s || g !== c.g) {
        c.s = s; c.g = g;
        if (!first) anim('b' + t.idx, 320, (u) => { c.pop = 1 + 0.5 * Math.sin(Math.PI * u); });
      }
      if (t.closed !== closedWant[t.idx]) {
        closedWant[t.idx] = t.closed;
        const from = closedU[t.idx], to = t.closed ? 1 : 0;
        if (first) closedU[t.idx] = to; else anim('c' + t.idx, 320, (u) => { closedU[t.idx] = from + (to - from) * u * u * (3 - 2 * u); });
      }
    }
    hl = highlight; pulse = highlight.length > 0;
    first = false; kick();
  }

  // ----- resize -----
  const parent = canvas.parentElement || canvas;
  function resize() {
    const w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    renderer.setSize(w, h, false); vw = w; vh = h; fitCamera(); kick();
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
    pawns.forEach((p) => { const idx = tileAt(p.target.x, p.target.z); if (idx >= 0) probe(p.root.position.clone().add(V3(0, 0.3, 0)), 24, idx); });
    for (const c of Object.values(CITIES)) { const t = BOARD[c.tile]; probe(V3(tileX(t.c), 0.5, tileZ(t.r)), 30, c.tile); }
    if (best === null) {
      ndc.set((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hitP)) { const i = tileAt(hitP.x, hitP.z); if (i >= 0) best = i; }
    }
    if (best !== null) onTileTap(best);
  };
  function tileAt(x, z) {
    const c = Math.floor(x / P + 2.5), r = Math.floor(z / P + 2.5);
    return c >= 0 && c < 5 && r >= 0 && r < 5 ? r * 5 + c : -1;
  }
  const onCancel = () => { down = null; };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);

  function projectTile(idx) {
    const t = BOARD[idx], r = canvas.getBoundingClientRect(), v = V3(tileX(t.c), topOf(t), tileZ(t.r));
    camera.updateMatrixWorld(); v.project(camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  const ready = Promise.all(jobs).then(() => {
    try { buildWorld(); } catch (e) { console.error('buildWorld failed', e); }
    if (pending) { const p = pending; pending = null; render(...p); }
    onProgress && onProgress(1); kick();
  }).catch((e) => { console.error(e); onProgress && onProgress(1); });

  function dispose() {
    disposed = true; cancelAnimationFrame(raf); raf = 0; anims.clear(); pulse = goalOn = false;
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
    pawns.forEach((p) => p.mixer && p.mixer.stopAllAction());
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose(); m.dispose(); }
      if (o.isInstancedMesh) o.dispose();
    });
    scene.clear(); renderer.dispose();
  }
  const pawnInfo = () => pawns.map((p, i) => {
    let skinned = 0; p.body.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    return { i, skinned, mixer: p.mixer ? p.mixer.getRoot().uuid : null, idle: !!p.idle && p.idle.isRunning(), x: +p.root.position.x.toFixed(3), z: +p.root.position.z.toFixed(3), moving: anims.has('p' + i) };
  });
  const info = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  return { ready, render, setInsets, projectTile, dispose, info, pawnInfo }; // info(): dev-only stats
}
