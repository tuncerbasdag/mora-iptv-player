import { div } from '../../dom.ts';
import { lockIconSvg } from '../../icons.ts';
import type { ViewId } from './vodTypes.ts';

export interface SideRow {
  id: ViewId;
  label: string;
  count: number;
  icon?: string;
  locked?: boolean;
}

const ICONS: Record<string, string> = {
  star: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" style="margin-right:14px;flex:none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  clock: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:14px;flex:none"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

export interface SideMenu {
  el: HTMLElement;
  /** Redraws the rows; `activeView` is highlighted. */
  render(rows: SideRow[], activeView: ViewId, onSelect: (row: SideRow) => void): void;
  /** Changes only the highlighted row, without redrawing. */
  markActive(view: ViewId): void;
}

/** Left menu: title (click to go back), separator, and Favorites / Continue Watching / All / category rows (with counts). */
export function createSideMenu(title: string, onBack: () => void): SideMenu {
  const side = div('width:328px;flex:none;box-sizing:border-box;padding-right:28px;border-right:1.5px solid var(--border);display:flex;flex-direction:column');
  const sideTitle = div('display:flex;align-items:center;height:80px;font-size:38px;font-weight:800;letter-spacing:-0.01em;flex:none');
  sideTitle.textContent = title;
  sideTitle.addEventListener('click', onBack);
  const sideRule = div('height:1.5px;flex:none;background:var(--border);margin:4px 0 8px');
  const sideList = div('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column', 'hide-scrollbar');
  side.append(sideTitle, sideRule, sideList);

  function render(rows: SideRow[], activeView: ViewId, onSelect: (row: SideRow) => void): void {
    sideList.innerHTML = '';
    for (const r of rows) {
      const row = div('margin-bottom:4px', 'list-row cat-row' + (r.id === activeView ? ' active' : ''));
      row.dataset.focusId = `vcat-${r.id}`;
      if (r.icon) row.insertAdjacentHTML('beforeend', ICONS[r.icon]);
      const label = div('white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0');
      label.textContent = r.label;
      const count = div('', 'vod-count');
      if (r.locked) {
        count.innerHTML = lockIconSvg(26);
        count.setAttribute('aria-label', 'Kilitli');
      } else {
        count.textContent = String(r.count);
      }
      row.append(label, count);
      row.addEventListener('click', () => onSelect(r));
      sideList.append(row);
    }
  }
  function markActive(view: ViewId): void {
    for (const row of Array.from(sideList.children)) {
      row.classList.toggle('active', (row as HTMLElement).dataset.focusId === `vcat-${view}`);
    }
  }

  return { el: side, render, markActive };
}
