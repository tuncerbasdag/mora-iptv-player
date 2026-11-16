import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import { startServer } from '../web/server.mjs';
import { fileURLToPath } from 'node:url';
import { openUpdatesPage, setupUpdater } from './updater.mjs';

/**
 * Desktop shell: starts the existing web server (including the CORS proxy) in the same process and opens the UI in a window.
 * The port is fixed: localStorage/IndexedDB (connections, favorites) are tied to the origin, i.e. the port; if the port changes, the data is lost.
 */
const PORT = 38787;
const APP_NAME = 'Mora IPTV Player';

app.setName(APP_NAME);
app.setAboutPanelOptions({ applicationName: APP_NAME, applicationVersion: app.getVersion(), copyright: 'Copyright (c) 2026 Tuncer Başdağ' });
// Don't require user interaction when a channel opens (it is opened via remote/keyboard).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/** @type {BrowserWindow | null} */
let mainWindow = null;
let origin = '';

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const help = {
    label: 'Help',
    submenu: [
      ...(isMac ? [] : [{ label: `About ${APP_NAME}`, click: () => void dialog.showMessageBox({ type: 'info', message: APP_NAME, detail: `Version ${app.getVersion()}\nCopyright (c) 2026 Tuncer Başdağ` }) }]),
      { label: 'Check for Updates…', click: () => openUpdatesPage() },
      { label: 'Releases', click: () => void shell.openExternal('https://github.com/tuncerbasdag/mora-iptv-player/releases') },
    ],
  };
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    // Edit menu: without it Cut/Copy/Paste/Select All shortcuts (Cmd/Ctrl+X/C/V/A) don't work in text fields.
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    help,
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Move the window by dragging anywhere on the page (preload.cjs sends mouse movement; the start position is kept here).
let dragStart = null;
ipcMain.on('window:drag-start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  dragStart = win && !win.isFullScreen() ? win.getPosition() : null;
});
ipcMain.on('window:controls-visible', (event, visible) => {
  // setWindowButtonVisibility exists on macOS only.
  BrowserWindow.fromWebContents(event.sender)?.setWindowButtonVisibility?.(!!visible);
});
ipcMain.on('window:toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.setFullScreen(!win.isFullScreen());
});
ipcMain.on('window:set-fullscreen', (event, value) => {
  BrowserWindow.fromWebContents(event.sender)?.setFullScreen(!!value);
});
ipcMain.on('window:drag-move', (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !dragStart || !Number.isFinite(delta?.dx) || !Number.isFinite(delta?.dy)) return;
  win.setPosition(Math.round(dragStart[0] + delta.dx), Math.round(dragStart[1] + delta.dy));
});

// App icon (build/icon.png). In the packaged build electron-builder already applies the icon; this replaces the
// dock/window icon of Electron itself for `npm run desktop` (development). Silently skipped if the file is missing from the package.
const iconPath = fileURLToPath(new URL('../../build/icon.png', import.meta.url));
const APP_ICON = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: APP_ICON ?? undefined,
    // Fixed 16:9 content area: the window cannot be resized by dragging (see 'will-resize' below), but can go full screen.
    // Note: on macOS `resizable: false` also disables the full-screen button, so resizable stays on.
    width: 1280,
    height: 720,
    useContentSize: true,
    maximizable: false,
    fullscreenable: true,
    title: APP_NAME,
    backgroundColor: '#242323',
    autoHideMenuBar: true,
    // The title bar is hidden; on macOS the traffic lights stay above the content, and the content fills the whole window.
    // On Windows, `titleBarStyle: 'hidden'` alone removes the close/minimize buttons entirely
    // (there is no equivalent of the macOS traffic lights) — `titleBarOverlay` brings them back at the top right, in colors
    // matching the app theme.
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32' ? { titleBarOverlay: { color: '#242323', symbolColor: '#f5f1ec', height: 40 } } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)) },
  });
  mainWindow.on('closed', () => (mainWindow = null));
  // Esc always exits full screen — the in-app full-screen exit button only exists on the player screen;
  // if the user switches to another screen (e.g. Home) while in full screen, there would be no exit UI there, so
  // this is a safety net that always works at the window level.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && mainWindow?.isFullScreen()) mainWindow.setFullScreen(false);
  });
  // Block manual resizing; entering/leaving full screen is unaffected.
  // When leaving full screen on macOS (e.g. via the red close button), isFullScreen() may already be false during the transition; fsActive
  // keeps the exit animation's resize from being blocked, which would leave the window stuck at the full-screen size.
  let fsActive = false;
  mainWindow.on('enter-full-screen', () => {
    fsActive = true;
    mainWindow?.webContents.send('window:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    // fsActive must stay true until this corrective resize COMPLETES: 'will-resize' fires synchronously
    // (within the same native call) — if fsActive is set to false too early, the setContentSize call below
    // is itself blocked by the will-resize guard and the window stays stuck at the full-screen size.
    mainWindow?.setContentSize(1280, 720);
    mainWindow?.center();
    fsActive = false;
    mainWindow?.webContents.send('window:fullscreen-changed', false);
  });
  mainWindow.on('will-resize', (event) => {
    if (!fsActive && !mainWindow?.isFullScreen()) event.preventDefault();
  });
  // Links outside the app (e.g. new-window requests) open in the default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) event.preventDefault();
  });
  void mainWindow.loadURL(origin);
}

async function main() {
  // Note: don't write a top-level `await app.whenReady()` in an ESM entry; Electron delays the `ready` event until the module has loaded,
  // so it would deadlock. That's why startup lives inside a function.
  await app.whenReady();
  if (APP_ICON && !APP_ICON.isEmpty()) app.dock?.setIcon(APP_ICON);
  // Permissions such as camera/microphone/location are not requested.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  try {
    const server = await startServer({ port: PORT });
    origin = server.url;
    app.on('before-quit', () => void server.close());
  } catch (err) {
    dialog.showErrorBox(APP_NAME, `Could not start the local server on port ${PORT}. Is another copy of the app running?\n\n${err?.message ?? err}`);
    app.quit();
    return;
  }

  buildMenu();
  createWindow();
  setupUpdater({ getWindow: () => mainWindow, origin });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  main().catch((err) => {
    console.error(err);
    dialog.showErrorBox(APP_NAME, String(err?.stack ?? err));
    app.quit();
  });
}
