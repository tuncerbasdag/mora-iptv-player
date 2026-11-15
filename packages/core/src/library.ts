import { classify } from './classify.ts';
import { hash } from './hash.ts';
import type { Category, Library, M3UEntry, MediaItem, Show } from './types.ts';

const NO_GROUP = 'Diğer';

/** Classifies raw M3U entries and converts them into a Live / Movie / Series library. */
export function buildLibrary(entries: M3UEntry[]): Library {
  const seen = new Map<string, number>();
  const items: MediaItem[] = entries.map((e) => {
    const { kind, episode } = classify(e);
    const group = e.attrs['group-title'] || NO_GROUP;
    // Identity is based on the name, not the URL: favorites / resume position survive even if the provider changes its token.
    const base = hash(`${kind}|${e.attrs['tvg-id'] || ''}|${group}|${e.name}`);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const durationSec = kind !== 'live' && e.duration > 0 ? Math.round(e.duration) : undefined;
    const addedAt = kind !== 'live' ? parseAdded(e.attrs) : undefined;
    return {
      id: n === 0 ? base : `${base}-${n}`,
      name: e.name,
      url: e.url,
      logo: e.attrs['tvg-logo'] || undefined,
      group,
      tvgId: e.attrs['tvg-id'] || undefined,
      kind,
      episode,
      ...(durationSec ? { durationSec } : {}),
      ...(addedAt ? { addedAt } : {}),
    };
  });

  const live = groupBy(items.filter((i) => i.kind === 'live'));
  const movies = groupBy(items.filter((i) => i.kind === 'movie'));
  const series = buildSeries(items.filter((i) => i.kind === 'series'));

  return {
    live,
    movies,
    series,
    counts: {
      live: live.reduce((a, c) => a + c.items.length, 0),
      movies: movies.reduce((a, c) => a + c.items.length, 0),
      series: series.reduce((a, c) => a + c.items.length, 0),
      episodes: items.filter((i) => i.kind === 'series').length,
    },
  };
}

const ADDED_ATTRS = ['tvg-added', 'added', 'date-added', 'date_added', 'timestamp'];

/**
 * Added-at time (epoch ms) from M3U attributes: a number in seconds or milliseconds, or a date
 * string. Not standardized; only present if the provider supplies it. Undefined if invalid or
 * outside the plausible range (2000-2100).
 */
export function parseAdded(attrs: Record<string, string>): number | undefined {
  for (const key of ADDED_ATTRS) {
    const raw = attrs[key]?.trim();
    if (!raw) continue;
    const ms = /^\d+(\.\d+)?$/.test(raw) ? (Number(raw) < 1e11 ? Number(raw) * 1000 : Number(raw)) : Date.parse(raw);
    if (Number.isFinite(ms) && ms > 946_684_800_000 && ms < 4_102_444_800_000) return Math.round(ms);
  }
  return undefined;
}

/**
 * Does the series have real season/episode numbers? When the name doesn't match the episode
 * pattern (e.g. just "Series Name"), classification falls back to assuming "season 1, episode 0":
 * this is not information from the M3U and should not be shown on screen.
 */
export function hasEpisodeNumbers(show: Show): boolean {
  return show.seasons.some((s) => s.episodes.some((e) => (e.episode?.episode ?? 0) > 0));
}

/** "Animation;Kids;Sci-Fi" -> ["Animation", "Kids", "Sci-Fi"]; also used to display genres on screen. */
export function genresOf(group: string): string[] {
  return group
    .split(';')
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * Some providers cram multiple categories into a single `group-title`, separated by semicolons
 * (e.g. `group-title="Entertainment;Family;General"`) — rather than the channel landing in one
 * odd category named "Entertainment;Family;General", the channel appears under each of the
 * three categories separately.
 */
function splitGroups(group: string): string[] {
  const parts = genresOf(group);
  return parts.length > 0 ? parts : [group];
}

function groupBy(items: MediaItem[]): Category<MediaItem>[] {
  const map = new Map<string, MediaItem[]>();
  for (const it of items) {
    for (const g of splitGroups(it.group)) {
      let arr = map.get(g);
      if (!arr) map.set(g, (arr = []));
      arr.push(it);
    }
  }
  // The category order from the M3U is preserved.
  return [...map].map(([name, items]) => ({ name, items }));
}

function buildSeries(eps: MediaItem[]): Category<Show>[] {
  // category -> series name -> season -> episodes
  const cats = new Map<string, Map<string, Show>>();
  for (const ep of eps) {
    const info = ep.episode!;
    for (const g of splitGroups(ep.group)) {
      let shows = cats.get(g);
      if (!shows) cats.set(g, (shows = new Map()));
      const key = info.show.toLocaleLowerCase('tr');
      let show = shows.get(key);
      if (!show) {
        // Identity is independent of category: the same series is a single show even if it appears under multiple genres (favorites / dedup list).
        show = { id: hash(`show|${key}`), title: info.show, logo: ep.logo, seasons: [] };
        shows.set(key, show);
      }
      let season = show.seasons.find((s) => s.number === info.season);
      if (!season) show.seasons.push((season = { number: info.season, episodes: [] }));
      season.episodes.push(ep);
    }
  }

  return [...cats].map(([name, shows]) => {
    const list = [...shows.values()];
    for (const s of list) {
      s.seasons.sort((a, b) => a.number - b.number);
      // episode=0 (unknown) entries stay in M3U order; stable sort.
      for (const se of s.seasons) se.episodes.sort((a, b) => a.episode!.episode - b.episode!.episode);
    }
    for (const s of list) {
      // The series' timestamp is its newest episode's timestamp (if the provider supplied episode dates).
      const times = s.seasons.flatMap((se) => se.episodes.map((e) => e.addedAt ?? 0));
      const newest = Math.max(0, ...times);
      if (newest > 0) s.addedAt = newest;
    }
    list.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    return { name, items: list };
  });
}
