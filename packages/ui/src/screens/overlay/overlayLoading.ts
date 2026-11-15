import { createLoadEstimator, type LoadProgressHandle } from '../../loadProgress.ts';
import type { PlayerControllerState } from '../../playerController.ts';

export interface LoadingBanner {
  /** Shows/updates/hides the banner from controller state + the message to display (empty hides it). */
  apply(state: PlayerControllerState, message: string): void;
  /** Releases the timers and hides the banner. */
  stop(): void;
}

/**
 * Top status banner driving a small ring icon + its own "%N" text (see overlayStatusLayer.ts): 'loading'
 * (initial load) and 'reconnecting'/'offline' (duration unknown) use a timed estimate that slows down as it
 * approaches 90% (or the real buffer percentage if that's higher); 'buffering' (stalling during playback) uses
 * the actual buffer fill percentage. On 'playing' the ring completes to 100% and holds briefly before hiding,
 * instead of cutting off abruptly.
 */
export class BannerLoadingIndicator implements LoadingBanner {
  private readonly bannerEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly percentEl: HTMLElement;
  private readonly ring: LoadProgressHandle;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** The real buffer percentage reported by the player; otherwise the ring advances on a timer (relative to 15s). */
  private bufferPercent: number | undefined;

  constructor(bannerEl: HTMLElement, textEl: HTMLElement, percentEl: HTMLElement, ring: LoadProgressHandle) {
    this.bannerEl = bannerEl;
    this.textEl = textEl;
    this.percentEl = percentEl;
    this.ring = ring;
  }

  apply(state: PlayerControllerState, message: string): void {
    if (state.status === 'loading' || state.status === 'reconnecting' || state.status === 'offline') {
      // Duration is unknown: an estimate that slows down over time (or the real buffer percentage if higher).
      this.show(message);
      this.bufferPercent = state.status === 'loading' ? state.bufferPercent : undefined;
      if (!this.timer) {
        const estimate = createLoadEstimator();
        this.setPercent(0);
        this.timer = setInterval(() => {
          this.setPercent(estimate(this.bufferPercent ?? null));
        }, 150);
      }
    } else if (state.status === 'buffering') {
      // Stalling during playback: the ring reflects the buffer's actual fill percentage.
      this.show(message);
      this.clearTimer();
      this.setPercent(state.bufferPercent ?? 0);
    } else if (state.status === 'playing') {
      this.finish();
    } else {
      this.hide();
    }
  }

  stop(): void {
    this.hide();
  }

  private show(message: string): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.bannerEl.style.display = 'flex';
    this.textEl.textContent = message;
  }

  private setPercent(pct: number): void {
    this.ring.setPercent(pct);
    this.percentEl.textContent = `%${Math.round(Math.max(0, Math.min(100, pct)))}`;
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private hide(): void {
    this.clearTimer();
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.bannerEl.style.display = 'none';
  }

  /** When loading finishes successfully, instead of hiding the banner abruptly, first complete it to 100%,
   * show it briefly, then hide it — this gives a sense of completion rather than an abrupt cut. */
  private finish(): void {
    if (!this.timer && this.bannerEl.style.display === 'none') return;
    this.clearTimer();
    this.setPercent(100);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.bannerEl.style.display = 'none';
    }, 500);
  }
}
