import type { MediaItem } from '../../../core/src/types.ts';
import { StreamBlockedError } from '../singleStream.ts';
import { BufferingMonitor } from './bufferingMonitor.ts';
import { LOAD_TIMEOUT_MS, type PlaybackHost } from './playbackTypes.ts';

/**
 * Playback session for a piece of content (Strategy): live and VOD operate under different rules
 * (reconnect/retry on drop, resume-position saving, seeking). `PlayerController` picks which session
 * to use and delegates the common lifecycle (start, teardown) to it.
 */
export abstract class PlaybackSession {
  readonly item: MediaItem;
  protected readonly host: PlaybackHost;
  protected readonly unsubs: Array<() => void> = [];
  protected readonly buffering: BufferingMonitor;
  private loadTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  protected disposed = false;

  constructor(host: PlaybackHost, item: MediaItem) {
    this.host = host;
    this.item = item;
    this.buffering = new BufferingMonitor(host);
  }

  /** Whether seeking (±seconds) is possible in this session (VOD only). */
  get seekable(): boolean {
    return false;
  }

  /** Starts playback: sets the status to 'loading', attaches listeners, and asks the adapter for the content. */
  abstract start(): Promise<void>;

  /** Retries at the user's request after an error; false if this session doesn't support it. */
  retry(): boolean {
    return false;
  }

  /** Switches the audio/subtitle track (pause → reload with the selected track → resume seamlessly);
   * false if this session doesn't support it (e.g. live). */
  changeTrack(_kind: 'audio' | 'subtitle', _id: number): boolean {
    return false;
  }

  /** Saves the watch position (VOD only; not applicable to live). */
  saveProgress(_force: boolean): void {}

  /** Releases timers and listeners (does not touch the adapter). */
  teardown(): void {
    this.disposed = true;
    this.clearLoadTimeout();
    this.buffering.clear();
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  protected startLoadTimeout(onTimeout: () => void): void {
    this.clearLoadTimeout();
    this.loadTimeoutTimer = setTimeout(() => {
      this.loadTimeoutTimer = null;
      onTimeout();
    }, LOAD_TIMEOUT_MS);
  }

  protected clearLoadTimeout(): void {
    if (this.loadTimeoutTimer) clearTimeout(this.loadTimeoutTimer);
    this.loadTimeoutTimer = null;
  }

  /** If playback was blocked by a provider stream-limit rule (see singleStream.ts), shows the message and stops; other errors are rethrown. */
  protected failIfBlocked(err: unknown): void {
    if (!(err instanceof StreamBlockedError)) throw err;
    this.clearLoadTimeout();
    this.onBlocked();
    this.host.setState({ status: 'error', message: err.message });
  }

  /** Session-specific cleanup for the blocked case (e.g. stopping the watchdog on live). */
  protected onBlocked(): void {}
}
