import type { MediaTrack } from '../../../ui/src/mediaTracks.ts';
import type { PlayerAdapterEvent } from '../../../ui/src/playerAdapter.ts';

/** The way the engine reports events to the adapter. */
export type EngineEmit = (event: PlayerAdapterEvent, ...args: unknown[]) => void;

/**
 * The strategy (Strategy pattern) that binds a stream to the `<video>` element on web: hls.js, mpegts.js,
 * and native `<video>` all sit behind the same interface; WebPlayerAdapter doesn't know which one is running.
 */
export interface PlaybackEngine {
  /** The engine's display name (diagnostics panel): 'hls.js' | 'mpegts.js' | 'video'. */
  readonly name: string;
  /** Loads the source and starts playback. */
  start(): Promise<void>;
  /** Releases resources held by the engine (the video element belongs to the adapter and isn't destroyed here). */
  destroy(): void;
  /** Instantaneous bitrate (kbps); null if it can't be measured. */
  bitrateKbps(): number | null;
  /** Displayed codec summary; null if unknown. */
  codec(): string | null;
  /** Frame rate reported by the engine itself; null if unavailable (the adapter measures it). */
  fps(): number | null;
  getAudioTracks(): MediaTrack[];
  getAudioTrack(): number;
  setAudioTrack(id: number): void;
  getSubtitleTracks(): MediaTrack[];
  getSubtitleTrack(): number;
  setSubtitleTrack(id: number): void;
}
