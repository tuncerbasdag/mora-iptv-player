import type { FavoriteStore, PlaybackStore, WatchProgress } from '../../../../core/src/storage.ts';
import type { MediaItem, Show } from '../../../../core/src/types.ts';
import { div } from '../../dom.ts';
import { formatRemaining } from '../../format.ts';
import { WATCHED_RATIO } from '../../playback/playbackTypes.ts';
import { attachPosterImage } from '../../posterImage.ts';
import { progressRatio } from '../vod/vodData.ts';
import { episodeNumber, episodeTitle } from './episodeInfo.ts';

const PASTELS = ['var(--poster-1)', 'var(--poster-3)', 'var(--poster-2)', 'var(--poster-4)'];
/** Thumbnails for this many initial episodes load right away; the rest load as focus advances (we don't want to load them all at once). */
const INITIAL_THUMBS = 12;
/** This many rows' thumbnails ahead of the focused episode are preloaded. */
const THUMB_LOOKAHEAD = 6;

export interface EpisodeListOptions {
  show: Show;
  storage: PlaybackStore & FavoriteStore;
  /** If there's no real season/episode numbering, the tab isn't shown. */
  numbered: boolean;
  initialSeason: number;
  onPlayEpisode: (episode: MediaItem, seasonIndex: number, episodeIndex: number) => void;
}

/** Season tabs and the selected season's episode list (thumbnail, progress, "Watched" / "N min left"). */
export class EpisodeList {
  /** Tab row and episode list (added to the main panel separately). */
  readonly tabs: HTMLElement = div('display:flex;align-items:center;flex:none;margin-bottom:12px');
  readonly list: HTMLElement = div('flex:1;min-height:0;overflow-y:auto', 'hide-scrollbar');
  private readonly episodeCount = div('margin-left:auto;font-size:24px;font-weight:600;color:var(--text-dim)');
  private readonly show: Show;
  private readonly storage: PlaybackStore;
  private readonly onPlayEpisode: EpisodeListOptions['onPlayEpisode'];
  private season: number;

  constructor(o: EpisodeListOptions) {
    this.show = o.show;
    this.storage = o.storage;
    this.onPlayEpisode = o.onPlayEpisode;
    this.season = o.initialSeason;
    o.show.seasons.forEach((season, i) => {
      if (!o.numbered) return; // season info is a fallback: don't show a tab
      const tab = div(i ? 'margin-left:14px' : '', 'vod-tab');
      tab.dataset.focusId = `season-${i}`;
      tab.textContent = `Sezon ${season.number}`;
      tab.addEventListener('click', () => this.render(i));
      this.tabs.append(tab);
    });
    this.tabs.append(this.episodeCount);
    this.render(this.season);
  }

  /** Index of the currently listed season. */
  get currentSeason(): number {
    return this.season;
  }

  /** Renders the selected season's episodes; marks the active one among the tabs. */
  render(seasonIndex: number): void {
    this.season = seasonIndex;
    for (const tab of Array.from(this.tabs.children)) {
      const id = (tab as HTMLElement).dataset.focusId;
      if (id) tab.classList.toggle('active', id === `season-${seasonIndex}`);
    }
    this.list.innerHTML = '';
    this.list.scrollTop = 0;
    const season = this.show.seasons[seasonIndex];
    if (!season) return;
    this.episodeCount.textContent = `${season.episodes.length} bölüm`;
    season.episodes.forEach((ep, i) => {
      const th = this.buildRow(ep, seasonIndex, i);
      if (i < INITIAL_THUMBS) this.loadThumb(th);
    });
  }

  /** Loads thumbnails for the episodes following the focused one. */
  loadThumbsFrom(episodeIndex: number): void {
    const rows = this.list.children;
    for (let i = episodeIndex; i < Math.min(rows.length, episodeIndex + THUMB_LOOKAHEAD); i++) {
      const t = rows[i].querySelector('.vod-thumb') as HTMLElement | null;
      if (t?.dataset.thumb) this.loadThumb(t);
    }
  }

  private buildRow(ep: MediaItem, seasonIndex: number, i: number): HTMLElement {
    const progress = this.storage.getProgress(ep.id);
    const ratio = progressRatio(progress);
    const row = div('', 'vod-ep');
    row.dataset.focusId = `ep-${seasonIndex}-${i}`;
    const num = div('width:40px;font-size:26px;font-weight:800;color:var(--text-dim);flex:none', 'vod-ep-num');
    num.textContent = String(episodeNumber(ep, i));
    const th = this.buildThumb(ep, i, progress);
    const text = div('flex:1;min-width:0;margin-left:22px;display:flex;flex-direction:column');
    const name = div('font-size:28px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', 'vod-ep-name');
    name.textContent = episodeTitle(ep, i);
    text.append(name);
    const status = div('font-size:22px;font-weight:700;color:var(--text-dim);flex:none;margin-left:16px', 'vod-ep-status');
    if (progress && ratio >= WATCHED_RATIO) status.textContent = '✓ İzlendi';
    else if (progress && progress.duration > 0 && ratio > 0) status.textContent = formatRemaining(progress.duration - progress.seconds);
    row.append(num, th, text, status);
    row.addEventListener('click', () => this.onPlayEpisode(ep, seasonIndex, i));
    this.list.append(row);
    return th;
  }

  private buildThumb(ep: MediaItem, index: number, progress: WatchProgress | null): HTMLElement {
    const t = div(`background:${PASTELS[index % PASTELS.length]}`, 'vod-thumb');
    t.append(div('', 'vod-deco thumb-circle'));
    t.dataset.thumb = ep.logo ?? '';
    const ratio = progressRatio(progress);
    if (ratio > 0) {
      const track = div('position:absolute;left:0;right:0;bottom:0;height:8px;background:var(--track-dark)');
      track.append(div(`width:${Math.round(ratio * 100)}%;height:100%;background:var(--accent)`));
      t.append(track);
    }
    return t;
  }

  private loadThumb(t: HTMLElement): void {
    const url = t.dataset.thumb;
    t.dataset.thumb = '';
    if (url) attachPosterImage(t, url);
  }
}
