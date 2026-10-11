// Deploy smoke (OL-8): node dev/smoke.mjs  (SMOKE_URL, SMOKE_EXPECT_VERSION). npm yok; Node'un global fetch/WebSocket'ı.
import { readFileSync } from 'node:fs';

const base = (process.env.SMOKE_URL ?? 'https://ahilik.ssilistre.dev').replace(/\/$/, '');
const expect = process.env.SMOKE_EXPECT_VERSION ?? /VERSION = (\d+)/.exec(readFileSync(new URL('../src/version.js', import.meta.url), 'utf8'))?.[1];
let fails = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`); if (!ok) fails++; return ok; };

const home = await fetch(`${base}/`);
const html = await home.text();
const vs = [...new Set([...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]))];
check(home.status === 200, 'GET / 200', home.status);
check(vs.length === 1 && vs[0] === expect, `?v= sürümü ${expect}`, `bulunan: ${vs.join(',') || '-'}`);

const health = await fetch(`${base}/api/health`);
check(health.status === 200 && (await health.json()).ok === true, 'GET /api/health {ok:true}');

const made = await fetch(`${base}/api/rooms`, { method: 'POST' });
const code = (await made.json().catch(() => ({}))).code;
check(made.status === 201 && /^[A-Z0-9]{6}$/.test(code ?? ''), 'POST /api/rooms 201 + kod', `${made.status} ${code}`);

if (code) {
  const wsUrl = `${base.replace(/^http/, 'ws')}/ws/${code}`;
  const welcome = await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { ws.close(); resolve(null); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ v: 1, t: 'hello', name: 'smoke', avatar: 0 }));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.t !== 'welcome') return;
      clearTimeout(t); ws.send(JSON.stringify({ v: 1, t: 'leave' })); ws.close(); resolve(m);
    };
    ws.onerror = () => { clearTimeout(t); resolve(null); };
  });
  check(welcome?.t === 'welcome' && welcome.code === code, 'ws hello -> welcome -> leave', welcome ? `koltuk ${welcome.you?.seat}` : 'yanıt yok');
  // Odayı sunucu etkinlik bitince siler: hiç katılım olmayana ve leave sonrası insansız lobiye 1 sa; burada yalnız bilgi.
  const info = await (await fetch(`${base}/api/rooms/${code}`)).json().catch(() => null);
  console.log(`bilgi: leave sonrası oda ${JSON.stringify(info)}`);
}
console.log(fails ? `SMOKE KIRMIZI: ${fails} hata` : 'SMOKE: tamam');
process.exit(fails ? 1 : 0);
