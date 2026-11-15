import type { FavoriteStore, PlaybackStore } from '../../../../core/src/storage.ts';
import type { Category } from '../../../../core/src/types.ts';

/** Common summary of a movie or show, as shown on a card. */
export interface VodEntry {
  id: string;
  title: string;
  logo?: string;
  /** Gray line under the title ("2024", "2 seasons"...); empty if there's none. */
  sub: string;
  /** Production year (if known); used for "By year" sorting. */
  year?: number;
  /** Added-at time reported by the provider (epoch ms); used for "Recently added" sorting. The option is hidden if no item has it. */
  addedAt?: number;
  /** Duration reported by the provider (seconds); used for "By duration" sorting. The option is hidden if no item has it. */
  durationSec?: number;
}

/** Shared events the movie and show browsers report outward. */
export interface VodBrowserCallbacks<T> {
  onSelect: (item: T) => void;
  onBack: () => void;
  /** When a card is opened (before onSelect), the browser's state is given. */
  onOpen?: (state: VodRestore) => void;
  restore?: VodRestore;
  onUnlockRequest?: (state: VodRestore) => void;
}

export interface VodBrowserOptions<T> {
  /** Top-left title: "Movies" / "Shows". */
  title: string;
  /** "All Movies" / "All Shows". */
  allLabel: string;
  searchLabel: string;
  categories: Category<T>[];
  entry: (v: T) => VodEntry;
  /** Converts a watch-progress record's id (movie or episode) to the id of the entry it belongs to; null if unknown. */
  entryIdOfProgress: (progressId: string) => string | null;
  storage: FavoriteStore & PlaybackStore;
  onSelect: (v: T) => void;
  onBack: () => void;
  /** When a card is opened (before onSelect), the browser's state is given. */
  onOpen?: (state: VodRestore) => void;
  /** If provided, the browser opens from this state (returning); if not, it starts with the default ("All", first category). */
  restore?: VodRestore;
  /** A locked (parental-lock) category was selected: after the PIN is asked and the lock opens, the browser is rebuilt with `state`. */
  onUnlockRequest?: (state: VodRestore) => void;
  /** Poster format in the main grid: movies are portrait 2:3 (5 columns), shows are landscape 16:9 by design (4 columns). Defaults to portrait. */
  landscapeGrid?: boolean;
  /** Badge text for newly added content (default "New"; "New episode" for shows). */
  newBadgeLabel?: string;
}

export type ViewId = 'fav' | 'recent' | 'all' | `cat-${number}`;
export type SortMode = 'list' | 'az' | 'za' | 'year' | 'new' | 'duration';

/**
 * The browser's state when a card is opened: when returning via Back from the player/detail screen, the same
 * category, search, sort, and the (opened) card are reselected.
 */
export interface VodRestore {
  view: string;
  query: string;
  sort: SortMode;
  /** The id of the opened movie/show and which section it was opened from (the "Continue Watching" row or the grid). */
  entryId: string;
  from: 'recent' | 'grid';
}

export const SORT_LABELS: Record<SortMode, string> = {
  list: 'Liste sırası',
  az: 'Ada göre (A–Z)',
  za: 'Ada göre (Z–A)',
  year: 'Yıla göre',
  new: 'Yeni eklenenler',
  duration: 'Süreye göre',
};
