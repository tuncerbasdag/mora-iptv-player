import { hasEpisodeNumbers } from '../../../core/src/library.ts';
import type { FavoriteStore, PlaybackStore } from '../../../core/src/storage.ts';
import type { Category, Show } from '../../../core/src/types.ts';
import { FocusManager } from '../focusManager.ts';
import { renderVodBrowser, type VodBrowserCallbacks } from './vodBrowser.ts';

export type SeriesBrowserCallbacks = VodBrowserCallbacks<Show>;

/** Category → series grid. Episode/season selection happens on the showDetail screen. */
export function renderSeriesBrowser(
  container: HTMLElement,
  categories: Category<Show>[],
  storage: FavoriteStore & PlaybackStore,
  cb: SeriesBrowserCallbacks,
): FocusManager {
  // Watch records are keyed by episode id: map episode to series for "Continue watching".
  const showOfEpisode = new Map<string, string>();
  for (const cat of categories) for (const show of cat.items) for (const season of show.seasons) for (const ep of season.episodes) showOfEpisode.set(ep.id, show.id);
  return renderVodBrowser<Show>(container, {
    title: 'Diziler',
    allLabel: 'Tüm Diziler',
    searchLabel: 'Dizi ara',
    landscapeGrid: true,
    newBadgeLabel: 'Yeni bölüm',
    categories,
    entry: (s) => ({ id: s.id, title: s.title, logo: s.logo, sub: hasEpisodeNumbers(s) ? `${s.seasons.length} sezon` : '', addedAt: s.addedAt }),
    entryIdOfProgress: (id) => showOfEpisode.get(id) ?? null,
    storage,
    onSelect: cb.onSelect,
    onBack: cb.onBack,
    onOpen: cb.onOpen,
    restore: cb.restore,
    onUnlockRequest: cb.onUnlockRequest,
  });
}
