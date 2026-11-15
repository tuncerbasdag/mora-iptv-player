import type { AppUpdater } from '../../../packages/ui/src/appUpdater.ts';
import { runApp } from '../../../packages/ui/src/bootstrap.ts';
import { enableMouseSupport } from '../../../packages/ui/src/mouseSupport.ts';
import { WebConnectivityProbe } from './webConnectivity.ts';
import { WebPlayerAdapter } from '../../../packages/web-player/src/webPlayerAdapter.ts';

/** In the browser, all network requests go through the local proxy to avoid CORS (see server.mjs). */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Only the Electron desktop shell exposes the updater (see apps/desktop/preload.cjs); in a browser it is undefined and Settings has no Update page. */
const appUpdater = (window as unknown as { moraDesktop?: { updater?: AppUpdater } }).moraDesktop?.updater;

// Mouse UI (Back buttons, reveal-on-move bars) exists on the web build only; the Tizen entry never enables it.
enableMouseSupport();

runApp({
  fetchText,
  appUpdater,
  connectivity: new WebConnectivityProbe(),
  // Remote Install (portal) is TV-only: in the browser the M3U URL is entered directly via Settings, so remoteSetup isn't provided.
  createPlayerAdapter: (videoContainer) => new WebPlayerAdapter(videoContainer),
});
