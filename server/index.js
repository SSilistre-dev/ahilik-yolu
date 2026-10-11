// HTTP katmanı: beyaz listeli statik sunum + /api. Yalnız Node yerleşik modülleri; ws'i bilen tek dosya hub.js'tir.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';
import { makeCode, normalizeCode } from './room.js';
import { createLimiter } from './limit.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const STATIC_FILES = new Set(['index.html', 'style.css', 'sw.js', 'precache.js', 'manifest.webmanifest']);
export const STATIC_DIRS = ['src', 'assets'];
export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.md': 'text/plain; charset=utf-8' };

const BASE_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

// Beyaz listedeyse mutlak yol, değilse null. new URL() kullanılmaz: '//evil.example/x' ana makineyi değiştirir.
export function resolveStatic(urlPath, root = ROOT) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (!p.startsWith('/') || p.includes('\0') || p.includes('\\')) return null;
  const segs = p === '/' ? ['index.html'] : p.slice(1).split('/');
  // boş segment ('//', sondaki '/'), '..' ve nokta ile başlayanlar (.git, .env, .wt) kabul edilmez
  if (segs.some(s => s === '' || s.startsWith('.'))) return null;
  if (segs.length === 1 ? !STATIC_FILES.has(segs[0]) : !STATIC_DIRS.includes(segs[0])) return null;
  const abs = path.resolve(root, ...segs);
  return abs.startsWith(root.endsWith(path.sep) ? root : root + path.sep) ? abs : null;
}

function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(h);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let a, b;
  if (m[1] === '') { a = Math.max(0, size - Number(m[2])); b = size - 1; }
  else { a = Number(m[1]); b = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  return a <= b && a < size ? [a, b] : null;
}

const json = (res, status, obj, extra = {}) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body), ...extra });
  res.end(body);
};
const cryptoRand = () => randomInt(0, 2 ** 32) / 2 ** 32;
const DEFAULT_ORIGINS = 'https://ahilik.ssilistre.dev,capacitor://localhost,https://localhost';

// Origin yoksa (tarayıcı dışı istemci) geçer; varsa tam eşleşme ya da localhost/127.0.0.1. Önek eşleşmesi yok.
export function originAllowed(origin, list = DEFAULT_ORIGINS) {
  if (!origin) return true;
  return list.split(',').map(s => s.trim()).includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Tek güvenilir proxy (Traefik) en sağa ekler; soldakiler istemci uydurması olabilir.
// ponytail: proxy zinciri uzarsa (ör. Cloudflare proxy) girdi sayısı yapılandırılmalı.
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (typeof xff === 'string' && xff.split(',').pop().trim()) || req.socket.remoteAddress || 'unknown';
}

const notFound = res => json(res, 404, { error: 'notFound' });

export function createApp({ hub, root = ROOT, env = process.env, now = Date.now, rand = cryptoRand } = {}) {
  const createLimit = createLimiter({ limit: Number(env.ROOM_CREATE_PER_MIN ?? 10), now });
  const queryLimit = createLimiter({ limit: 60, now });
  const limited = (res, r) => json(res, 429, { error: 'rate' }, { 'retry-after': r.retryAfterS });

  function createRoomApi(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' }, { allow: 'POST' });
    const lim = createLimit.take(clientIp(req));
    if (!lim.ok) return limited(res, lim);
    // gövde okunmaz: Content-Length > 1 KB ya da chunked ise bağlantı kapatılır
    if (Number(req.headers['content-length'] ?? 0) > 1024 || req.headers['transfer-encoding']) {
      return json(res, 413, { error: 'tooBig' }, { connection: 'close' }), req.socket.destroySoon();
    }
    for (let i = 0; i < 5; i++) {
      const code = makeCode(rand);
      const r = hub.create(code);
      if (r === 'created') return json(res, 201, { code });
      if (r === 'full') break;
    }
    json(res, 503, { error: 'busy' });
  }

  function roomInfoApi(req, res, seg) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method' }, { allow: 'GET' });
    let raw;
    try { raw = decodeURIComponent(seg); } catch { raw = null; }
    const code = normalizeCode(raw);
    if (!code) return json(res, 400, { error: 'badCode' });
    const lim = queryLimit.take(clientIp(req));
    if (!lim.ok) return limited(res, lim);
    json(res, 200, hub.info(code));
  }

  async function serveStatic(req, res, urlPath) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' }, { allow: 'GET, HEAD' });
    const abs = resolveStatic(urlPath, root);
    const type = abs && MIME[path.extname(abs).toLowerCase()];
    // sembolik bağ kök dışına çıkamaz: gerçek yol da kök altında olmalı
    const real = type ? await realpath(abs).catch(() => null) : null;
    const realRoot = real && await realpath(root).catch(() => null);
    const st = realRoot && real.startsWith(realRoot + path.sep) ? await stat(real).catch(() => null) : null;
    if (!st?.isFile()) return notFound(res);
    const rel = path.relative(root, abs).split(path.sep);
    const etag = `W/"${st.size}-${st.mtimeMs}"`;
    const headers = { ...BASE_HEADERS, 'content-type': type, etag, 'accept-ranges': 'bytes',
      'cache-control': rel[0] === 'assets' ? 'public, max-age=86400' : 'no-cache' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    let status = 200, range = null;
    if (req.headers.range) {
      range = parseRange(req.headers.range, st.size);
      if (!range) { res.writeHead(416, { ...headers, 'content-range': `bytes */${st.size}` }); return res.end(); }
      status = 206;
      headers['content-range'] = `bytes ${range[0]}-${range[1]}/${st.size}`;
    }
    headers['content-length'] = range ? range[1] - range[0] + 1 : st.size;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    pipeline(createReadStream(real, range ? { start: range[0], end: range[1] } : {}), res, () => {}); // istemci kesince akışı kapatır (fd sızmaz)
  }

  return {
    handle(req, res) {
      const urlPath = (req.url ?? '/').split('?')[0];
      if (urlPath === '/api/health') {
        if (req.method !== 'GET') return json(res, 405, { error: 'method' }, { allow: 'GET' });
        return json(res, 200, { ok: true });
      }
      if (urlPath === '/api/rooms' || urlPath.startsWith('/api/rooms/')) {
        try {
          if (urlPath === '/api/rooms') return createRoomApi(req, res);
          const seg = urlPath.slice('/api/rooms/'.length);
          return seg.includes('/') ? notFound(res) : roomInfoApi(req, res, seg);
        } catch (e) {
          console.error(e.stack); // gövde/başlık yazılmaz
          return json(res, 500, { error: 'internal' });
        }
      }
      if (urlPath.startsWith('/api/')) return notFound(res);
      if (urlPath.startsWith('/ws/')) { // Upgrade'siz normal istek
        return normalizeCode(urlPath.slice(4)) ? json(res, 426, { error: 'upgrade' }, { upgrade: 'websocket' }) : notFound(res);
      }
      serveStatic(req, res, urlPath).catch(() => { if (!res.headersSent) json(res, 500, { error: 'internal' }); else res.destroy(); });
    },
    upgrade(req, socket, head) {
      const deny = line => { socket.write(`HTTP/1.1 ${line}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
      const m = /^\/ws\/([^/?]+)(\?.*)?$/.exec(req.url ?? '');
      const code = m && normalizeCode(m[1]);
      if (!code) return deny('404 Not Found');
      if (String(req.headers.upgrade).toLowerCase() !== 'websocket') return deny('426 Upgrade Required');
      if (!originAllowed(req.headers.origin, env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)) return deny('403 Forbidden');
      if (!hub.has(code)) return deny('404 Not Found');
      hub.handleUpgrade(req, socket, head, code);
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { createHub } = await import('./hub.js');
  const hub = createHub({ dir: process.env.DATA_DIR ?? '/data' });
  const app = createApp({ hub });
  const server = http.createServer(app.handle);
  server.on('upgrade', app.upgrade);
  server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
  process.on('SIGTERM', () => { hub.close(); server.close(() => process.exit(0)); });
}
