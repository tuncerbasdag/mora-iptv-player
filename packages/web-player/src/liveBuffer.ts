/**
 * Dynamic buffer for live playback: low latency at first, about 5s of buffer if the network fluctuates, back
 * to low latency once it settles down.
 *
 * Rules:
 * - 'low'   : after an interruption, playback resumes once ~2s is buffered (default, low latency).
 * - 'stable': switched to if `stallsToStabilize` interruptions happen within a short window (`stallWindowMs`); the resume threshold becomes ~5s.
 * - Reverts to 'low' after `calmMs` has passed without interruptions.
 * - A hold lasts at most `maxHoldMs`: if the network is slower than the stream's bitrate the buffer never fills;
 *   in that case playback continues with whatever is available (otherwise there'd be a long freeze mistaken for a dropped stream, triggering an unnecessary reconnect).
 * - Latency does NOT stack: the resume threshold is fixed (5s), it's not "+5s per interruption". Also, if playback
 *   falls more than `maxAheadSeconds` behind the end of the buffer (e.g. the provider sends data faster than real
 *   stream speed), it catches back up toward live — not with a hard `seek`, but with a brief, mild speed-up
 *   (`CATCH_UP_RATE`); a seek creates a visible freeze/jump while the speed-up goes unnoticed and keeps latency
 *   from growing past the limit either way.
 */

export type BufferMode = 'low' | 'stable';

export interface LiveBufferConfig {
  /** Buffer needed to resume after an interruption in 'low' mode (s). */
  lowSeconds: number;
  /** Buffer needed to resume in 'stable' mode (s) = the targeted maximum latency. */
  stableSeconds: number;
  /** Jump toward live if the buffer grows past this (s). */
  maxAheadSeconds: number;
  /** This many interruptions... */
  stallsToStabilize: number;
  /** ...within this time window switches to 'stable' (ms). */
  stallWindowMs: number;
  /** Reverts to 'low' after this much time passes without an interruption (ms). */
  calmMs: number;
  /** Playback is held for at most this long (ms); must be shorter than LiveWatchdog's drop threshold (10s). */
  maxHoldMs: number;
}

export const DEFAULT_LIVE_BUFFER: LiveBufferConfig = {
  lowSeconds: 2,
  stableSeconds: 5,
  maxAheadSeconds: 8,
  stallsToStabilize: 1,
  stallWindowMs: 60_000,
  calmMs: 180_000,
  maxHoldMs: 6_000,
};

/** Decides which threshold applies in which mode (pure logic; the clock is injected, fixed in tests). */
export class LiveBufferPolicy {
  private readonly config: LiveBufferConfig;
  private readonly now: () => number;
  private stalls: number[] = [];
  private lastStallAt = Number.NEGATIVE_INFINITY;
  private current: BufferMode = 'low';
  private total = 0;

  constructor(config: LiveBufferConfig = DEFAULT_LIVE_BUFFER, now: () => number = Date.now) {
    this.config = config;
    this.now = now;
  }

  get mode(): BufferMode {
    return this.current;
  }

  /** Total interruption count so far for this player (diagnostics). */
  get totalStalls(): number {
    return this.total;
  }

  /** Resume threshold (s) for the current mode. */
  resumeSeconds(): number {
    return this.current === 'stable' ? this.config.stableSeconds : this.config.lowSeconds;
  }

  maxAheadSeconds(): number {
    return this.config.maxAheadSeconds;
  }

  maxHoldMs(): number {
    return this.config.maxHoldMs;
  }

  /** Playback stalled due to buffering. */
  recordStall(): void {
    this.total++;
    const t = this.now();
    this.lastStallAt = t;
    this.stalls = this.stalls.filter((s) => t - s <= this.config.stallWindowMs);
    this.stalls.push(t);
    if (this.stalls.length >= this.config.stallsToStabilize && this.current !== 'stable') {
      this.current = 'stable';
    }
  }

  /** Called regularly: reverts to 'low' if no interruption has happened for a long time. */
  update(): void {
    if (this.current === 'stable' && this.now() - this.lastStallAt >= this.config.calmMs) {
      this.current = 'low';
      this.stalls = [];
    }
  }
}

/** The `<video>` surface the controller needs (a fake object is passed in DOM-less tests). */
export interface BufferedVideo {
  readonly paused: boolean;
  /** Buffer ahead of the playback position (s). */
  aheadSeconds(): number;
  /** End of the buffered range the playback position is in (s). */
  bufferedEnd(): number;
  pause(): void;
  play(): void;
  /** Playback rate (1 = normal). When the buffer grows too large, it catches up toward live with a brief
   * speed-up instead of a hard `seek` (no visible freeze/jump). */
  setPlaybackRate(rate: number): void;
}

/** Catch-up speed toward live once the buffer grows past maxAheadSeconds; unlike a hard seek, doesn't freeze the screen. */
const CATCH_UP_RATE = 1.15;

/**
 * Holds playback on an interruption and resumes once the policy's threshold is met; if the buffer grows too
 * large, catches up toward live with a mild speed increase (not a hard seek). `tick()` should be called about every 200ms.
 */
export class LiveBufferController {
  private readonly video: BufferedVideo;
  private readonly policy: LiveBufferPolicy;
  private readonly now: () => number;
  private hold = false;
  private holdStartedAt = 0;
  private catchingUp = false;

  constructor(video: BufferedVideo, policy: LiveBufferPolicy, now: () => number = Date.now) {
    this.video = video;
    this.policy = policy;
    this.now = now;
  }

  /** Is playback currently held by us (not the user)? */
  get holding(): boolean {
    return this.hold;
  }

  resumeSeconds(): number {
    return this.policy.resumeSeconds();
  }

  /**
   * The FIRST frame of the stream arrived. If the buffer is still below the threshold, playback is held (so
   * it doesn't start on the first frame and immediately stutter "step by step"); resumes once the threshold
   * is met. Not counted as an interruption (doesn't affect the mode). Returns true if a hold started.
   */
  onFirstFrame(): boolean {
    const ahead = this.video.aheadSeconds();
    const threshold = this.policy.resumeSeconds();
    if (this.video.paused || ahead >= threshold) return false;
    this.hold = true;
    this.holdStartedAt = this.now();
    this.video.pause();
    return true;
  }

  /** The video went 'waiting' (after the first frame arrived). Returns true if a hold started. */
  onWaiting(): boolean {
    this.policy.recordStall();
    const ahead = this.video.aheadSeconds();
    const threshold = this.policy.resumeSeconds();
    if (this.video.paused || ahead >= threshold) return false;
    this.stopCatchUp();
    this.hold = true;
    this.holdStartedAt = this.now();
    this.video.pause();
    return true;
  }

  tick(): void {
    this.policy.update();
    if (this.hold) {
      if (!this.video.paused) {
        this.hold = false; // something else (e.g. the player library) started playback itself
      } else if (this.video.aheadSeconds() >= this.policy.resumeSeconds() || this.now() - this.holdStartedAt >= this.policy.maxHoldMs()) {
        this.hold = false;
        this.video.play();
      }
      return;
    }
    const ahead = this.video.aheadSeconds();
    if (this.catchingUp) {
      if (this.video.paused || ahead <= this.policy.resumeSeconds()) {
        this.stopCatchUp();
      }
      return;
    }
    if (!this.video.paused && ahead > this.policy.maxAheadSeconds()) {
      this.catchingUp = true;
      this.video.setPlaybackRate(CATCH_UP_RATE);
    }
  }

  private stopCatchUp(): void {
    if (!this.catchingUp) return;
    this.catchingUp = false;
    this.video.setPlaybackRate(1);
  }

  /** The user hit play/pause or the stream changed: drop any hold and catch-up. */
  cancel(): void {
    this.hold = false;
    this.stopCatchUp();
  }
}
