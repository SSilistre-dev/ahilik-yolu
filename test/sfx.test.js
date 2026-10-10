// AHI-020: ses yükleme yeniden denemesi, iOS oturum kilidi, askıdaki bağlam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSfx } from '../src/sfx.js';

const tick = () => new Promise((r) => setImmediate(r));

function rig({ failures = 0, state = 'running', nav = {} } = {}) {
  const r = { fetches: 0, starts: 0, resumes: 0, plays: 0, t: 0, state, fail: failures };
  r.fetch = async () => {
    r.fetches++;
    if (r.fail > 0) { r.fail--; throw new Error('ağ'); }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  r.AudioCtx = class {
    constructor() { this.destination = {}; r.ctx = this; }
    get state() { return r.state; }
    resume() { r.resumes++; return Promise.resolve(); }
    decodeAudioData(b, ok) { ok({ fake: true }); }
    createBuffer() { return {}; }
    createGain() { return { gain: {}, connect: (d) => d }; }
    createBufferSource() { return { playbackRate: {}, connect() { return { connect() {} }; }, start() { r.starts++; } }; }
  };
  r.Audio = class { canPlayType() { return ''; } play() { r.plays++; return Promise.resolve(); } };
  r.doc = { hidden: false, addEventListener() {} };
  r.nav = nav;
  r.sfx = createSfx({ fetch: r.fetch, AudioCtx: r.AudioCtx, Audio: r.Audio, now: () => r.t, doc: r.doc, nav: r.nav });
  r.sfx.setMuted(false);
  return r;
}

test('sfx: retry after failure', async () => {
  const r = rig({ failures: 1 });
  r.sfx.play('click'); await tick();
  assert.equal(r.fetches, 1); assert.equal(r.starts, 0);
  r.t = 2000; r.sfx.play('click'); await tick();
  assert.equal(r.fetches, 2); assert.equal(r.starts, 1); // yeniden denedi ve çaldı
  r.sfx.play('click'); await tick();
  assert.equal(r.fetches, 2); assert.equal(r.starts, 2); // başarılı yükleme önbellekte
});

test('sfx: gives up after 3', async () => {
  const r = rig({ failures: 99 });
  for (let i = 0; i < 6; i++) { r.t = i * 5000; r.sfx.play('card'); await tick(); }
  assert.equal(r.fetches, 3);
  assert.equal(r.starts, 0);
});

test('sfx: retry backoff', async () => {
  const r = rig({ failures: 99 });
  r.sfx.play('coin'); await tick();
  r.t = 1999; r.sfx.play('coin'); await tick();
  assert.equal(r.fetches, 1); // 2 sn dolmadan yeni fetch yok
  r.t = 2000; r.sfx.play('coin'); await tick();
  assert.equal(r.fetches, 2);
});

test('sfx: unlock once', () => {
  const nav = {};
  const r = rig({ nav });
  r.sfx.unlock(); r.sfx.unlock(); r.sfx.unlock();
  assert.equal(r.plays, 1); // sessiz WAV bir kez
  assert.equal(nav.audioSession, undefined); // API yoksa atlanır, hata yok
  const nav2 = { audioSession: { type: 'auto' } };
  rig({ nav: nav2 }).sfx.unlock();
  assert.equal(nav2.audioSession.type, 'playback');
});

test('sfx: suspended resume', async () => {
  const r = rig({ state: 'suspended' });
  assert.doesNotThrow(() => r.sfx.play('click'));
  await tick();
  assert.ok(r.resumes >= 1);
  assert.equal(r.starts, 0); // o çalma atlanır
  r.state = 'interrupted'; r.sfx.play('click'); await tick();
  assert.ok(r.resumes >= 2);
});

test('sfx: muted skips fetch', async () => {
  const r = rig();
  r.sfx.setMuted(true);
  r.sfx.play('click'); await tick();
  assert.equal(r.fetches, 0);
  r.sfx.setMuted(false);
});

test('sfx: nope reuses the close file', async () => {
  const urls = [];
  const r = rig();
  const s = createSfx({ fetch: async (u) => { urls.push(u); return r.fetch(); }, AudioCtx: r.AudioCtx, Audio: r.Audio, now: () => 0, doc: r.doc, nav: {} });
  s.setMuted(false); s.play('nope'); await tick();
  assert.match(urls[0], /close\.(ogg|m4a)$/);
});
