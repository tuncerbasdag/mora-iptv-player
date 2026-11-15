import type { PlaylistPort } from '../../../../core/src/playlistService.ts';
import type { SettingsStore } from '../../../../core/src/storage.ts';
import type { AppUpdater } from '../../appUpdater.ts';
import type { FocusManager } from '../../focusManager.ts';
import type { SettingsPage } from '../settingsShell.ts';

export interface SettingsScreenCallbacks {
  /** Return to the home screen. */
  onHome: () => void;
  /** `connectionId` is only used by the 'edit' page: which connection to edit. */
  onNavigate: (page: SettingsPage, connectionId?: string) => void;
  /** Called when epgEnabled changes — the caller reloads the EPG if needed. */
  onEpgChanged: () => void;
  /** If provided, shows the device's MAC address on the Connections page (for remote upload). */
  getDeviceMac?: () => Promise<string> | string;
  /** Desktop app only: enables the Update page. */
  appUpdater?: AppUpdater;
}

/** Dependencies a settings page needs. */
export interface SettingsPageContext {
  container: HTMLElement;
  storage: SettingsStore;
  playlist: PlaylistPort;
  cb: SettingsScreenCallbacks;
}

/** A settings page (Strategy): renders its own content and returns a focus manager. */
export interface SettingsPageView {
  render(): FocusManager;
}
