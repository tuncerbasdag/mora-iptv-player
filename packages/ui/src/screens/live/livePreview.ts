import { LiveWatchdog } from '../../../../core/src/liveWatchdog.ts';
import type { MediaItem } from '../../../../core/src/types.ts';
import type { ConnectivityProbe } from '../../../../core/src/connectivity.ts';
import { createLoadEstimator } from '../../loadProgress.ts';
import type { PlayerAdapter, PlayerStats } from '../../playerAdapter.ts';
import { LOAD_TIMEOUT_MS } from '../../playerController.ts';
import { StreamBlockedError } from '../../singleStream.ts';
import type { PreviewCardView } from './livePreviewCard.ts';

export interface PreviewResume {
  item: MediaItem;
  /** The adapter already playing — moved into the preview box via moveTo(), not reloaded. */
  adapter: PlayerAdapter;
}

export interface PreviewControllerDeps {
  view: PreviewCardView;
  createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter;
  /** Handed off to move an already-loaded stream; the caller must NOT call loadLive() again. */
  onFullscreen: (item: MediaItem, adapter: PlayerAdapter) => void;
  /** If provided, preview dropout tracking probes connectivity (see LiveWatchdog.checkConnectivity). */
  connectivity?: ConnectivityProbe;
  /** Called when the playing/failed channel changes (so the list highlight and card get re-rendered). */
  onStateChange: () => void;
}

export interface PreviewController {
  /** The channel currently playing in the preview (null if it failed to open). */
  readonly item: MediaItem | null;
  /** The channel that failed to open on the last attempt: its name stays on the card (cleared on a new selection). */
  readonly failedItem: MediaItem | null;
  /** The playing channel's position number in the list (0 = none). */
  readonly number: number;
  /** Opens the channel in the preview (a loading spinner until the first frame arrives, an error if it doesn't within 15s). */
  start(item: MediaItem, number: number): Promise<void>;
  /** On return from fullscreen: moves the already-playing adapter into the preview box without reloading it. */
  resume(r: PreviewResume, number: number): void;
  /** Hands off the channel already playing in the preview to fullscreen without reloading it. */
  goFullscreen(item: MediaItem): void;
  /** When the screen closes, drops the timers, the watchdog, and (unless handed off to fullscreen) the player. */
  destroy(): void;
}

/**
 * Preview playback logic: loads the channel, manages the loading spinner and the 15s timeout, shows a
 * stall spinner while playing, reconnects on dropout (LiveWatchdog), and hands off to fullscreen.
 * The view lives in livePreviewCard.ts; this class only touches the DOM via `view`.
 */
export class LivePreviewController implements PreviewController {
  private readonly view: PreviewCardView;
  private readonly createPlayerAdapter: (videoContainer: HTMLElement) => PlayerAdapter;
  private readonly onFullscreen: (item: MediaItem, adapter: PlayerAdapter) => void;
  private readonly connectivity: ConnectivityProbe | undefined;
  private readonly onStateChange: () => void;

  private previewNumber = 0;
  private previewingItem: MediaItem | null = null;
  /** The channel that failed to open on the last attempt: its name stays on the card, an error state shows in the video area (cleared on a new selection). */
  private failed: MediaItem | null = null;
  private adapter: PlayerAdapter | null = null;
  private statsUnsub: (() => void) | null = null;
  /** True once ownership of the adapter has been handed off via onFullscreen — so destroy() doesn't
   * stop and dispose of the adapter (it was moved to fullscreen and must not be reloaded). */
  private handedOff = false;
  private loadTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private progressHideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the first frame has ever arrived for the current channel: "waiting" events before it count as
   * connecting ("Connecting"), those after it count as a real dropout ("Stalling"). */
  private everPlayed = false;

  // Preview dropout tracking: if the stream stalls or errors after the first frame has arrived, it reconnects
  // with exponential backoff (as in fullscreen); if it gives up, the info box shows "stream dropped".
  private watchdog: LiveWatchdog | null = null;
  private watchOffs: Array<() => void> = [];

  /** If buffering runs out while the preview is playing (outside the initial load), the spinner shows the buffer's fill percentage. */
  private cancelWait: (() => void) | null = null;
  private buffering = false;
  private bufferingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: PreviewControllerDeps) {
    this.view = deps.view;
    this.createPlayerAdapter = deps.createPlayerAdapter;
    this.onFullscreen = deps.onFullscreen;
    this.connectivity = deps.connectivity;
    this.onStateChange = deps.onStateChange;
  }

  get item(): MediaItem | null {
    return this.previewingItem;
  }

  get failedItem(): MediaItem | null {
    return this.failed;
  }

  get number(): number {
    return this.previewNumber;
  }

  async start(item: MediaItem, number: number): Promise<void> {
    const { view } = this;
    this.previewNumber = number;
    this.failed = null;
    this.previewingItem = item;
    // The channel name is now shown in the card's top row — this overlay text over the video
    // was disabled per a user request (it's still used only for error messages, see the
    // timeout/catch branches below).
    view.setLabel('');
    view.clearStats();
    view.setConn('connecting');
    this.everPlayed = false;
    this.onStateChange();
    view.setFocusable(false);
    if (!this.adapter) {
      this.adapter = this.createPlayerAdapter(view.videoContainer);
      this.attachStatsListener(this.adapter);
    }
    const adapter = this.adapter;

    this.stopWatchdog();
    // Don't let listeners from a previous (unfinished) channel load interfere with the new one.
    this.cancelWait?.();
    this.clearLoadTimers();
    view.setProgressVisible(true);
    view.progress.setPercent(0);
    // The spinner advances along a curve that slows over time, showing the real buffer percentage instead if it's higher.
    const estimate = createLoadEstimator();
    let loadBufferPercent: number | null = null;
    const offProgress = adapter.on('bufferprogress', (...args) => {
      loadBufferPercent = Number(args[0]) || 0;
    });
    this.loadTimer = setInterval(() => {
      view.progress.setPercent(estimate(loadBufferPercent));
    }, 150);
    // Success = the stream's FIRST FRAME has arrived ('playing'); loadLive() resolving only means
    // the player has been set up. Previously the spinner would jump to 100% and close at that
    // point while the picture itself arrived seconds later. If the first frame doesn't arrive
    // within 15 seconds it's treated as an error (the `settled` flag prevents a race).
    let settled = false;
    let offPlaying: (() => void) | null = null;
    const finish = (): void => {
      offProgress();
      offPlaying?.();
    };
    offPlaying = adapter.on('playing', () => {
      if (settled) return;
      settled = true;
      finish();
      this.finishLoadTimers();
      if (this.adapter) this.startWatchdog(this.adapter, item);
      view.setFocusable(true);
    });
    this.cancelWait = () => {
      settled = true;
      finish();
    };
    this.timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      finish();
      this.clearLoadTimers();
      this.fail(item, '15 saniye içinde yayın başlatılamadı.');
    }, LOAD_TIMEOUT_MS);

    try {
      await adapter.loadLive(item.url);
    } catch (err) {
      if (settled) return;
      settled = true;
      finish();
      this.clearLoadTimers();
      // Provider blocks, such as the account being in use on another device, are shown with their explicit message.
      this.fail(item, err instanceof StreamBlockedError ? err.message : 'Yayın yüklenemedi.');
    }
  }

  resume(r: PreviewResume, number: number): void {
    this.adapter = r.adapter;
    this.handedOff = false;
    r.adapter.moveTo(this.view.videoContainer);
    this.attachStatsListener(r.adapter);
    this.everPlayed = true; // was already playing in fullscreen, not counted as "connecting" again
    this.failed = null;
    this.previewingItem = r.item;
    this.startWatchdog(r.adapter, r.item); // preview tracking restarts on return from fullscreen
    this.previewNumber = number;
    this.view.setLabel('');
    this.view.setFocusable(true);
    this.onStateChange();
  }

  goFullscreen(item: MediaItem): void {
    if (!this.adapter || this.handedOff) return; // a double click must not hand the adapter off twice
    this.stopWatchdog(); // the fullscreen PlayerController sets up its own watchdog
    // A load still waiting for its first frame must not act after the handoff: its 'playing' listener would start
    // a watchdog on this (soon destroyed) preview, which later reloads the stream on the destroyed player (audio with no picture).
    this.cancelWait?.();
    this.cancelWait = null;
    this.clearLoadTimers();
    this.statsUnsub?.();
    this.statsUnsub = null;
    this.handedOff = true;
    this.onFullscreen(item, this.adapter);
  }

  destroy(): void {
    this.cancelWait?.();
    this.cancelWait = null;
    this.clearLoadTimers();
    this.stopWatchdog();
    this.statsUnsub?.();
    if (!this.handedOff) {
      this.adapter?.stop();
      this.adapter?.destroy();
    }
  }

  // ---- Preview dropout tracking

  private stopWatchdog(): void {
    this.watchdog?.stop();
    this.watchdog = null;
    for (const off of this.watchOffs) off();
    this.watchOffs = [];
  }

  private startWatchdog(adapter: PlayerAdapter, item: MediaItem): void {
    this.stopWatchdog();
    const { view, connectivity } = this;
    const wd = new LiveWatchdog({
      jitter: 0.3,
      // If a connectivity probe is provided (as in fullscreen), instead of giving up once attempts run out it keeps
      // retrying at a slow interval; attempts aren't spent while there's no internet. This way, the preview
      // recovers on its own once the stream comes back.
      ...(connectivity ? { checkConnectivity: () => connectivity.check(item.url) } : {}),
      reconnect: () => {
        view.setConn('slow');
        void adapter.loadLive(item.url).catch(() => {});
      },
      onGiveUp: () => {
        view.setConn('lost');
        view.setLabel(`${item.name} — yayın koptu`);
      },
    });
    this.watchdog = wd;
    wd.start();
    this.watchOffs = [
      adapter.on('timeupdate', () => wd.heartbeat()),
      // The "stream dropped" text is only cleared once the picture actually comes back ('playing'); time events
      // arriving during a reload shouldn't clear it immediately.
      adapter.on('playing', () => {
        if (view.getLabel()) view.setLabel('');
      }),
      adapter.on('error', () => wd.reportError()),
    ];
  }

  // ---- Player events -> card

  private attachStatsListener(adapter: PlayerAdapter): void {
    const { view } = this;
    const offs = [
      adapter.on('stats', (...args) => {
        view.setStats(args[0] as PlayerStats);
      }),
      adapter.on('playing', () => {
        this.everPlayed = true;
        view.setConn('ok');
        this.endBuffering();
      }),
      adapter.on('buffering', () => {
        // If the first frame has never arrived (during startup) this is "connecting"; dropouts after it are "stalling".
        view.setConn(this.everPlayed ? 'slow' : 'connecting');
        this.beginBuffering();
      }),
      adapter.on('bufferprogress', (...args) => {
        if (this.buffering) view.progress.setPercent(Number(args[0]) || 0);
      }),
      adapter.on('error', () => {
        view.setConn('lost');
        this.endBuffering();
      }),
    ];
    this.statsUnsub = () => offs.forEach((off) => off());
  }

  private beginBuffering(): void {
    // The initial load has its own spinner/timer; show nothing if the stall is too brief.
    if (this.loadTimer || !this.previewingItem || this.buffering || this.bufferingTimer) return;
    this.bufferingTimer = setTimeout(() => {
      this.bufferingTimer = null;
      if (!this.previewingItem || this.loadTimer) return;
      this.buffering = true;
      if (this.progressHideTimer) clearTimeout(this.progressHideTimer);
      this.progressHideTimer = null;
      this.view.setProgressVisible(true);
      this.view.progress.setPercent(0);
    }, 400);
  }

  private endBuffering(): void {
    if (this.bufferingTimer) clearTimeout(this.bufferingTimer);
    this.bufferingTimer = null;
    if (!this.buffering) return;
    this.buffering = false;
    this.view.progress.setPercent(100);
    this.hideProgressSoon();
  }

  // ---- Loading timers

  private clearLoadTimers(): void {
    this.buffering = false;
    if (this.bufferingTimer) clearTimeout(this.bufferingTimer);
    this.bufferingTimer = null;
    if (this.loadTimer) clearInterval(this.loadTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.progressHideTimer) clearTimeout(this.progressHideTimer);
    this.loadTimer = null;
    this.timeoutTimer = null;
    this.progressHideTimer = null;
    this.view.setProgressVisible(false);
  }

  /** When loading finishes successfully, instead of abruptly hiding the bar, it first completes it to
   * 100%, shows it briefly, then hides it — giving a sense of completion rather than an abrupt cutoff. */
  private finishLoadTimers(): void {
    if (this.loadTimer) clearInterval(this.loadTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.loadTimer = null;
    this.timeoutTimer = null;
    this.view.progress.setPercent(100);
    this.hideProgressSoon();
  }

  private hideProgressSoon(): void {
    this.progressHideTimer = setTimeout(() => {
      this.progressHideTimer = null;
      this.view.setProgressVisible(false);
    }, 500);
  }

  /** The channel failed to open: its name stays on the card, the video area shows the error state and reason. */
  private fail(item: MediaItem, reason: string): void {
    this.view.setLabel(reason);
    this.previewingItem = null;
    this.failed = item;
    this.onStateChange();
  }
}
