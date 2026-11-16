/** 'buffering': playback stopped because of the buffer. 'bufferprogress': the buffer fill percentage during that (0-100, first argument). */
export type PlayerAdapterEvent = 'playing' | 'timeupdate' | 'ended' | 'error' | 'buffering' | 'bufferprogress' | 'stats' | 'tracks' | 'subtitle';

import type { MediaTrack } from './mediaTracks.ts';

/** Instantaneous connection info for live playback — emitted via the 'stats' event (live only, not present for VOD). */
export interface PlayerStats {
  width: number;
  height: number;
  /** Instantaneous bitrate (kilobits/second); null if it cannot be measured (e.g. in the native <video> fallback). */
  kbps: number | null;
  /** Frame rate (fps); null/absent if it cannot be measured. */
  fps?: number | null;
  /** Display codec summary ("H.264 · AAC"); null/absent if unknown. */
  codec?: string | null;
}

/** Converts codec strings ("avc1.640028", "mp4a.40.2", "h264"...) into a short display name. */
export function codecLabel(video?: string | null, audio?: string | null): string | null {
  const v = (video ?? '').toLowerCase();
  const a = (audio ?? '').toLowerCase();
  const vl = /avc|h264|h\.264/.test(v)
    ? 'H.264'
    : /hvc|hev|h265|hevc|h\.265/.test(v)
      ? 'H.265'
      : /av01|av1/.test(v)
        ? 'AV1'
        : /vp09|vp9/.test(v)
          ? 'VP9'
          : /mpeg2|mp2v/.test(v)
            ? 'MPEG-2'
            : '';
  const al = /ec-3|eac3/.test(a)
    ? 'E-AC-3'
    : /ac-3|ac3/.test(a)
      ? 'AC-3'
      : /mp4a\.40|aac/.test(a)
        ? 'AAC'
        : /mp3|mp4a\.6b|mp4a\.69|mpeg/.test(a)
          ? 'MP3'
          : '';
  const parts = [vl, al].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Produces a short summary string to show the user, like "720p · 3.2 Mbps". */
export function formatStats(stats: PlayerStats): string {
  const res = `${stats.height}p`;
  if (stats.kbps == null) return res;
  const kbps = stats.kbps >= 1000 ? `${(stats.kbps / 1000).toFixed(1)} Mbps` : `${stats.kbps} kbps`;
  return `${res} · ${kbps}`;
}

/**
 * Abstracts the platform-specific player (web: hls.js/mpegts.js/<video>, Tizen: webapis.avplay)
 * behind a single interface. The UI and PlayerController know only about this.
 */
export interface PlayerAdapter {
  loadLive(url: string): Promise<void>;
  loadVod(url: string, resumeSeconds: number): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  on(event: PlayerAdapterEvent, handler: (...args: unknown[]) => void): () => void;
  destroy(): void;
  /**
   * Moves content that is already playing to a new container without reloading or rebuffering
   * (e.g. transitioning between Live TV's small preview box and full screen). On web, this is just
   * moving the `<video>` element — which is already in the DOM — elsewhere via `container.append()`;
   * browsers do this without interrupting playback. On Tizen, the AVPlay picture lives on a separate
   * hardware layer, so here only `setDisplayRect` is updated to the new position.
   */
  moveTo(container: HTMLElement): void;
}

/**
 * Audio / subtitle track selection (role interface): not every player has to support this, so it is
 * not part of `PlayerAdapter` (Interface Segregation). The 'tracks' event fires when the list loads or
 * changes. `getSubtitleTrack()` returns -1 = off; `setSubtitleTrack(-1)` turns subtitles off. The
 * 'subtitle' event: (text, duration ms); only emitted by players that don't render subtitles themselves
 * (AVPlay), empty text = clear.
 */
export interface TrackCapable {
  getAudioTracks(): MediaTrack[];
  getAudioTrack(): number;
  setAudioTrack(id: number): void;
  getSubtitleTracks(): MediaTrack[];
  getSubtitleTrack(): number;
  setSubtitleTrack(id: number): void;
}

export function isTrackCapable(adapter: PlayerAdapter): adapter is PlayerAdapter & TrackCapable {
  return typeof (adapter as Partial<TrackCapable>).getAudioTracks === 'function';
}

/**
 * Submitting a track selection BEFORE reloading (loadVod) (role interface, optional): only AVPlay
 * supports this — it applies the selection directly just before the player calls play(), avoiding the
 * glitch of "play briefly with the default track, then switch a second time" (see
 * apps/tizen/src/tizenPlayerAdapter.ts). For players that don't support it (web engines),
 * `VodPlayback.changeTrack()` applies it AFTER loading finishes instead.
 */
export interface PendingTrackCapable {
  setPendingTracks(audioId: number, subtitleId: number): void;
}

export function isPendingTrackCapable(adapter: PlayerAdapter): adapter is PlayerAdapter & PendingTrackCapable {
  return typeof (adapter as Partial<PendingTrackCapable>).setPendingTracks === 'function';
}

/** No-op behavior for players without track support (Null Object): callers don't have to bother with `?.`/`?? []`. */
export const NO_TRACK_SUPPORT: TrackCapable = {
  getAudioTracks: () => [],
  getAudioTrack: () => -1,
  setAudioTrack: () => {},
  getSubtitleTracks: () => [],
  getSubtitleTrack: () => -1,
  setSubtitleTrack: () => {},
};

/** Instantaneous diagnostic info for the player (for distinguishing causes of freezes/stalls; see the diagnostics panel). */
export interface PlayerDiagnostics {
  /** Active engine: 'hls.js' | 'mpegts.js' | 'video' | 'avplay'; '-' if unknown. */
  engine: string;
  /** Buffer ahead of the playback position (seconds); null if it cannot be measured. */
  bufferSeconds: number | null;
  /** Live buffer mode ('low' = low latency, 'stable' = ~5s); null if not live. */
  bufferMode: 'low' | 'stable' | null;
  /** Whether playback is currently being held back to let the buffer fill. */
  holding: boolean;
  /** Number of stalls (buffer running out) on this player so far. */
  stalls: number;
  /** Dropped / total frames as reported by the browser; null if unknown (AVPlay). */
  droppedFrames: number | null;
  totalFrames: number | null;
  /** Recent playback events (oldest to newest), e.g. "12.3 waiting · tampon 0.4"; shows WHEN and WHY a stall happens. */
  events: string[];
}

export const EMPTY_DIAGNOSTICS: PlayerDiagnostics = { engine: '-', bufferSeconds: null, bufferMode: null, holding: false, stalls: 0, droppedFrames: null, totalFrames: null, events: [] };

/** Role interface for players that provide diagnostic info (Interface Segregation; optional, like `TrackCapable`). */
export interface DiagnosticsCapable {
  getDiagnostics(): PlayerDiagnostics;
}

/** Returns the player's diagnostics if it provides them, otherwise null. */
export function diagnosticsOf(adapter: PlayerAdapter | null | undefined): PlayerDiagnostics | null {
  const a = adapter as Partial<DiagnosticsCapable> | null | undefined;
  return a && typeof a.getDiagnostics === 'function' ? a.getDiagnostics() : null;
}

/** The player's track interface; no-op behavior if unsupported. */
export function tracksOf(adapter: PlayerAdapter | null | undefined): TrackCapable {
  return adapter && isTrackCapable(adapter) ? adapter : NO_TRACK_SUPPORT;
}
