import type { ConnectivityProbe } from '../../../core/src/connectivity.ts';
import type { PlaybackStore, SettingsStore } from '../../../core/src/storage.ts';
import { DEFAULT_SETTINGS, type MediaItem } from '../../../core/src/types.ts';
import { backChevronSvg, fullscreenEnterIconSvg, fullscreenExitIconSvg, hasMouseSupport, isDesktopApp, pipIconSvg, onFullscreenChange, setWindowControlsVisible, toggleFullscreen } from '../mouseSupport.ts';
import { pictureInPictureOf, type PlayerAdapter } from '../playerAdapter.ts';
import { PlayerController, type PlayerControllerState } from '../playerController.ts';
import { DiagnosticsPanel } from './overlay/overlayDiagnostics.ts';
import { OverlayKeyHandler } from './overlay/overlayKeys.ts';
import { VodScrub } from './overlay/overlayScrub.ts';
import { createStatusLayer, type StatusLayer } from './overlay/overlayStatusLayer.ts';
import { TrackMenuController } from './overlay/overlayTrackMenu.ts';
import { createVodBar, type VodBar } from './overlay/overlayVodBar.ts';

/** How long the bottom bar (and the mouse Back button) stay visible before fading out. */
const BAR_VISIBLE_MS = 5000;

export interface PlayerOverlayCallbacks {
  onBack: () => void;
  /** To advance to the next one when an episode/movie ends in VOD (next episode for series). */
  onEnded?: () => void;
  /**
   * Channel change via Up/Down while live: given a direction (+1 down = next, -1 up = previous),
   * returns the target channel within the same category (null if none → no change).
   */
  onChannelStep?: (direction: 1 | -1) => MediaItem | null;
  /** Previous/next episode for series; the corresponding button is hidden if not provided. */
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
}

export interface PlayerOverlayHandle {
  controller: PlayerController;
  /**
   * If `keepAdapterAlive: true` is passed, the adapter is not stopped and destroyed — only this
   * screen's listeners are released (see PlayerController.release()). Used to hand off the same
   * live stream to another screen (e.g. returning to the Live TV preview) without reloading it.
   */
  destroy: (opts?: { keepAdapterAlive?: boolean }) => void;
}

/**
 * Player layer: the video area + status/error message overlay. `createAdapter` receives the video area's DOM
 * element (the platform mounts <video>/avplay onto it) — that's why PlayerAdapter/PlayerController are created
 * here, after the video area is set up. No scrubbing while live (HANDOFF); in VOD, left/right arrow ±10s, OK
 * pauses/plays.
 *
 * This class wires the pieces together and manages the bottom bar's visibility. The pieces live under `./overlay/`:
 * the status layer (live bottom bar, top loading banner, center message; overlayStatusLayer/overlayLoading), the
 * movie/series bar (overlayVodBar), scrubbing on the bar (overlayScrub), the audio/subtitle menu (overlayTrackMenu),
 * and key handling (overlayKeys).
 */
class PlayerOverlay implements PlayerOverlayHandle {
  readonly controller: PlayerController;
  private readonly cb: PlayerOverlayCallbacks;
  private readonly adapter: PlayerAdapter;
  private readonly statusLayer: StatusLayer;
  private readonly vodBar: VodBar;
  private readonly scrub: VodScrub;
  private readonly keys: OverlayKeyHandler;
  private readonly diagnostics: DiagnosticsPanel;
  private readonly offs: Array<() => void> = [];
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStatus: PlayerControllerState['status'] | null = null;
  /** Hidden immediately by a track selection: prevents the subsequent 'buffering' → 'playing' transitions
   * from reopening the bar (see hideBarForTrackChange/TrackMenuController.chooseMenuRow) — reset once 'playing' is reached. */
  private pendingTrackChangeHide = false;

  constructor(
    container: HTMLElement,
    storage: PlaybackStore & SettingsStore,
    createAdapter: (videoContainer: HTMLElement) => PlayerAdapter,
    cb: PlayerOverlayCallbacks,
    existingAdapter?: PlayerAdapter,
    probe?: ConnectivityProbe,
  ) {
    this.cb = cb;
    container.innerHTML = '';
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.style.padding = '0';
    screen.style.position = 'relative';

    const videoContainer = document.createElement('div');
    videoContainer.style.position = 'absolute';
    videoContainer.style.inset = '0';

    const statusLayer = createStatusLayer();
    this.statusLayer = statusLayer;
    this.vodBar = createVodBar({
      seek: (delta) => this.seek(delta),
      togglePause: () => this.controller.togglePause(),
      onPrevEpisode: cb.onPrevEpisode,
      onNextEpisode: cb.onNextEpisode,
      requestPaint: () => this.paintVod(),
    });
    this.vodBar.setSubtitleStyle(storage.getSettings().subtitleStyle ?? DEFAULT_SETTINGS.subtitleStyle);

    screen.append(
      videoContainer,
      statusLayer.loadingBanner,
      statusLayer.centerMsg,
      statusLayer.pausedBadge,
      this.vodBar.seekInd,
      this.vodBar.captionEl,
      this.vodBar.trackToastEl,
      statusLayer.bottomBar,
      this.vodBar.el,
    );
    container.append(screen);

    this.adapter = existingAdapter ?? createAdapter(videoContainer);
    if (existingAdapter) existingAdapter.moveTo(videoContainer);
    this.controller = new PlayerController(this.adapter, storage, probe);
    this.scrub = new VodScrub(this.controller, this.adapter, () => this.paintVod());
    this.diagnostics = new DiagnosticsPanel(this.adapter);
    screen.append(this.diagnostics.el);

    const trackMenu = new TrackMenuController({
      adapter: this.adapter,
      vodBar: this.vodBar,
      controller: this.controller,
      showBar: (persistent) => this.showBar(persistent),
      hideBar: () => this.hideBarForTrackChange(),
    });
    this.keys = new OverlayKeyHandler({
      controller: this.controller,
      vodBar: this.vodBar,
      trackMenu,
      scrub: this.scrub,
      onBack: cb.onBack,
      onChannelStep: cb.onChannelStep,
      showBar: (persistent) => this.showBar(persistent),
      seek: (delta) => this.seek(delta),
      toggleDiagnostics: () => this.diagnostics.toggle(),
    });

    this.offs.push(
      this.adapter.on('tracks', trackMenu.syncPills),
      this.adapter.on('subtitle', (text, duration) => {
        const t = String(text ?? '').replace(/<[^>]*>/g, '').trim(); // AVPlay text may contain tags: plain text is shown
        this.vodBar.showCaption(t, Math.max(1500, Number(duration) || 4000));
      }),
    );
    trackMenu.syncPills();
    this.offs.push(
      this.adapter.on('timeupdate', () => {
        if (this.vodBar.isVisible()) this.paintVod();
      }),
    );
    statusLayer.apply(this.controller.getState(), this.controller.getCurrentItem());
    this.offs.push(this.controller.on((state) => this.onControllerState(state)));
    document.addEventListener('keydown', this.keys.handle);
    // Web only (browser + Electron, not Tizen): mouse support. Moving the mouse reveals a Back button (top-left) and the bottom bar.
    if (hasMouseSupport()) this.setupMouse(screen);
  }

  /** Back + fullscreen buttons + mouse-move reveal (Electron only; remote/keyboard platforms never see it). */
  private setupMouse(screen: HTMLElement): void {
    const back = document.createElement('button');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = backChevronSvg(28);
    Object.assign(back.style, {
      position: 'absolute', top: '64px', left: '48px', width: '48px', height: '48px', borderRadius: '50%',
      border: '1.5px solid rgba(255,255,255,0.55)', background: 'transparent', color: '#fff', padding: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: '50', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.25s',
    });
    back.addEventListener('click', () => this.cb.onBack());
    screen.append(back);

    // Same look/behavior as Back (top-left), mirrored to the top-right; toggles the desktop window's
    // fullscreen (or the browser's Fullscreen API outside Electron).
    const fullscreen = document.createElement('button');
    fullscreen.type = 'button';
    fullscreen.setAttribute('aria-label', 'Fullscreen');
    fullscreen.innerHTML = fullscreenEnterIconSvg(24);
    Object.assign(fullscreen.style, {
      position: 'absolute', top: '64px', right: '48px', width: '48px', height: '48px', borderRadius: '50%',
      border: '1.5px solid rgba(255,255,255,0.55)', background: 'transparent', color: '#fff', padding: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: '50', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.25s',
    });
    fullscreen.addEventListener('click', () => toggleFullscreen());
    screen.append(fullscreen);

    // Picture-in-Picture (top-right, next to fullscreen): floats the picture in a small always-on-top window.
    // Desktop (Electron) app only, and only when the player supports it (never in the plain browser or on Tizen).
    const pip = isDesktopApp() ? pictureInPictureOf(this.adapter) : null;
    let pipBtn: HTMLButtonElement | null = null;
    if (pip) {
      pipBtn = document.createElement('button');
      pipBtn.type = 'button';
      pipBtn.setAttribute('aria-label', 'Picture in Picture');
      pipBtn.innerHTML = pipIconSvg(24);
      Object.assign(pipBtn.style, {
        position: 'absolute', top: '64px', right: '112px', width: '48px', height: '48px', borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,0.55)', background: 'transparent', color: '#fff', padding: '0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: '50', opacity: '0', pointerEvents: 'none', transition: 'opacity 0.25s',
      });
      pipBtn.addEventListener('click', () => void pip.togglePictureInPicture());
      screen.append(pipBtn);
    }
    const offFullscreenChange = onFullscreenChange((fs) => {
      fullscreen.innerHTML = fs ? fullscreenExitIconSvg(24) : fullscreenEnterIconSvg(24);
      fullscreen.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen');
    });
    this.offs.push(offFullscreenChange);
    setWindowControlsVisible(false); // window buttons are hidden during in-app fullscreen; revealed with the Back button

    let idle: ReturnType<typeof setTimeout> | null = null;
    let lastX = -1;
    let lastY = -1;
    const onMove = (e: MouseEvent): void => {
      if (e.screenX === lastX && e.screenY === lastY) return; // ignore synthetic moves (e.g. after a layout change)
      lastX = e.screenX;
      lastY = e.screenY;
      back.style.opacity = '1';
      back.style.pointerEvents = 'auto';
      fullscreen.style.opacity = '1';
      fullscreen.style.pointerEvents = 'auto';
      if (pipBtn) {
        pipBtn.style.opacity = '1';
        pipBtn.style.pointerEvents = 'auto';
      }
      setWindowControlsVisible(true);
      screen.style.cursor = '';
      // Don't override a persistent bar (loading/error/paused); only reveal the auto-hiding one while playing.
      if (this.controller.getState().status === 'playing') this.showBar(false);
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        back.style.opacity = '0';
        back.style.pointerEvents = 'none';
        fullscreen.style.opacity = '0';
        fullscreen.style.pointerEvents = 'none';
        if (pipBtn) {
          pipBtn.style.opacity = '0';
          pipBtn.style.pointerEvents = 'none';
        }
        setWindowControlsVisible(false);
        screen.style.cursor = 'none';
      }, BAR_VISIBLE_MS); // same duration as the bottom bar (see showBar) so both disappear together
    };
    document.addEventListener('mousemove', onMove);
    this.offs.push(() => {
      document.removeEventListener('mousemove', onMove);
      if (idle) clearTimeout(idle);
      setWindowControlsVisible(true); // leaving the player: window buttons return
    });
  }

  destroy = (opts?: { keepAdapterAlive?: boolean }): void => {
    this.clearHideTimer();
    this.statusLayer.destroy();
    this.diagnostics.destroy();
    for (const off of this.offs) off();
    this.vodBar.destroy();
    this.scrub.destroy();
    document.removeEventListener('keydown', this.keys.handle);
    if (opts?.keepAdapterAlive) {
      this.controller.release();
    } else {
      this.controller.stop();
      this.adapter.destroy();
    }
  };

  private onControllerState(state: PlayerControllerState): void {
    this.statusLayer.apply(state, this.controller.getCurrentItem());
    if (state.status === 'ended') this.cb.onEnded?.();
    // Only re-trigger the bar when the status actually CHANGES — since 'stats' updates every second
    // (status still 'playing'), without this check showBar(false) would be called repeatedly and keep
    // resetting the 5s hide countdown so it never finishes.
    if (state.status !== this.lastStatus) {
      // A track change hid the bar immediately: don't let the 'buffering' during reload and the subsequent
      // 'playing' reopen it (stay in fullscreen) — the flag is consumed once 'playing' is reached. If an
      // unexpected state arrives instead (e.g. an error), the flag drops and the bar returns to normal behavior.
      const swallow = this.pendingTrackChangeHide && (state.status === 'buffering' || state.status === 'playing');
      if (swallow) {
        if (state.status === 'playing') this.pendingTrackChangeHide = false;
      } else {
        this.pendingTrackChangeHide = false;
        if (state.status === 'loading' || state.status === 'buffering' || state.status === 'reconnecting' || state.status === 'offline' || state.status === 'error' || state.status === 'paused') {
          this.showBar(true);
        } else if (state.status === 'playing') {
          this.showBar(false);
        }
      }
    }
    this.lastStatus = state.status;
    if (this.vodBar.isVisible()) this.paintVod();
  }

  private isLive(): boolean {
    return this.controller.getCurrentItem()?.kind === 'live';
  }

  private clearHideTimer(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  /** persistent=true: stays until the issue is resolved. false: disappears on its own after 5s. */
  private showBar(persistent: boolean): void {
    this.clearHideTimer();
    // Channel/stats bar while live, player bar for movies/series.
    const vod = !this.isLive();
    const bar = vod ? this.vodBar.el : this.statusLayer.bottomBar;
    (vod ? this.statusLayer.bottomBar : this.vodBar.el).style.display = 'none';
    bar.style.display = 'flex';
    bar.style.opacity = '1';
    if (vod) {
      this.paintVod();
      this.vodBar.setCaptionBarOpen(true);
    }
    if (!persistent) {
      this.hideTimer = setTimeout(() => {
        bar.style.opacity = '0';
        this.hideTimer = setTimeout(() => {
          bar.style.display = 'none';
          this.keys.resetTrackFocus();
          this.vodBar.leaveControls();
          if (vod) this.vodBar.setCaptionBarOpen(false);
        }, 600);
      }, BAR_VISIBLE_MS);
    }
  }

  /** Hides the bar immediately when audio/subtitle is selected, instead of waiting for the 5s timer (focus
   * returns to fullscreen); sets a flag so that once the selection finishes, 'buffering'/'playing' transitions
   * don't reopen the bar (see onControllerState). */
  private hideBarForTrackChange(): void {
    this.clearHideTimer();
    this.vodBar.el.style.opacity = '0';
    this.vodBar.el.style.display = 'none';
    this.keys.resetTrackFocus();
    this.vodBar.leaveControls();
    this.vodBar.setCaptionBarOpen(false);
    this.pendingTrackChangeHide = true;
  }

  /** Updates the movie/series bar. */
  private paintVod(): void {
    const item = this.controller.getCurrentItem();
    if (!item || item.kind === 'live') return;
    const playable = this.controller.isVodPlayable();
    const state = this.controller.getState();
    this.vodBar.paint({
      item,
      duration: this.adapter.getDuration(),
      playable,
      currentTime: playable ? this.adapter.getCurrentTime() : 0,
      scrubTarget: this.scrub.target,
      scrubFrom: this.scrub.from,
      trackFocus: this.keys.trackFocus,
      status: state.status,
      stats: state.stats,
    });
  }

  /** Seeks by ±10s and briefly highlights the indicator (and the relevant button). */
  private seek(delta: number): void {
    if (!this.controller.seekBy(delta)) return; // no seeking if the video hasn't loaded/there's an error, so no indicator either
    this.vodBar.flashSeek(delta);
  }
}

/** Sets up the fullscreen player; closed using the returned handle. */
export function renderPlayerOverlay(
  container: HTMLElement,
  storage: PlaybackStore & SettingsStore,
  createAdapter: (videoContainer: HTMLElement) => PlayerAdapter,
  cb: PlayerOverlayCallbacks,
  /** If provided, no new adapter is created — this already-playing adapter is moved here
   * (see moveTo), without reloading. Used when going from the Live TV preview to fullscreen. */
  existingAdapter?: PlayerAdapter,
  /** For connectivity probing during a live stream interruption (see connectivity.ts); falls back to the old behavior if not provided. */
  probe?: ConnectivityProbe,
): PlayerOverlayHandle {
  return new PlayerOverlay(container, storage, createAdapter, cb, existingAdapter, probe);
}
