import type { ConnectivityProbe } from '../../core/src/connectivity.ts';
import { EpgCoordinator } from '../../core/src/epgCoordinator.ts';
import { EpgService } from '../../core/src/epgService.ts';
import { PlaylistService, type PlaylistPort } from '../../core/src/playlistService.ts';
import type { AppUpdater } from './appUpdater.ts';
import type { RemoteSetupConfig } from '../../core/src/remoteSetup.ts';
import { BrowserStorage } from '../../core/src/storage.ts';
import { startApp } from './app.ts';
import type { PlayerAdapter } from './playerAdapter.ts';
import { applyScaleToFit } from './scaleToFit.ts';

/** Pieces specific to the platform (web / Tizen); the rest of the startup sequence is shared in `bootstrap` (Template Method). */
export interface PlatformServices {
  /** Downloads text from the network (via a local proxy for CORS on web). */
  fetchText: (url: string) => Promise<string>;
  connectivity: ConnectivityProbe;
  remoteSetup?: RemoteSetupConfig;
  /** Desktop (Electron) app only: enables Settings → Update. */
  appUpdater?: AppUpdater;
  createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter;
  /** Runs before the library loads (e.g. registering remote control keys on Tizen). */
  beforeStart?: () => void;
  /** Called after the app is running; for platform-specific extra bindings (e.g. the Tizen yellow key). */
  afterStart?: (ctx: { playlist: PlaylistPort }) => void;
}

/** Shared startup: storage -> playlist -> EPG -> UI. */
export async function bootstrap(platform: PlatformServices): Promise<void> {
  platform.beforeStart?.();

  const container = document.getElementById('app');
  if (!container) throw new Error('#app bulunamadı');
  applyScaleToFit(container);

  const storage = new BrowserStorage();
  const playlist = new PlaylistService(storage, platform.fetchText);
  const epgService = new EpgService(platform.fetchText);
  const epg = new EpgCoordinator(storage, epgService);
  epg.attach(playlist);

  await playlist.init();
  epg.reload();

  startApp({
    container,
    playlist,
    storage,
    epgService,
    onEpgSettingsChanged: () => epg.reload(),
    fetchText: platform.fetchText,
    connectivity: platform.connectivity,
    remoteSetup: platform.remoteSetup,
    appUpdater: platform.appUpdater,
    createPlayerAdapter: platform.createPlayerAdapter,
  });

  platform.afterStart?.({ playlist });
}

/** Entry point: logs the startup error to the console and shows a short message to the user. */
export function runApp(platform: PlatformServices): void {
  bootstrap(platform).catch((err) => {
    console.error('[main] başlatma hatası', err);
    document.body.textContent = 'Uygulama başlatılamadı, konsolu kontrol edin.';
  });
}
