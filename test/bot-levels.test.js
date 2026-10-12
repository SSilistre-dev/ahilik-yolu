// AHI-024 / AHI-025: bot davranışı senaryoları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { newGame, legalActions, apply, actor } from '../src/game.js';
import { createHash } from 'node:crypto';
import { botAction, LEVELS, smooth } from '../src/bot.js';
import { viewFor } from '../src/view.js';
import { CARDS, CITIES, neighbors } from '../src/data.js';

const decide = (s, level = 'medium') => botAction(viewFor(s, actor(s), 't'), legalActions(s), level);
const isLegal = (s, a) => legalActions(s).some((l) => isDeepStrictEqual(l, a));
const place = (s, pi, tile) => {
  const o = s.tiles[s.players[pi].pos].occupants; o.splice(o.indexOf(pi), 1);
  s.tiles[tile].occupants.push(pi); s.players[pi].pos = tile;
};
const moveState = ({ pos = 0, hand = [], task = 'ticaret-kayseri-0', closed = [] } = {}) => {
  const s = newGame({ players: [{ name: 'A', bot: true }, { name: 'B', bot: true }], seed: 7 });
  s.phase = 'move'; place(s, 0, pos);
  s.players[0].hand = hand; s.players[0].task = task;
  for (const t of closed) { s.tiles[t].closed = true; s.tiles[t].closedBy = 'x'; }
  return s;
};

test('AHI-024: görevsiz bot takas istemez, hedefsiz kargo oynamaz; rozetli kareye gider', () => {
  const hand = ['yol-tokgozlu-1', 'yol-adaletli-1', 'yol-comert-1'];
  const s = moveState({ pos: 7, task: null, hand });
  s.tiles[13].badges = 2;
  assert.deepEqual(decide(s), { type: 'move', card: 'yol-tokgozlu-1', tile: 13 });
  const stuck = moveState({ pos: 7, task: null, hand: ['yol-kargo-0', 'yol-durust-1'] }); // hamle yok, kargo zorunlu
  stuck.tiles = stuck.tiles.map((t) => (t.kind === 'ilke' && t.ilke === 'durust' ? { ...t, closed: true, closedBy: 'x' } : t));
  const a = decide(stuck);
  assert.ok(a.type === 'kargo' && isLegal(stuck, a), JSON.stringify(a));
  const after = apply(moveState({ pos: 7, task: null, hand }), { type: 'move', card: 'yol-tokgozlu-1', tile: 13 }).state;
  assert.equal(decide(after).type, 'endTurn', 'rozeti kalmayınca turu bitirir');
  for (const level of ['medium', 'hard']) { const t = moveState({ pos: 7, task: null, hand }); assert.notEqual(decide(t, level).type, 'offerTrade', level); }
});

test('AHI-025: Orta kargo kuralı değişmez; Zor eldeki kartlarla varabiliyorsa kargoyu saklar, varamıyorsa oynar', () => {
  const reach = moveState({ pos: 4, task: 'ticaret-konya-5', closed: [8], hand: ['yol-kargo-0', 'yol-tokgozlu-3', 'yol-tokgozlu-2', 'yol-bilgili-6', 'yol-bilgili-0', 'yol-comert-6'] });
  assert.deepEqual(decide(reach, 'medium'), { type: 'kargo', card: 'yol-kargo-0', city: 'konya' });
  assert.equal(decide(reach, 'hard').type, 'move', 'bilgili 9, tokgozlu 13, bilgili 17, comert 16: bu turda teslim');
  const blocked = moveState({ pos: 4, task: 'ticaret-konya-5', closed: [8], hand: ['yol-kargo-0', 'yol-durust-3', 'yol-durust-2', 'yol-adaletli-6', 'yol-adaletli-0', 'yol-merhametli-6'] });
  assert.deepEqual(decide(blocked, 'hard'), { type: 'kargo', card: 'yol-kargo-0', city: 'konya' });
});

test('AHI-025: hard + medium karma oyunlar biter, yalnız yasal aksiyon', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const n = 2 + (seed % 5);
    let s = newGame({ players: Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true })), seed });
    for (let steps = 0; s.phase !== 'over' && steps < 3000; steps++) {
      const a = decide(s, actor(s) % 2 ? 'hard' : 'medium');
      assert.ok(isLegal(s, a), `seed ${seed}: ${JSON.stringify(a)}`);
      s = apply(s, a).state;
    }
    assert.equal(s.phase, 'over');
  }
});

// ---- AHI-021: seviyeler ----
const bots = (n) => Array.from({ length: n }, (_, i) => ({ name: `B${i}`, bot: true }));

test('bot: her seviye yalnız yasal aksiyon verir ve oyunu bitirir (karışık dizilim, 2-6 oyuncu)', () => {
  assert.deepEqual(LEVELS, ['easy', 'medium', 'hard']);
  for (let seed = 1; seed <= 30; seed++) {
    const n = 2 + (seed % 5), lv = Array.from({ length: n }, (_, i) => LEVELS[(i + seed) % 3]);
    let s = newGame({ players: bots(n), seed, startIdx: seed % n }), steps = 0;
    while (s.phase !== 'over' && steps++ < 3000) {
      const a = decide(s, lv[actor(s)]);
      assert.ok(isLegal(s, a), `seed ${seed} adım ${steps} ${lv[actor(s)]}: yasal değil ${JSON.stringify(a)}`);
      s = apply(s, a).state;
    }
    assert.equal(s.phase, 'over', `seed ${seed} bitmedi`);
  }
});

test('bot: aynı view aynı aksiyon; rakip eli ve deste sırası değişse karar değişmez', () => {
  const shuffle = (a, k) => { for (let i = a.length - 1; i > 0; i--) { const j = (k * 7 + i * 13) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const level of LEVELS) for (let seed = 1; seed <= 6; seed++) {
    let s = newGame({ players: bots(4), seed });
    while (s.phase !== 'over') {
      const a = decide(s, level), me = actor(s);
      assert.deepEqual(decide(s, level), a, 'deterministik değil');
      if (s.pending?.kind !== 'trade') { // takasta verilen kart iki tarafa açık; atla
        const t = structuredClone(s); t.seed = 424242; t.rng = 99;
        const others = t.players.map((_, i) => i).filter((i) => i !== me);
        const pool = shuffle([...others.flatMap((i) => t.players[i].hand), ...t.decks.yol], seed);
        for (const i of others) t.players[i].hand = pool.splice(0, t.players[i].hand.length);
        t.decks.yol = pool; shuffle(t.decks.ahlak, seed); shuffle(t.decks.ticaret, seed);
        assert.deepEqual(decide(t, level), a, `${level}: gizli bilgiye bakıyor (seed ${seed}, tur ${s.turn})`);
      }
      s = apply(s, a).state;
    }
  }
});

test('bot: bilinmeyen seviye hata verir', () => {
  const s = newGame({ players: bots(2), seed: 1 });
  assert.throws(() => botAction(viewFor(s, 0), legalActions(s), 'cok-zor'), /bilinmeyen bot seviyesi/);
});

test('kolay: takas teklif etmez ve yol açmaz', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 15; seed++) {
    let s = newGame({ players: bots(3), seed });
    while (s.phase !== 'over') { const a = decide(s, 'easy'); seen.add(a.type); s = apply(s, a).state; }
  }
  assert.ok(!seen.has('offerTrade') && !seen.has('openRoad'), [...seen].join());
});

test('orta: AHI-021 öncesi bot v4 ile aynı aksiyon dizisi (30 tohum, 2-6 oyuncu, sha1 kilidi)', () => {
  const h = createHash('sha1');
  for (let seed = 1; seed <= 30; seed++) {
    const n = 2 + (seed % 5);
    let s = newGame({ players: bots(n), seed, startIdx: seed % n });
    for (let k = 0; s.phase !== 'over' && k < 3000; k++) { const a = decide(s, 'medium'); h.update(JSON.stringify(a)); s = apply(s, a).state; }
  }
  // 2026-10-12: kural motoru değişti (tek bitiş kuralı, okuma hakkı listesi, dolu kareye girilmez); bot kodu aynı, eski hash 7eae7212...
  assert.equal(h.digest('hex'), 'cfa3b3448594b442c7c2be1a9e65d9e203aa6dda');
});

test('AHI-022: Zor rozet ekonomisi. Eşiğe yakınken bir adım geri sapar, uzakken sapmaz', () => {
  // Oyuncu 0 ilk hamlesini yapmış (movesThisTurn=1), elinde yalnız bilgili kartı var. Geri adım: 6 -> 5 (kare 5 bilgili, rozetli).
  const at = (points, onTile, level = 'hard') => {
    const s = moveState({ pos: 6, hand: ['yol-bilgili-1'] });
    s.movesThisTurn = 1; s.tiles[5].badges = onTile; s.players[0].badges = points;
    return decide(s, level).type;
  };
  const expected = [[0, 1, 'endTurn'], [4, 1, 'move'], [7, 1, 'endTurn'], [9, 1, 'move'], [14, 1, 'move'], [9, 0, 'endTurn'], [0, 3, 'move']];
  for (const [points, onTile, want] of expected) assert.equal(at(points, onTile), want, `puan ${points}, kare rozeti ${onTile}`);
  assert.notEqual(at(4, 1, 'medium'), 'move', 'Orta sapmaz');
});

test('AHI-022: smooth(5k) === min(5, k+1) ve sürekli artan', () => {
  for (let k = 0; k <= 4; k++) assert.equal(smooth(5 * k), Math.min(5, k + 1));
  for (let b = 0; b < 30; b++) assert.ok(smooth(b + 1) >= smooth(b), `b=${b}`);
  assert.ok(smooth(3) > smooth(2) && smooth(3) < smooth(5));
});

test('AHI-023: Zor lider rakibin yolunu uzatan kareyi kapatır; Orta kendinden en uzak kareyi', () => {
  const s = moveState({ pos: 0, task: 'ticaret-kirsehir-0' });
  s.phase = 'close'; s.pendingClose = 'merhametli'; // adaylar: 1, 12, 22
  place(s, 1, 24); s.players[1].task = 'ticaret-ankara-0'; s.players[1].trades = ['ticaret-konya-0', 'ticaret-konya-1'];
  assert.deepEqual(decide(s, 'medium'), { type: 'closeTile', tile: 22 });
  assert.deepEqual(decide(s, 'hard'), { type: 'closeTile', tile: 12 });
});

test('AHI-023: Zor kendi yolunu uzatan kareyi, alternatif varken kapatmaz', () => {
  const dist = (s, shut) => { // oyuncu 0'ın görev şehrine kalan en kısa adım (açık ilke kareleri üzerinden)
    const goal = CITIES[CARDS[s.players[0].task].city].tile, open = (t) => s.tiles[t].kind === 'ilke' && !s.tiles[t].closed && t !== shut;
    const d = new Map([[s.players[0].pos, 0]]), q = [s.players[0].pos];
    for (let i = 0; i < q.length; i++) for (const n of neighbors(q[i])) {
      if (n === goal) return d.get(q[i]) + 1;
      if (open(n) && !d.has(n)) { d.set(n, d.get(q[i]) + 1); q.push(n); }
    }
    return Infinity;
  };
  let checked = 0;
  for (const pos of [0, 2, 6, 7, 11, 13, 17, 20, 23]) for (const task of ['ticaret-kirsehir-0', 'ticaret-konya-0', 'ticaret-ankara-0']) {
    const s = moveState({ pos, task });
    if (s.tiles[pos].kind !== 'ilke' && s.tiles[pos].kind !== 'city') continue;
    s.phase = 'close'; s.pendingClose = 'merhametli';
    place(s, 1, 24); s.players[1].task = 'ticaret-ankara-0';
    const cand = legalActions(s).map((a) => a.tile), base = dist(s, -1);
    const safe = cand.filter((t) => dist(s, t) <= base);
    if (!safe.length || safe.length === cand.length) continue;
    checked++;
    const a = decide(s, 'hard');
    assert.ok(safe.includes(a.tile), `pos ${pos} ${task}: ${a.tile} kendi yolunu uzatıyor (güvenli ${safe})`);
  }
  assert.ok(checked > 0, 'senaryo üretilemedi');
});
