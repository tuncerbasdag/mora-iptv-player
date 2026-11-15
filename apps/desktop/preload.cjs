// Preload (sandboxed → CommonJS, only contextBridge + ipcRenderer): exposes the updater to the page as `window.moraDesktop.updater`.
// No network access here; it is just IPC between the window and the main process (see updater.mjs).
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Başlık çubuğu olmadığı için pencere sayfanın herhangi bir yerinden sürüklenerek taşınır. Hareket eşiği aşılmadıkça tıklamalar
// olduğu gibi çalışır; sürükleme sonrası oluşan 'click' yutulur. Form alanları (input/select/textarea) sürüklemeyi başlatmaz.
const DRAG_THRESHOLD_PX = 5;
let drag = null;
window.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
  drag = { x: event.screenX, y: event.screenY, active: false };
}, true);
window.addEventListener('mousemove', (event) => {
  if (!drag) return;
  if (!(event.buttons & 1)) { drag = null; return; }
  const dx = event.screenX - drag.x;
  const dy = event.screenY - drag.y;
  if (!drag.active) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.active = true;
    ipcRenderer.send('window:drag-start');
  }
  ipcRenderer.send('window:drag-move', { dx, dy });
}, true);
window.addEventListener('mouseup', () => {
  if (drag?.active) {
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  }
  drag = null;
}, true);

contextBridge.exposeInMainWorld('moraDesktop', {
  // macOS: shows/hides the traffic-light buttons (hidden during in-app fullscreen playback; no-op elsewhere).
  setWindowControlsVisible: (visible) => ipcRenderer.send('window:controls-visible', !!visible),
  toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  setFullscreen: (value) => ipcRenderer.send('window:set-fullscreen', !!value),
  onFullscreenChange: (callback) => subscribe('window:fullscreen-changed', callback),
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.send('updater:check'),
    download: () => ipcRenderer.send('updater:download'),
    install: () => ipcRenderer.send('updater:install'),
    openReleases: () => ipcRenderer.send('updater:open-releases'),
    onState: (callback) => subscribe('updater:state', callback),
    onOpenUpdates: (callback) => subscribe('updater:open', () => callback()),
  },
});
