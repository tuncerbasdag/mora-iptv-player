import type { WatchProgress } from '../../../../core/src/storage.ts';
import type { SortMode, ViewId, VodBrowserOptions } from './vodTypes.ts';

export function progressRatio(p: WatchProgress | null): number {
  return p && p.duration > 0 ? Math.min(1, p.seconds / p.duration) : 0;
}

export interface VodData<T> {
  /** Content across all categories (each id appears once). */
  all: T[];
  recentEntries(): Array<{ value: T; progress: WatchProgress }>;
  favorites(): T[];
  /** Unfiltered content for a view (Favorites, Continue Watching, All, category). */
  itemsOf(view: ViewId): T[];
  /** Content with search and sort applied. */
  visibleItems(view: ViewId, query: string, sort: SortMode): T[];
  /** Sort options: year / added / duration are only included when at least one item in the data has that field (hidden if the provider doesn't supply it). */
  sortModes: SortMode[];
}

type DataOptions<T> = Pick<VodBrowserOptions<T>, 'categories' | 'entry' | 'storage' | 'entryIdOfProgress'>;

/** Data layer for the movie/show browser: deduplicated list across categories, favorites, continue watching, search, and sort. */
export function createVodData<T>(opts: DataOptions<T>): VodData<T> {
  const byId = new Map<string, T>();
  const all: T[] = [];
  for (const cat of opts.categories) {
    for (const v of cat.items) {
      const id = opts.entry(v).id;
      if (byId.has(id)) continue;
      byId.set(id, v);
      all.push(v);
    }
  }

  function recentEntries(): Array<{ value: T; progress: WatchProgress }> {
    const seen = new Set<string>();
    const out: Array<{ value: T; progress: WatchProgress }> = [];
    for (const p of opts.storage.getRecents()) {
      const entryId = opts.entryIdOfProgress(p.id);
      const value = entryId ? byId.get(entryId) : undefined;
      if (!entryId || !value || seen.has(entryId)) continue;
      seen.add(entryId);
      out.push({ value, progress: p });
    }
    return out;
  }

  function favorites(): T[] {
    return all.filter((v) => opts.storage.isFavorite(opts.entry(v).id));
  }

  function itemsOf(v: ViewId): T[] {
    if (v === 'fav') return favorites();
    if (v === 'recent') return recentEntries().map((r) => r.value);
    if (v === 'all') return all;
    return opts.categories[Number(v.slice(4))]?.items ?? [];
  }

  function visibleItems(view: ViewId, query: string, sort: SortMode): T[] {
    let items = itemsOf(view);
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (q) items = items.filter((v) => opts.entry(v).title.toLocaleLowerCase('tr-TR').includes(q));
    if (sort !== 'list' && view !== 'recent') {
      if (sort === 'year') {
        // Newest year first; unknown years last.
        items = items.slice().sort((a, b) => (opts.entry(b).year ?? -1) - (opts.entry(a).year ?? -1));
      } else if (sort === 'new') {
        // Most recently added first; items the provider didn't date last.
        items = items.slice().sort((a, b) => (opts.entry(b).addedAt ?? -1) - (opts.entry(a).addedAt ?? -1));
      } else if (sort === 'duration') {
        // Longest first; items with unknown duration last.
        items = items.slice().sort((a, b) => (opts.entry(b).durationSec ?? -1) - (opts.entry(a).durationSec ?? -1));
      } else {
        items = items.slice().sort((a, b) => opts.entry(a).title.localeCompare(opts.entry(b).title, 'tr-TR'));
        if (sort === 'za') items.reverse();
      }
    }
    return items;
  }

  const sortModes: SortMode[] = [
    'list',
    'az',
    'za',
    ...(all.some((v) => opts.entry(v).year) ? (['year'] as SortMode[]) : []),
    ...(all.some((v) => opts.entry(v).addedAt) ? (['new'] as SortMode[]) : []),
    ...(all.some((v) => opts.entry(v).durationSec) ? (['duration'] as SortMode[]) : []),
  ];

  return { all, recentEntries, favorites, itemsOf, visibleItems, sortModes };
}
