// Merge çakışma işareti kalmış dosya kapıdan geçmez (CSS/HTML testsiz olduğu için gözden kaçabiliyor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('conflict: izlenen metin dosyalarında çakışma işareti yok', () => {
  const root = new URL('../', import.meta.url).pathname;
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter((f) => /\.(js|mjs|css|html|json|md|webmanifest|yml)$|^(Makefile|Dockerfile)$/.test(f));
  const bad = files.filter((f) => { try { return /^(<{7}|>{7}) /m.test(readFileSync(root + f, 'utf8')); } catch { return false; } });
  assert.deepEqual(bad, []);
});
