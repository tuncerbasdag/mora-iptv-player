import type { ContentKind, EpisodeInfo, M3UEntry } from './types.ts';

const VOD_EXT = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm)(\?|#|$)/i;
const LIVE_EXT = /\.(m3u8|ts)(\?|#|$)/i;

const SERIES_WORDS = /\b(dizi|diziler|series|tv ?shows?|season|sezon)\b/i;
const MOVIE_WORDS = /\b(vod|film|filmler|movies?|sinema|cinema)\b/i;

// S01E05, S1 E5, 1x05, "1. Sezon 5. Bölüm" (Turkish: "Season 1 Episode 5"), "Sezon 1 Bölüm 5"
const EPISODE_PATTERNS: RegExp[] = [
  /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})\b/i,
  /^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})\b/i,
  /^(.*?)[\s._-]*(\d{1,2})\.?\s*Sezon[\s._-]*(\d{1,3})\.?\s*B[öo]l[üu]m/i,
  /^(.*?)[\s._-]*Sezon\s*(\d{1,2})[\s._-]*B[öo]l[üu]m\s*(\d{1,3})/i,
  /^(.*?)[\s._-]*Season\s*(\d{1,2})[\s._-]*Episode\s*(\d{1,3})/i,
];

export function parseEpisode(name: string): EpisodeInfo | undefined {
  for (const re of EPISODE_PATTERNS) {
    const m = name.match(re);
    if (m) {
      const show = cleanTitle(m[1]);
      if (!show) continue;
      return { show, season: parseInt(m[2], 10), episode: parseInt(m[3], 10) };
    }
  }
  return undefined;
}

function cleanTitle(s: string): string {
  return s
    .replace(/[\s._\-|:]+$/g, '')
    .replace(/^[\s._\-|:]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Infers the content kind from hints, in order of reliability:
 * 1) URL path (/movie/, /series/, /live/)  2) extension  3) group-title  4) episode pattern
 */
export function classify(e: M3UEntry): { kind: ContentKind; episode?: EpisodeInfo } {
  const url = e.url.toLowerCase();
  const group = e.attrs['group-title'] ?? '';
  const ep = parseEpisode(e.name);

  // 1) Xtream-style URLs
  if (/\/series\//.test(url)) return { kind: 'series', episode: ep ?? fallbackEpisode(e) };
  if (/\/movies?\//.test(url)) return { kind: 'movie' };
  if (/\/live\//.test(url)) return { kind: 'live' };

  const isVodFile = VOD_EXT.test(url);
  const isLiveFile = LIVE_EXT.test(url);

  // 2+4) File extension + episode pattern
  if (ep && (isVodFile || SERIES_WORDS.test(group))) return { kind: 'series', episode: ep };

  // 3) Category name
  if (SERIES_WORDS.test(group)) return { kind: 'series', episode: ep ?? fallbackEpisode(e) };
  if (MOVIE_WORDS.test(group)) return { kind: 'movie' };

  if (isVodFile) return ep ? { kind: 'series', episode: ep } : { kind: 'movie' };
  if (isLiveFile) return { kind: 'live' };

  // 5) Default
  return { kind: 'live' };
}

/** When it's clearly a series but the name doesn't match the pattern: a single season, unordered episode. */
function fallbackEpisode(e: M3UEntry): EpisodeInfo {
  const group = e.attrs['group-title'] ?? '';
  // Some providers put a genre list in group-title ("Classic;Comedy;Public"): this is not a
  // series name and would lump different series into a single "series"; in that case the entry's
  // own name is used instead.
  const looksLikeGenreList = /[;,|]/.test(group);
  return { show: group && !looksLikeGenreList ? group : e.name, season: 1, episode: 0 };
}
