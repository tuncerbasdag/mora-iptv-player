import { parseAvplayStats, type AvplayStreamInfo } from '../../../packages/ui/src/avplayStats.ts';
import { parseAvplayTracks, type AvplayTrackInfo, type MediaTrack } from '../../../packages/ui/src/mediaTracks.ts';
import { BasePlayerAdapter } from '../../../packages/ui/src/basePlayerAdapter.ts';
import { EMPTY_DIAGNOSTICS, type DiagnosticsCapable, type PlayerAdapter, type PlayerDiagnostics, type TrackCapable } from '../../../packages/ui/src/playerAdapter.ts';

/**
 * Minimal type definition for the AVPlay API that Samsung Tizen exposes globally at runtime
 * (no official @types package exists). Only the members used here are declared.
 */
declare const webapis: {
  avplay: {
    open(url: string): void;
    close(): void;
    setDisplayRect(x: number, y: number, w: number, h: number): void;
    setBufferingParam(option: string, param: string, value: number): void;
    setTimeoutForBuffering(seconds: number): void;
    getCurrentStreamInfo(): AvplayStreamInfo[];
    getStreamingProperty(property: string): string;
    prepareAsync(onSuccess: () => void, onError?: (err: unknown) => void): void;
    play(): void;
    pause(): void;
    stop(): void;
    seekTo(ms: number, onSuccess?: () => void, onError?: (err: unknown) => void): void;
    getCurrentTime(): number;
    getDuration(): number;
    setListener(listener: Record<string, (...args: unknown[]) => void>): void;
    getTotalTrackInfo(): AvplayTrackInfo[];
    setSelectTrack(type: string, index: number): void;
    setSilentSubtitle(silent: boolean): void;
  };
};

/** Low latency matters for live; not for VOD — hence the separate constants. */
const LIVE_BUFFER_SECONDS = 5;
/** VOD: this many seconds are pre-buffered on initial open (PLAYER_BUFFER_FOR_PLAY) and before resuming
 * after a stall (PLAYER_BUFFER_FOR_RESUME) — YouTube-style pre-loading that avoids stalls ahead of time. */
const VOD_BUFFER_SECONDS = 10;
/** Pause duration while switching audio/subtitle track: gives the decoder room to apply the new track. */
const TRACK_SWITCH_RESUME_MS = 300;
/** Samsung's docs suggest 3-10s (default 20): if the buffer doesn't fill, onerror fires sooner so reconnection starts earlier. */
const BUFFERING_TIMEOUT_S = 10;
const STATS_INTERVAL_MS = 1000;
/** Same constant/CSS rule as in tizenHybridAdapter.ts (styles.css): making the page transparent reveals
 * AVPlay's hardware layer behind it. That layer is blank/gray during stop()/reload — we keep the page opaque
 * until the first frame arrives (see emitFirstPlay) so our own UI covers the gray gap instead. */
const AVPLAY_ACTIVE_CLASS = 'avplay-active';

/**
 * Tizen AVPlay adapter. Sequence from HANDOFF.md: open → setBufferingParam (after open, before
 * prepare) → setDisplayRect → prepareAsync → play. Not yet tested on a real Tizen TV (no
 * emulator/device in this environment) — the AVPlay API shape was written from Samsung's
 * documentation and must be verified on the first TV test.
 */
export class TizenPlayerAdapter extends BasePlayerAdapter implements PlayerAdapter, TrackCapable, DiagnosticsCapable {
  private paused = false;
  private container: HTMLElement;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private audioTracks: MediaTrack[] = [];
  private textTracks: MediaTrack[] = [];
  private audioId = -1;
  private textId = -1;
  /** Request left by VodPlayback.changeTrack() before loadVod: applied directly right before play()
   * (without switchTrack's pause/wait/resume cycle) — so the reload doesn't start playing the default
   * track first, avoiding the "briefly plays the wrong track, then switches a second time" glitch. */
  private pendingAudioId = -1;
  private pendingSubtitleId = -1;
  /** Whether 'playing' has been emitted once for this load: onbufferingcomplete OR the first real time
   * progress (oncurrentplaytime), whichever comes first. We no longer emit immediately when play() is
   * called (see loadVod/loadLive) because AVPlay could still be buffering at that point — an early
   * 'playing' made the UI drop its loading indicator while the stream was still stalled. onbufferingcomplete
   * may never fire on some streams (if they never enter a buffering phase) — so we don't rely on it alone. */
  private firstPlaySignaled = false;

  constructor(videoContainer: HTMLElement) {
    super();
    // The AVPlay picture is drawn in a separate hardware layer via the <object type="application/avplayer">
    // in index.html; the container's on-screen rectangle is used to position it.
    this.container = videoContainer;
  }

  async loadLive(url: string): Promise<void> {
    await this.openAndPrepare(url, ['PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_FOR_RESUME'], LIVE_BUFFER_SECONDS);
    webapis.avplay.play();
    this.startStatsTimer();
    this.paused = false;
    // 'playing' is NOT emitted here — the onbufferingcomplete listener does (see openAndPrepare). At the
    // moment play() is called AVPlay may not have filled its buffer yet; an early 'playing' made the UI
    // think it had "loaded" and drop the loading indicator while the stream was still stalled/buffering.
  }

  async loadVod(url: string, resumeSeconds: number): Promise<void> {
    await this.openAndPrepare(url, ['PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_FOR_RESUME'], VOD_BUFFER_SECONDS);
    if (resumeSeconds > 0) {
      await new Promise<void>((resolve) => {
        webapis.avplay.seekTo(
          Math.floor(resumeSeconds * 1000),
          () => resolve(),
          () => resolve(), // seek failed: keep playing from the start anyway
        );
      });
    }
    this.readTracks();
    // AVPlay rejects setSelectTrack with PLAYER_ERROR_INVALID_STATE right after prepare (READY state) —
    // track selection must be applied AFTER play(), before the audio is actually heard (while buffering).
    webapis.avplay.play();
    this.applyPendingTracks();
    this.paused = false;
    // 'playing' is NOT emitted here — the onbufferingcomplete listener does (see openAndPrepare, note above).
  }

  /** Applies the pending track (requested via changeTrack) instead of readTracks()'s default selection —
   * BEFORE play(), so the stream is never heard/seen with the wrong track at all. */
  private applyPendingTracks(): void {
    const audioId = this.pendingAudioId;
    const subtitleId = this.pendingSubtitleId;
    this.pendingAudioId = -1;
    this.pendingSubtitleId = -1;
    if (audioId >= 0 && this.audioTracks.some((t) => t.id === audioId)) {
      try {
        webapis.avplay.setSelectTrack('AUDIO', audioId);
        this.audioId = audioId;
      } catch {
        /* could not be selected: previous track stays */
      }
    }
    if (subtitleId >= 0 && this.textTracks.some((t) => t.id === subtitleId)) {
      try {
        webapis.avplay.setSelectTrack('TEXT', subtitleId);
        webapis.avplay.setSilentSubtitle(false);
        this.textId = subtitleId;
      } catch {
        /* could not be selected: previous track stays */
      }
    }
    // readTracks() emitted 'tracks' BEFORE the selection was applied (with the default track) — the UI
    // (pills) was synced to that initial info, not yet reflecting the real selection. Emitting again here
    // corrects the pills and subtitle display to match the now-applied selection.
    this.emit('tracks');
  }

  /** Called by VodPlayback.changeTrack() BEFORE the reload starts; applied inside loadVod(). */
  setPendingTracks(audioId: number, subtitleId: number): void {
    this.pendingAudioId = audioId;
    this.pendingSubtitleId = subtitleId;
  }

  /** Reads audio/subtitle tracks after prepare (fields unverified on a real TV: falls back to no tracks on error). Subtitles default to off. */
  private readTracks(): void {
    this.audioTracks = [];
    this.textTracks = [];
    this.audioId = -1;
    this.textId = -1;
    try {
      const { audio, text } = parseAvplayTracks(webapis.avplay.getTotalTrackInfo());
      this.audioTracks = audio;
      this.textTracks = text;
      const current = webapis.avplay.getCurrentStreamInfo() as unknown as Array<{ index: number; type: string }>;
      const cur = current.find((s) => s.type === 'AUDIO');
      this.audioId = cur && audio.some((t) => t.id === cur.index) ? cur.index : (audio[0]?.id ?? -1);
      webapis.avplay.setSilentSubtitle(true);
    } catch {
      /* no track info available */
    }
    this.emit('tracks');
  }

  /** AVPlay doesn't expose buffer/frame info to JavaScript; only which engine is currently playing is reported. */
  getDiagnostics(): PlayerDiagnostics {
    return { ...EMPTY_DIAGNOSTICS, engine: 'avplay' };
  }

  getAudioTracks(): MediaTrack[] {
    return this.audioTracks;
  }
  getAudioTrack(): number {
    return this.audioId;
  }
  setAudioTrack(id: number): void {
    this.switchTrack(
      () => webapis.avplay.setSelectTrack('AUDIO', id),
      () => (this.audioId = id),
    );
  }
  getSubtitleTracks(): MediaTrack[] {
    return this.textTracks;
  }
  getSubtitleTrack(): number {
    return this.textId;
  }
  setSubtitleTrack(id: number): void {
    this.switchTrack(
      () => {
        if (id < 0) {
          webapis.avplay.setSilentSubtitle(true);
        } else {
          webapis.avplay.setSelectTrack('TEXT', id);
          webapis.avplay.setSilentSubtitle(false);
        }
      },
      () => (this.textId = id),
    );
    if (id < 0) this.emit('subtitle', '', 0);
  }

  /**
   * Switching a track (audio/subtitle) can briefly desync AVPlay's decode pipeline (confirmed on a real
   * TV: audio/video glitches). If playing, it's paused first, the track is applied, then resumed after a
   * short delay (TRACK_SWITCH_RESUME_MS) — a short, deliberate-looking transition instead of an uncontrolled glitch.
   * Only expected to be hit for live track switches now; VOD always goes through setPendingTracks/applyPendingTracks instead.
   */
  private switchTrack(apply: () => void, commit: () => void): void {
    const wasPlaying = !this.paused;
    try {
      if (wasPlaying) webapis.avplay.pause();
      apply();
      commit();
    } catch {
      /* could not be selected: previous track stays */
    } finally {
      if (wasPlaying) {
        setTimeout(() => {
          try {
            webapis.avplay.play();
          } catch {
            /* stopped/closed in the meantime (e.g. channel changed): ignore */
          }
        }, TRACK_SWITCH_RESUME_MS);
      }
      this.emit('tracks');
    }
  }

  play(): void {
    webapis.avplay.play();
    this.paused = false;
  }
  pause(): void {
    webapis.avplay.pause();
    this.paused = true;
  }
  stop(): void {
    this.stopStatsTimer();
    try {
      webapis.avplay.stop();
      webapis.avplay.close();
    } catch {
      /* already closed: ignore */
    }
  }
  seek(seconds: number): void {
    webapis.avplay.seekTo(Math.floor(seconds * 1000));
  }
  getCurrentTime(): number {
    return webapis.avplay.getCurrentTime() / 1000;
  }
  getDuration(): number {
    return webapis.avplay.getDuration() / 1000;
  }
  isPaused(): boolean {
    return this.paused;
  }
  /** The actual picture lives in a separate hardware layer, so this only calls setDisplayRect for the
   * new position — never tested (see the note at the top of the file). */
  moveTo(container: HTMLElement): void {
    this.container = container;
    this.applyDisplayRect();
  }

  /** setDisplayRect works in 1920x1080 screen coordinates (Samsung docs); scaled if the window differs. */
  private applyDisplayRect(): void {
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) {
      webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      return;
    }
    const k = 1920 / (window.innerWidth || 1920);
    webapis.avplay.setDisplayRect(Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k));
  }

  override destroy(): void {
    this.stop();
    super.destroy();
  }

  /** Emits 'playing' once, whichever of `onbufferingcomplete`/`oncurrentplaytime` arrives first. */
  private emitFirstPlay(): void {
    if (this.firstPlaySignaled) return;
    this.firstPlaySignaled = true;
    // The hardware layer is now actually producing frames: make the page transparent again so the layer
    // shows through (see the note in openAndPrepare — it was kept opaque since stop() to hide the gray/blank layer).
    document.documentElement.classList.add(AVPLAY_ACTIVE_CLASS);
    this.emit('playing');
  }

  private openAndPrepare(url: string, bufferOptions: string[], bufferSeconds: number): Promise<void> {
    // open() can only be called in the NONE/IDLE state (otherwise InvalidStateError): closed first for
    // reconnects (the watchdog calls loadLive again) and for channel changes.
    this.stop();
    this.firstPlaySignaled = false;
    // The hardware layer is blank/gray from stop() until the first frame — keeping the page opaque (see
    // emitFirstPlay) covers that gap with our own UI (loading/buffering indicator) instead.
    document.documentElement.classList.remove(AVPLAY_ACTIVE_CLASS);
    return new Promise((resolve, reject) => {
      try {
        webapis.avplay.open(url);
        for (const option of bufferOptions) {
          webapis.avplay.setBufferingParam(option, 'PLAYER_BUFFER_SIZE_IN_SECOND', bufferSeconds);
        }
        webapis.avplay.setTimeoutForBuffering(BUFFERING_TIMEOUT_S);
        this.applyDisplayRect();
        webapis.avplay.setListener({
          onbufferingstart: () => this.emit('buffering'),
          onbufferingprogress: (percent) => this.emit('bufferprogress', Number(percent)),
          onbufferingcomplete: () => this.emitFirstPlay(),
          onstreamcompleted: () => this.emit('ended'),
          onerror: () => this.emit('error'),
          oncurrentplaytime: () => {
            this.emitFirstPlay(); // fallback signal for streams that never enter buffering
            this.emit('timeupdate');
          },
          // AVPlay doesn't draw embedded subtitles itself (video is in a separate layer): text is shown in the UI. (duration ms, text)
          onsubtitlechange: (duration, text) => {
            if (this.textId >= 0) this.emit('subtitle', String(text ?? ''), Number(duration) || 4000);
          },
        });
        webapis.avplay.prepareAsync(
          () => resolve(),
          (err) => reject(err),
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  /** Reads resolution/bitrate/codec/fps once a second on live and emits a 'stats' event. API fields unverified on a real TV: silently skipped on error. */
  private startStatsTimer(): void {
    this.stopStatsTimer();
    this.statsTimer = setInterval(() => {
      try {
        let bandwidth: number | null = null;
        try {
          bandwidth = Number(webapis.avplay.getStreamingProperty('CURRENT_BANDWIDTH')) || null;
        } catch {
          // falls back to Bit_rate if this property doesn't exist for this stream type
        }
        const stats = parseAvplayStats(webapis.avplay.getCurrentStreamInfo(), bandwidth);
        if (stats) this.emit('stats', stats);
      } catch {
        // player not ready at the moment (reconnecting, etc.)
      }
    }, STATS_INTERVAL_MS);
  }

  private stopStatsTimer(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }
}
