import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Self-installing update for UNSIGNED macOS builds. Squirrel.Mac (electron-updater's mac installer) refuses unsigned
 * packages, so we do it ourselves: download the release .zip, verify its sha512 (from latest-mac.yml), unpack it
 * with `ditto`, and after the app quits swap the .app bundle and relaunch. A file downloaded by the app itself has no
 * quarantine flag, so there is no Gatekeeper prompt; the bundle is ad-hoc re-signed because Apple Silicon needs a signature.
 */

/** Picks this machine's .zip from the update info (`files` of latest-mac.yml); null if there is none. */
export function pickZip(info, arch = process.arch) {
  const zips = (info?.files ?? []).filter((f) => /\.zip$/i.test(f.url));
  return zips.find((f) => f.url.includes(`-${arch}.`)) ?? (zips.length === 1 ? zips[0] : null);
}

/** Only files of our own GitHub release are ever downloaded (the name comes from update metadata, so it is validated). */
export function releaseAssetUrl({ owner, repo, version, fileName }) {
  if (!/^[\w.\-]+$/.test(fileName) || !/^\d+\.\d+\.\d+([\w.\-]*)$/.test(version)) throw new Error('Invalid update file name or version');
  return `https://github.com/${owner}/${repo}/releases/download/v${version}/${fileName}`;
}

/** Downloads + verifies + unpacks. Returns the path of the new .app. `onProgress(percent)` is 0-100. */
export async function downloadAndUnpack({ url, sha512, dir, onProgress, fetchFn = fetch }) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const zipPath = join(dir, 'update.zip');
  const res = await fetchFn(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = createHash('sha512');
  let received = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    hash.update(chunk);
    received += chunk.length;
    if (total) onProgress?.((received / total) * 100);
  });
  await pipeline(body, createWriteStream(zipPath));
  if (sha512 && hash.digest('base64') !== sha512) throw new Error('Update file is corrupted (checksum mismatch)');
  const out = join(dir, 'unpacked');
  await run('/usr/bin/ditto', ['-x', '-k', zipPath, out]);
  const { stdout } = await run('/bin/ls', [out]);
  const appName = stdout.split('\n').find((n) => n.endsWith('.app'));
  if (!appName) throw new Error('No app found in the update');
  return join(out, appName);
}

/** The running .app bundle (…/X.app/Contents/MacOS/X → …/X.app). */
export function currentBundlePath(exePath) {
  return dirname(dirname(dirname(exePath)));
}

/** Waits for this process to exit, swaps the bundle, re-signs ad-hoc, clears quarantine, relaunches. Detached from the app. */
export function spawnInstaller({ newApp, targetApp, pid }) {
  const script = `
while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done
BACKUP="$TARGET.old"
rm -rf "$BACKUP"
mv "$TARGET" "$BACKUP" || exit 1
if /usr/bin/ditto "$NEW" "$TARGET"; then
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
  codesign --force --deep --sign - "$TARGET" 2>/dev/null
  rm -rf "$BACKUP"
else
  rm -rf "$TARGET"; mv "$BACKUP" "$TARGET"
fi
open "$TARGET"
rm -rf "$(dirname "$(dirname "$NEW")")"
`;
  const child = spawn('/bin/sh', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PID: String(pid), NEW: newApp, TARGET: targetApp },
  });
  child.unref();
}
