import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const DEFAULT_PORT = Number(process.env.PORT) || 8787;
const HOST = '127.0.0.1';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// With PROXY_LOG=1 the number of live streams open to the provider is printed to the console (should never exceed 1 at a time).
const PROXY_LOG = process.env.PROXY_LOG === '1';
let openStreams = 0;

const HOP_BY_HOP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);

/**
 * Starts the server (127.0.0.1 only). The desktop app calls this in the same process; `npm run web:start` calls it when
 * the file is run directly (bottom of the file below). The returned `close()` shuts the server down.
 */
export function startServer({ port = DEFAULT_PORT } = {}) {
  const server = createServer((req, res) => {
    handleRequest(req, res, port).catch((err) => {
      console.error('[server] beklenmeyen hata', err);
      if (!res.headersSent) res.writeHead(500);
      res.end('Sunucu hatası');
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.off('error', reject);
      resolve({ port, host: HOST, url: `http://${HOST}:${port}`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

async function handleRequest(req, res, port) {
  const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${port}`}`);
  if (url.pathname === '/proxy') {
    await handleProxy(req, res, url);
    return;
  }
  await serveStatic(res, url.pathname);
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Yasak');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Bulunamadı');
  }
}

/**
 * Most IPTV servers don't send CORS headers; here we make the requests through the local server.
 * Segment/sub-playlist addresses in M3U8 responses are resolved against the final URL after redirects and
 * rewritten to point back at this proxy. The Range header
 * (for mp4 seeking) and the content are passed through directly as a stream (pipe).
 */
async function handleProxy(req, res, url) {
  const target = url.searchParams.get('url');
  if (!target) {
    res.writeHead(400);
    res.end("'url' parametresi gerekli");
    return;
  }

  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;

  // When the browser closes the connection (channel change, tab closed), the connection still open to the provider
  // must be closed too: since a live stream never ends, the proxy would otherwise hold it open forever
  // and the provider would block the account for "multiple connections".
  const upstreamAbort = new AbortController();
  res.on('close', () => upstreamAbort.abort());

  let upstream;
  try {
    upstream = await fetch(target, { headers, redirect: 'follow', signal: upstreamAbort.signal });
  } catch (err) {
    if (upstreamAbort.signal.aborted) return; // the client is already gone
    console.warn('[proxy] yukarı akış isteği başarısız', target, err.message);
    res.writeHead(502);
    res.end('Yukarı akış sunucusuna erişilemedi');
    return;
  }

  const finalUrl = upstream.url || target;
  const contentType = upstream.headers.get('content-type') ?? '';
  const isPlaylist = /mpegurl|m3u8/i.test(contentType) || /\.m3u8?(\?|$)/i.test(finalUrl);

  const outHeaders = {};
  for (const [key, value] of upstream.headers) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    outHeaders[key] = value;
  }
  outHeaders['access-control-allow-origin'] = '*';

  if (isPlaylist) {
    const text = await upstream.text().catch(() => null);
    if (text === null) return;
    // A CHANNEL LIST with a .m3u extension also lands in this branch: without an HLS tag (#EXT-X-...) it is not an HLS playlist and
    // is passed through unchanged. If rewritten, every stream address would become a proxy address; the player would proxy it once more and,
    // because the address is encoded, patterns like /series/ and /movie/ would not match in the classifier.
    if (!/#EXT-X-/.test(text)) {
      res.writeHead(upstream.status, outHeaders);
      res.end(text);
      return;
    }
    const proxyBase = `http://${req.headers.host ?? `${HOST}:${DEFAULT_PORT}`}/proxy`;
    const rewritten = rewritePlaylist(text, finalUrl, proxyBase);
    outHeaders['content-type'] = 'application/vnd.apple.mpegurl';
    delete outHeaders['content-length'];
    res.writeHead(upstream.status, outHeaders);
    res.end(rewritten);
    return;
  }

  res.writeHead(upstream.status, outHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }
  openStreams++;
  // Diagnostics (PROXY_LOG=1): is the provider data continuous, bursty, or does it stall after the first byte? The address may contain credentials:
  // only the server name is printed.
  const host = (() => {
    try {
      return new URL(target).host;
    } catch {
      return '?';
    }
  })();
  const startedAt = Date.now();
  let lastChunkAt = startedAt;
  let firstByteMs = null;
  let bytes = 0;
  let chunks = 0;
  let maxGapMs = 0;
  if (PROXY_LOG) console.log(`[proxy] akış açıldı (HTTP ${upstream.status}) ${host} → açık akış: ${openStreams}`);
  try {
    for await (const chunk of upstream.body) {
      if (res.destroyed) break;
      const now = Date.now();
      if (firstByteMs === null) firstByteMs = now - startedAt;
      else maxGapMs = Math.max(maxGapMs, now - lastChunkAt);
      lastChunkAt = now;
      bytes += chunk.length;
      chunks++;
      res.write(chunk);
    }
  } catch {
    // the client disconnected (abort) or the upstream dropped — closed below in every case
  } finally {
    upstreamAbort.abort();
    if (!res.destroyed) res.end();
    openStreams--;
    if (PROXY_LOG) {
      const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      console.log(
        `[proxy] akış kapandı ${host}: ${secs} sn, ${(bytes / 1024).toFixed(0)} KB (~${Math.round((bytes * 8) / 1000 / secs)} kbps), ${chunks} parça, ilk bayt ${firstByteMs ?? '-'} ms, en uzun sessizlik ${maxGapMs} ms → açık akış: ${openStreams}`,
      );
    }
  }
}

function rewritePlaylist(text, baseUrl, proxyBase) {
  const proxied = (absoluteUrl) => `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
  const resolve = (ref) => new URL(ref, baseUrl).toString();

  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(resolve(uri))}"`);
      }
      const trimmed = line.trim();
      if (!trimmed) return line;
      return proxied(resolve(trimmed));
    })
    .join('\n');
}

// If run directly with `node apps/web/server.mjs`, start the server (don't start it when imported).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { url } = await startServer();
  console.log(`IPTV web oynatıcı: ${url}`);
}
