import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain, net, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { initialState, reduceUpdate } from './updateState.mjs';
import { installMode, updatePolicy } from './updatePolicy.mjs';
import { currentBundlePath, downloadAndUnpack, pickZip, releaseAssetUrl, spawnInstaller } from './macSelfUpdate.mjs';

const { autoUpdater } = electronUpdater;

const RELEASES_URL = 'https://github.com/tuncerbasdag/mora-iptv-player/releases/latest';
const FIRST_CHECK_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const buildInfo = JSON.parse(readFileSync(new URL('./build-info.json', import.meta.url), 'utf8'));
export const policy = updatePolicy({ platform: process.platform, packaged: app.isPackaged, macSigned: buildInfo.macSigned });

// Unsigned macOS: Squirrel.Mac can't install, so macSelfUpdate.mjs downloads, verifies and swaps the app itself.
const mode = installMode({ platform: process.platform, macSigned: buildInfo.macSigned });
let availableInfo = null; // update info (version + files with sha512) from the last check
let unpackedApp = null; // new .app ready to be swapped in (self mode)

let getWindow = () => null;
let state = initialState({ currentVersion: app.getVersion(), policy });
let userInitiated = false; // the user pressed "check": failures are shown; background checks fail silently

/** Applies an event to the state and pushes the new state to the window (Settings → Update page). */
function dispatch(event) {
  state = reduceUpdate(state, event);
  const win = getWindow();
  win?.webContents.send('updater:state', state);
  win?.setProgressBar(state.status === 'downloading' ? (state.percent ?? 0) / 100 : -1);
}

function openReleases() {
  void shell.openExternal(RELEASES_URL);
}

/** Checks for a new version. Background checks (userRequested=false) never interrupt; results are only reflected in the state. */
export function checkForUpdates(userRequested) {
  if (policy === 'disabled') return;
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return;
  userInitiated = userRequested;
  dispatch({ type: 'checking' });
  autoUpdater.checkForUpdates().catch(() => {}); // errors are handled in the 'error' event
}

/** Self mode (unsigned macOS): download the release zip, verify its checksum, unpack it. */
async function downloadSelf() {
  try {
    const file = pickZip(availableInfo);
    if (!file) throw new Error('No macOS package in this release');
    const url = releaseAssetUrl({ owner: 'tuncerbasdag', repo: 'mora-iptv-player', version: availableInfo.version, fileName: file.url });
    unpackedApp = await downloadAndUnpack({
      url,
      sha512: file.sha512,
      dir: join(app.getPath('temp'), 'mora-update'),
      onProgress: (percent) => dispatch({ type: 'progress', percent }),
      fetchFn: (u, init) => net.fetch(u, init),
    });
    dispatch({ type: 'downloaded', version: availableInfo.version });
  } catch (err) {
    console.error('[updater]', err);
    dispatch({ type: 'error', message: String(err?.message ?? err), silent: false });
  }
}

function download() {
  if (state.status !== 'available') return;
  dispatch({ type: 'download-started' });
  if (mode === 'self') void downloadSelf();
  else autoUpdater.downloadUpdate().catch(() => {});
}

function install() {
  if (state.status !== 'ready') return;
  if (mode === 'self') {
    if (!unpackedApp) return;
    spawnInstaller({ newApp: unpackedApp, targetApp: currentBundlePath(app.getPath('exe')), pid: process.pid });
    app.quit();
    return;
  }
  autoUpdater.quitAndInstall();
}

/**
 * Sets up the updater and the IPC the page uses (see preload.cjs). IPC from any page other than the app's own origin is ignored.
 * In unpackaged runs the state stays 'disabled' (the page says updates only work in the installed app).
 */
export function setupUpdater({ getWindow: windowGetter, origin }) {
  getWindow = windowGetter;
  const trusted = (event) => String(event.senderFrame?.url ?? '').startsWith(origin);
  ipcMain.handle('updater:get-state', (event) => (trusted(event) ? state : null));
  ipcMain.on('updater:check', (event) => trusted(event) && checkForUpdates(true));
  ipcMain.on('updater:download', (event) => trusted(event) && download());
  ipcMain.on('updater:install', (event) => trusted(event) && install());
  ipcMain.on('updater:open-releases', (event) => trusted(event) && openReleases());

  if (policy === 'disabled') return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = mode === 'native';
  autoUpdater.on('update-available', (info) => {
    availableInfo = info;
    dispatch({ type: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => dispatch({ type: 'not-available' }));
  autoUpdater.on('update-downloaded', (info) => dispatch({ type: 'downloaded', version: info.version }));
  autoUpdater.on('download-progress', (p) => dispatch({ type: 'progress', percent: p.percent }));
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err);
    // 404 from the GitHub releases feed means "no releases published yet" (e.g. a private repo, or none published
    // yet) — not a real failure; surfacing the raw HTTP dump (headers, auth-token hint, etc.) just reads as a crash.
    if (err?.statusCode === 404) {
      dispatch({ type: 'not-available' });
      return;
    }
    dispatch({ type: 'error', message: String(err?.message ?? err), silent: !userInitiated });
  });

  setTimeout(() => checkForUpdates(false), FIRST_CHECK_DELAY_MS);
  setInterval(() => checkForUpdates(false), CHECK_INTERVAL_MS);
}

/** Tells the page to open Settings → Update (the "Help → Check for Updates…" menu item); the page then starts the check. */
export function openUpdatesPage() {
  getWindow()?.webContents.send('updater:open');
}
