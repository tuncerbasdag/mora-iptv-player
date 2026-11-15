import type { FocusManagerOptions } from '../../focusManager.ts';

export interface ShowDetailNavContext {
  /** Whether real season/episode numbering exists (if not, there's no tab row: Down from Play goes straight to the first episode). */
  numbered: boolean;
  /** Index of the currently open season. */
  currentSeason(): number;
}

/**
 * Navigation order is explicitly defined: Play/Favorite -> season tabs -> first episode -> episodes below.
 * (Spatial calculation was jumping straight from the season tab to the end of the list on Down.)
 */
export function createShowDetailFilter(ctx: ShowDetailNavContext): NonNullable<FocusManagerOptions['candidateFilter']> {
  return (current, candidate, direction) => {
    const from = current.dataset.focusId ?? '';
    const to = candidate.dataset.focusId ?? '';
    const season = ctx.currentSeason();
    const belowActions = ctx.numbered ? `season-${season}` : `ep-${season}-0`;
    if (from === 'play' || from === 'fav') {
      if (direction === 'down') return to === belowActions;
      return (from === 'play' && direction === 'right' && to === 'fav') || (from === 'fav' && direction === 'left' && to === 'play');
    }
    if (from.startsWith('season-')) {
      if (direction === 'down') return to === `ep-${season}-0`;
      if (direction === 'up') return to === 'play';
      return to.startsWith('season-');
    }
    const m = /^ep-(\d+)-(\d+)$/.exec(from);
    if (m) {
      const i = Number(m[2]);
      if (direction === 'down') return to === `ep-${m[1]}-${i + 1}`;
      if (direction === 'up') return i === 0 ? to === (ctx.numbered ? `season-${m[1]}` : 'play') : to === `ep-${m[1]}-${i - 1}`;
      return false;
    }
    return true;
  };
}
