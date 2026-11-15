import type { ConnectivityProbe } from '../../../core/src/connectivity.ts';
import type { EpgService } from '../../../core/src/epgService.ts';
import type { PlaylistPort } from '../../../core/src/playlistService.ts';
import type { RemoteSetupConfig } from '../../../core/src/remoteSetup.ts';
import type { StorageAdapter } from '../../../core/src/storage.ts';
import type { Library } from '../../../core/src/types.ts';
import type { AppUpdater } from '../appUpdater.ts';
import type { PlayerAdapter } from '../playerAdapter.ts';
import type { LiveScreenResume } from '../screens/liveScreen.ts';
import type { SettingsPage } from '../screens/settings.ts';
import type { ParentalSession } from './parentalSession.ts';
import type { PinPrompt } from './pinPrompt.ts';
import type { ScreenHost } from './screenHost.ts';

export interface AppDeps {
  container: HTMLElement;
  playlist: PlaylistPort;
  storage: StorageAdapter;
  /** Called at the start of every playback, after the video container is attached to the DOM: returns hls.js/mpegts.js/<video> for web, the AVPlay adapter for Tizen. */
  createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter;
  /** Null if EPG is disabled or hasn't loaded yet — the Live TV screen shows "no data" in the EPG panel. */
  epgService: EpgService | null;
  /** Called when epgEnabled/epgUrl changes in Settings — the platform's main.ts reloads the EPG here. */
  onEpgSettingsChanged?: () => void;
  /** Internet/source probing on live stream interruption; if not given, reconnection falls back to the old (no-probing) behavior. */
  connectivity?: ConnectivityProbe;
  /** If given, "Remote Setup" (sending the playlist via the portal using MAC + PIN) is enabled in Add Connection. */
  remoteSetup?: RemoteSetupConfig;
  /** Desktop (Electron) app only: enables Settings → Update. */
  appUpdater?: AppUpdater;
  /** If given, whether another device is already using up the Xtream account's connection slot is checked before opening a stream. */
  fetchText?: (url: string) => Promise<string>;
}

/**
 * Navigation between screens (Mediator): controllers don't know about each other, they only move to
 * another domain through this interface. This way, adding a new screen/domain doesn't require changing existing controllers.
 */
export interface Navigation {
  home(): void;
  settings(page?: SettingsPage, connectionId?: string): void;
  live(resume?: LiveScreenResume, startCategoryId?: string): void;
  movies(restore?: boolean): void;
  series(restore?: boolean): void;
}

/** Dependencies shared by the controllers (Dependency Injection). */
export interface AppContext {
  deps: AppDeps;
  host: ScreenHost;
  parental: ParentalSession;
  pin: PinPrompt;
  nav: Navigation;
  /** Player factory that passes through the single-stream gate (see singleStream.ts). */
  createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter;
  /** The library with the parental lock applied. */
  library(): Library | null;
}
