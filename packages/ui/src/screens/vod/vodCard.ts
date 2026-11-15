import type { WatchProgress } from '../../../../core/src/storage.ts';
import { div } from '../../dom.ts';
import { formatRemaining } from '../../format.ts';
import { addPosterDeco } from '../../posterDeco.ts';
import { WATCHED_RATIO } from '../../playerController.ts';
import { progressRatio } from './vodData.ts';
import type { VodEntry } from './vodTypes.ts';

/** Content added more recently than this gets the "New" badge. */
const NEW_BADGE_MS = 14 * 24 * 3600 * 1000;
/** Pastel placeholder colors (while there's no poster, or until it loads). */
const PASTELS = ['var(--poster-1)', 'var(--poster-2)', 'var(--poster-3)', 'var(--poster-4)'];

export interface VodCardOptions {
  entry: VodEntry;
  focusId: string;
  index: number;
  /** 'recent': the "Continue Watching" row (play badge, progress, time remaining); 'poster': the main grid. */
  mode: 'poster' | 'recent';
  progress?: WatchProgress;
  /** Series: both "Continue Watching" and the main grid are landscape 16:9. Movies: both are portrait 2:3. */
  landscape: boolean;
  newBadgeLabel?: string;
  favorite: boolean;
  /** Loads the poster image once it becomes visible (see vodPosters). */
  lazyImage: (poster: HTMLElement, url?: string) => void;
  onClick: () => void;
}

/** Movie/show card: poster (decorations, badges, favorite star, progress bar) + title + subtitle. */
export function buildVodCard(o: VodCardOptions): HTMLElement {
  const { entry: e, mode, progress, landscape } = o;
  const a = div('display:flex;flex-direction:column;min-width:0;cursor:pointer', 'vod-card');
  a.dataset.focusId = o.focusId;
  // On landscape grid cards, decorations keep their portrait-poster positions (`detail`), matching the design.
  const poster = div(`background:${PASTELS[o.index % PASTELS.length]}`, `vod-poster ${landscape ? 'p169' : 'p23'}${mode === 'poster' && landscape ? ' detail' : ''}`);
  addPosterDeco(poster, o.index);
  o.lazyImage(poster, e.logo);
  if (mode === 'recent') {
    // Design: play badge top-right; "Continue" pill bottom-left when focused.
    const badge = div('', 'vod-play-badge');
    badge.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" style="fill:var(--peach)"/></svg>';
    const pill = div('', 'vod-resume-pill');
    pill.textContent = 'Devam et';
    poster.append(badge, pill);
  }
  // Design: recently added content gets a "New" badge top-left on its poster. Only shown if the provider reported an added-at time.
  if (mode === 'poster' && e.addedAt && Date.now() >= e.addedAt && Date.now() - e.addedAt < NEW_BADGE_MS) {
    const fresh = div('', 'vod-new');
    fresh.textContent = o.newBadgeLabel ?? 'Yeni';
    poster.append(fresh);
  }
  if (o.favorite) {
    const star = div('', mode === 'recent' ? 'vod-star left' : 'vod-star');
    star.textContent = '★';
    poster.append(star);
  }
  const ratio = progressRatio(progress ?? null);
  if (mode === 'recent' && ratio > 0) {
    const track = div('position:absolute;left:0;right:0;bottom:0;height:10px;background:var(--track-dark)');
    const fill = div(`width:${Math.round(ratio * 100)}%;height:100%;background:var(--accent)`);
    track.append(fill);
    poster.append(track);
  }
  const text = div('min-width:0;margin-top:12px');
  const title = div('', 'vod-title');
  title.textContent = e.title;
  const sub = div('', 'vod-sub');
  sub.textContent = mode === 'recent' && progress && progress.duration > 0 ? (ratio >= WATCHED_RATIO ? 'İzlendi' : formatRemaining(progress.duration - progress.seconds)) : e.sub;
  text.append(title, sub);
  a.append(poster, text);
  a.addEventListener('click', o.onClick);
  return a;
}
