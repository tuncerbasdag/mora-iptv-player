// E2E test sunucusu: harness'ı derleyip statik olarak sunar (Playwright `webServer` bunu başlatır).
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.E2E_PORT) || 8911;

/** Her test sayfası kendi harness'ından derlenir: / (Canlı TV), /overlay (oynatıcı), /vod (film/dizi gezgini), /app (tüm uygulama). */
const ENTRIES = { '/harness.js': 'harness.ts', '/overlay.js': 'overlayHarness.ts', '/vod.js': 'vodHarness.ts', '/app.js': 'appHarness.ts' };
const bundles = {};
for (const [url, file] of Object.entries(ENTRIES)) {
  try {
    const r = await build({ entryPoints: [`${dir}${file}`], bundle: true, format: 'iife', target: 'chrome110', write: false, logLevel: 'error' });
    bundles[url] = r.outputFiles[0].text;
  } catch (e) {
    if (!String(e).includes('Could not resolve')) throw e; // henüz yazılmamış harness: atla
  }
}

const FILES = {
  '/': [`${dir}harness.html`, 'text/html; charset=utf-8'],
  '/overlay': [`${dir}overlay.html`, 'text/html; charset=utf-8'],
  '/vod': [`${dir}vod.html`, 'text/html; charset=utf-8'],
  '/app': [`${dir}app.html`, 'text/html; charset=utf-8'],
  '/styles.css': [`${dir}../src/styles.css`, 'text/css; charset=utf-8'],
};

/** Logo isteklerini test anahtarına (?k=) göre sayar; paralel testler birbirini etkilemesin. */
const logoHits = new Map();
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#fff"/></svg>';

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (path.startsWith('/logo/')) {
    const k = url.searchParams.get('k') ?? '';
    logoHits.set(k, (logoHits.get(k) ?? 0) + 1);
    if (path.includes('bad')) return void res.writeHead(404).end();
    return void res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(SVG);
  }
  if (path === '/__logo_count') {
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(logoHits.get(url.searchParams.get('k') ?? '') ?? 0));
  }
  if (bundles[path]) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(bundles[path]);
    return;
  }
  const f = FILES[path];
  if (!f) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': f[1] }).end(await readFile(f[0]));
}).listen(PORT, '127.0.0.1', () => console.log(`[e2e] http://127.0.0.1:${PORT}`));
