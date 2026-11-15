import type { FocusManagerOptions } from '../../focusManager.ts';

/**
 * Home screen navigation rules. The Live TV card spans the height of the two right-hand cards, so spatial
 * calculation would pick Movies on Right and Series on Up. We pin the navigation order explicitly: Live TV -> Right
 * = Series, Up = Settings; Settings <-> Active connection badge <-> Lock (Left/Right); Down from any of the three
 * = Series.
 */
export const welcomeCandidateFilter: NonNullable<FocusManagerOptions['candidateFilter']> = (current, candidate, direction) => {
  const from = current.dataset.focusId;
  const to = candidate.dataset.focusId;
  if (from === 'lock-btn') {
    if (direction === 'right') return to === 'conn-pill';
    if (direction === 'down') return to === 'series-card';
    return false;
  }
  if (from === 'conn-pill') {
    if (direction === 'right') return to === 'settings-btn';
    if (direction === 'left') return to === 'lock-btn';
    if (direction === 'down') return to === 'series-card';
    return false;
  }
  if (from === 'settings-btn') {
    if (direction === 'left') return to === 'conn-pill';
    if (direction === 'down') return to === 'series-card';
    return false;
  }
  if (from === 'live-card') {
    if (direction === 'right') return to === 'series-card';
    if (direction === 'up') return to === 'settings-btn';
  }
  if (from === 'series-card' && direction === 'up') return to === 'settings-btn';
  return true;
};
