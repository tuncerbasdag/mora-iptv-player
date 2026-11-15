import type { WatchProgress } from '../../../core/src/storage.ts';
import { div } from '../dom.ts';
import { FocusManager } from '../focusManager.ts';
import { isFavoriteKey } from '../keys.ts';
import { buildVodCard } from './vod/vodCard.ts';
import { createVodData, type VodData } from './vod/vodData.ts';
import { createVodHeader, type VodHeader } from './vod/vodHeader.ts';
import { createVodCandidateFilter } from './vod/vodNav.ts';
import { LazyPosterLoader } from './vod/vodPosters.ts';
import { createSideMenu, type SideMenu, type SideRow } from './vod/vodSideMenu.ts';
import type { SortMode, ViewId, VodBrowserOptions } from './vod/vodTypes.ts';

export { progressRatio } from './vod/vodData.ts';
export type { SortMode, VodBrowserCallbacks, VodBrowserOptions, VodEntry, VodRestore } from './vod/vodTypes.ts';

const PAGE_SIZE = 60;
/** Number of columns in the poster grid: 5 for movie portrait posters, 4 for show landscape posters (see renderContent). */
const gridColumns = (landscape: boolean | undefined): number => (landscape ? 4 : 5);
const RECENT_ROW = 4;

/**
 * Shared browser for Movies and Shows: on the left, Favorites / Continue Watching / All / categories (with
 * counts); on the right, search + sort, the "Continue Watching" row, and a scrollable poster grid. Focusing
 * a category (without Enter) refreshes the content. Blue button / F: toggles the focused card's favorite state.
 *
 * This class holds the screen's state (view, search, sort, focus) and wires the pieces together. The pieces
 * live under `./vod/`: data/search/sort (vodData), card (vodCard), poster loading (vodPosters), left menu
 * (vodSideMenu), top bar (vodHeader), and arrow-key rules (vodNav).
 */
class VodBrowser<T> {
  private readonly container: HTMLElement;
  private readonly opts: VodBrowserOptions<T>;
  private readonly data: VodData<T>;
  private readonly sideMenu: SideMenu;
  private readonly header: VodHeader;
  private readonly scroller: HTMLElement;
  private readonly posters: LazyPosterLoader;
  /** The focus manager is set up last; it doesn't exist yet during the initial render. */
  private fm: FocusManager | undefined;
  private view: ViewId = 'all';
  private query = '';
  private sort: SortMode = 'list';
  private focusedId = '';
  private rendered = 0;
  private shownItems: T[] = [];
  private readonly keyHandler = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    if (isFavoriteKey(e)) this.toggleFavoriteOfFocused();
  };

  constructor(container: HTMLElement, opts: VodBrowserOptions<T>) {
    this.container = container;
    this.opts = opts;
    container.innerHTML = '';
    const screen = div('padding:48px 64px', 'screen');
    const frame = div('', 'settings-frame');
    const main = div('position:relative;flex:1;min-width:0;box-sizing:border-box;padding-left:32px;display:flex;flex-direction:column;overflow:hidden');
    this.sideMenu = createSideMenu(opts.title, opts.onBack);
    frame.append(this.sideMenu.el, main);
    screen.append(frame);
    container.append(screen);

    this.data = createVodData(opts);
    this.scroller = div('flex:1;min-height:0;overflow-y:auto;margin-top:20px', 'hide-scrollbar');
    this.posters = new LazyPosterLoader(this.scroller);

    // ---- top bar: search + sort
    this.header = createVodHeader({
      searchLabel: opts.searchLabel,
      sortModes: this.data.sortModes,
      getSort: () => this.sort,
      onQuery: (value) => {
        this.query = value;
        this.renderContent();
      },
      setSort: (mode) => {
        this.sort = mode;
      },
      onSortChange: () => this.renderContent(),
      getFocus: () => this.fm,
    });
    main.append(this.header.el, this.scroller, this.header.sortPanel);

    document.addEventListener('keydown', this.keyHandler);
    this.renderSide();
    this.renderContent();

    const manager = new FocusManager(screen, {
      onBack: () => (this.header.isSortOpen() ? this.header.closeSort() : opts.onBack()),
      candidateFilter: createVodCandidateFilter({
        container,
        getView: () => this.view,
        columns: () => gridColumns(opts.landscapeGrid),
        isSortOpen: this.header.isSortOpen,
      }),
      onFocus: (id) => {
        this.focusedId = id;
        if (id.startsWith('vcat-')) this.setView(id.slice(5) as ViewId);
        const m = /^vi-(\d+)$/.exec(id);
        if (m && Number(m[1]) >= this.rendered - 10) this.renderMore();
      },
    });
    this.fm = manager;
    this.restoreOrFocusDefault(manager);
    manager.onDestroy(() => {
      document.removeEventListener('keydown', this.keyHandler);
      this.posters.destroy();
    });
    this.focusManager = manager;
  }

  readonly focusManager: FocusManager;

  private card(value: T, focusId: string, index: number, mode: 'poster' | 'recent', progress?: WatchProgress): HTMLElement {
    const { opts } = this;
    const e = opts.entry(value);
    return buildVodCard({
      entry: e,
      focusId,
      index,
      mode,
      progress,
      landscape: !!opts.landscapeGrid,
      newBadgeLabel: opts.newBadgeLabel,
      favorite: opts.storage.isFavorite(e.id),
      lazyImage: this.posters.lazyImage,
      onClick: () => {
        opts.onOpen?.({ view: this.view, query: this.query, sort: this.sort, entryId: e.id, from: mode === 'recent' ? 'recent' : 'grid' });
        opts.onSelect(value);
      },
    });
  }

  // ---- left menu
  private sideRows(): SideRow[] {
    const { opts, data } = this;
    return [
      { id: 'fav', label: 'Favoriler', count: data.favorites().length, icon: 'star' },
      { id: 'recent', label: 'Son İzlenenler', count: data.recentEntries().length, icon: 'clock' },
      { id: 'all', label: opts.allLabel, count: data.all.length },
      ...opts.categories.map((c, i) => ({ id: `cat-${i}` as ViewId, label: c.name, count: c.items.length, locked: c.locked })),
    ];
  }

  private renderSide(): void {
    this.sideMenu.render(this.sideRows(), this.view, (r) => {
      // Enter: load the category and move focus to the first card on the right (like category selection in Live TV).
      if (r.locked) {
        this.opts.onUnlockRequest?.({ view: r.id, query: '', sort: this.sort, entryId: '', from: 'grid' }); // ask for the PIN; rebuilt once unlocked
        return;
      }
      this.setView(r.id);
      this.focusFirstContent();
    });
  }

  // ---- content
  private sectionTitle(text: string): HTMLElement {
    const t = div('font-size:28px;font-weight:800;flex:none;margin-bottom:12px');
    t.textContent = text;
    return t;
  }

  private renderContent(): void {
    const { opts, scroller, data } = this;
    this.posters.reset();
    scroller.innerHTML = '';
    scroller.scrollTop = 0;
    this.shownItems = data.visibleItems(this.view, this.query, this.sort);
    this.rendered = 0;
    const columns = gridColumns(opts.landscapeGrid);

    if (this.view === 'all' && !this.query.trim()) {
      const recents = data.recentEntries().slice(0, opts.landscapeGrid ? RECENT_ROW : RECENT_ROW + 1);
      if (recents.length) {
        scroller.append(this.sectionTitle('Son izlenenler'));
        const row = div(`display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-column-gap:28px;margin-bottom:24px`);
        recents.forEach((r, i) => row.append(this.card(r.value, `vr-${i}`, i, 'recent', r.progress)));
        scroller.append(row);
      }
    }
    if (this.shownItems.length === 0) {
      const empty = div('', 'empty-state');
      empty.textContent = this.emptyText();
      scroller.append(empty);
      return;
    }
    // The "All Movies" menu label becomes "All movies" in the section heading.
    const gridTitle = this.view === 'all' ? opts.allLabel.charAt(0) + opts.allLabel.slice(1).toLocaleLowerCase('tr-TR') : (this.sideRows().find((r) => r.id === this.view)?.label ?? '');
    scroller.append(this.sectionTitle(gridTitle));
    const grid = div(`display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-column-gap:28px;grid-row-gap:28px;align-content:start;padding-bottom:8px`);
    grid.id = 'vod-grid';
    scroller.append(grid);
    this.renderMore();
  }

  private emptyText(): string {
    const { view, query } = this;
    if (query.trim()) return 'Aramayla eşleşen sonuç yok.';
    if (view === 'fav') return 'Henüz favori eklenmedi. Bir kartı odaklayıp Mavi tuşla (bilgisayarda F) ekleyin.';
    if (view === 'recent') return 'Henüz izlenen yok.';
    return this.opts.categories[Number(view.slice(4))]?.locked ? "Bu kategori kilitli. PIN girmek için Tamam'a bas." : 'Bu kategoride içerik yok.';
  }

  /** Cards are appended in PAGE_SIZE-sized chunks to avoid bloating the DOM on large lists. */
  private renderMore(): void {
    const grid = this.scroller.querySelector('#vod-grid');
    if (!grid || this.rendered >= this.shownItems.length) return;
    const end = Math.min(this.shownItems.length, this.rendered + PAGE_SIZE);
    for (let i = this.rendered; i < end; i++) grid.append(this.card(this.shownItems[i], `vi-${i}`, i, 'poster'));
    this.rendered = end;
    this.fm?.refresh();
  }

  /** First card in the right pane: the first of "Continue Watching" if present, otherwise the first of the grid. */
  private focusFirstContent(): void {
    const first = this.container.querySelector('[data-focus-id="vr-0"]') ? 'vr-0' : this.container.querySelector('[data-focus-id="vi-0"]') ? 'vi-0' : null;
    if (first) this.fm?.focus(first);
  }

  private setView(v: ViewId): void {
    if (v === this.view && this.scroller.childElementCount) return;
    this.view = v;
    this.sideMenu.markActive(v);
    this.renderContent();
  }

  // ---- favorite shortcut
  private toggleFavoriteOfFocused(): void {
    const m = /^v([ir])-(\d+)$/.exec(this.focusedId);
    if (!m) return;
    const index = Number(m[2]);
    const value = m[1] === 'i' ? this.shownItems[index] : this.data.recentEntries()[index]?.value;
    if (!value) return;
    const { storage, entry } = this.opts;
    const id = entry(value).id;
    storage.setFavorite(id, !storage.isFavorite(id));
    this.renderSide();
    this.renderContent();
    // In the Favorites view, the card can disappear: move focus to the nearest card (or the menu if none).
    const keep = m[1] === 'i' ? `vi-${Math.min(index, Math.max(0, this.shownItems.length - 1))}` : `vr-${index}`;
    this.fm?.focus(this.container.querySelector(`[data-focus-id="${keep}"]`) ? keep : `vcat-${this.view}`);
  }

  /** On return: same search/sort/category, focus on the opened card. Otherwise, the "All" menu row. */
  private restoreOrFocusDefault(manager: FocusManager): void {
    const { opts, data } = this;
    const r = opts.restore;
    if (!r) {
      manager.focus('vcat-all');
      return;
    }
    // (The constructor may have focused the first item and changed the view.)
    this.sort = data.sortModes.includes(r.sort) ? r.sort : 'list';
    this.query = r.query;
    this.header.searchInput.value = r.query;
    this.header.paintSort();
    const valid = r.view === 'fav' || r.view === 'recent' || r.view === 'all' || (/^cat-\d+$/.test(r.view) && Number(r.view.slice(4)) < opts.categories.length);
    this.view = '' as ViewId; // prevent setView from short-circuiting
    this.setView((valid ? r.view : 'all') as ViewId);
    let id: string | null = null;
    if (r.from === 'recent') {
      const k = data.recentEntries().findIndex((x) => opts.entry(x.value).id === r.entryId);
      if (k >= 0 && !this.query.trim() && this.view === 'all') id = `vr-${k}`;
    }
    if (!id) {
      const i = this.shownItems.findIndex((v) => opts.entry(v).id === r.entryId);
      if (i >= 0) {
        while (this.rendered <= i && this.rendered < this.shownItems.length) this.renderMore(); // pagination: render if the card hasn't been drawn yet
        id = `vi-${i}`;
      }
    }
    manager.focus(id && this.container.querySelector(`[data-focus-id="${id}"]`) ? id : `vcat-${this.view}`);
  }
}

/** Sets up the Movie/Show browser; calling the returned FocusManager.destroy() closes the screen. */
export function renderVodBrowser<T>(container: HTMLElement, opts: VodBrowserOptions<T>): FocusManager {
  return new VodBrowser(container, opts).focusManager;
}
