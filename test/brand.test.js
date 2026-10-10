// Tracked files must not name AI tooling; the project is credited to ssilistre.dev (AGENTS.md, Künye).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const banned = new RegExp(['cla' + 'ude', 'anthr' + 'opic', 'co-authored' + '-by'].join('|'), 'i');
const binary = /\.(png|jpe?g|webp|glb|gltf|bin|m4a|mp3|ogg|wav|pdf|ico|woff2?)$/i;

test('no AI tool names in tracked files', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((f) => f && !binary.test(f));
  const hits = files.filter((f) => banned.test(f) || banned.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('README credits ssilistre.dev', () => {
  assert.match(readFileSync('README.md', 'utf8'), /ssilistre\.dev/);
});
