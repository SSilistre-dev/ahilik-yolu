// HTTP katmanı: beyaz listeli statik sunum + /api. Yalnız Node yerleşik modülleri; ws'i bilen tek dosya hub.js'tir.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const STATIC_FILES = new Set(['index.html', 'style.css', 'sw.js', 'manifest.webmanifest']);
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
const notFound = res => json(res, 404, { error: 'notFound' });

export function createApp({ hub, root = ROOT } = {}) {
  async function serveStatic(req, res, urlPath) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' }, { allow: 'GET, HEAD' });
    const abs = resolveStatic(urlPath, root);
    const type = abs && MIME[path.extname(abs).toLowerCase()];
    const st = type ? await stat(abs).catch(() => null) : null;
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
    const rs = createReadStream(abs, range ? { start: range[0], end: range[1] } : {});
    rs.on('error', () => res.destroy());
    rs.pipe(res);
  }

  return {
    handle(req, res) {
      const urlPath = (req.url ?? '/').split('?')[0];
      if (urlPath === '/api/health') {
        if (req.method !== 'GET') return json(res, 405, { error: 'method' }, { allow: 'GET' });
        return json(res, 200, { ok: true });
      }
      if (urlPath.startsWith('/api/')) return notFound(res); // N10 oda API'si buraya oturur
      serveStatic(req, res, urlPath).catch(() => { if (!res.headersSent) json(res, 500, { error: 'internal' }); else res.destroy(); });
    },
    upgrade(req, socket) { // N09 hub'a bağlar; şimdilik her upgrade 404
      void hub;
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
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
