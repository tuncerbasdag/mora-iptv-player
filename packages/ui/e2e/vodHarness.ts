/**
 * E2E test page for the movie/series browser (vodBrowser.ts): real screen, with fake data/store.
 * Playwright tests set it up via `window.__vodStart(...)` and read callbacks via `window.__v`.
 */
import { applyScaleToFit } from '../src/scaleToFit.ts';
import { renderVodBrowser, type SortMode, type VodEntry, type VodRestore } from '../src/screens/vodBrowser.ts';
import type { StorageAdapter, WatchProgress } from '../../core/src/storage.ts';
import { DEFAULT_SETTINGS, type Category } from '../../core/src/types.ts';

interface Movie {
  id: string;
  title: string;
  year?: number;
  addedAt?: number;
  durationSec?: number;
  logo?: string;
}

interface StartOptions {
  /** Series view: horizontal 16:9 poster, 4 columns, "New episode" badge. */
  landscape?: boolean;
  favorites?: string[];
  /** Recently watched: [movieId, watched sec, duration sec]. */
  recents?: Array<[string, number, number]>;
  restore?: VodRestore;
  /** true: no year/added/duration info (like a series): only the 3 basic sorts are shown. */
  plain?: boolean;
  /** If given, posters are requested via /logo/ with this key (counted on the server). */
  logoKey?: string;
}

const DAY = 24 * 3600 * 1000;

function makeCategories(o: StartOptions): Category<Movie>[] {
  const now = Date.now();
  const mk = (i: number, cat: string): Movie => ({
    id: `${cat}-${i}`,
    title: `${cat} Film ${String(i + 1).padStart(3, '0')}`,
    ...(o.plain ? {} : { year: 2000 + (i % 25), addedAt: now - (i % 40) * DAY, durationSec: 3600 + i * 60 }),
    ...(o.logoKey ? { logo: `/logo/ok-${cat}-${i}.svg?k=${o.logoKey}` } : {}),
  });
  const aksiyon = Array.from({ length: 80 }, (_, i) => mk(i, 'Aksiyon'));
  const dram = Array.from({ length: 12 }, (_, i) => mk(i, 'Dram'));
  return [
    { name: 'Aksiyon', items: aksiyon },
    { name: 'Dram', items: dram },
    { name: 'Kilitli', locked: true, items: [] }, // when locked, content stays empty until the PIN is entered (see Category.locked)
    { name: 'Boş', items: [] },
  ];
}

function memoryStorage(favs: string[], recents: Array<[string, number, number]>): StorageAdapter {
  const fav = new Set(favs);
  const progress: WatchProgress[] = recents.map(([id, seconds, duration], i) => ({ id, seconds, duration, at: 1_000_000 - i }));
  return {
    getSettings: () => DEFAULT_SETTINGS,
    setSettings: () => {},
    loadLibrary: async () => null,
    saveLibrary: async () => {},
    deleteLibrary: async () => {},
    getResume: () => 0,
    setResume: () => {},
    getProgress: (id) => progress.find((p) => p.id === id) ?? null,
    getRecents: () => progress,
    getLastLive: () => null,
    setLastLive: () => {},
    getFavorites: () => [...fav],
    isFavorite: (id) => fav.has(id),
    setFavorite: (id, v) => void (v ? fav.add(id) : fav.delete(id)),
  };
}

interface Harness {
  selected: string[];
  opened: VodRestore[];
  unlock: VodRestore[];
  back: number;
  favorites: () => string[];
}

declare global {
  interface Window {
    __vodStart: (o?: StartOptions) => void;
    __v: Harness;
  }
}

window.__vodStart = (o: StartOptions = {}) => {
  const container = document.getElementById('app')!;
  applyScaleToFit(container);
  const storage = memoryStorage(o.favorites ?? [], o.recents ?? []);
  const h: Harness = { selected: [], opened: [], unlock: [], back: 0, favorites: () => storage.getFavorites() };
  window.__v = h;
  renderVodBrowser<Movie>(container, {
    title: o.landscape ? 'Diziler' : 'Filmler',
    allLabel: o.landscape ? 'Tüm Diziler' : 'Tüm Filmler',
    searchLabel: o.landscape ? 'Dizi ara' : 'Film ara',
    categories: makeCategories(o),
    entry: (m): VodEntry => ({ id: m.id, title: m.title, sub: m.year ? String(m.year) : 'Dizi', year: m.year, addedAt: m.addedAt, durationSec: m.durationSec, logo: m.logo }),
    entryIdOfProgress: (id) => id,
    storage,
    onSelect: (m) => void h.selected.push(m.id),
    onBack: () => void h.back++,
    onOpen: (s) => void h.opened.push(s),
    onUnlockRequest: (s) => void h.unlock.push(s),
    restore: o.restore,
    landscapeGrid: o.landscape,
    newBadgeLabel: o.landscape ? 'Yeni bölüm' : undefined,
  });
};

export type { SortMode };
