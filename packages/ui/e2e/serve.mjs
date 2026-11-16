// E2E test server: builds the harnesses and serves them statically (started by Playwright's `webServer`).
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.E2E_PORT) || 8911;

/** Each test page is built from its own harness: / (Live TV), /overlay (player), /vod (movie/series browser), /app (whole app). */
const ENTRIES = { '/harness.js': 'harness.ts', '/overlay.js': 'overlayHarness.ts', '/vod.js': 'vodHarness.ts', '/app.js': 'appHarness.ts' };
const bundles = {};
for (const [url, file] of Object.entries(ENTRIES)) {
  try {
    const r = await build({ entryPoints: [`${dir}${file}`], bundle: true, format: 'iife', target: 'chrome110', write: false, logLevel: 'error' });
    bundles[url] = r.outputFiles[0].text;
  } catch (e) {
    if (!String(e).includes('Could not resolve')) throw e; // harness not written yet: skip
  }
}

const FILES = {
  '/': [`${dir}harness.html`, 'text/html; charset=utf-8'],
  '/overlay': [`${dir}overlay.html`, 'text/html; charset=utf-8'],
  '/vod': [`${dir}vod.html`, 'text/html; charset=utf-8'],
  '/app': [`${dir}app.html`, 'text/html; charset=utf-8'],
  '/styles.css': [`${dir}../src/styles.css`, 'text/css; charset=utf-8'],
};

/** Counts logo requests per test key (?k=); so parallel tests don't affect each other. */
const logoHits = new Map();
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#fff"/></svg>';

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://example.test');
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
