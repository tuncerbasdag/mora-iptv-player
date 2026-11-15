import type { FocusManagerOptions } from '../../focusManager.ts';
import { FAV_CAT_ID } from './liveItems.ts';

type FocusGroup = 'category' | 'channel' | 'right';

/** Category/channel list and the preview group on the right — Down/Up must not jump between
 * these groups (e.g. in a single-channel list, Down must not slip into the adjacent category
 * column); switching between them must only happen via Left/Right. See FocusManagerOptions.candidateFilter. */
export function focusGroupOf(id: string): FocusGroup | null {
  if (id === FAV_CAT_ID || /^cat-\d+$/.test(id)) return 'category';
  if (/^ch-/.test(id) || id === 'search') return 'channel';
  if (id === 'preview' || id === 'preview-info') return 'right';
  return null;
}

/** The instantaneous screen state the focus rules need. */
export interface FocusRuleContext {
  currentCategoryId(): string;
  previewingItemId(): string | null;
  /** Is the given channel's row currently rendered in the channel list? */
  hasChannelRow(itemId: string): boolean;
}

/** Arrow-key navigation rules for the Live TV screen (FocusManager `candidateFilter`). */
export function createCandidateFilter(ctx: FocusRuleContext): NonNullable<FocusManagerOptions['candidateFilter']> {
  return (current, candidate, direction) => {
    const a = focusGroupOf(current.dataset.focusId!);
    // Moving right from the channel list must always land in the preview box first, never jump
    // straight to the favorite/stats bar below it — so the vertical order (video first, then
    // Down to favorite) stays the same no matter which channel row you're on.
    if (direction === 'right' && a === 'channel' && candidate.dataset.focusId === 'preview-info') return false;
    // Moving left from the channel list must always return to the currently OPEN category —
    // not whichever category happens to be closest in vertical alignment to the row. Since
    // category/channel rows share the same height, e.g. pressing Left from the 2nd channel in
    // Favorites could jump to an unrelated but vertically aligned category (e.g. "General"),
    // changing the whole list.
    if (direction === 'left' && a === 'channel') {
      const b = focusGroupOf(candidate.dataset.focusId!);
      if (b === 'category') return candidate.dataset.focusId === ctx.currentCategoryId();
    }
    // Moving left from the preview column (video/favorite/stats) must always land in the channel
    // list first, never the category list — if the channel list is short (a category/Favorites
    // with few channels), there may be no channel row aligned at that height, in which case the
    // nearest candidate would wrongly be a row in the category list (middle/bottom of the list).
    // Moreover, "channel group" alone isn't sufficient: it must return to the row of the channel
    // that is CURRENTLY PREVIEWED, not whichever other channel happens to be closest in vertical
    // alignment (e.g. if the channel list has been scrolled, pressing Left from the "Add to
    // Favorites" row could jump to an unrelated row in the middle of the list instead of the
    // channel that's actually playing). But this rule only applies if the previewed channel is
    // actually visible in the list of the currently OPEN category — if the user switched to
    // another category (e.g. opening Religious while a channel is still playing in Favorites) and
    // that channel is no longer in the on-screen channel list, no candidate would match and the
    // Left key would become completely unresponsive — in that case we fall back to the normal
    // "any channel row" rule.
    if (direction === 'left' && a === 'right') {
      const b = focusGroupOf(candidate.dataset.focusId!);
      if (b !== 'channel') return false;
      // If the previewed channel is NOT VISIBLE in the currently open category's list (e.g.
      // "2x2" is playing in Entertainment but Religious has been opened), there's no "correct"
      // row to return to — in that case, instead of the nearest aligned row (which would be
      // INCONSISTENT depending on whether you came from the video box or the "Add to Favorites"
      // row), we always go to the FIRST row of the list.
      const playingId = ctx.previewingItemId();
      const previewRowVisible = !!playingId && ctx.hasChannelRow(playingId);
      if (previewRowVisible) return candidate.dataset.itemId === playingId;
      return candidate.dataset.focusId === `ch-${ctx.currentCategoryId()}-0`;
    }
    // Plain navigation within the category list (changing rows with up/down) must NOT change the
    // channel list — the channel list is only updated when the user EXPLICITLY SELECTS a category
    // via Enter/click (see selectCategory). That's why the Right key also must not allow moving
    // to the channel list if the currently focused category isn't yet the selected one
    // (currentCategoryId) — otherwise the list visible while navigating would still belong to the
    // OLD category, and pressing Right would drop the user into that old list (unrelated to the
    // newly highlighted category).
    if (direction === 'right' && a === 'category') {
      const b = focusGroupOf(candidate.dataset.focusId!);
      if (b !== 'channel') return false;
      return current.dataset.focusId === ctx.currentCategoryId();
    }
    if (direction === 'left' || direction === 'right') return true;
    const b = focusGroupOf(candidate.dataset.focusId!);
    if (!a || !b) return true;
    return a === b;
  };
}
