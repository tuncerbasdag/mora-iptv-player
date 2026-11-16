import { build, context } from 'esbuild';
import { copyFile, readFile } from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const watch = process.argv.includes('--watch');

// App version (package.json) is embedded at build time and shown on the home screen.
const { version } = JSON.parse(await readFile(`${__dirname}../../package.json`, 'utf8'));

const options = {
  entryPoints: [`${__dirname}src/main.ts`],
  outfile: `${__dirname}public/bundle.js`,
  bundle: true,
  format: 'iife',
  target: 'chrome56',
  sourcemap: true,
  logLevel: 'info',
  define: { __APP_VERSION__: JSON.stringify(version) },
};

const STYLES_SRC = `${__dirname}../../packages/ui/src/styles.css`;

async function copyStyles() {
  await copyFile(STYLES_SRC, `${__dirname}public/styles.css`);
}

await copyStyles();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  // Watch the folder, not the file: when editors/tools delete and rewrite a file (new inode),
  // a file watcher silently detaches; a folder watcher is unaffected.
  let timer;
  fsWatch(dirname(STYLES_SRC), (_event, name) => {
    if (name !== 'styles.css') return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      copyStyles().then(() => console.log('[build] styles.css kopyalandı'), console.error);
    }, 50);
  });
  console.log('[build] izleniyor (watch)...');
} else {
  await build(options);
}
