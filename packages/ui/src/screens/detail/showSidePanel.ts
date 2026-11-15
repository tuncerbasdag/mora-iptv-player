import type { Show } from '../../../../core/src/types.ts';
import { div } from '../../dom.ts';
import { addPosterDeco } from '../../posterDeco.ts';
import { attachPosterImage } from '../../posterImage.ts';

const POSTER_BACKGROUND = 'var(--poster-1)';

export interface ShowSidePanelOptions {
  show: Show;
  /** Called when the "Diziler" title is clicked. */
  onBack: () => void;
  /** Production year and genre (same values as the header info line, shared with the main panel). */
  year: string;
  genre: string;
  /** Whether real season/episode numbering exists (if not, the "Season" row isn't shown). */
  numbered: boolean;
}

/** Left column: back title, 16:9 poster, and info rows (production year, genre, season, episode count). */
export function buildShowSidePanel(o: ShowSidePanelOptions): HTMLElement {
  const { show } = o;
  const side = div('width:328px;flex:none;box-sizing:border-box;padding-right:28px;border-right:1.5px solid var(--border);display:flex;flex-direction:column');
  const back = div('display:flex;align-items:center;height:80px;font-size:38px;font-weight:800;letter-spacing:-0.01em;flex:none;cursor:pointer');
  back.textContent = 'Diziler';
  back.addEventListener('click', o.onBack);
  // Design: 16:9 poster in the left column.
  const poster = div(`background:${POSTER_BACKGROUND}`, 'vod-poster p169 detail');
  addPosterDeco(poster, 1); // by design, show posters get a diagonal stripe + square pattern
  poster.style.flex = 'none';
  if (show.logo) attachPosterImage(poster, show.logo, 'end');

  const totalEpisodes = show.seasons.reduce((n, s) => n + s.episodes.length, 0);
  const info = div('display:flex;flex-direction:column;margin-top:22px');
  const infoRow = (label: string, value: string): void => {
    if (!value) return;
    const row = div('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px');
    const l = div('font-size:22px;font-weight:600;color:var(--text-dim)');
    l.textContent = label;
    const v = div('font-size:26px;font-weight:800;min-width:0;margin-left:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    v.textContent = value;
    row.append(l, v);
    info.append(row);
  };
  infoRow('Yapım yılı', o.year);
  infoRow('Tür', o.genre);
  if (o.numbered) infoRow('Sezon', String(show.seasons.length));
  infoRow('Bölüm', String(totalEpisodes));
  side.append(back, div('height:1.5px;flex:none;background:var(--border);margin:4px 0 16px'), poster, info);
  return side;
}
