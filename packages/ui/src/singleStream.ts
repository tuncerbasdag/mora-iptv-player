import type { MediaTrack } from './mediaTracks.ts';
import {
  diagnosticsOf,
  EMPTY_DIAGNOSTICS,
  isPendingTrackCapable,
  pictureInPictureOf,
  tracksOf,
  type DiagnosticsCapable,
  type PendingTrackCapable,
  type PlayerAdapter,
  type PlayerAdapterEvent,
  type PictureInPictureCapable,
  type PlayerDiagnostics,
  type TrackCapable,
} from './playerAdapter.ts';

/** Delay (ms) required after a stream closes before the next one can open: lets the provider drop the closed connection. */
export const STREAM_COOLDOWN_MS = 600;
/** If no stream has been open for at least this long (ms), it's treated as a "cold start" and the account check runs. */
export const COLD_AFTER_MS = 45_000;

/** The stream failed to open because of provider rules (e.g. concurrent connection limit); the message can be shown to the user. */
export class StreamBlockedError extends Error {}

export interface SingleStreamGateOptions {
  /** Called on a cold start. If it returns text, the stream won't open (StreamBlockedError); if it returns null, it's allowed. */
  preflight?: () => Promise<string | null>;
  cooldownMs?: number;
  coldAfterMs?: number;
  now?: () => number;
}

/**
 * Prevents the app from opening more than one stream connection to the provider AT THE SAME TIME. All players are
 * wrapped with `wrap()`; before any of them starts a new stream, whichever stream is currently open (on the same or
 * a different player) is stopped, a short delay happens, and only then does the new one open. For overlapping
 * requests, only the most recent one opens.
 */
export class SingleStreamGate {
  private active: GuardedAdapter | null = null;
  private lastActivityAt = 0;
  private readonly opts: SingleStreamGateOptions;

  constructor(opts: SingleStreamGateOptions = {}) {
    this.opts = opts;
  }

  wrap(inner: PlayerAdapter): PlayerAdapter {
    return new GuardedAdapter(this, inner);
  }

  /** @internal */
  now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** @internal Stops whichever stream is open (regardless of who opened it) and records the time. */
  stopActive(except?: GuardedAdapter): void {
    const a = this.active;
    if (!a || a === except) return;
    a.stopInner();
    this.markStopped(a);
  }

  /** @internal */
  markStopped(a: GuardedAdapter): void {
    if (this.active === a) this.active = null;
    this.lastActivityAt = this.now();
  }

  /** @internal */
  markStarted(a: GuardedAdapter): void {
    this.active = a;
    this.lastActivityAt = this.now();
  }

  /** @internal */
  isActive(a: GuardedAdapter): boolean {
    return this.active === a;
  }

  /** @internal Waits until enough time has passed since the last close. */
  async cooldown(): Promise<void> {
    const wait = (this.opts.cooldownMs ?? STREAM_COOLDOWN_MS) - (this.now() - this.lastActivityAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  /** @internal Runs the account check on a cold start; returns the message if blocked. */
  async preflightIfCold(): Promise<string | null> {
    if (!this.opts.preflight || this.active) return null;
    const idle = this.now() - this.lastActivityAt;
    if (this.lastActivityAt !== 0 && idle < (this.opts.coldAfterMs ?? COLD_AFTER_MS)) return null;
    return this.opts.preflight();
  }
}

class GuardedAdapter implements PlayerAdapter, TrackCapable, PendingTrackCapable, DiagnosticsCapable, PictureInPictureCapable {
  /** Incremented on every new request and every stop; this is how stale pending requests get cancelled. */
  private ticket = 0;
  private destroyed = false;
  private readonly gate: SingleStreamGate;
  private readonly inner: PlayerAdapter;

  constructor(gate: SingleStreamGate, inner: PlayerAdapter) {
    this.gate = gate;
    this.inner = inner;
  }

  loadLive(url: string): Promise<void> {
    return this.start(() => this.inner.loadLive(url));
  }

  loadVod(url: string, resumeSeconds: number): Promise<void> {
    return this.start(() => this.inner.loadVod(url, resumeSeconds));
  }

  private async start(open: () => Promise<void>): Promise<void> {
    // A destroyed player must never open a stream again (e.g. a stale reconnect timer): it would play with sound but no picture.
    if (this.destroyed) return NEVER;
    // First stop whichever stream is open (on another player or this one): this also cancels that player's
    // pending requests. The ticket must be taken AFTER this, otherwise the request would cancel itself.
    this.gate.stopActive();
    const ticket = ++this.ticket;
    await this.gate.cooldown();
    if (ticket !== this.ticket) return NEVER;
    const blocked = await this.gate.preflightIfCold();
    if (ticket !== this.ticket) return NEVER;
    if (blocked) throw new StreamBlockedError(blocked);
    this.gate.markStarted(this);
    await open();
  }

  /** @internal */
  stopInner(): void {
    this.ticket++;
    this.inner.stop();
  }

  stop(): void {
    this.stopInner();
    this.gate.markStopped(this);
  }

  destroy(): void {
    this.destroyed = true;
    this.ticket++;
    this.inner.destroy();
    this.gate.markStopped(this);
  }

  play(): void {
    this.inner.play();
  }
  pause(): void {
    this.inner.pause();
  }
  seek(seconds: number): void {
    this.inner.seek(seconds);
  }
  getCurrentTime(): number {
    return this.inner.getCurrentTime();
  }
  getDuration(): number {
    return this.inner.getDuration();
  }
  isPaused(): boolean {
    return this.inner.isPaused();
  }
  moveTo(container: HTMLElement): void {
    this.inner.moveTo(container);
  }
  // Picture-in-Picture is passed through to the wrapped player (unsupported when it has none).
  isPictureInPictureSupported(): boolean {
    return pictureInPictureOf(this.inner) !== null;
  }
  togglePictureInPicture(): Promise<void> {
    return pictureInPictureOf(this.inner)?.togglePictureInPicture() ?? Promise.resolve();
  }
  onPictureInPictureChange(callback: (active: boolean) => void): () => void {
    return pictureInPictureOf(this.inner)?.onPictureInPictureChange(callback) ?? (() => {});
  }
  // Audio/subtitle tracks are passed through from the wrapped player unchanged (if the wrapper hid them, they'd never show up in the UI).
  getDiagnostics(): PlayerDiagnostics {
    return diagnosticsOf(this.inner) ?? EMPTY_DIAGNOSTICS;
  }
  getAudioTracks(): MediaTrack[] {
    return tracksOf(this.inner).getAudioTracks();
  }
  getAudioTrack(): number {
    return tracksOf(this.inner).getAudioTrack();
  }
  setAudioTrack(id: number): void {
    tracksOf(this.inner).setAudioTrack(id);
  }
  getSubtitleTracks(): MediaTrack[] {
    return tracksOf(this.inner).getSubtitleTracks();
  }
  getSubtitleTrack(): number {
    return tracksOf(this.inner).getSubtitleTrack();
  }
  setSubtitleTrack(id: number): void {
    tracksOf(this.inner).setSubtitleTrack(id);
  }
  // Passed through unchanged if the wrapped player supports it (AVPlay) — otherwise VodPlayback.changeTrack()
  // applies it instead via setAudioTrack/setSubtitleTrack once loading finishes.
  setPendingTracks(audioId: number, subtitleId: number): void {
    if (isPendingTrackCapable(this.inner)) this.inner.setPendingTracks(audioId, subtitleId);
  }
  on(event: PlayerAdapterEvent, handler: (...args: unknown[]) => void): () => void {
    return this.inner.on(event, handler);
  }
}

/**
 * A superseded load (cancelled because of a newer request or a stop) never resolves: since the caller has
 * already moved on to another stream, the stale request finishing as "success" or "error" shouldn't corrupt
 * its state.
 */
const NEVER: Promise<void> = new Promise(() => {});
