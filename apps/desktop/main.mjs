import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import { startServer } from '../web/server.mjs';
import { fileURLToPath } from 'node:url';
import { openUpdatesPage, setupUpdater } from './updater.mjs';

/**
 * Masaüstü kabuğu: mevcut web sunucusunu (CORS proxy'si dahil) aynı süreçte başlatır ve arayüzü bir pencerede açar.
 * Port sabittir: localStorage/IndexedDB (bağlantılar, favoriler) origin'e, yani porta bağlıdır; port değişirse veriler kaybolur.
 */
const PORT = 38787;
const APP_NAME = 'Mora IPTV Player';

app.setName(APP_NAME);
app.setAboutPanelOptions({ applicationName: APP_NAME, applicationVersion: app.getVersion(), copyright: 'Copyright (c) 2026 Tuncer Başdağ' });
// Kanal açılırken kullanıcı etkileşimi şart olmasın (kumanda/klavye ile açılır).
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

// Sayfanın her yerinden pencere taşıma (preload.cjs mouse hareketini gönderir; başlangıç konumu burada tutulur).
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

// Uygulama simgesi (build/icon.png). Paketli sürümde electron-builder simgeyi zaten uygular; bu, `npm run desktop` (geliştirme) için
// dock/pencere simgesini Electron'unkinden değiştirir. Dosya pakette yoksa sessizce atlanır.
const iconPath = fileURLToPath(new URL('../../build/icon.png', import.meta.url));
const APP_ICON = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: APP_ICON ?? undefined,
    // Sabit 16:9 içerik alanı: pencere elle sürüklenerek yeniden boyutlandırılamaz (aşağıdaki 'will-resize'), ama tam ekrana geçilebilir.
    // Not: macOS'ta `resizable: false` tam ekran düğmesini de devre dışı bıraktığı için resizable açık kalır.
    width: 1280,
    height: 720,
    useContentSize: true,
    maximizable: false,
    fullscreenable: true,
    title: APP_NAME,
    backgroundColor: '#242323',
    autoHideMenuBar: true,
    // Başlık çubuğu gizlenir; macOS'ta trafik ışıkları içeriğin üstünde kalır, içerik pencerenin tamamını kaplar.
    // Windows'ta `titleBarStyle: 'hidden'` tek başına kapatma/simge durumuna küçültme düğmelerini tamamen kaldırır
    // (macOS'taki trafik ışıklarının eşleniği yok) — `titleBarOverlay` bunları sağ üstte, uygulama temasına uygun
    // renklerle geri getirir.
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32' ? { titleBarOverlay: { color: '#242323', symbolColor: '#f5f1ec', height: 40 } } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)) },
  });
  mainWindow.on('closed', () => (mainWindow = null));
  // Esc her zaman tam ekrandan çıkarır — uygulama içi tam ekran çıkış butonu sadece oynatıcı ekranında var;
  // kullanıcı tam ekrandayken başka bir ekrana (ör. Ana Sayfa) geçerse orada çıkış arayüzü olmayacağı için
  // bu, pencere seviyesinde her zaman çalışan bir güvenlik ağı.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && mainWindow?.isFullScreen()) mainWindow.setFullScreen(false);
  });
  // Elle yeniden boyutlandırmayı engelle; tam ekrana giriş/çıkış etkilenmez.
  // macOS tam ekrandan çıkarken (ör. kırmızı kapat düğmesi) isFullScreen() geçiş sırasında zaten false olabilir; fsActive, çıkış
  // animasyonunun yeniden boyutlandırmasının engellenip pencerenin tam ekran boyutunda takılı kalmasını önler.
  let fsActive = false;
  mainWindow.on('enter-full-screen', () => {
    fsActive = true;
    mainWindow?.webContents.send('window:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    // fsActive, bu düzeltici resize TAMAMLANANA kadar true kalmalı: 'will-resize' senkron olarak
    // (aynı native çağrı içinde) tetiklenir — fsActive erken false yapılırsa aşağıdaki setContentSize
    // çağrısının kendisi will-resize guard'ı tarafından engellenir ve pencere tam ekran boyutunda tak覆ılı kal覆ır.
    mainWindow?.setContentSize(1280, 720);
    mainWindow?.center();
    fsActive = false;
    mainWindow?.webContents.send('window:fullscreen-changed', false);
  });
  mainWindow.on('will-resize', (event) => {
    if (!fsActive && !mainWindow?.isFullScreen()) event.preventDefault();
  });
  // Uygulama dışındaki bağlantılar (ör. yeni pencere isteği) varsayılan tarayıcıda açılır, uygulama içinde değil.
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
  // Not: ESM girişinde en üst düzeyde `await app.whenReady()` yazılmaz; Electron `ready` olayını modül yüklenene kadar
  // geciktirdiği için kilitlenir. Bu yüzden açılış bir fonksiyon içinde.
  await app.whenReady();
  if (APP_ICON && !APP_ICON.isEmpty()) app.dock?.setIcon(APP_ICON);
  // Kamera/mikrofon/konum gibi izinler istenmez.
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
