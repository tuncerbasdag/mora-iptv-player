import type { EpgService } from '../../../core/src/epgService.ts';
import type { ConnectivityProbe } from '../../../core/src/connectivity.ts';
import type { FavoriteStore } from '../../../core/src/storage.ts';
import type { Category, MediaItem } from '../../../core/src/types.ts';
import { FocusManager } from '../focusManager.ts';
import { isFavoriteKey } from '../keys.ts';
import type { PlayerAdapter } from '../playerAdapter.ts';
import { createEpgPanel, type EpgPanel } from './live/liveEpgPanel.ts';
import { createCandidateFilter } from './live/liveFocusRules.ts';
import { categoryById, FAV_CAT_ID, searchLiveItems } from './live/liveItems.ts';
import { isDesktopApp } from '../mouseSupport.ts';
import { buildLiveLayout, type LiveLayout } from './live/liveLayout.ts';
import { buildChannelRow, buildEmptyState, renderCategoryRows } from './live/liveLists.ts';
import { ChannelLogoLoader, LOGO_INITIAL_COUNT } from './live/liveLogos.ts';
import { FocusMarquee } from './live/liveMarquee.ts';
import { LivePreviewController } from './live/livePreview.ts';
import { createPreviewCard, type PreviewCardView } from './live/livePreviewCard.ts';
import { createSearchBox } from './live/liveSearchBox.ts';

export { liveCategoryItems } from './live/liveItems.ts';

export interface LiveScreenCallbacks {
  onBack: () => void;
  /** To go fullscreen when Enter is pressed again on the channel currently playing in the preview. `adapter`
   * is handed off to move the already-loaded stream — the caller must NOT call loadLive() again.
   * `categoryId` is the category the user is currently VIEWING (e.g. Favorites) — it may not be the
   * channel's "real" category, and is needed to focus the correct category on return. */
  onFullscreen: (item: MediaItem, adapter: PlayerAdapter, categoryId: string) => void;
  /** A locked (parental lock) category was selected: a PIN is requested, and once unlocked the screen is rebuilt with `categoryId`. */
  onUnlockRequest?: (categoryId: string) => void;
  /** If provided, preview dropout tracking probes connectivity (see LiveWatchdog.checkConnectivity). */
  connectivity?: ConnectivityProbe;
}

export interface LiveScreenResume {
  item: MediaItem;
  /** The adapter already playing — moved into the preview box via moveTo(), not reloaded. */
  adapter: PlayerAdapter;
  /** The category the user was viewing (e.g. Favorites) when going fullscreen — not the channel's own
   * "real" category; this is focused again on return. */
  categoryId: string;
}

/**
 * Live TV screen: 3 columns inside a single large rounded panel — categories, channels (search + list), and
 * on the right the selected channel's preview at the top (starts on Enter, goes fullscreen on another Enter),
 * with the focused channel's EPG timeline below it. The "F" key adds/removes the focused channel from favorites.
 *
 * This class holds the screen's state (open category, search text, focused channel) and wires the pieces
 * together. The pieces live under `./live/`: layout (liveLayout), list rows (liveLists), search
 * (liveSearchBox, liveItems), logos (liveLogos), marquee (liveMarquee), preview card + playback
 * (livePreviewCard, livePreview), the EPG panel (liveEpgPanel), and arrow-key navigation rules (liveFocusRules).
 */
class LiveScreen {
  private readonly categories: Category<MediaItem>[];
  private readonly storage: FavoriteStore;
  private readonly cb: LiveScreenCallbacks;
  private readonly layout: LiveLayout;
  private readonly previewView: PreviewCardView;
  private readonly epgPanel: EpgPanel;
  private readonly logos: ChannelLogoLoader;
  private readonly marquee: FocusMarquee;
  private readonly preview: LivePreviewController;
  readonly focusManager: FocusManager;

  /**
   * If `resume` is present, return to the category the user was viewing when they WENT fullscreen
   * (resume.categoryId, see goFullscreen) — we don't recompute it from the channel's "real" category, since
   * the user may have opened the channel from Favorites, and Favorites isn't the channel's own category. If
   * there's no `resume` (freshly entered from the home screen), Favorites is always shown by default — even if
   * empty; per a user request, the first thing seen on entering Live TV should always be Favorites.
   */
  private currentCategoryId: string;
  private focusedItem: MediaItem | null = null;
  private searchQuery = '';
  private readonly favoriteKeyHandler = (e: KeyboardEvent): void => {
    if (!isFavoriteKey(e) || !this.focusedItem) return;
    // The "f" character shouldn't be treated as the favorite key while typing in the search box.
    if ((document.activeElement as HTMLElement | null)?.tagName === 'INPUT') return;
    e.preventDefault();
    this.toggleFavorite(this.focusedItem);
  };

  constructor(
    container: HTMLElement,
    categories: Category<MediaItem>[],
    storage: FavoriteStore,
    epgService: EpgService | null,
    createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter,
    cb: LiveScreenCallbacks,
    resume?: LiveScreenResume,
    startCategoryId?: string,
  ) {
    container.innerHTML = '';
    this.categories = categories;
    this.storage = storage;
    this.cb = cb;
    this.currentCategoryId = resume?.categoryId ?? startCategoryId ?? FAV_CAT_ID;

    // Search: as the user types, the channel list is filtered across all categories (see liveItems.searchLiveItems).
    const searchBox = createSearchBox((value) => {
      this.searchQuery = value;
      this.renderChannels(this.currentCategoryId);
    });
    this.layout = buildLiveLayout(container, searchBox.el, isDesktopApp() ? cb.onBack : undefined);
    this.previewView = createPreviewCard();
    this.epgPanel = createEpgPanel(epgService);
    this.layout.rightCol.append(this.previewView.el, this.epgPanel.el);

    this.logos = new ChannelLogoLoader(this.layout.channelList);
    this.marquee = new FocusMarquee(this.layout.screen);
    this.preview = new LivePreviewController({
      view: this.previewView,
      createPlayerAdapter,
      onFullscreen: (item, adapter) => cb.onFullscreen(item, adapter, this.currentCategoryId),
      connectivity: cb.connectivity,
      onStateChange: () => {
        this.markActiveChannel();
        this.renderPreviewCard();
      },
    });
    this.previewView.onVideoClick(() => {
      if (this.preview.item) this.preview.goFullscreen(this.preview.item);
    });
    this.previewView.onFavClick(() => {
      if (this.preview.item) this.toggleFavorite(this.preview.item);
    });

    this.renderCategories();
    this.renderChannels(this.currentCategoryId);
    this.epgPanel.render(null);
    this.renderPreviewCard();
    if (resume) {
      this.preview.resume(resume, this.itemsForCategory(resume.categoryId).findIndex((it) => it.id === resume.item.id) + 1);
    }
    document.addEventListener('keydown', this.favoriteKeyHandler);

    this.focusManager = this.createFocusManager();
    this.restoreFocus(resume, startCategoryId);
    this.focusManager.onDestroy(() => {
      this.logos.cancel();
      document.removeEventListener('keydown', this.favoriteKeyHandler);
      this.preview.destroy();
    });
  }

  private itemsForCategory(catId: string): MediaItem[] {
    return searchLiveItems(this.categories, this.storage, catId, this.searchQuery);
  }

  private renderCategories(): void {
    renderCategoryRows(this.layout.categoryList, this.categories, (catId) => this.selectCategory(catId));
  }

  /** SELECTING a category (Enter/click) — distinct from mere navigation/highlighting: the channel list is
   * rebuilt here, and per a user request focus always goes to the FIRST row of that category (not based
   * on vertical alignment — landing on a random channel while navigating between categories was confusing). */
  private selectCategory(catId: string): void {
    if (categoryById(this.categories, catId)?.locked) {
      this.cb.onUnlockRequest?.(catId); // request the PIN; the screen is rebuilt once unlocked
      return;
    }
    this.renderChannels(catId);
    if (this.itemsForCategory(catId).length > 0) this.focusManager.focus(`ch-${catId}-0`);
  }

  /** A persistent highlight so which category is open doesn't get lost even if actual keyboard focus
   * moves to another group (e.g. the preview) — see styles.css .list-row.active. */
  private markActiveCategory(): void {
    for (const row of this.layout.categoryList.querySelectorAll<HTMLElement>('.list-row')) {
      row.classList.toggle('active', row.dataset.focusId === this.currentCategoryId);
    }
  }

  /** Same logic for the channel list — keeps the channel currently previewed/playing visible even
   * when focus is elsewhere (or after switching categories and coming back). */
  private markActiveChannel(): void {
    const playingId = this.preview.item?.id;
    for (const row of this.layout.channelList.querySelectorAll<HTMLElement>('.list-row')) {
      row.classList.toggle('active', !!playingId && row.dataset.itemId === playingId);
    }
  }

  private renderChannels(catId: string): void {
    const { channelList, searchInfo } = this.layout;
    this.currentCategoryId = catId;
    this.markActiveCategory();
    channelList.innerHTML = '';
    const items = this.itemsForCategory(catId);
    const query = this.searchQuery.trim();
    searchInfo.style.display = query ? 'block' : 'none';
    searchInfo.textContent = `${items.length} sonuç`;
    if (items.length === 0) {
      channelList.append(buildEmptyState({ catId, query, locked: !!categoryById(this.categories, catId)?.locked }));
      return;
    }
    this.logos.reset();
    items.forEach((item, i) => {
      const { row, logoBox, initials } = buildChannelRow({
        item,
        index: i,
        catId,
        query,
        favorite: this.storage.isFavorite(item.id),
        onSelect: () => this.handleSelect(item, i + 1),
      });
      this.logos.add(logoBox, initials, item.logo, i);
      channelList.append(row);
    });
    this.markActiveChannel();
    this.logos.loadUpTo(LOGO_INITIAL_COUNT);
  }

  private renderPreviewCard(): void {
    const playing = this.preview.item;
    this.previewView.render({
      shownItem: playing ?? this.preview.failedItem,
      playing: !!playing,
      failed: !!this.preview.failedItem,
      number: this.preview.number,
      favorite: playing ? this.storage.isFavorite(playing.id) : false,
    });
  }

  private toggleFavorite(item: MediaItem): void {
    this.storage.setFavorite(item.id, !this.storage.isFavorite(item.id));
    this.renderCategories();
    this.renderChannels(this.currentCategoryId);
    this.renderPreviewCard();
  }

  private handleSelect(item: MediaItem, number: number): void {
    if (this.preview.item && this.preview.item.id === item.id) {
      this.preview.goFullscreen(item);
      return;
    }
    void this.preview.start(item, number);
  }

  private createFocusManager(): FocusManager {
    return new FocusManager(this.layout.screen, {
      onBack: this.cb.onBack,
      candidateFilter: createCandidateFilter({
        currentCategoryId: () => this.currentCategoryId,
        previewingItemId: () => this.preview.item?.id ?? null,
        hasChannelRow: (itemId) => !!this.layout.channelList.querySelector(`[data-item-id="${itemId}"]`),
      }),
      onFocus: (id) => this.onFocus(id),
    });
  }

  private onFocus(id: string): void {
    this.marquee.update(id);
    if (id.startsWith('ch-')) this.logos.loadMoreIfNeeded();
    if (id === FAV_CAT_ID || /^cat-\d+$/.test(id)) {
      // The channel list is NO LONGER rebuilt here — this is just navigation (highlighting), not selection.
      // See selectCategory() (called via Enter/click).
      this.focusedItem = null;
      this.epgPanel.render(null);
      return;
    }
    const m = /^ch-(.+)-(\d+)$/.exec(id);
    if (m) {
      this.focusedItem = this.itemsForCategory(m[1])[Number(m[2])] ?? null;
      this.epgPanel.render(this.focusedItem);
    }
  }

  /**
   * The FocusManager constructor focuses the first DOM element by default (always the "Favorites" row) —
   * which would, via onFocus, rebuild the channel list based on Favorites. If `resume` is present, the
   * category the user came from (resume.categoryId — including Favorites) is explicitly focused; just
   * setting currentCategoryId isn't enough, since FocusManager still jumps to the first element.
   */
  private restoreFocus(resume: LiveScreenResume | undefined, startCategoryId: string | undefined): void {
    if (!resume && startCategoryId) {
      this.renderChannels(startCategoryId);
      this.focusManager.focus(startCategoryId);
    }
    if (resume) {
      // The channel list is no longer rebuilt AUTOMATICALLY when a category is focused — so it must be
      // called EXPLICITLY here with the right category, otherwise the target channel row never exists in
      // the DOM and the second focus() call below fails.
      this.renderChannels(resume.categoryId);
      this.focusManager.focus(resume.categoryId);
      const idx = this.itemsForCategory(resume.categoryId).findIndex((it) => it.id === resume.item.id);
      if (idx >= 0) this.focusManager.focus(`ch-${resume.categoryId}-${idx}`);
    }
  }
}

/** Builds the Live TV screen; calling FocusManager.destroy() on the return value closes the screen (the preview player is stopped if it wasn't handed off). */
export function renderLiveScreen(
  container: HTMLElement,
  categories: Category<MediaItem>[],
  storage: FavoriteStore,
  epgService: EpgService | null,
  createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter,
  cb: LiveScreenCallbacks,
  /** To resume the channel left behind on return from fullscreen (and the adapter already playing) in the
   * preview without reloading it, and restore category/channel focus to its previous state. */
  resume?: LiveScreenResume,
  /** The category to show open when rebuilt after unlocking (no channel is playing; used instead of Favorites when `resume` is absent). */
  startCategoryId?: string,
): FocusManager {
  return new LiveScreen(container, categories, storage, epgService, createPlayerAdapter, cb, resume, startCategoryId).focusManager;
}
