import { LEGACY_CONNECTION_ID, migrateSettings } from './connections.ts';
import type { Library, Settings } from './types.ts';

/** Settings (connections, theme, parental lock...). */
export interface SettingsStore {
  getSettings(): Settings;
  setSettings(s: Settings): void;
}

/** Library cached per connection. */
export interface LibraryStore {
  /** The connection's cached library; null if none. */
  loadLibrary(connectionId: string): Promise<Library | null>;
  saveLibrary(connectionId: string, lib: Library): Promise<void>;
  deleteLibrary(connectionId: string): Promise<void>;
}

/** Watch history: resume position, progress, recently watched, last live channel. */
export interface PlaybackStore {
  getResume(id: string): number;
  /** If `duration` (seconds) is given, progress percentage and "N min left" can be shown; otherwise 0. */
  setResume(id: string, seconds: number, duration?: number): void;
  getProgress(id: string): WatchProgress | null;
  /** Most recently watched, newest to oldest. */
  getRecents(): WatchProgress[];
  getLastLive(): string | null;
  setLastLive(id: string): void;
}

export interface FavoriteStore {
  getFavorites(): string[];
  isFavorite(id: string): boolean;
  setFavorite(id: string, fav: boolean): void;
}

/**
 * The full store = a union of four roles (Interface Segregation): consumers only request the role
 * they need (e.g. Live TV only needs `FavoriteStore`, the player only needs `PlaybackStore`), and tests
 * only need to fake that one role.
 */
export interface StorageAdapter extends SettingsStore, LibraryStore, PlaybackStore, FavoriteStore {}

/** Watch status of a movie/episode. `duration` is 0 if unknown. */
export interface WatchProgress {
  id: string;
  seconds: number;
  duration: number;
  at: number; // epoch ms
}

const K_SETTINGS = 'iptv.settings';
const K_RESUME = 'iptv.resume';
const K_LAST_LIVE = 'iptv.lastLive';
const K_FAVORITES = 'iptv.favorites';
const MAX_RESUME = 500;
/** [seconds, updated timestamp, total duration]; older records have no duration. */
type ResumeEntry = [number, number, number?];

/**
 * Works both in the browser and on Samsung TV (Tizen web app):
 * settings live in localStorage, the channel list in IndexedDB (localStorage is limited to ~5 MB).
 */
export class BrowserStorage implements StorageAdapter {
  private dbp: Promise<IDBDatabase> | null = null;

  getSettings(): Settings {
    return migrateSettings(readJson<Record<string, unknown>>(K_SETTINGS, {}));
  }
  setSettings(s: Settings) {
    writeJson(K_SETTINGS, s);
  }

  async loadLibrary(connectionId: string): Promise<Library | null> {
    try {
      const db = await this.db();
      const store = () => db.transaction('lib').objectStore('lib');
      const found = await req<Library | undefined>(store().get(libKey(connectionId)));
      if (found) return found;
      // The old single-connection version's cache was under the 'current' key.
      if (connectionId === LEGACY_CONNECTION_ID) return (await req<Library | undefined>(store().get('current'))) ?? null;
      return null;
    } catch (e) {
      console.warn('[storage] failed to read list', e);
      return null;
    }
  }

  async saveLibrary(connectionId: string, lib: Library): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('lib', 'readwrite');
    tx.objectStore('lib').put(lib, libKey(connectionId));
    await txDone(tx);
  }

  async deleteLibrary(connectionId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('lib', 'readwrite');
    tx.objectStore('lib').delete(libKey(connectionId));
    if (connectionId === LEGACY_CONNECTION_ID) tx.objectStore('lib').delete('current');
    await txDone(tx);
  }

  getResume(id: string): number {
    return readJson<Record<string, ResumeEntry>>(K_RESUME, {})[id]?.[0] ?? 0;
  }
  setResume(id: string, seconds: number, duration = 0) {
    const all = readJson<Record<string, ResumeEntry>>(K_RESUME, {});
    if (seconds <= 0) delete all[id];
    else all[id] = [Math.floor(seconds), Date.now(), Math.floor(duration)];
    // Drop the oldest records so storage doesn't bloat.
    const keys = Object.keys(all);
    if (keys.length > MAX_RESUME) {
      keys.sort((a, b) => all[a][1] - all[b][1]);
      for (const k of keys.slice(0, keys.length - MAX_RESUME)) delete all[k];
    }
    writeJson(K_RESUME, all);
  }
  getProgress(id: string): WatchProgress | null {
    const e = readJson<Record<string, ResumeEntry>>(K_RESUME, {})[id];
    return e ? { id, seconds: e[0], at: e[1], duration: e[2] ?? 0 } : null;
  }
  getRecents(): WatchProgress[] {
    const all = readJson<Record<string, ResumeEntry>>(K_RESUME, {});
    return Object.keys(all)
      .map((id) => ({ id, seconds: all[id][0], at: all[id][1], duration: all[id][2] ?? 0 }))
      .sort((a, b) => b.at - a.at);
  }
  getLastLive() {
    return safe(() => localStorage.getItem(K_LAST_LIVE), null);
  }
  setLastLive(id: string) {
    safe(() => localStorage.setItem(K_LAST_LIVE, id), undefined);
  }

  getFavorites(): string[] {
    return readJson<string[]>(K_FAVORITES, []);
  }
  isFavorite(id: string): boolean {
    return this.getFavorites().includes(id);
  }
  setFavorite(id: string, fav: boolean): void {
    const current = this.getFavorites();
    const next = fav ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id);
    writeJson(K_FAVORITES, next);
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((res, rej) => {
        const r = indexedDB.open('iptv-player', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('lib');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return this.dbp;
  }
}

function libKey(connectionId: string): string {
  return `lib-${connectionId}`;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

function req<T>(r: IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
function readJson<T>(key: string, fallback: T): T {
  return safe(() => {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  }, fallback);
}
function writeJson(key: string, v: unknown) {
  safe(() => localStorage.setItem(key, JSON.stringify(v)), undefined);
}

/** Read-modify-write pattern for settings: `patch` returns a partial update derived from the current settings. */
export function updateSettings(storage: SettingsStore, patch: (current: Settings) => Partial<Settings>): void {
  const current = storage.getSettings();
  storage.setSettings({ ...current, ...patch(current) });
}
