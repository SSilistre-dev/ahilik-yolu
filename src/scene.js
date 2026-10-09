import * as THREE from 'three';
import { ILKELER, CITIES, BOARD } from './data.js';

const P = 1.1;            // tile pitch
const ILKE_H = 0.18, CITY_H = 0.1, COIN_H = 0.035, MAX_COINS = 6;
const tileX = (c) => (c - 2) * P, tileZ = (r) => (r - 2) * P;

function canvasTex(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function fitText(g, text, y, maxW, px, color) {
  g.font = `bold ${px}px sans-serif`;
  while (g.measureText(text).width > maxW && px > 12) { px -= 2; g.font = `bold ${px}px sans-serif`; }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, g.canvas.width / 2, y);
}
const ilkeTex = (ilke) => canvasTex(256, (g, s) => {
  g.fillStyle = ILKELER[ilke].color; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6; g.strokeRect(8, 8, s - 16, s - 16);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, 92, 46, 0, 7); g.fill();
  g.fillStyle = ILKELER[ilke].color; g.beginPath(); g.arc(s / 2, 92, 30, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, 92, 14, 0, 7); g.fill();
  fitText(g, ILKELER[ilke].name, 196, s - 36, 44, '#fff');
});
const cityTex = (city) => canvasTex(256, (g, s) => {
  g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#a58a55'; g.lineWidth = 6; g.strokeRect(8, 8, s - 16, s - 16);
  fitText(g, CITIES[city].name, 214, s - 36, 42, '#4a3a1c');
});
const barrierTex = () => canvasTex(128, (g, s) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, s, s); g.fillStyle = '#f2c200';
  for (let i = -s; i < 2 * s; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + s, s); g.lineTo(i + s, s); g.fill(); }
});
const frameTex = () => canvasTex(128, (g, s) => {
  g.shadowColor = '#fff176'; g.shadowBlur = 14; g.strokeStyle = '#fff6a0'; g.lineWidth = 10;
  g.strokeRect(14, 14, s - 28, s - 28);
});
const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
// BoxGeometry material order: +x -x +y -y +z -z; top is +y
const boxMats = (side, top) => [side, side, top, side, side, side];

export function createScene(canvas, { onTileTap } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  canvas.style.touchAction = 'none';
  canvas.style.width = canvas.style.height = '100%';
  canvas.style.display = 'block';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2118);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a48, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-3, 7, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // base plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(5 * P + 0.5, 0.3, 5 * P + 0.5), lam(0x8b5a2b));
  plate.position.y = -0.15; scene.add(plate);

  // shared resources
  const tileGeo = new THREE.BoxGeometry(1, 1, 1);
  const ilkeMats = {}, cityMats = {};
  for (const id in ILKELER) ilkeMats[id] = boxMats(lam(ILKELER[id].color), lam(0xffffff, { map: ilkeTex(id) }));
  for (const id in CITIES) cityMats[id] = boxMats(lam(0xe0d0a8), lam(0xffffff, { map: cityTex(id) }));
  const pawnCone = new THREE.ConeGeometry(0.17, 0.42, 16), pawnBall = new THREE.SphereGeometry(0.11, 16, 12);
  const coinGeo = new THREE.CylinderGeometry(0.13, 0.13, COIN_H, 16), coinMat = lam(0xc9ced4, { emissive: 0x30343a });
  const barGeo = new THREE.BoxGeometry(0.94, 0.22, 0.94), barMat = lam(0xffffff, { map: barrierTex() });
  const frameGeo = new THREE.PlaneGeometry(1.08, 1.08).rotateX(-Math.PI / 2);
  const frameMat = new THREE.MeshBasicMaterial({ map: frameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lmMat = lam(0xb89a63), lmMat2 = lam(0x7d6a44);

  // tiles
  const tileMeshes = [], tops = [], coinGroups = [], coinCount = [], barriers = [], frames = [];
  for (const t of BOARD) {
    const h = t.kind === 'city' ? CITY_H : ILKE_H;
    const m = new THREE.Mesh(tileGeo, t.kind === 'city' ? cityMats[t.city] : ilkeMats[t.ilke]);
    m.scale.set(1, h, 1);
    m.position.set(tileX(t.c), h / 2, tileZ(t.r));
    m.userData.idx = t.idx;
    scene.add(m); tileMeshes.push(m); tops.push(h);
    if (t.kind === 'city') addLandmark(t.city, m.position.x, h, m.position.z);
    const f = new THREE.Mesh(frameGeo, frameMat);
    f.position.set(m.position.x, h + 0.02, m.position.z); f.visible = false; scene.add(f); frames.push(f);
    coinCount.push(0);
  }
  function addLandmark(city, x, y, z) {
    const g = new THREE.Group(); g.position.set(x - 0.27, y, z - 0.2);
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); };
    if (city === 'ankara') { add(new THREE.BoxGeometry(0.4, 0.08, 0.28), lmMat, 0, 0.04, 0); add(new THREE.BoxGeometry(0.3, 0.14, 0.2), lmMat2, 0, 0.15, 0); add(new THREE.BoxGeometry(0.2, 0.06, 0.12), lmMat, 0, 0.25, 0); }
    else if (city === 'konya') { add(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12), lmMat, 0, 0.1, 0); add(new THREE.ConeGeometry(0.1, 0.2, 12), lam(0x2a9d8f), 0, 0.3, 0); }
    else if (city === 'kayseri') { add(new THREE.BoxGeometry(0.28, 0.16, 0.28), lmMat, 0, 0.08, 0); add(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), lmMat2, 0, 0.24, 0); add(new THREE.ConeGeometry(0.11, 0.14, 12), lam(0x8a3b2a), 0, 0.39, 0); }
    else { add(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 12), lmMat, 0, 0.05, 0); add(new THREE.BoxGeometry(0.16, 0.2, 0.16), lmMat2, 0, 0.2, 0); add(new THREE.BoxGeometry(0.2, 0.04, 0.2), lmMat, 0, 0.32, 0); }
    scene.add(g);
  }

  // camera fit: closed-form distance so the plate's bounding box fits at any aspect
  const dir = new THREE.Vector3(0, Math.sin(1.0), Math.cos(1.0));
  const half = (5 * P + 0.5) / 2, corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-0.3, 0.7]) corners.push(new THREE.Vector3(sx * half, y, sz * half));
  function fitCamera(w, h) {
    camera.aspect = w / h;
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tx = ty * camera.aspect, k = 0.97;
    camera.position.copy(dir).multiplyScalar(10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    let d = 0;
    for (const c of corners) {
      const p = c.clone().applyMatrix4(camera.matrixWorldInverse), zrel = p.z + 10;
      d = Math.max(d, Math.abs(p.x) / (tx * k) + zrel, Math.abs(p.y) / (ty * k) + zrel);
    }
    camera.position.copy(dir).multiplyScalar(d); camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  // pawns
  const pawns = [];
  function makePawn(color) {
    const g = new THREE.Group(), mat = lam(color);
    const cone = new THREE.Mesh(pawnCone, mat); cone.position.y = 0.21;
    const ball = new THREE.Mesh(pawnBall, mat); ball.position.y = 0.5;
    g.add(cone, ball); scene.add(g); return g;
  }
  function pawnTarget(state, p) {
    const t = state.tiles[state.players[p].pos], n = t.occupants.length, i = Math.max(0, t.occupants.indexOf(p));
    const bx = tileX(t.c), bz = tileZ(t.r) + (t.kind === 'city' ? 0.18 : 0);
    const a = (2 * Math.PI * i) / n - Math.PI / 2, r = n > 1 ? 0.2 : 0;
    return new THREE.Vector3(bx + Math.cos(a) * r, tops[t.idx], bz + Math.sin(a) * r);
  }

  // animation loop (on demand)
  const anims = new Map();
  let raf = 0, pulse = false;
  const anim = (key, dur, fn) => { anims.set(key, { t0: performance.now(), dur, fn }); kick(); };
  function frame(now) {
    raf = 0;
    for (const [k, a] of anims) { const u = Math.min(1, Math.max(0, (now - a.t0) / a.dur)); a.fn(u); if (u >= 1) anims.delete(k); }
    if (pulse) frameMat.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 220));
    renderer.render(scene, camera);
    if (anims.size || pulse) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  // state sync (animations come from diffing against what is currently shown)
  let first = true;
  function render(state, { highlight = [] } = {}) {
    state.players.forEach((pl, i) => {
      const to = pawnTarget(state, i);
      let pw = pawns[i];
      if (!pw) { pw = pawns[i] = makePawn(pl.color); pw.position.copy(to); pw.userData.target = to; }
      if (!pw.userData.target.equals(to)) {
        const from = pw.position.clone(), h = Math.min(0.45, 0.15 + from.distanceTo(to) * 0.2);
        pw.userData.target = to;
        anim('p' + i, 350, (u) => { pw.position.lerpVectors(from, to, u); pw.position.y += Math.sin(Math.PI * u) * h; });
      }
    });
    while (pawns.length > state.players.length) scene.remove(pawns.pop());

    for (const t of state.tiles) {
      const n = Math.min(t.badges, MAX_COINS);
      if (n !== coinCount[t.idx]) {
        if (coinGroups[t.idx]) scene.remove(coinGroups[t.idx]);
        coinGroups[t.idx] = null;
        if (n) {
          const g = new THREE.Group(); g.position.set(tileX(t.c) + 0.3, tops[t.idx], tileZ(t.r) - 0.3);
          for (let k = 0; k < n; k++) { const c = new THREE.Mesh(coinGeo, coinMat); c.position.y = COIN_H / 2 + k * COIN_H; g.add(c); }
          scene.add(g); coinGroups[t.idx] = g;
          if (!first) anim('b' + t.idx, 300, (u) => g.scale.setScalar(1 + 0.45 * Math.sin(Math.PI * u)));
        }
        coinCount[t.idx] = n;
      }
      if (t.closed && !barriers[t.idx]) {
        const b = new THREE.Mesh(barGeo, barMat); b.position.set(tileX(t.c), tops[t.idx] + 0.11, tileZ(t.r));
        scene.add(b); barriers[t.idx] = b;
      }
      if (barriers[t.idx]) barriers[t.idx].visible = t.closed;
    }
    frames.forEach((f, i) => { f.visible = highlight.includes(i); });
    pulse = highlight.length > 0;
    if (!pulse) frameMat.opacity = 1;
    first = false;
    kick();
  }

  // resize
  const parent = canvas.parentElement || canvas;
  function resize() {
    const w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    renderer.setSize(w, h, false); fitCamera(w, h); kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(parent); resize();

  // picking: pointerdown/up closer than 8px = tap
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved >= 8) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(tileMeshes, false)[0];
    if (hit && onTileTap) onTileTap(hit.object.userData.idx);
  };
  const onCancel = () => { down = null; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  function dispose() {
    cancelAnimationFrame(raf); raf = 0; anims.clear(); pulse = false;
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    scene.clear(); renderer.dispose();
  }
  return { render, dispose };
}
