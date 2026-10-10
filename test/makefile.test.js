// AGENTS.md kuralı: kapı tarifleri `set -eo pipefail;` ile başlar (macOS make 3.81 .SHELLFLAGS'ı yok sayar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GATES = ['olc', 'qa', 'sim', 'e2e'];

// Her hedefin ilk tarif satırını döner: { olc: 'set -eo pipefail; ...', ... }
export function firstRecipeLines(text) {
  const out = {};
  let target = null;
  for (const line of text.split('\n')) {
    const t = line.match(/^([A-Za-z0-9_.-]+):(?!=)/);
    if (t) { target = t[1]; continue; }
    if (target && line.startsWith('\t') && !(target in out)) out[target] = line.slice(1).trim();
    if (line.trim() === '') continue;
    if (!line.startsWith('\t') && !t) target = null;
  }
  return out;
}

test('makefile: kapı hedefleri set -eo pipefail ile başlar', () => {
  const first = firstRecipeLines(readFileSync(new URL('../Makefile', import.meta.url), 'utf8'));
  for (const g of GATES) if (g in first) assert.match(first[g], /^set -eo pipefail;/, `${g} tarifi pipefail ile başlamıyor`);
  assert.ok('olc' in first && 'qa' in first, 'olc ve qa hedefleri bulunmalı');
});

test('makefile: ayrıştırıcı kendini sınar', () => {
  const bad = firstRecipeLines('qa:\n\tnode --test test/ | tail -3\n');
  assert.doesNotMatch(bad.qa, /^set -eo pipefail;/);
});
