import { build, context } from 'esbuild';
import { copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const watch = process.argv.includes('--watch');

/** Reads the .env file at the repo root (KEY=value lines); returns empty if the file doesn't exist. A real environment variable takes precedence. */
async function loadEnv() {
  const env = {};
  try {
    const text = await readFile(`${__dirname}../../.env`, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // No .env: a warning is printed below.
  }
  return { ...env, ...process.env };
}

// App version (package.json) is embedded at build time and shown on the home screen.
const { version } = JSON.parse(await readFile(`${__dirname}../../package.json`, 'utf8'));

const env = await loadEnv();
const portalUrl = env.PORTAL_URL ?? '';
if (!portalUrl) console.warn('[build] UYARI: PORTAL_URL tanımlı değil (.env.example\'a bak); "Uzaktan Yükle" TV\'de çalışmaz.');

const options = {
  entryPoints: [`${__dirname}src/main.ts`],
  outfile: `${__dirname}bundle.js`,
  bundle: true,
  format: 'iife',
  // The embedded browser on Tizen 4/5 TVs may be based on an old Chromium.
  target: 'chrome56',
  sourcemap: true,
  logLevel: 'info',
  // Embedded at build time; the address lives in the local .env file, not in the repo.
  define: { __PORTAL_URL__: JSON.stringify(portalUrl), __APP_VERSION__: JSON.stringify(version) },
};

async function copyStyles() {
  await copyFile(`${__dirname}../../packages/ui/src/styles.css`, `${__dirname}styles.css`);
  // Apache-2.0 (hls.js, mpegts.js) requires the license text to ship with the widget.
  await copyFile(`${__dirname}../../LICENSE`, `${__dirname}LICENSE`);
  await copyFile(`${__dirname}../../THIRD_PARTY_NOTICES.md`, `${__dirname}THIRD_PARTY_NOTICES.md`);
}

await copyStyles();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build] izleniyor (watch)...');
} else {
  await build(options);
}
