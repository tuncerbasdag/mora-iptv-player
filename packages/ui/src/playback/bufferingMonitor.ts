import type { PlayerAdapter } from '../playerAdapter.ts';
import { BUFFERING_SHOW_AFTER_MS, type PlaybackHost } from './playbackTypes.ts';

/** If the buffer doesn't fill back up within this long while playing, the stream is considered stalled (VOD only). */
const VOD_STALL_MS = 30000;

/**
 * When the buffer runs out during playback (adapter emits 'buffering'), after a short delay the status becomes
 * 'buffering' and the UI shows the loading ring; once the stream resumes ('playing', or once the position advances)
 * it goes back to 'playing'. Initial load and reconnection have their own states, so this only kicks in while 'playing'.
 */
export class BufferingMonitor {
  private readonly host: PlaybackHost;
  private readonly adapter: PlayerAdapter;
  /** Called when the buffer doesn't fill back up for too long on VOD (never assigned for live). */
  onStall: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private percent = 0;
  /** The playback position where the stall started: once the position advances, the stream is considered resumed. */
  private fromTime = 0;

  constructor(host: PlaybackHost) {
    this.host = host;
    this.adapter = host.adapter;
  }

  /** Attaches listeners; the returned functions are called when the session closes. */
  listen(): Array<() => void> {
    const { host, adapter } = this;
    const resume = (): void => {
      this.clearTimer();
      this.clearStall();
      const state = host.getState();
      if (state.status === 'buffering') host.setState({ ...state, status: 'playing', bufferPercent: undefined });
    };
    return [
      adapter.on('buffering', () => {
        if (host.getState().status !== 'playing' || this.timer) return;
        this.fromTime = adapter.getCurrentTime();
        this.percent = 0;
        this.timer = setTimeout(() => {
          this.timer = null;
          const state = host.getState();
          if (state.status === 'playing') {
            host.setState({ ...state, status: 'buffering', bufferPercent: this.percent });
            // On VOD, if the buffer doesn't fill back up for too long, the stream is considered stalled and retried.
            const stalled = this.onStall;
            if (stalled) this.stallTimer = setTimeout(stalled, VOD_STALL_MS);
          }
        }, BUFFERING_SHOW_AFTER_MS);
      }),
      adapter.on('bufferprogress', (...args) => {
        this.percent = Number(args[0]) || 0;
        // During a playback stall, and during initial load/reconnection: the ring shows the real buffer fill percentage.
        const state = host.getState();
        const s = state.status;
        if (s === 'buffering' || s === 'loading' || s === 'reconnecting') host.setState({ ...state, bufferPercent: this.percent });
      }),
      adapter.on('playing', resume),
      adapter.on('timeupdate', () => {
        if (adapter.getCurrentTime() > this.fromTime + 0.25) resume();
      }),
    ];
  }

  clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  clearStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  /** Releases all timers. */
  clear(): void {
    this.clearTimer();
    this.clearStall();
  }
}
