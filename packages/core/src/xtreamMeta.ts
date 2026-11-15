import type { Category, Library, MediaItem, Show } from './types.ts';

/** Converts a number/string in seconds (or ms) to epoch ms; undefined if invalid or outside the plausible range (2000-2100). */
function toMs(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = n < 1e11 ? n * 1000 : n;
  return ms > 946_684_800_000 && ms < 4_102_444_800_000 ? Math.round(ms) : undefined;
}

/** stream_id -> added timestamp (ms) from the `get_vod_streams` response. Empty map if the field is missing/malformed. */
export function parseXtreamVodAdded(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(json)) return out;
  for (const row of json) {
    const r = row as { stream_id?: unknown; added?: unknown };
    const at = toMs(r?.added);
    if (r?.stream_id != null && at) out.set(String(r.stream_id), at);
  }
  return out;
}

/** lowercased series name -> last-modified timestamp (ms) from the `get_series` response. */
export function parseXtreamSeriesAdded(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(json)) return out;
  for (const row of json) {
    const r = row as { name?: unknown; last_modified?: unknown };
    const at = toMs(r?.last_modified);
    if (typeof r?.name === 'string' && at) out.set(r.name.trim().toLocaleLowerCase('tr'), at);
  }
  return out;
}

/** The stream number in a movie URL: `/movie/<username>/<password>/<id>.<extension>`. */
export function xtreamMovieId(url: string): string | null {
  const m = /\/movie\/[^/]+\/[^/]+\/(\d+)(?:\.[a-z0-9]+)?(?:[?#]|$)/i.exec(url);
  return m ? m[1] : null;
}

/**
 * Applies added timestamps from the Xtream API into the library (the provider's M3U doesn't carry this info).
 * Movies are matched by stream number, series by name; unmatched items are left untouched. Mutates the same library object.
 */
export function applyXtreamAdded(lib: Library, vodAdded: Map<string, number>, seriesAdded: Map<string, number>): Library {
  const stamp = (cats: Category<MediaItem>[]): void => {
    for (const c of cats) {
      for (const it of c.items) {
        const id = xtreamMovieId(it.url);
        const at = id ? vodAdded.get(id) : undefined;
        if (at) it.addedAt = at;
      }
    }
  };
  stamp(lib.movies);
  const seen = new Set<Show>();
  for (const c of lib.series) {
    for (const s of c.items) {
      if (seen.has(s)) continue;
      seen.add(s);
      const at = seriesAdded.get(s.title.trim().toLocaleLowerCase('tr'));
      if (at) s.addedAt = at;
    }
  }
  return lib;
}
