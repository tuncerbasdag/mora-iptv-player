import type { ConnectivityProbe } from '../../../core/src/connectivity.ts';
import type { PlaybackStore } from '../../../core/src/storage.ts';
import type { PlayerAdapter, PlayerStats } from '../playerAdapter.ts';

/** 'offline': no internet, waiting for connectivity (polled indefinitely); 'reconnecting': retrying. */
/** 'buffering': the buffer ran out during playback, the stream stalled (fill state is shown via bufferPercent). */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'reconnecting' | 'offline' | 'error' | 'ended';

/** If the stall is shorter than this (ms), nothing is shown in the UI; this keeps the ring from flashing on brief hiccups. */
export const BUFFERING_SHOW_AFTER_MS = 400;

/** If the initial load exceeds this duration (and 'playing' has never been reached yet), an error is raised — reconnection
 * attempts (status 'reconnecting') are separate from this rule and have their own backoff logic (see LiveWatchdog); this
 * timeout applies only to the INITIAL load. */
export const LOAD_TIMEOUT_MS = 15000;
/** A movie/episode watched beyond this ratio is considered "watched". */
export const WATCHED_RATIO = 0.95;
/** If a VOD item fails to open or drops, it is automatically retried this many times (total attempts = 1 + this number). */
export const VOD_MAX_RETRIES = 2;

export interface PlayerControllerState {
  status: PlayerStatus;
  message?: string;
  /** Only populated for live playback — resolution + instantaneous bitrate (see PlayerAdapter 'stats' event). */
  stats?: PlayerStats;
  /** Buffer fill percentage (0-100) while status is 'buffering' / 'loading' / 'reconnecting'; absent if unknown. */
  bufferPercent?: number;
}

/** Dependencies that playback sessions need from the controller (sessions don't know about the controller itself). */
export interface PlaybackHost {
  readonly adapter: PlayerAdapter;
  readonly storage: PlaybackStore;
  readonly probe: ConnectivityProbe | null;
  /** Base wait time (ms) for VOD retries; read every time since it can be shortened in tests. */
  readonly vodRetryBaseMs: number;
  getState(): PlayerControllerState;
  setState(state: PlayerControllerState): void;
}
