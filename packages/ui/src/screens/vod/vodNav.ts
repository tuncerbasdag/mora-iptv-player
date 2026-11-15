import type { FocusManagerOptions } from '../../focusManager.ts';
import type { ViewId } from './vodTypes.ts';

type Direction = 'up' | 'down' | 'left' | 'right';

export interface VodNavContext {
  container: HTMLElement;
  getView(): ViewId;
  /** Number of columns in the main grid (5 for movies, 4 for shows). */
  columns(): number;
  isSortOpen(): boolean;
}

const isSide = (id: string): boolean => id.startsWith('vcat-');

/** Target focus id in a given direction within the content area (null = stay in place). */
function contentTarget(ctx: VodNavContext, from: string, direction: Direction): string | null {
  const { container } = ctx;
  const has = (id: string): boolean => !!container.querySelector(`[data-focus-id="${id}"]`);
  const count = (prefix: string): number => container.querySelectorAll(`[data-focus-id^="${prefix}"]`).length;
  const side = `vcat-${ctx.getView()}`;
  const columns = ctx.columns();
  const firstContent = has('vr-0') ? 'vr-0' : has('vi-0') ? 'vi-0' : null;
  if (from === 'vsearch') return direction === 'right' ? 'vsort' : direction === 'left' ? side : direction === 'down' ? firstContent : null;
  if (from === 'vsort') return direction === 'left' ? 'vsearch' : direction === 'down' ? firstContent : null;
  const recent = /^vr-(\d+)$/.exec(from);
  if (recent) {
    const k = Number(recent[1]);
    if (direction === 'up') return 'vsearch';
    if (direction === 'left') return k > 0 ? `vr-${k - 1}` : side;
    if (direction === 'right') return has(`vr-${k + 1}`) ? `vr-${k + 1}` : null;
    const grid = count('vi-');
    return grid > 0 ? `vi-${Math.min(k, grid - 1)}` : null;
  }
  const card = /^vi-(\d+)$/.exec(from);
  if (card) {
    const i = Number(card[1]);
    const n = count('vi-');
    if (direction === 'left') return i % columns > 0 ? `vi-${i - 1}` : side;
    if (direction === 'right') return i % columns < columns - 1 && has(`vi-${i + 1}`) ? `vi-${i + 1}` : null;
    if (direction === 'up') {
      if (i >= columns) return `vi-${i - columns}`;
      const r = count('vr-');
      return r > 0 ? `vr-${Math.min(i, r - 1)}` : 'vsearch';
    }
    if (has(`vi-${i + columns}`)) return `vi-${i + columns}`;
    // If the last row isn't completely full: the last card of the row below.
    return Math.floor((n - 1) / columns) === Math.floor(i / columns) + 1 ? `vi-${n - 1}` : null;
  }
  return null;
}

/**
 * Arrow-key rules for the movie/show browser (FocusManager `candidateFilter`). The left menu and the content
 * are two separate columns: Up/Down in the menu only moves within the menu, Left from content always returns
 * to the selected category, Right from the menu moves into the content.
 */
export function createVodCandidateFilter(ctx: VodNavContext): NonNullable<FocusManagerOptions['candidateFilter']> {
  return (current, candidate, direction) => {
    const from = current.dataset.focusId ?? '';
    const to = candidate.dataset.focusId ?? '';
    // While the Sort menu is open, focus only moves among its options.
    if (ctx.isSortOpen()) return from.startsWith('vsort-opt-') && to.startsWith('vsort-opt-');
    if (isSide(from)) {
      if (direction !== 'right') return isSide(to);
      // Right from the menu = the first card of the content (the first of "Continue Watching", or else the
      // first of the grid). The spatial calculation was selecting the top-right Sort button instead, when
      // the card ended up higher up (short lists).
      const first = ctx.container.querySelector('[data-focus-id="vr-0"]') ? 'vr-0' : ctx.container.querySelector('[data-focus-id="vi-0"]') ? 'vi-0' : null;
      return first ? to === first : !isSide(to);
    }
    // The content area is navigated in column/row order (the spatial calculation was skipping a scrolled-past
    // "Continue Watching" row and jumping straight to the search box): search/Sort -> continue watching -> grid rows.
    const target = contentTarget(ctx, from, direction);
    return !!target && to === target;
  };
}
