import { channelStepOf, isBackKey, isDiagnosticsKey, mediaKeyOf } from '../../keys.ts';
import type { MediaItem } from '../../../../core/src/types.ts';
import type { PlayerController } from '../../playerController.ts';
import type { Scrub } from './overlayScrub.ts';
import type { TrackMenu } from './overlayTrackMenu.ts';
import type { VodBar } from './overlayVodBar.ts';

export interface OverlayKeyDeps {
  controller: PlayerController;
  vodBar: VodBar;
  trackMenu: TrackMenu;
  scrub: Scrub;
  onBack: () => void;
  /** Up/Down while live: the target channel within the same category (null if none → no change). */
  onChannelStep?: (direction: 1 | -1) => MediaItem | null;
  /** Shows the bottom bar; if persistent=false it disappears after 5s. */
  showBar(persistent: boolean): void;
  /** Seeks by ±seconds and highlights the indicator. */
  seek(delta: number): void;
  /** Opens/closes the diagnostics panel. */
  toggleDiagnostics(): void;
}

/**
 * Key handling for the fullscreen player. Movie/series focus order: content (video; Left/Right ±10s, OK pauses) →
 * progress bar (scrub) → control row; while live, Up/Down changes channel. Media keys, the audio/subtitle menu,
 * and Back are always handled first regardless of state.
 */
export class OverlayKeyHandler {
  private readonly d: OverlayKeyDeps;
  /** Progress bar is focused (reached by pressing Down from the content). */
  private barFocused = false;

  constructor(deps: OverlayKeyDeps) {
    this.d = deps;
  }

  get trackFocus(): boolean {
    return this.barFocused;
  }

  /** Focus returns to the content when the bar closes. */
  resetTrackFocus(): void {
    this.barFocused = false;
  }

  /** Used as the `document` keydown listener (arrow function: keeps `this` bound). */
  readonly handle = (e: KeyboardEvent): void => {
    const { controller, trackMenu, scrub, onBack } = this.d;
    if (this.handleMediaKey(e)) return;
    if (trackMenu.handleKey(e)) return;
    if (isDiagnosticsKey(e)) {
      e.preventDefault();
      if (!e.repeat) this.d.toggleDiagnostics();
      return;
    }
    if (isBackKey(e)) {
      e.preventDefault();
      if (scrub.target !== null) {
        scrub.cancel(); // While scrubbing, Back only cancels the scrub; it does not exit the player
        return;
      }
      onBack();
      return;
    }
    if (controller.getCurrentItem()?.kind === 'live') {
      this.handleLive(e);
      return;
    }
    this.handleVod(e);
  };

  /** Remote media keys (Tizen: Play 415, Pause 19, Play/Pause 10252): pause/play on movies/series, retry on error. */
  private handleMediaKey(e: KeyboardEvent): boolean {
    const media = mediaKeyOf(e);
    if (!media) return false;
    const { controller, scrub, showBar } = this.d;
    e.preventDefault();
    if (controller.getCurrentItem()?.kind === 'live') return true;
    const status = controller.getState().status;
    const wantsPlay = status === 'paused' || status === 'error';
    if (media === 'toggle' || (media === 'play' && wantsPlay) || (media === 'pause' && !wantsPlay)) {
      if (scrub.target !== null) scrub.commit();
      controller.togglePause();
      showBar(false);
    }
    return true;
  }

  private handleLive(e: KeyboardEvent): void {
    const { controller, onChannelStep, showBar } = this.d;
    // On the remote, CH+ = next channel in the same category, CH− = previous channel. The arrow keys
    // (Up/Down) do not change channel; Down only opens the bottom bar (see the else-if below).
    const step = channelStepOf(e);
    if (step !== null) {
      e.preventDefault();
      showBar(false); // the bottom bar (channel name, resolution, connection) appears on keypress
      if (!e.repeat) {
        // Holding the key down (e.repeat) must not trigger repeated channel changes.
        const next = onChannelStep?.(step);
        if (next) void controller.playLive(next);
      }
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      showBar(false); // there's no pausing while live; OK or Down shows the bottom bar
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
    }
  }

  private handleVod(e: KeyboardEvent): void {
    const { controller, vodBar, scrub, showBar, seek } = this.d;
    // Movies/series: while the bar is visible, Down moves into the control row, Up leaves it.
    const barVisible = vodBar.isVisible();
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && scrub.target !== null) scrub.commit();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (vodBar.controlFocused) {
        // already on the buttons
      } else if (barVisible && this.barFocused) {
        vodBar.enterControls();
      } else {
        this.barFocused = true; // from content to the bar
      }
      showBar(false);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (vodBar.controlFocused) vodBar.leaveControls();
      else this.barFocused = false; // from the bar to content
      showBar(false);
      return;
    }
    if (vodBar.controlFocused && barVisible) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        vodBar.moveControl(1);
        showBar(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        vodBar.moveControl(-1);
        showBar(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        vodBar.activateControl();
        showBar(false);
      }
      return;
    }
    // Content selected: Left/Right skip ±10s, OK pauses/plays.
    if (!this.barFocused || !barVisible) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        seek(e.repeat ? 30 : 10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(e.repeat ? -30 : -10);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        controller.togglePause();
        showBar(false);
      }
      return;
    }
    // Bar selected: Left/Right move the target (holding the key increases the step), OK applies the pending scrub immediately.
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrub.by(e.repeat ? 30 : 10);
      showBar(false);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrub.by(e.repeat ? -30 : -10);
      showBar(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (scrub.target !== null) scrub.commit();
      else controller.togglePause();
      showBar(false);
    }
  }
}
