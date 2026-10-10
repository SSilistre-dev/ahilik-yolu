// Offline precache list (AHI-036): precache.js is generated; these tests keep it complete and current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildPrecache, render } from '../dev/precache-gen.mjs';
import { MODELS, CARD_ART } from '../src/assets.js';
import { CARDS, ILKE_IDS, CITIES } from '../src/data.js';
import { cardArt } from '../src/ui.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const rel = (href) => fileURLToPath(href).slice(root.length);
const built = buildPrecache(root);
const loaded = (() => { const self = {}; vm.runInNewContext(readFileSync(`${root}precache.js`, 'utf8'), { self }); return JSON.parse(JSON.stringify(self)); })();
const listed = new Set(loaded.ASSET_URLS);

test('precache.js is current (run: node dev/precache-gen.mjs)', () => {
  assert.deepEqual(
    { rev: loaded.ASSETS_REV, shell: loaded.SHELL_FILES, assets: loaded.ASSET_URLS, cdn: loaded.CDN_URLS },
    built,
  );
  assert.equal(readFileSync(`${root}precache.js`, 'utf8'), render(built));
});

test('precache lists exclude lazy and non-asset files', () => {
  assert.ok(built.assets.length > 100);
  assert.ok(built.assets.every((p) => !/\.md$|@2x\.webp$|^assets\/music\/|\.DS_Store/.test(p)));
});

test('precache: every model, its buffers and textures are listed', () => {
  const need = [];
  for (const m of Object.values(MODELS)) {
    const f = rel(m.url);
    need.push(f);
    const dir = f.slice(0, f.lastIndexOf('/') + 1);
    let json = null;
    if (f.endsWith('.gltf')) json = JSON.parse(readFileSync(root + f, 'utf8'));
    else if (f.endsWith('.glb')) { const b = readFileSync(root + f); json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()); }
    for (const x of [...(json?.buffers ?? []), ...(json?.images ?? [])]) if (x.uri && !x.uri.startsWith('data:')) need.push(dir + decodeURIComponent(x.uri));
  }
  assert.ok(need.length > 40);
  assert.deepEqual(need.filter((p) => !listed.has(p)), []);
});

test('precache: every card face, back and board image is listed', () => {
  const need = Object.keys(CARDS).map((id) => rel(cardArt(id)));
  need.push(...ILKE_IDS.map((i) => rel(CARD_ART(`ilke-${i}`))));
  need.push(...Object.keys(CITIES).map((c) => `assets/cards/city-${c}.jpg`));
  need.push(...['board', 'logo', 'ahlak-back', 'yol-back', 'ticaret-back'].map((n) => `assets/cards/${n}.jpg`));
  // literal url('x') names used by ui.js / tutorial.js
  for (const f of ['src/ui.js', 'src/tutorial.js']) {
    for (const m of readFileSync(root + f, 'utf8').matchAll(/\burl\('([a-z0-9-]+)'\)/g)) need.push(`assets/cards/${m[1]}.jpg`);
  }
  assert.ok(need.length > 40);
  assert.deepEqual(need.filter((p) => !listed.has(p)), []);
});

test('precache: both sfx formats are listed', () => {
  const sfx = readdirSync(`${root}assets/sfx`).filter((f) => /\.(ogg|m4a)$/.test(f));
  assert.ok(sfx.length >= 8);
  assert.deepEqual(sfx.map((f) => `assets/sfx/${f}`).filter((p) => !listed.has(p)), []);
});

test('precache: shell holds every src module and each is in the importmap', () => {
  const html = readFileSync(`${root}index.html`, 'utf8');
  for (const f of readdirSync(`${root}src`).filter((n) => n.endsWith('.js'))) {
    assert.ok(loaded.SHELL_FILES.includes(`src/${f}`), `${f} missing from SHELL_FILES`);
    assert.ok(html.includes(`"./src/${f}": "./src/${f}?v=`), `${f} missing from importmap`);
  }
  assert.ok(loaded.SHELL_FILES.includes('style.css'));
});

test('precache: three.js and each addon import is in CDN_URLS', () => {
  assert.ok(loaded.CDN_URLS.some((u) => u.endsWith('/build/three.module.js')));
  for (const m of readFileSync(`${root}src/scene.js`, 'utf8').matchAll(/from 'three\/addons\/([^']+)'/g)) {
    assert.ok(loaded.CDN_URLS.some((u) => u.endsWith(`/examples/jsm/${m[1]}`)), m[1]);
  }
  // GLTFLoader pulls ../utils/BufferGeometryUtils.js itself
  assert.ok(loaded.CDN_URLS.some((u) => u.endsWith('/utils/BufferGeometryUtils.js')));
});

test('precache: asset bytes stay within the 6,000,000 B ceiling', () => {
  const total = loaded.ASSET_URLS.reduce((s, p) => s + statSync(root + p).size, 0);
  assert.ok(total <= 6_000_000, `${total} B`);
  assert.ok(loaded.ASSET_URLS.every((p) => existsSync(root + p)));
});
