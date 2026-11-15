import { LiveWatchdog } from '../../../core/src/liveWatchdog.ts';
import type { MediaItem } from '../../../core/src/types.ts';
import type { PlayerStats } from '../playerAdapter.ts';
import { PlaybackSession } from './playbackSession.ts';
import type { PlaybackHost } from './playbackTypes.ts';

/**
 * Live playback session: reconnects with exponential backoff via LiveWatchdog on a drop/stall (waits without
 * burning attempts while offline, if a connectivity probe is available); unlike movies/shows there's no resume
 * position or scrubbing.
 */
export class LivePlayback extends PlaybackSession {
  private watchdog: LiveWatchdog | null = null;

  constructor(host: PlaybackHost, item: MediaItem) {
    super(host, item);
  }

  async start(): Promise<void> {
    const { host, item } = this;
    host.storage.setLastLive(item.id);
    host.setState({ status: 'loading' });
    this.attach();
    this.startLoadTimeout(() => this.onLoadTimeout('15 saniye içinde yayın başlatılamadı.'));
    try {
      await host.adapter.loadLive(item.url);
    } catch (err) {
      this.failIfBlocked(err);
    }
  }

  /**
   * Takes over a live stream that's already loaded and playing on another screen — `adapter.loadLive()` is NOT
   * called again (to avoid an unnecessary reload/buffering when switching between the preview and fullscreen);
   * only the watchdog/stats listeners are attached to this session and the status starts directly as 'playing'.
   */
  resume(): void {
    this.host.storage.setLastLive(this.item.id);
    this.host.setState({ status: 'playing' });
    this.attach();
  }

  override teardown(): void {
    this.watchdog?.stop();
    this.watchdog = null;
    super.teardown();
  }

  protected override onBlocked(): void {
    this.watchdog?.stop();
  }

  /**
   * Initial load timeout: if a connectivity probe is available this isn't a permanent error, it's handed off
   * to the watchdog's probe/retry loop instead (waits indefinitely while offline); otherwise an error is shown.
   */
  private onLoadTimeout(message: string): void {
    if (this.host.probe && this.watchdog) {
      this.watchdog.reportError();
      return;
    }
    this.watchdog?.stop();
    this.host.setState({ ...this.host.getState(), status: 'error', message });
  }

  private attach(): void {
    const { host, item } = this;
    const { adapter, probe } = host;
    this.watchdog = new LiveWatchdog({
      jitter: 0.3,
      reconnect: () => {
        host.setState({ ...host.getState(), status: 'reconnecting', message: undefined });
        void adapter.loadLive(item.url).catch(() => {});
      },
      onGiveUp: () => {
        host.setState({ ...host.getState(), status: 'error', message: 'Sağlayıcı sunucusuna ulaşılamıyor.' });
      },
      ...(probe
        ? {
            checkConnectivity: () => probe.check(item.url),
            onStatus: (st: 'offline' | 'source-down' | 'reconnecting') => {
              if (st === 'offline') {
                host.setState({ ...host.getState(), status: 'offline', message: 'İnternet bağlantısı yok, bağlantı bekleniyor...' });
              } else {
                host.setState({
                  ...host.getState(),
                  status: 'reconnecting',
                  message: st === 'source-down' ? 'Yayın sunucusuna ulaşılamıyor, yeniden deneniyor...' : undefined,
                });
              }
            },
          }
        : {}),
    });
    this.watchdog.start();

    this.unsubs.push(
      adapter.on('playing', () => {
        this.clearLoadTimeout();
        host.setState({ ...host.getState(), status: 'playing', message: undefined });
      }),
      adapter.on('timeupdate', () => {
        this.watchdog?.heartbeat();
        // Clear the warning if playback is progressing on its own (buffer caught up / connection recovered).
        const state = host.getState();
        if (state.status === 'offline' || state.status === 'reconnecting') {
          host.setState({ ...state, status: 'playing', message: undefined });
        }
      }),
      adapter.on('error', () => this.watchdog?.reportError()),
      adapter.on('stats', (...args) => host.setState({ ...host.getState(), stats: args[0] as PlayerStats })),
      ...this.buffering.listen(),
    );
  }
}
