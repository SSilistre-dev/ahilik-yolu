// SPEC v5 (online contract) guard: SPEC.md and docs/ARCHITECTURE.md must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const spec = read('../SPEC.md');
const arch = read('../docs/ARCHITECTURE.md');
const v5 = spec.slice(spec.indexOf('## v5: Çevrimiçi sözleşme'));
const sec5 = arch.slice(arch.indexOf('## 5. Ağ protokolü'), arch.indexOf('## 6. '));
const uniq = (a) => [...new Set(a)].sort();
// first-cell backtick names of the table rows between two markers
const rows = (text, from, to) => {
  const a = text.indexOf(from), b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `işaret yok: ${from} / ${to}`);
  return uniq(text.slice(a, b).split('\n').filter((l) => l.startsWith('| `')).map((l) => l.split('|')[1].trim().replace(/`/g, '')));
};

test('SPEC v5: zorunlu başlıklar var', () => {
  assert.ok(v5.startsWith('## v5: Çevrimiçi sözleşme'));
  for (const h of ['Modlar ve otorite', 'View', 'Bot imzası', 'Koltuk, token, host', 'Protokol v1',
    'Oda yaşam döngüsü ve zamanlayıcılar', 'Session arayüzü', 'Davet kodu', 'HTTP']) {
    assert.match(v5, new RegExp('^### ' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm'), h);
  }
});

test('SPEC v5: istemci ve sunucu mesaj tipleri ARCHITECTURE ile aynı küme', () => {
  const c = ['hello', 'ready', 'addBot', 'setBot', 'removeSeat', 'setOptions', 'start', 'act', 'emote', 'rematch', 'leave', 'ping'];
  const s = ['welcome', 'lobby', 'game', 'emote', 'error', 'pong'];
  const specC = rows(v5, 'İstemci → sunucu:', 'Sunucu → istemci:');
  const specS = rows(v5, 'Sunucu → istemci:', 'Hata kodları:');
  assert.deepEqual(specC, uniq(c));
  assert.deepEqual(specS, uniq(s));
  assert.deepEqual(rows(sec5, '**İstemci → sunucu**', '**Sunucu → istemci**'), specC);
  assert.deepEqual(rows(sec5, '**Sunucu → istemci**', '```mermaid'), specS);
});

test('SPEC v5: hata kodları iki belgede de tam', () => {
  const codes = ['stale', 'illegal', 'notYourTurn', 'notHost', 'full', 'started', 'notFound', 'rate', 'tooBig', 'badMsg', 'badName', 'version', 'kicked', 'replaced', 'expired'];
  assert.equal(codes.length, 15);
  for (const [name, text] of [['SPEC', v5], ['ARCHITECTURE §5', sec5]]) {
    assert.deepEqual(codes.filter((k) => !text.includes('`' + k + '`')), [], name);
  }
});

test('SPEC v5: davet kodu alfabesi 31 karakter ve 887503681 kombinasyon', () => {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  assert.equal(new Set(alpha).size, 31);
  assert.equal(alpha.length, 31);
  assert.equal(31 ** 6, 887503681);
  assert.ok(v5.includes(alpha));
  assert.ok(v5.includes('887 503 681'));
  assert.ok(arch.includes(alpha));
});

test('SPEC v5: view tablosu seed ve rng alanlarını gizler', () => {
  const t = v5.slice(v5.indexOf('### View'), v5.indexOf('### Bot imzası'));
  assert.match(t, /\| `seed` \| silinir;.*`gameId`/);
  assert.match(t, /\| `rng` \| `0` \|/);
});
