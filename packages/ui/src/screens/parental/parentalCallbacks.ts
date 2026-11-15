import { updateSettings, type SettingsStore } from '../../../../core/src/storage.ts';
import type { Library, ParentalSettings } from '../../../../core/src/types.ts';
import type { SettingsPage } from '../settingsShell.ts';

export interface ParentalCallbacks {
  onNavigate: (page: SettingsPage) => void;
  onHome: () => void;
  /** Called when the lock is turned on/off or the rules change (resets the "PIN entered" state for the session). */
  onChanged: (change: 'enabled' | 'disabled' | 'rules') => void;
  getLibrary: () => Library | null;
}

/** Updates part of the parental lock settings. */
export function patchParental(storage: SettingsStore, patch: Partial<ParentalSettings>): void {
  updateSettings(storage, (s) => ({ parental: { ...s.parental, ...patch } }));
}
