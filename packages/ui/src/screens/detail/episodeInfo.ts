import type { MediaItem } from '../../../../core/src/types.ts';

/** "Show Name S02E04 The Way Back" -> "The Way Back"; if nothing is left of the name, "Episode 4". */
export function episodeTitle(ep: MediaItem, _index: number): string {
  let t = ep.name;
  if (ep.episode?.show && t.toLocaleLowerCase('tr-TR').startsWith(ep.episode.show.toLocaleLowerCase('tr-TR'))) t = t.slice(ep.episode.show.length);
  t = t.replace(/^[\s._\-|:]*S\d{1,2}[\s._-]*E\d{1,3}\b[\s._\-|:]*/i, '').replace(/^[\s._\-|:]+/, '').trim();
  if (t) return t;
  // If the name is just the show name: "Episode N" when the episode number is known, otherwise the actual M3U name.
  return ep.episode && ep.episode.episode > 0 ? `Bölüm ${ep.episode.episode}` : ep.name;
}

/** The episode's displayed number: the actual episode number if known, otherwise its position in the list. */
export function episodeNumber(ep: MediaItem, index: number): number {
  return ep.episode && ep.episode.episode > 0 ? ep.episode.episode : index + 1;
}
