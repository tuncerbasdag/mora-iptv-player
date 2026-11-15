import type { ConnectivityProbe } from '../../core/src/connectivity.ts';
import type { PlaybackStore } from '../../core/src/storage.ts';
import type { MediaItem } from '../../core/src/types.ts';
import type { PlayerAdapter } from './playerAdapter.ts';
import { LivePlayback } from './playback/livePlayback.ts';
import type { PlaybackSession } from './playback/playbackSession.ts';
import type { PlaybackHost, PlayerControllerState } from './playback/playbackTypes.ts';
import { VodPlayback } from './playback/vodPlayback.ts';

export { BUFFERING_SHOW_AFTER_MS, LOAD_TIMEOUT_MS, VOD_MAX_RETRIES, WATCHED_RATIO } from './playback/playbackTypes.ts';
export type { PlayerControllerState, PlayerStatus } from './playback/playbackTypes.ts';

/**
 * Ties the PlayerAdapter (platform player) together with playback sessions and resume-position saving
 * (Strategy's context + Facade): live runs via the `LivePlayback` session, VOD via `VodPlayback`; state
 * and listeners live here. Doesn't touch the DOM; screens only listen to state via on().
 */
export class PlayerController {
  private readonly adapter: PlayerAdapter;
  private readonly listeners = new Set<(s: PlayerControllerState) => void>();
  private readonly host: PlaybackHost;
  private session: PlaybackSession | null = null;
  private current: MediaItem | null = null;
  private state: PlayerControllerState = { status: 'idle' };
  /** Base wait time between retries (ms); doubles with each attempt. Shortened in tests. */
  vodRetryBaseMs = 1500;

  /** If `probe` is given, connectivity is polled when live playback drops (see LiveWatchdog.checkConnectivity). */
  constructor(adapter: PlayerAdapter, storage: PlaybackStore, probe?: ConnectivityProbe) {
    this.adapter = adapter;
    const controller = this;
    this.host = {
      adapter,
      storage,
      probe: probe ?? null,
      get vodRetryBaseMs() {
        return controller.vodRetryBaseMs;
      },
      getState: () => this.state,
      setState: (s) => this.setState(s),
    };
  }

  on(fn: (s: PlayerControllerState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): PlayerControllerState {
    return this.state;
  }

  async playLive(item: MediaItem): Promise<void> {
    const session = this.begin(new LivePlayback(this.host, item));
    await session.start();
  }

  /**
   * Takes over a live stream that is already loaded and playing on another screen — `adapter.loadLive()` is
   * NOT called again (to avoid unnecessary reloading/rebuffering when transitioning between preview and full
   * screen); the state starts directly as 'playing'.
   */
  resumeLive(item: MediaItem): void {
    this.begin(new LivePlayback(this.host, item)).resume();
  }

  async playVod(item: MediaItem): Promise<void> {
    const session = this.begin(new VodPlayback(this.host, item));
    await session.start();
  }

  /** Retries from scratch at the user's request after an error (all automatic attempts exhausted). */
  retryVod(): void {
    this.session?.retry();
  }

  /** Delegates an audio/subtitle track change to the active session (only VOD supports it). */
  changeTrack(kind: 'audio' | 'subtitle', id: number): boolean {
    return this.session?.changeTrack(kind, id) ?? false;
  }

  /** Releases only this controller's listeners without stopping the adapter — used when the adapter
   * is being handed off to another controller (e.g. via resumeLive). */
  release(): void {
    this.endSession();
  }

  stop(): void {
    if (this.state.status === 'playing' || this.state.status === 'paused' || this.state.status === 'buffering') this.session?.saveProgress(true);
    this.endSession();
    this.adapter.stop();
    this.current = null;
    this.setState({ status: 'idle' });
  }

  /**
   * If playback is genuinely in progress (playing / paused / buffering), seeks ±seconds and returns true. VOD only;
   * does not seek if the video hasn't loaded yet or is in an error state: the browser would retain a position set
   * while there was no media and show the duration as changed.
   */
  seekBy(deltaSeconds: number): boolean {
    if (!this.session?.seekable) return false;
    if (!this.isVodPlayable()) return false;
    this.adapter.seek(Math.max(0, this.adapter.getCurrentTime() + deltaSeconds));
    return true;
  }

  /** Whether VOD is in a playable state (for seeking and the position/duration display). */
  isVodPlayable(): boolean {
    const st = this.state.status;
    return st === 'playing' || st === 'paused' || st === 'buffering';
  }

  togglePause(): void {
    if (this.state.status === 'error' && this.session?.retry()) return;
    if (this.adapter.isPaused()) {
      this.adapter.play();
      this.setState({ status: 'playing' });
    } else {
      this.adapter.pause();
      this.setState({ status: 'paused' });
    }
  }

  getCurrentItem(): MediaItem | null {
    return this.current;
  }

  /** For handing off the adapter to another screen (see release()/resumeLive()). */
  getAdapter(): PlayerAdapter {
    return this.adapter;
  }

  /** Closes the previous session and activates the new one. */
  private begin<T extends PlaybackSession>(session: T): T {
    this.endSession();
    this.session = session;
    this.current = session.item;
    return session;
  }

  private endSession(): void {
    this.session?.teardown();
    this.session = null;
  }

  private setState(s: PlayerControllerState): void {
    this.state = s;
    for (const fn of this.listeners) fn(s);
  }
}
