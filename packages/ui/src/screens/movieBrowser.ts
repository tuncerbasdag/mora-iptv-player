import type { FavoriteStore, PlaybackStore } from '../../../core/src/storage.ts';
import type { Category, MediaItem } from '../../../core/src/types.ts';
import { FocusManager } from '../focusManager.ts';
import { runtimeLabel } from '../format.ts';
import { renderVodBrowser, type VodBrowserCallbacks } from './vodBrowser.ts';

export type MovieBrowserCallbacks = VodBrowserCallbacks<MediaItem>;

/** Production year within the name: "Movie (2024)" or "Movie 2024". Empty if not found. */
export function yearOf(name: string): string {
  const m = /\((19|20)\d{2}\)|\b(19|20)\d{2}\b/.exec(name);
  return m ? m[0].replace(/[()]/g, '') : '';
}

/** A trailing "(2024)" is stripped from the title; the year is already shown on the row below it. */
export function titleOf(name: string): string {
  return name.replace(/\s*\((19|20)\d{2}\)\s*$/, '').trim() || name;
}

export function renderMovieBrowser(
  container: HTMLElement,
  categories: Category<MediaItem>[],
  storage: FavoriteStore & PlaybackStore,
  cb: MovieBrowserCallbacks,
): FocusManager {
  return renderVodBrowser<MediaItem>(container, {
    title: 'Filmler',
    allLabel: 'Tüm Filmler',
    searchLabel: 'Film ara',
    categories,
    entry: (m) => ({
      id: m.id,
      title: titleOf(m.name),
      logo: m.logo,
      // If the runtime was provided by the source, it's shown next to the year: "2022 · 1h 44m".
      sub: [yearOf(m.name), runtimeLabel(m.durationSec)].filter(Boolean).join(' · '),
      year: Number(yearOf(m.name)) || undefined,
      addedAt: m.addedAt,
      durationSec: m.durationSec,
    }),
    entryIdOfProgress: (id) => id,
    storage,
    onSelect: cb.onSelect,
    onBack: cb.onBack,
    onOpen: cb.onOpen,
    restore: cb.restore,
    onUnlockRequest: cb.onUnlockRequest,
  });
}
