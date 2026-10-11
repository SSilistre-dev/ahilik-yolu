// Uçtan uca çevrimiçi test (OL-7): docker compose sunucusu + headless Brave (CDP), iki ayrı tarayıcı bağlamı.
// Kullanım: make e2e-online   (E2E_BROWSER_PATH, COMPOSE_PROJECT_NAME=ahilik-e2e, PORT=8093)
// Node'un global fetch/WebSocket'ı; npm yok. Bitince (başarısız olsa da) Brave kapanır, geçici dizin silinir, compose down.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { AVATAR_IDS } from '../src/data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = process.env.COMPOSE_PROJECT_NAME ?? 'ahilik-e2e';
const PORT = process.env.PORT ?? '8093';
const BROWSER = process.env.E2E_BROWSER_PATH ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const BASE = `http://localhost:${PORT}`;
const env = { ...process.env, COMPOSE_PROJECT_NAME: PROJECT, PORT, BOT_DELAY_MS: process.env.BOT_DELAY_MS ?? '40', DISCONNECT_GRACE_MS: process.env.DISCONNECT_GRACE_MS ?? '10000' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('e2e:', ...a);
const compose = (...args) => spawnSync('docker', ['compose', ...args], { cwd: ROOT, env, encoding: 'utf8' });
function assert(ok, msg) { if (!ok) throw new Error(`assert: ${msg}`); log('ok  ', msg); }

async function until(fn, label, ms = 20000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(100);
  }
  throw new Error(`zaman aşımı: ${label}${last instanceof Error ? ` (${last.message})` : ''}`);
}
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

// ---- minimal CDP istemcisi (tarayıcı soketi + flatten oturumlar) ----
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl), pend = new Map(), handlers = [];
  let id = 0;
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP bağlanamadı')); });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id) { const p = pend.get(m.id); pend.delete(m.id); if (p) m.error ? p.rej(new Error(`${m.error.message}`)) : p.res(m.result); }
    else for (const h of handlers) h(m);
  };
  return {
    ready, close: () => ws.close(), on: h => handlers.push(h),
    send: (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }),
  };
}

const problems = [];
async function openPage(c, name, url) {
  const { browserContextId } = await c.send('Target.createBrowserContext');
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => c.send(m, p, sessionId);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 860, deviceScaleFactor: 1, mobile: false });
  c.on(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') problems.push(`${name}: exception ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`${name}: console.error ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
  });
  const page = {
    name,
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${name}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    wait: (expr, label, ms) => until(() => page.ev(expr), `${name}: ${label}`, ms),
    click: async sel => { const ok = await page.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled)return false;e.click();return true})()`); if (!ok) throw new Error(`${name}: tıklanamadı ${sel}`); },
    clickWhen: async (sel, ms) => { await page.wait(`!!document.querySelector(${JSON.stringify(sel)}) && !document.querySelector(${JSON.stringify(sel)}).disabled`, `düğme ${sel}`, ms); await page.click(sel); },
    goto: async u => { await send('Page.navigate', { url: u }); },
    reload: async () => { await send('Page.reload', { ignoreCache: false }); },
  };
  await page.goto(url);
  return page;
}

// Ekran akışları
async function makeProfile(p, name, avatarIdx) {
  await p.wait(`!!document.querySelector('#pf-name')`, 'profil ekranı');
  await p.ev(`(()=>{const i=document.querySelector('#pf-name');i.value=${JSON.stringify(name)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await p.click(`.pf-card[data-id="${AVATAR_IDS[avatarIdx]}"]`);
  await p.clickWhen('#pf-ok');
}
const st = p => p.ev(`(()=>{const a=window.__ahilik;return a&&a.state?{you:a.state.you,phase:a.state.phase,active:a.state.active,nLegal:a.legal.length,ver:a.meta?.version,gameId:a.meta?.gameId,types:a.legal.map(l=>l.type)}:null})()`);

// Sunucunun yedek bot kararıyla aynı sıra: pas geç / bitir / kart aç. Aynı sürüme iki kez aksiyon vermez.
const drive = p => p.ev(`(()=>{const a=window.__ahilik,L=a.legal,v=a.meta?.version;
  if(!L.length||a.state.phase==='over'||window.__e2eV===v)return false;
  const act=L.find(l=>l.type==='respondTrade'&&!l.accept)??L.find(l=>l.type==='contribute'&&!l.cards.length)
    ??['endTurn','pass','drawAhlak'].map(t=>L.find(l=>l.type===t)).find(Boolean)??L[0];
  window.__e2eV=v;a.act(act);return act.type})()`);

let browser = null, udir = null, c = null, composeUp = false;
async function cleanup() {
  try { c?.close(); } catch {}
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await sleep(500); if (browser.exitCode === null) browser.kill('SIGKILL'); }
  if (udir) { const d = udir; udir = null; rmSync(d, { recursive: true, force: true }); }
  if (composeUp) { composeUp = false; compose('down', '-v'); }
  rmSync(join(ROOT, 'test-results'), { recursive: true, force: true }); // koşu bitince çıktı kalmaz
}

async function main() {
  log(`compose ${PROJECT} port ${PORT}`);
  const up = compose('up', '--build', '-d');
  composeUp = true;
  if (up.status !== 0) throw new Error(`compose up başarısız: ${up.stderr.slice(-400)}`);
  await until(async () => (await fetch(`${BASE}/api/health`)).ok, 'sunucu sağlıklı', 120000);

  udir = mkdtempSync(join(tmpdir(), 'ahilik-e2e-'));
  const dbg = await freePort();
  browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${udir}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const ver = await until(async () => (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json(), 'Brave açıldı', 30000);
  c = cdp(ver.webSocketDebuggerUrl); await c.ready;

  // --- A: kurucu ---
  const A = await openPage(c, 'A', BASE + '/');
  await makeProfile(A, 'Ayse', 0);
  await A.clickWhen('[data-go="friends"]');
  await A.clickWhen('[data-new]');
  const code = await A.wait(`document.querySelector('.ol-code')?.textContent.trim()`, 'lobi kodu');
  assert(/^[A-Z0-9]{6}$/.test(code), `A lobide, kod ${code}`);

  // --- B: davet linkiyle, ayrı bağlam (ayrı localStorage) ---
  const B = await openPage(c, 'B', `${BASE}/?oda=${code}`);
  await makeProfile(B, 'Berk', 2);
  await B.clickWhen('[data-ok]');
  await B.wait(`document.querySelectorAll('.ol-seat').length===2`, 'B lobide iki koltuk');
  await A.wait(`document.querySelectorAll('.ol-seat').length===2`, 'A iki koltuk görür');
  const glyphB = await B.ev(`document.querySelector('.ol-seat.you .ol-av').textContent`);
  const glyphSeen = await A.ev(`document.querySelectorAll('.ol-seat')[1].querySelector('.ol-av').textContent`);
  assert(glyphB === glyphSeen && glyphB !== await A.ev(`document.querySelector('.ol-seat.you .ol-av').textContent`), 'B karakteri (indeks 2) A lobisinde doğru görünür');

  await A.clickWhen('[data-addbot]');
  await A.wait(`document.querySelectorAll('.ol-seat').length===3`, 'bot eklendi');
  await B.clickWhen('[data-main]'); // Hazırım
  await A.wait(`!document.querySelector('[data-main]').disabled`, 'Başlat açıldı');
  await A.click('[data-main]');
  for (const p of [A, B]) await p.wait(`window.__ahilik?.router.current?.name==='game' && !!window.__ahilik.state`, 'oyunda');
  const s0 = { A: await st(A), B: await st(B) };
  assert(s0.A.you !== s0.B.you && s0.A.gameId === s0.B.gameId, `ikisi de oyunda (koltuk ${s0.A.you}/${s0.B.you}, ${s0.A.gameId})`);

  // --- A sırası gelince gerçek düğme; araya B ---
  let clicked = false;
  await until(async () => {
    const a = await st(A);
    if (a.types.includes('drawAhlak') && a.phase === 'ahlak') { await A.clickWhen('[data-a="draw"]'); clicked = true; return true; }
    if (a.nLegal) await drive(A);
    if ((await st(B)).nLegal) await drive(B);
    return false;
  }, 'A ahlak kartı sırası', 60000);
  const verBefore = (await st(A)).ver;
  await A.wait(`window.__ahilik.meta.version>${verBefore}`, 'Ahlak Kartı Aç sunucuca işlendi');
  assert(clicked, 'A "Ahlak Kartı Aç" düğmesiyle kart çekti');

  // --- tepki ---
  await A.clickWhen('[data-a="emote"]');
  await A.clickWhen('[data-a="emo"]');
  await B.wait(`!!document.querySelector('.ay-emo')`, 'B tepki balonunu görür', 5000);
  assert(true, 'A tepki gönderdi, B balonu gördü');

  // --- B yenile: aynı koltukla oyuna otomatik dönüş ---
  const before = await st(B);
  await B.reload();
  await B.wait(`window.__ahilik?.router.current?.name==='game' && window.__ahilik.state?.you===${before.you}`, 'B yenilemeden sonra aynı koltukla oyunda', 30000);
  assert((await st(B)).gameId === before.gameId, `B yenilemeden sonra aynı oyuna döndü (koltuk ${before.you})`);

  // --- oyunu bitir ---
  await until(async () => {
    const [a, b] = [await st(A), await st(B)];
    if (a?.phase === 'over' && b?.phase === 'over') return true;
    if (a?.nLegal) await drive(A);
    if (b?.nLegal) await drive(B);
    return false;
  }, 'oyun sona erer', 240000);
  assert(true, 'oyun bitti, ikisi de "over" görür');
  const over = await st(A);
  for (const p of [A, B]) await p.wait(`!!document.querySelector('[data-a="rematch"]')`, 'Tekrar Oyna düğmesi');

  // --- rematch ---
  await A.click('[data-a="rematch"]');
  await B.click('[data-a="rematch"]');
  for (const p of [A, B]) await p.wait(`window.__ahilik.state.phase!=='over' && window.__ahilik.meta.gameId!==${JSON.stringify(over.gameId)}`, 'yeni oyun başladı', 20000);
  const n = await st(A);
  assert(n.gameId !== over.gameId && n.gameId === (await st(B)).gameId, `Tekrar Oyna: yeni gameId ${n.gameId}`);

  // B bilerek çıkar: Duraklat -> Oyundan Çık -> onay. Menüye döner, saklı oda token'ı silinir, A'da B "Bot oynuyor" olur.
  const roomKeys = p => p.ev(`Object.keys(localStorage).filter(k=>k.startsWith('ahilik.room.')).length`);
  assert(await roomKeys(B) > 0, 'B çıkmadan önce saklı oda token\'ı var');
  await B.clickWhen('[data-a="pause"]', 5000);
  await B.clickWhen('[data-p="exit"]', 5000);
  await B.clickWhen('.mn-btns .ok', 5000);
  await B.wait(`history.state?.name==='menu' && !window.__ahilik.state`, 'B menüde', 10000);
  assert(await roomKeys(B) === 0, 'Oyundan Çık: B menüde, saklı oda token\'ı silindi');
  await A.wait(`window.__ahilik.meta?.seats?.[1]?.bot === true`, 'A\'da B koltuğu bot', 15000);
  assert(true, 'A\'da ayrılan B koltuğu bot oynuyor');

  await sleep(500);
  assert(problems.length === 0, `konsol hatası/istisna yok${problems.length ? `: ${problems.slice(0, 3).join(' | ')}` : ''}`);
}

let code = 0;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => cleanup().finally(() => process.exit(130)));
const hard = setTimeout(() => { console.error('e2e: genel zaman aşımı (8 dk)'); process.exit(2); }, 480000);
try { await main(); log('GEÇTİ'); }
catch (e) { console.error(`e2e: BAŞARISIZ: ${e.message}`); if (problems.length) console.error('e2e: konsol:', problems.slice(0, 5).join(' | ')); code = 1; }
finally { clearTimeout(hard); await cleanup(); }
process.exit(code);
