import { div } from '../../dom.ts';
import type { FocusManager } from '../../focusManager.ts';
import { SORT_LABELS, type SortMode } from './vodTypes.ts';

export interface VodHeaderDeps {
  searchLabel: string;
  sortModes: SortMode[];
  getSort(): SortMode;
  /** Raw text on every keystroke in the search box. */
  onQuery(value: string): void;
  /** An option was selected in the Sort panel: state is updated first (the pill is repainted with the new label)... */
  setSort(mode: SortMode): void;
  /** ...content is redrawn after the panel closes. */
  onSortChange(): void;
  /** The focus manager is set up last; it doesn't exist yet during the initial render. */
  getFocus(): FocusManager | undefined;
}

export interface VodHeader {
  /** Top bar: search box + Sort pill. */
  el: HTMLElement;
  /** Sort options panel (appended separately, below the top bar). */
  sortPanel: HTMLElement;
  searchInput: HTMLInputElement;
  isSortOpen(): boolean;
  closeSort(): void;
  /** Repaints the Sort pill's label according to the selected mode. */
  paintSort(): void;
}

const CHEVRON_DOWN = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:12px"><path d="M6 9l6 6 6-6"/></svg>';
const CHEVRON_UP = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:12px"><path d="M6 15l6-6 6 6"/></svg>';

/** Top bar for the movie/show browser: search box and sort pill + options panel. */
export function createVodHeader(deps: VodHeaderDeps): VodHeader {
  const header = div('display:flex;align-items:center;flex:none');
  const searchBox = div('display:flex;align-items:center;box-sizing:border-box;height:80px;flex:1;max-width:640px;padding:0 22px;border-radius:20px;background:var(--bg)', 'vod-search');
  searchBox.dataset.focusId = 'vsearch';
  searchBox.insertAdjacentHTML('beforeend', '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-right:16px;color:var(--text-dim)"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>');
  // While focused (but not typing), the design's fake caret is shown; the real caret takes over once typing starts.
  const fakeCaret = document.createElement('span');
  fakeCaret.className = 'vod-fake-caret';
  fakeCaret.setAttribute('aria-hidden', 'true');
  searchBox.append(fakeCaret);
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.lang = 'tr';
  searchInput.placeholder = deps.searchLabel;
  searchInput.setAttribute('aria-label', deps.searchLabel);
  searchBox.append(searchInput);
  searchBox.addEventListener('click', () => searchInput.focus());
  searchInput.addEventListener('focus', () => searchBox.classList.add('editing'));
  searchInput.addEventListener('blur', () => searchBox.classList.remove('editing'));
  searchInput.addEventListener('input', () => deps.onQuery(searchInput.value));

  const sortPill = div('margin-left:auto', 'vod-sort');
  sortPill.dataset.focusId = 'vsort';
  let sortOpen = false;
  function paintSort(): void {
    sortPill.innerHTML = '';
    sortPill.classList.toggle('open', sortOpen);
    const l = document.createElement('span');
    l.className = 'vod-sort-label';
    l.textContent = 'Sırala';
    sortPill.append(l, document.createTextNode(SORT_LABELS[deps.getSort()]));
    sortPill.insertAdjacentHTML('beforeend', sortOpen ? CHEVRON_UP : CHEVRON_DOWN);
  }
  paintSort();

  const sortPanel = div('display:none', 'vod-sort-panel');
  function renderSortPanel(): void {
    sortPanel.innerHTML = '';
    const title = div('', 'vod-sort-title');
    title.textContent = 'Sırala';
    sortPanel.append(title);
    const current = deps.getSort();
    deps.sortModes.forEach((m, i) => {
      const row = div('', 'vod-sort-opt' + (m === current ? ' selected' : ''));
      row.dataset.focusId = `vsort-opt-${i}`;
      const label = document.createElement('span');
      label.style.flex = '1';
      label.textContent = SORT_LABELS[m];
      row.append(label);
      if (m === current) row.insertAdjacentHTML('beforeend', '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" style="stroke:var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>');
      row.addEventListener('click', () => {
        deps.setSort(m);
        closeSort();
        deps.onSortChange();
      });
      sortPanel.append(row);
    });
  }
  function openSort(): void {
    sortOpen = true;
    renderSortPanel();
    sortPanel.style.display = 'flex';
    paintSort();
    const fm = deps.getFocus();
    fm?.refresh();
    fm?.focus(`vsort-opt-${Math.max(0, deps.sortModes.indexOf(deps.getSort()))}`);
  }
  function closeSort(): void {
    const wasOpen = sortOpen;
    sortOpen = false;
    sortPanel.style.display = 'none';
    sortPanel.innerHTML = '';
    paintSort();
    if (wasOpen) deps.getFocus()?.focus('vsort');
  }
  sortPill.addEventListener('click', () => (sortOpen ? closeSort() : openSort()));
  header.append(searchBox, sortPill);

  return { el: header, sortPanel, searchInput, isSortOpen: () => sortOpen, closeSort, paintSort };
}
