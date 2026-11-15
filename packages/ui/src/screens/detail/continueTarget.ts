import type { WatchProgress } from '../../../../core/src/storage.ts';
import type { Show } from '../../../../core/src/types.ts';
import { WATCHED_RATIO } from '../../playback/playbackTypes.ts';
import { progressRatio } from '../vod/vodData.ts';

export interface ContinueTarget {
  /** Season and episode index. */
  s: number;
  i: number;
  /** true: "Continue" for a partially watched episode; false: "Play" (first or next episode). */
  resume: boolean;
}

/**
 * Where to continue the show from: if the most recently watched episode is still partway through, that one ("Continue");
 * if it's finished (>= 95%), the next episode, the first of the next season if at the end of a season, or the last
 * episode if the show is over; if never watched, the first episode.
 * `recents`: most recently watched, newest to oldest.
 */
export function resolveContinueTarget(show: Show, recents: WatchProgress[]): ContinueTarget {
  const location = new Map<string, { s: number; i: number }>();
  show.seasons.forEach((season, s) => season.episodes.forEach((ep, i) => location.set(ep.id, { s, i })));
  const last = recents.find((p) => location.has(p.id));
  if (!last) return { s: 0, i: 0, resume: false };
  const at = location.get(last.id)!;
  if (progressRatio(last) < WATCHED_RATIO) return { ...at, resume: true };
  // Episode finished: move to the next episode.
  const season = show.seasons[at.s];
  if (season && at.i + 1 < season.episodes.length) return { s: at.s, i: at.i + 1, resume: false };
  if (show.seasons[at.s + 1]?.episodes.length) return { s: at.s + 1, i: 0, resume: false };
  return { ...at, resume: false };
}
