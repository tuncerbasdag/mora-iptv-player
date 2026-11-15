/**
 * Film/dizi gezgini (vodBrowser.ts) E2E test sayfası: gerçek ekran, sahte veri/depo ile.
 * Playwright testleri `window.__vodStart(...)` ile kurar, `window.__v` ile geri çağrıları okur.
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
  /** Dizi görünümü: yatay 16:9 poster, 4 sütun, "Yeni bölüm" rozeti. */
  landscape?: boolean;
  favorites?: string[];
  /** Son izlenenler: [filmId, izlenen sn, süre sn]. */
  recents?: Array<[string, number, number]>;
  restore?: VodRestore;
  /** true: yıl/eklenme/süre bilgisi yok (dizi gibi): yalnızca 3 temel sıralama görünür. */
  plain?: boolean;
  /** Verilirse posterler bu anahtarla /logo/ üzerinden istenir (sunucuda sayılır). */
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
    { name: 'Kilitli', locked: true, items: [] }, // kilitliyken içerik PIN girilene kadar boş gelir (bkz. Category.locked)
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
