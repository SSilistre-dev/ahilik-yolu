// Menü kiti token kapısı (M02): style.css :root eksiksiz mi, var() yazım hatası var mı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyTokens } from '../src/menu.js';
import { ILKE_IDS, ILKELER, PLAYER_COLORS } from '../src/data.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(`${root}style.css`, 'utf8');
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)[1];
const decl = (block) => new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
const tokens = decl(rootBlock);

const REQUIRED = `bg bg-deep ink parch parch-hi gold gold2 gold-lo brown btn-top btn-bot btn-edge dlg-top dlg-bot panel panel2 line
danger-top danger-bot danger-ink ok-top ok-bot ok-ink scrim scrim-strong
font-ui font-display ts fs-1 fs-2 fs-3 fs-4 fs-5 fs-6 lh-tight lh-body
sp-1 sp-2 sp-3 sp-4 sp-5 sp-6 r-1 r-2 r-3 r-4 r-pill
sh-btn sh-btn-gold sh-card sh-dialog sh-glow
z-modal z-sheet z-drawer z-fx z-coach z-screen z-tut z-loading z-pause z-toast z-curtain z-fatal
d-press d-fast d-base d-pop d-screen d-slow e-out e-pop e-screen e-fly tap tap-lg
side sat sab sal sar`.split(/\s+/);

test('tokens: required set', () => {
  assert.deepEqual(REQUIRED.filter((n) => !tokens.has(`--${n}`)), []);
  // pc-* / il-* çalışma anında data.js'ten yazılır (renk tek kaynak).
  const set = {};
  applyTokens({ style: { setProperty: (k, v) => { set[k] = v; } } });
  PLAYER_COLORS.forEach((c, i) => assert.equal(set[`--pc-${i}`], c));
  for (const id of ILKE_IDS) assert.equal(set[`--il-${id}`], ILKELER[id].color);
});

test('tokens: no undefined var()', () => {
  const src = readdirSync(`${root}src`).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${root}src/${f}`, 'utf8')).join('\n');
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const runtime = (n) => new RegExp(`${n}\\b`).test(src) || /^--(pc|il)-/.test(n); // JS'ten set edilenler
  // yedek değerli var(--x, ...) kullanımı güvenli sayılır.
  const bad = [...css.matchAll(/var\((--[\w-]+)\s*\)/g)].map((m) => m[1]).filter((n) => !defined.has(n) && !runtime(n));
  assert.deepEqual([...new Set(bad)], []);
});

test('tokens: z unique', () => {
  const z = [...tokens].filter(([k]) => k.startsWith('--z-')).map(([, v]) => v);
  assert.ok(z.length >= 12);
  assert.equal(new Set(z).size, z.length);
});

test('tokens: base font 16', () => {
  assert.match(tokens.get('--fs-1'), /^calc\(16px\s*\*\s*var\(--ts\)\)$/);
  assert.equal(tokens.get('--ts'), '1');
  assert.match(css, /html\[data-text="large"\]\s*\{\s*--ts:\s*1\.2/);
});
