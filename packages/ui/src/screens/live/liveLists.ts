import type { Category, MediaItem } from '../../../../core/src/types.ts';
import { emptyBoxIconSvg, lockIconSvg } from '../../icons.ts';
import { FAV_CAT_ID } from './liveItems.ts';

/** Left column: fixed "Favorites" row + each category (with a lock icon if locked). */
export function renderCategoryRows(listEl: HTMLElement, categories: Category<MediaItem>[], onSelect: (catId: string) => void): void {
  listEl.innerHTML = '';
  const favRow = document.createElement('div');
  favRow.className = 'list-row cat-row';
  favRow.dataset.focusId = FAV_CAT_ID;
  const favStar = document.createElement('span');
  favStar.className = 'cat-star';
  favStar.style.cssText = 'display:flex;flex:none;margin-right:14px;color:var(--accent)';
  favStar.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const favLabel = document.createElement('span');
  favLabel.className = 'row-label';
  favLabel.textContent = 'Favoriler';
  favRow.append(favStar, favLabel);
  favRow.addEventListener('click', () => onSelect(FAV_CAT_ID));
  listEl.append(favRow);

  categories.forEach((cat, i) => {
    const row = document.createElement('div');
    row.className = 'list-row cat-row';
    row.dataset.focusId = `cat-${i}`;
    const label = document.createElement('span');
    label.className = 'row-label';
    label.textContent = cat.name;
    row.append(label);
    if (cat.locked) {
      const lock = document.createElement('span');
      lock.className = 'cat-lock';
      lock.setAttribute('aria-label', 'Kilitli');
      lock.innerHTML = lockIconSvg(26);
      row.append(lock);
    }
    row.addEventListener('click', () => onSelect(`cat-${i}`));
    listEl.append(row);
  });
}

/** Writes the search text into the label, highlighting it in orange (case-insensitive, Turkish locale). */
export function appendHighlighted(label: HTMLElement, name: string, q: string): void {
  const idx = q ? name.toLocaleLowerCase('tr-TR').indexOf(q.toLocaleLowerCase('tr-TR')) : -1;
  if (idx < 0) {
    label.textContent = name;
    return;
  }
  const hl = document.createElement('span');
  hl.className = 'hl';
  hl.textContent = name.slice(idx, idx + q.length);
  label.append(name.slice(0, idx), hl, name.slice(idx + q.length));
}

/** State shown when the channel list is empty (search, locked, favorites, or an empty category). */
export function buildEmptyState(opts: { catId: string; query: string; locked: boolean }): HTMLElement {
  const { catId, query, locked } = opts;
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const emptyText = query
    ? 'Aramayla eşleşen kanal yok.'
    : locked
      ? 'Bu kategori kilitli. PIN girmek için Tamam\'a bas.'
      : catId === FAV_CAT_ID
      ? "Henüz favori eklenmedi. Bir kanalı odaklayıp F (TV'de Mavi tuş) ile ekleyin."
      : 'Bu kategoride kanal yok.';
  if (catId === FAV_CAT_ID && !query) {
    empty.innerHTML =
      '<div class="empty-ring"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>' +
      '<div class="empty-title">Favori listen boş</div><div class="empty-sub">Beğendiğin kanalları yıldızla, burada hızlıca bul.</div>';
  } else {
    empty.innerHTML = `${emptyBoxIconSvg(56)}<div>${emptyText}</div>`;
  }
  return empty;
}

/** "Now playing" icon: three animated bars (SMIL; CSS-driven SVG shape animation isn't reliable on older Tizen Chromium). */
const NOW_PLAYING_SVG =
  '<svg aria-label="Şu an oynuyor" role="img" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="9" width="4" height="12" rx="2"><animate attributeName="y" values="9;3;13;9" dur="0.9s" repeatCount="indefinite"/><animate attributeName="height" values="12;18;8;12" dur="0.9s" repeatCount="indefinite"/></rect><rect x="10" y="3" width="4" height="18" rx="2"><animate attributeName="y" values="3;13;5;3" dur="1.1s" repeatCount="indefinite"/><animate attributeName="height" values="18;8;16;18" dur="1.1s" repeatCount="indefinite"/></rect><rect x="17" y="12" width="4" height="9" rx="2"><animate attributeName="y" values="12;6;14;12" dur="0.8s" repeatCount="indefinite"/><animate attributeName="height" values="9;15;7;9" dur="0.8s" repeatCount="indefinite"/></rect></svg>';

export interface ChannelRow {
  row: HTMLElement;
  /** Logo box and the initials inside it (LogoLoader removes the abbreviation once the logo loads). */
  logoBox: HTMLElement;
  initials: HTMLElement;
}

/** A row in the channel list: number, logo/initials, name, favorite star, "playing" icon. */
export function buildChannelRow(opts: { item: MediaItem; index: number; catId: string; query: string; favorite: boolean; onSelect: () => void }): ChannelRow {
  const { item, index, catId, query, favorite, onSelect } = opts;
  const row = document.createElement('div');
  row.className = 'list-row';
  row.dataset.focusId = `ch-${catId}-${index}`;
  row.dataset.itemId = item.id;

  const number = document.createElement('span');
  number.className = 'row-number';
  number.textContent = String(index + 1).padStart(2, '0');

  const label = document.createElement('span');
  label.className = 'row-label';
  appendHighlighted(label, item.name, query);

  const star = document.createElement('span');
  star.className = 'favorite-star';
  star.textContent = favorite ? '★' : '';

  // If there's no logo or it fails to load, the channel name's initials are shown; the box
  // always exists so rows stay aligned.
  const logoBox = document.createElement('span');
  logoBox.className = 'channel-logo';
  const initials = document.createElement('span');
  initials.className = 'channel-initials';
  initials.textContent = item.name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toLocaleUpperCase('tr-TR');
  logoBox.append(initials);

  // "Now playing" indicator: only visible on the .active row (see styles.css .row-eq).
  const eq = document.createElement('span');
  eq.className = 'row-eq';
  eq.innerHTML = NOW_PLAYING_SVG;
  row.append(number, logoBox, label, star, eq);
  row.addEventListener('click', onSelect);
  return { row, logoBox, initials };
}
