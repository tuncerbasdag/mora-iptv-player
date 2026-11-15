import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8788;
// Yerelde yalnızca loopback; yayında HOST=0.0.0.0 ile açılır (TLS'i önündeki proxy sağlamalı).
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 8 * 1024;
const RATE_LIMIT = 30; // IP başına dakikada en fazla istek

const store = createStore();
setInterval(() => store.sweep(), 60_000).unref();

const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
function rateLimited(ip) {
  const n = (hits.get(ip) ?? 0) + 1;
  hits.set(ip, n);
  return n > RATE_LIMIT;
}

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

/** Statik sayfa için: satır içi betik dışında kaynak yok, çerçeveye alınamaz, MIME tahmini yok. */
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-device-secret',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new Error('bad_json');
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const ip = req.socket.remoteAddress ?? '?';
  if (rateLimited(ip)) return json(res, 429, { error: 'rate_limited' });

  if (url.pathname === '/api/device/register' && req.method === 'POST') {
    const r = store.register((await readJson(req)).mac);
    return r.ok ? json(res, 200, { mac: r.mac, pin: r.pin, secret: r.secret, expiresAt: r.expiresAt }) : json(res, 400, { error: r.error });
  }
  if (url.pathname === '/api/device/poll' && req.method === 'GET') {
    return json(res, 200, store.poll(url.searchParams.get('mac'), req.headers['x-device-secret']));
  }
  if (url.pathname === '/api/push' && req.method === 'POST') {
    const r = store.push(await readJson(req));
    return r.ok ? json(res, 200, { ok: true }) : json(res, r.error === 'locked' ? 423 : 400, { error: r.error });
  }
  return json(res, 404, { error: 'not_found' });
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + sep)) {
    res.writeHead(403);
    res.end('Yasak');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream', ...SECURITY_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Bulunamadı');
  }
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  const run = url.pathname.startsWith('/api/') ? handleApi(req, res, url) : serveStatic(res, url.pathname);
  run.catch((err) => {
    if (res.headersSent) return res.end();
    if (err?.message === 'too_large') return json(res, 413, { error: 'too_large' });
    if (err?.message === 'bad_json') return json(res, 400, { error: 'bad_json' });
    console.error('[portal] beklenmeyen hata', err);
    json(res, 500, { error: 'server_error' });
  });
}).listen(PORT, HOST, () => console.log(`Uzaktan yükleme portalı: http://${HOST}:${PORT}`));
