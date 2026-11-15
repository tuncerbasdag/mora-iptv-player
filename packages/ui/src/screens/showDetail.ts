import type { FavoriteStore, PlaybackStore } from '../../../core/src/storage.ts';
import { genresOf, hasEpisodeNumbers } from '../../../core/src/library.ts';
import type { MediaItem, Show } from '../../../core/src/types.ts';
import { div } from '../dom.ts';
import { FocusManager } from '../focusManager.ts';
import { resolveContinueTarget } from './detail/continueTarget.ts';
import { EpisodeList } from './detail/episodeList.ts';
import { episodeNumber } from './detail/episodeInfo.ts';
import { buildShowSidePanel } from './detail/showSidePanel.ts';
import { createShowDetailFilter } from './detail/showDetailNav.ts';
import { yearOf } from './movieBrowser.ts';

export { episodeTitle } from './detail/episodeInfo.ts';

export interface ShowDetailCallbacks {
  onPlayEpisode: (episode: MediaItem, seasonIndex: number, episodeIndex: number) => void;
  onBack: () => void;
}

/**
 * Show detail: poster and info on the left, title on the right, "Continue" / favorite buttons, season tabs,
 * and the episode list (thumbnail, watch progress, "Watched" / "N min left"). Focusing a season tab
 * (without Enter) refreshes the episodes.
 *
 * Pieces live under `./detail/`: the side panel (showSidePanel), where-to-continue logic (continueTarget, pure),
 * the episode list (episodeList), navigation rules (showDetailNav).
 */
export function renderShowDetail(container: HTMLElement, show: Show, storage: FavoriteStore & PlaybackStore, cb: ShowDetailCallbacks): FocusManager {
  container.innerHTML = '';
  const screen = div('padding:48px 64px', 'screen');
  const frame = div('', 'settings-frame');
  screen.append(frame);
  container.append(screen);

  // group-title can be a list of genres ("Animation;Kids;Sci-Fi"): only the first two genres are shown.
  const genre = genresOf(show.seasons[0]?.episodes[0]?.group ?? '').slice(0, 2).join(', ');
  // When there are no real season/episode numbers (fallback assumption), season tabs, season count, and the "S1 E1" label are hidden.
  const numbered = hasEpisodeNumbers(show);
  const year = yearOf(show.title);
  const side = buildShowSidePanel({ show, onBack: cb.onBack, year, genre, numbered });

  // ---- right side
  const main = div('flex:1;min-width:0;box-sizing:border-box;padding-left:40px;display:flex;flex-direction:column;overflow:hidden');
  const titleEl = div('font-size:56px;font-weight:800;letter-spacing:-0.02em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
  titleEl.textContent = show.title;
  const subEl = div('font-size:26px;font-weight:600;color:var(--text-dim);margin-top:8px');
  subEl.textContent = [numbered ? `${show.seasons.length} sezon` : '', genre, year].filter(Boolean).join(' · ');

  // ---- where to continue from
  const target = resolveContinueTarget(show, storage.getRecents());
  const targetEp = show.seasons[target.s]?.episodes[target.i];

  const actions = div('display:flex;margin:18px 0 6px;flex:none');
  const playBtn = div('', 'vod-btn primary');
  playBtn.dataset.focusId = 'play';
  playBtn.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" style="margin-right:14px"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  playBtn.append(document.createTextNode(`${target.resume ? 'Devam et' : 'Oynat'}${numbered ? ` · S${show.seasons[target.s]?.number ?? 1} B${targetEp ? episodeNumber(targetEp, target.i) : 1}` : ''}`));
  playBtn.addEventListener('click', () => {
    if (targetEp) cb.onPlayEpisode(targetEp, target.s, target.i);
  });
  const favBtn = div('margin-left:20px', 'vod-btn');
  favBtn.dataset.focusId = 'fav';
  function paintFav(): void {
    const on = storage.isFavorite(show.id);
    favBtn.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" style="margin-right:12px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    favBtn.append(document.createTextNode(on ? 'Favorilerden çıkar' : 'Favorilere ekle'));
  }
  paintFav();
  favBtn.addEventListener('click', () => {
    storage.setFavorite(show.id, !storage.isFavorite(show.id));
    paintFav();
  });
  actions.append(playBtn, favBtn);

  const rule = div('height:1.5px;flex:none;background:var(--border);margin:10px 0 14px');
  const episodes = new EpisodeList({ show, storage, numbered, initialSeason: target.s, onPlayEpisode: cb.onPlayEpisode });
  main.append(titleEl, subEl, actions, rule, episodes.tabs, episodes.list);
  frame.append(side, main);

  const fm = new FocusManager(screen, {
    onBack: cb.onBack,
    candidateFilter: createShowDetailFilter({ numbered, currentSeason: () => episodes.currentSeason }),
    onFocus: (id) => {
      const m = /^season-(\d+)$/.exec(id);
      if (m && Number(m[1]) !== episodes.currentSeason) episodes.render(Number(m[1]));
      const e = /^ep-\d+-(\d+)$/.exec(id);
      if (e) episodes.loadThumbsFrom(Number(e[1]));
    },
  });
  fm.focus('play');
  return fm;
}
