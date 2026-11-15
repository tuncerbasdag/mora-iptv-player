import type { ConnectivityResult } from './connectivity.ts';

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000];

export interface LiveWatchdogOptions {
  /** Called when a reconnect attempt is triggered (should reopen the stream). */
  reconnect: () => void;
  /** Called once maxAttempts is exceeded; the watchdog stops itself automatically. */
  onGiveUp: () => void;
  /** If no heartbeat arrives for this long, it's counted as a stall. Default 10000. */
  stallTimeoutMs?: number;
  /** Interval at which the stall check runs. Default 2000. */
  checkIntervalMs?: number;
  /** The attempt counter resets after this much uninterrupted playback. Default 30000. */
  stableAfterMs?: number;
  /** Maximum number of attempts before giving up. Default 8. */
  maxAttempts?: number;
  /** Exponential backoff (ms) sequence; the last element is reused as the ceiling. */
  backoffMs?: number[];
  /**
   * If provided, connectivity is probed before every reconnect attempt (see connectivity.ts):
   * - 'offline': the attempt budget is NOT spent; polls at `offlinePollMs` intervals until the
   *   internet comes back (no time limit); once it does, the budget resets and it reconnects immediately.
   * - 'source-down' / 'ok': reconnects using the normal exponential backoff; once the budget is
   *   exhausted, instead of giving up (onGiveUp) it keeps retrying at `slowRetryMs` intervals.
   * If not provided, the old behavior applies: onGiveUp after maxAttempts.
   */
  checkConnectivity?: () => Promise<ConnectivityResult>;
  /** Called when the probing/reconnecting status changes (for a UI message). */
  onStatus?: (status: 'offline' | 'source-down' | 'reconnecting') => void;
  /** Poll intervals while offline (ms); the last element is reused. Default 3s, 5s, 10s. */
  offlinePollMs?: number[];
  /** Retry interval after the budget is exhausted while the internet is up but the source isn't responding. Default 30000. */
  slowRetryMs?: number;
  /**
   * Random jitter ratio applied to wait times (0-1): the duration varies by ±ratio. This keeps
   * many clients from reconnecting at the exact same moment after the same outage and hammering
   * the server again.
   * Default 0 (no jitter).
   */
  jitter?: number;
  /** Source of randomness (0-1); can be pinned in tests. Default Math.random. */
  random?: () => number;
}

/**
 * Live-stream outage management: fed externally via heartbeat()/reportError(), calls reconnect()
 * with exponential backoff on stall or error.
 * Unaware of the player/storage — it only carries the timing logic.
 */
export class LiveWatchdog {
  private attempts = 0;
  private lastHeartbeat = 0;
  private running = false;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while the probe/wait loop is running; stall and new error triggers are ignored during this time. */
  private recovering = false;
  /** Incremented on every recover() call; stale loops end themselves once canceled. */
  private recoverToken = 0;
  private pendingSleep: ((ok: boolean) => void) | null = null;
  private readonly opts: LiveWatchdogOptions;

  constructor(opts: LiveWatchdogOptions) {
    this.opts = opts;
  }

  start(): void {
    this.running = true;
    this.attempts = 0;
    this.lastHeartbeat = Date.now();
    this.clearStableTimer();
    const interval = this.opts.checkIntervalMs ?? 2000;
    this.checkTimer = setInterval(() => this.checkStall(), interval);
  }

  stop(): void {
    this.running = false;
    this.cancelRecovery();
    if (this.checkTimer) clearInterval(this.checkTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.clearStableTimer();
    this.checkTimer = null;
    this.reconnectTimer = null;
  }

  /** Must be called as playback progresses (e.g. via timeupdate). */
  heartbeat(): void {
    this.lastHeartbeat = Date.now();
    // If playback is continuing on its own (e.g. the connection returned before the buffer ran out), probing is unnecessary.
    if (this.recovering) this.cancelRecovery();
    if (this.attempts > 0 && !this.stableTimer) {
      const stableAfter = this.opts.stableAfterMs ?? 30000;
      this.stableTimer = setTimeout(() => {
        this.attempts = 0;
        this.stableTimer = null;
      }, stableAfter);
    }
  }

  /** Must be called immediately when the player errors (without waiting for a stall). */
  reportError(): void {
    if (!this.running) return;
    this.triggerReconnect();
  }

  private checkStall(): void {
    if (!this.running || this.recovering) return;
    const stallTimeout = this.opts.stallTimeoutMs ?? 10000;
    if (Date.now() - this.lastHeartbeat > stallTimeout) this.triggerReconnect();
  }

  private triggerReconnect(): void {
    this.clearStableTimer();
    if (this.opts.checkConnectivity) {
      if (!this.recovering) void this.recover();
      return;
    }
    const maxAttempts = this.opts.maxAttempts ?? 8;
    if (this.attempts >= maxAttempts) {
      this.stop();
      this.opts.onGiveUp();
      return;
    }
    const backoff = this.opts.backoffMs ?? DEFAULT_BACKOFF_MS;
    const delay = this.jittered(backoff[Math.min(this.attempts, backoff.length - 1)]);
    this.attempts++;
    // Don't let the stall check trigger again until the reconnect finishes.
    this.lastHeartbeat = Date.now();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) this.opts.reconnect();
    }, delay);
  }

  /**
   * Connectivity-aware reconnect: probe first; if there's no internet, wait indefinitely (without
   * spending the budget), otherwise wait out the backoff and call reconnect(). The loop ends as
   * soon as one attempt completes; if the stream drops again (error/stall) a new recover() starts.
   */
  private async recover(): Promise<void> {
    this.recovering = true;
    const token = ++this.recoverToken;
    const alive = (): boolean => this.running && this.recoverToken === token;
    const probe = this.opts.checkConnectivity!;
    const offlineSteps = this.opts.offlinePollMs ?? [3000, 5000, 10000];
    const maxAttempts = this.opts.maxAttempts ?? 8;
    const backoff = this.opts.backoffMs ?? DEFAULT_BACKOFF_MS;
    let offlineRounds = 0;
    let cameBack = false;

    for (;;) {
      const result = await probe().catch((): ConnectivityResult => 'source-down');
      if (!alive()) return;
      if (result === 'offline') {
        this.opts.onStatus?.('offline');
        cameBack = true;
        const wait = this.jittered(offlineSteps[Math.min(offlineRounds++, offlineSteps.length - 1)]);
        if (!(await this.sleep(wait, token))) return;
        continue;
      }
      if (cameBack) this.attempts = 0; // the internet came back: the budget is renewed
      this.opts.onStatus?.(result === 'source-down' ? 'source-down' : 'reconnecting');
      const delay = cameBack
        ? 0
        : this.jittered(
            this.attempts < maxAttempts
              ? backoff[Math.min(this.attempts, backoff.length - 1)]
              : (this.opts.slowRetryMs ?? 30000),
          );
      this.attempts++;
      if (!(await this.sleep(delay, token))) return;
      this.recovering = false;
      this.lastHeartbeat = Date.now();
      this.opts.reconnect();
      return;
    }
  }

  /** Randomly perturbs `ms` by ±jitter ratio; returns it unchanged if jitter is 0. */
  private jittered(ms: number): number {
    const j = this.opts.jitter ?? 0;
    if (j <= 0) return ms;
    const rand = (this.opts.random ?? Math.random)();
    return Math.round(ms * (1 + (rand * 2 - 1) * j));
  }

  private cancelRecovery(): void {
    this.recoverToken++;
    this.recovering = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.pendingSleep?.(false); // make sure the pending loop doesn't hang, let it end
    this.pendingSleep = null;
  }

  /** Cancelable wait: true if the duration elapsed, false if the loop was canceled. */
  private sleep(ms: number, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (ms <= 0) {
        resolve(this.running && this.recoverToken === token);
        return;
      }
      this.pendingSleep = resolve;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.pendingSleep = null;
        resolve(this.running && this.recoverToken === token);
      }, ms);
    });
  }

  private clearStableTimer(): void {
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
  }
}
