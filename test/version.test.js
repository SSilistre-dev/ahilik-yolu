// ?v= / sw.js V senkron kapısı (AHI-038). Elle artırma unutulunca eski modül önbellekten gelir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const srcFiles = () => readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js')).sort();

// Hata listesi döner; boşsa tutarlı.
export function checkVersions({ html, sw, files, sources }) {
  const errs = [];
  const swV = sw.match(/^const V = (\d+);/m)?.[1];
  if (!swV) return ['sw.js: "const V = <sayı>;" satırı yok'];
  const found = [...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]);
  if (!found.length) errs.push('index.html: hiç ?v= yok');
  for (const v of new Set(found)) if (v !== swV) errs.push(`index.html ?v=${v} ama sw.js V=${swV}`);
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? '{"imports":{}}').imports;
  for (const f of files) {
    const key = `./src/${f}`;
    if (map[key] !== `${key}?v=${swV}`) errs.push(`importmap: ${key} -> ${map[key] ?? 'YOK'} (beklenen ${key}?v=${swV})`);
  }
  // Kabuk modül listesi precache.js'te üretilir; test/precache.test.js denetler.
  if (!/import\(\s*['"]\.\/src\/main\.js['"]\s*\)/.test(html)) errs.push('index.html: satır içi `import("./src/main.js")` yok (giriş modülü importmap\'ten geçmeli)');
  for (const [f, code] of Object.entries(sources)) for (const m of code.matchAll(/(?:from|import)\s*['"](\.\/[^'"]+)['"]/g)) {
    if (!map[`./src/${m[1].slice(2)}`]) errs.push(`src/${f}: ${m[1]} importmap'te yok (sürümsüz yüklenir)`);
  }
  return errs;
}

const live = () => {
  const files = srcFiles();
  return { html: read('index.html'), sw: read('sw.js'), files, sources: Object.fromEntries(files.map((f) => [f, read(`src/${f}`)])) };
};

test('version: index.html ?v=, importmap, sw.js V ve modül listesi tutarlı', () => {
  assert.deepEqual(checkVersions(live()), []);
});

test('version: kapı bozuk girdiyi yakalar (kendini sınar)', () => {
  const ok = live();
  const bump = (s) => s.replace('style.css?v=', 'style.css?v=9');
  assert.ok(checkVersions({ ...ok, html: bump(ok.html) }).length > 0, 'html sürümü farklı');
  assert.ok(checkVersions({ ...ok, sw: ok.sw.replace(/const V = \d+;/, 'const V = 99;') }).length > 0, 'sw V farklı');
  assert.ok(checkVersions({ ...ok, files: [...ok.files, 'yeni.js'], sources: ok.sources }).length > 0, 'yeni modül kayıtsız');
  assert.ok(checkVersions({ ...ok, html: ok.html.replace(/\s*"\.\/src\/bot\.js": "[^"]*",/, '') }).length > 0, 'importmap girdisi eksik');
});
