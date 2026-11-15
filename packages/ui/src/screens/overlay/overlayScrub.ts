import type { PlayerAdapter } from '../../playerAdapter.ts';
import type { PlayerController } from '../../playerController.ts';

/** If the scrub target stays unchanged for this long, it's applied automatically. */
const SCRUB_COMMIT_MS = 700;

export interface Scrub {
  /** Target position (s) while scrubbing; null otherwise. */
  readonly target: number | null;
  /** The playback position (s) when scrubbing started. */
  readonly from: number;
  /** Moves the target by ±delta seconds; applied shortly after. Seeks directly if the duration is unknown. */
  by(delta: number): void;
  /** Applies the pending scrub immediately. */
  commit(): void;
  /** Discards the pending scrub without applying it. */
  cancel(): void;
  destroy(): void;
}

/**
 * Scrubbing on the bar: Left/Right move the target; it's applied shortly after or via OK, Back cancels it.
 * `repaint` repaints the bar whenever the target changes.
 */
export class VodScrub implements Scrub {
  private readonly controller: PlayerController;
  private readonly adapter: PlayerAdapter;
  private readonly repaint: () => void;
  private scrubTarget: number | null = null;
  private scrubFrom = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(controller: PlayerController, adapter: PlayerAdapter, repaint: () => void) {
    this.controller = controller;
    this.adapter = adapter;
    this.repaint = repaint;
  }

  get target(): number | null {
    return this.scrubTarget;
  }

  get from(): number {
    return this.scrubFrom;
  }

  by(delta: number): void {
    if (!this.controller.isVodPlayable()) return; // no scrubbing if the video hasn't loaded
    const dur = this.adapter.getDuration();
    if (dur <= 0) {
      this.controller.seekBy(delta); // duration unknown: seek directly without a preview
      return;
    }
    if (this.scrubTarget === null) {
      this.scrubFrom = this.adapter.getCurrentTime();
      this.scrubTarget = this.scrubFrom;
    }
    this.scrubTarget = Math.max(0, Math.min(dur, this.scrubTarget + delta));
    this.clearTimer();
    this.timer = setTimeout(() => this.commit(), SCRUB_COMMIT_MS);
    this.repaint();
  }

  commit(): void {
    this.clearTimer();
    if (this.scrubTarget !== null) this.adapter.seek(this.scrubTarget);
    this.scrubTarget = null;
    this.repaint();
  }

  cancel(): void {
    this.clearTimer();
    this.scrubTarget = null;
    this.repaint();
  }

  destroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
