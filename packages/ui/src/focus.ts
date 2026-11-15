export interface FocusRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Finds the best next focus target in the given direction.
 * Score = distance along the primary axis + perpendicular deviation penalty (weighted 2x);
 * this way a "perfectly aligned but far" element is reasonably compared against a
 * "misaligned but close" one.
 *
 * Candidates are first run through a "direction cone" test (the deviation must not exceed
 * the distance on the primary axis — |dy|<=|dx| for left/right, |dx|<=|dy| for up/down). The
 * best-scoring candidate inside the cone is always preferred over any candidate outside the
 * cone. Without this, e.g. when navigating a vertical list (right panel), sub-pixel horizontal
 * rendering differences could cause pressing "left" to jump to a neighboring row instead of
 * ever reaching the actual target panel on the left. If there are no candidates inside the
 * cone at all (e.g. when the screen only has a single group of elements in that direction),
 * it falls back to the best-scoring candidate outside the cone — so the user never feels like
 * they can't go anywhere.
 *
 * This general algorithm doesn't know which candidates count as "candidates" — if a screen has
 * two adjacent columns (e.g. category/channel lists) that are both vertically long at the same
 * time, pressing Down/Up at the end of a short list could wrongly jump into the adjacent
 * column. On such screens the candidate list must be narrowed with FocusManagerOptions.candidateFilter
 * (see liveScreen.ts).
 */
export function findNextFocus(current: FocusRect, candidates: FocusRect[], direction: Direction): string | null {
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;

  let bestInCone: { id: string; score: number } | null = null;
  let bestAny: { id: string; score: number } | null = null;

  for (const cand of candidates) {
    const nx = cand.x + cand.w / 2;
    const ny = cand.y + cand.h / 2;
    const dx = nx - cx;
    const dy = ny - cy;

    let inDirection: boolean;
    let primary: number;
    let perpendicular: number;
    let inCone: boolean;
    switch (direction) {
      case 'right':
        inDirection = dx > 0;
        primary = dx;
        perpendicular = Math.abs(dy);
        inCone = Math.abs(dy) <= Math.abs(dx);
        break;
      case 'left':
        inDirection = dx < 0;
        primary = -dx;
        perpendicular = Math.abs(dy);
        inCone = Math.abs(dy) <= Math.abs(dx);
        break;
      case 'down':
        inDirection = dy > 0;
        primary = dy;
        perpendicular = Math.abs(dx);
        inCone = Math.abs(dx) <= Math.abs(dy);
        break;
      case 'up':
        inDirection = dy < 0;
        primary = -dy;
        perpendicular = Math.abs(dx);
        inCone = Math.abs(dx) <= Math.abs(dy);
        break;
    }
    if (!inDirection) continue;

    const score = primary + perpendicular * 2;
    if (!bestAny || score < bestAny.score) bestAny = { id: cand.id, score };
    if (inCone && (!bestInCone || score < bestInCone.score)) bestInCone = { id: cand.id, score };
  }
  return (bestInCone ?? bestAny)?.id ?? null;
}
