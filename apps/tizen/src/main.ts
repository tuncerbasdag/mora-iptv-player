import { getOrCreateDeviceMac } from '../../../packages/core/src/remoteSetup.ts';
import { runApp } from '../../../packages/ui/src/bootstrap.ts';
import { TizenConnectivityProbe } from './tizenConnectivity.ts';
import { TizenHybridAdapter } from './tizenHybridAdapter.ts';

/** Minimal global provided by the Tizen runtime (no official @types package exists). */
declare const tizen: {
  tvinputdevice: { registerKey(name: string): void };
};
declare const webapis: { network?: { getMac?: () => string } };

/** Filled in at build time by apps/tizen/build.mjs from PORTAL_URL in .env. */
declare const __PORTAL_URL__: string;
/** Address of the Remote Install portal (the portal/ folder must be run on a server and written into .env). */
const PORTAL_URL = __PORTAL_URL__;
const YELLOW_KEYCODE = 405;
/** Keys that aren't registered never reach the app, so any key we need must be listed here. */
const REGISTERED_KEYS = [
  'ColorF2Yellow', // yellow: refresh the list
  'ColorF3Blue', // blue: add/remove favorite in Live TV (remote has no "F" letter key)
  'Info', // Info: fullscreen diagnostics panel (buffer, dropped frames, engine)
  'ColorF1Green', // green: diagnostics panel (if the remote has no Info key)
  'ChannelUp', // CH+: next channel in fullscreen live playback (key never reaches the app if not registered)
  'ChannelDown', // CH-: previous channel
  'MediaPlay',
  'MediaPause',
  'MediaPlayPause',
];

/** The TV's real MAC address; falls back to a persisted generated identifier if it can't be read (no API/permission). */
function getTizenDeviceMac(): string {
  try {
    const mac = webapis.network?.getMac?.();
    if (mac && /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i.test(mac)) return mac.toUpperCase().replace(/-/g, ':');
  } catch {
    // webapis.network is unavailable or not permitted — fall through to the fallback below.
  }
  return getOrCreateDeviceMac(localStorage);
}

function registerTizenKeys(): void {
  try {
    for (const key of REGISTERED_KEYS) tizen.tvinputdevice.registerKey(key);
  } catch (err) {
    // Outside Tizen (e.g. testing in a desktop browser) the tizen global doesn't exist — ignore.
    console.warn('[tizen] tuş kaydı başarısız', err);
  }
}

/** The Tizen widget isn't subject to CORS: URLs are fetched directly. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

runApp({
  fetchText,
  connectivity: new TizenConnectivityProbe(),
  remoteSetup: { portalUrl: PORTAL_URL, getDeviceMac: getTizenDeviceMac },
  createPlayerAdapter: (videoContainer) => new TizenHybridAdapter(videoContainer),
  beforeStart: registerTizenKeys,
  afterStart: ({ playlist }) => {
    document.addEventListener('keydown', (e) => {
      if (e.keyCode === YELLOW_KEYCODE) void playlist.refresh();
    });
  },
});
