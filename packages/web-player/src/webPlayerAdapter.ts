import type { MediaTrack } from '../../ui/src/mediaTracks.ts';
import { BasePlayerAdapter } from '../../ui/src/basePlayerAdapter.ts';
import type { DiagnosticsCapable, PlayerAdapter, PlayerDiagnostics, TrackCapable } from '../../ui/src/playerAdapter.ts';
import { createLiveEngine, createVodEngine } from './engines/engineFactory.ts';
import type { PlaybackEngine } from './engines/playbackEngine.ts';
import { LiveBufferController, LiveBufferPolicy, type BufferedVideo } from './liveBuffer.ts';

function proxied(url: string): string {
  // Absolute URL: mpegts.js fetches inside a blob: Worker, where a relative '/proxy?...' can't be parsed.
  const base = typeof location !== 'undefined' && location.origin && location.origin !== 'null' ? location.origin : '';
  return `${base}/proxy?url=${encodeURIComponent(url)}`;
}

/** For movies/series, once the buffer is at least this full the loading spinner shows 100% (for live the threshold is dynamic: see liveBuffer.ts). */
const BUFFER_RESUME_SECONDS = 2;
const STATS_INTERVAL_MS = 1000;
const BUFFER_REPORT_INTERVAL_MS = 200;
/** How often the live buffer controller ticks (decides whether to keep holding or jump back to live). */
const LIVE_BUFFER_TICK_MS = 200;
/** 'waiting' events within this window after `moveTo` count as a side effect of the move (not an interruption) if the buffer is healthy. */
const MOVE_GRACE_MS = 1500;
/** Number of recent events kept in the diagnostics panel. */
const EVENT_LOG_SIZE = 8;
/** Common frame rates: if the measured value is within ±1.5 of one of these, it's rounded to it. */
const COMMON_FPS = [24, 25, 30, 50, 60];

/**
 * Web PlayerAdapter: manages the `<video>` element, buffer/stats notifications, and the engine lifecycle.
 * How the stream is actually played (hls.js / mpegts.js / native `<video>`) lives in the `PlaybackEngine`
 * strategies (see ./engines/); all URLs go through the local proxy (/proxy) for CORS (see apps/web/server.mjs).
 */
export class WebPlayerAdapter extends BasePlayerAdapter implements PlayerAdapter, TrackCapable, DiagnosticsCapable {
  private readonly video: HTMLVideoElement;
  private engine: PlaybackEngine | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private bufferTimer: ReturnType<typeof setInterval> | null = null;
  private liveBufferTimer: ReturnType<typeof setInterval> | null = null;
  /** Live only: holds playback on a stall and resumes using a dynamic threshold (the fluctuation history is kept even across channel changes). */
  private liveBuffer: LiveBufferController | null = null;
  private readonly bufferPolicy = new LiveBufferPolicy();
  /** Whether the first frame of the new stream has arrived (the 'waiting' stall during initial load doesn't count). */
  private hasPlayed = false;
  private moveGraceUntil = 0;
  /** The user paused (never in live; for movies/series): so recovery after a move doesn't restart playback. */
  private userPaused = false;
  private readonly eventLog: string[] = [];
  private readonly startedAt = Date.now();
  private lastFrames = 0;
  private lastFramesAt = 0;

  /** Whether URLs go through the local /proxy (web) or directly (the Tizen widget isn't subject to CORS). */
  private readonly useProxy: boolean;

  constructor(container: HTMLElement, options: { proxy?: boolean } = {}) {
    super();
    this.useProxy = options.proxy ?? true;
    this.video = document.createElement('video');
    this.video.style.width = '100%';
    this.video.style.height = '100%';
    this.video.autoplay = true;
    container.append(this.video);

    this.video.addEventListener('playing', () => {
      const first = !this.hasPlayed;
      this.hasPlayed = true;
      // For live, if the buffer is below the threshold on the first frame, fill the buffer before showing anything
      // (so playback doesn't start choppy). Once the threshold is met, playback restarts and this handler fires
      // a second time, reporting 'playing'.
      if (first && this.liveBuffer?.onFirstFrame()) return;
      this.stopBufferProgress();
      this.video.style.visibility = 'visible';
      this.emit('playing');
    });
    this.video.addEventListener('timeupdate', () => this.emit('timeupdate'));
    this.video.addEventListener('ended', () => this.emit('ended'));
    this.video.addEventListener('error', () => {
      // A media error on the element is permanent (until reset with video.load()): if the engine isn't stopped it
      // keeps feeding data and produces an "appendBuffer … error attribute is not null" error for every segment
      // (hundreds of lines).
      const err = this.video.error;
      console.warn('[player] media error', err?.code, err?.message);
      this.engine?.destroy();
      this.engine = null;
      this.emit('error');
    });
    // Media events are written to the diagnostics panel's log (to see when and with what buffer a freeze happens on the TV).
    for (const name of ['play', 'pause', 'emptied', 'stalled', 'seeking', 'playing'] as const) this.video.addEventListener(name, () => this.logEvent(name));
    this.video.addEventListener('waiting', () => {
      this.logEvent('waiting');
      // Moving the video in the DOM (preview ↔ full screen) can reset the media pipeline in some TV browsers and produce a brief 'waiting'.
      // If the buffer is healthy this is not a network interruption: it isn't counted, playback isn't held, and "Buffering" isn't shown.
      if (Date.now() < this.moveGraceUntil && this.aheadSeconds() >= 0.5) return;
      if (this.hasPlayed) this.liveBuffer?.onWaiting();
      this.emit('buffering');
      this.startBufferProgress();
    });
    // Track list is reported when metadata arrives and when tracks are added later (may be empty depending on the browser: Chrome mostly doesn't provide audioTracks).
    this.video.addEventListener('loadedmetadata', () => this.emit('tracks'));
    this.video.textTracks?.addEventListener?.('addtrack', () => this.emit('tracks'));
  }

  async loadLive(url: string): Promise<void> {
    this.teardownSource();
    this.beginLoading();
    this.startStatsTimer();
    this.startLiveBuffer();
    await this.run(createLiveEngine(this.video, this.emit.bind(this), url, this.playUrl(url)));
  }

  async loadVod(url: string, resumeSeconds: number): Promise<void> {
    this.teardownSource();
    this.beginLoading();
    await this.run(createVodEngine(this.video, this.emit.bind(this), url, this.playUrl(url), resumeSeconds));
  }

  private playUrl(url: string): string {
    return this.useProxy ? proxied(url) : url;
  }

  private async run(engine: PlaybackEngine): Promise<void> {
    this.engine = engine;
    await engine.start();
  }

  play(): void {
    this.userPaused = false;
    this.liveBuffer?.cancel();
    void this.video.play().catch(() => {});
  }
  pause(): void {
    this.userPaused = true;
    this.liveBuffer?.cancel();
    this.video.pause();
  }
  stop(): void {
    this.video.style.visibility = 'hidden';
    this.teardownSource();
    this.video.removeAttribute('src');
    this.video.load();
  }
  seek(seconds: number): void {
    this.video.currentTime = seconds;
  }
  getCurrentTime(): number {
    return this.video.currentTime;
  }
  getDuration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }
  getDiagnostics(): PlayerDiagnostics {
    const quality = this.video.getVideoPlaybackQuality?.();
    return {
      engine: this.engine?.name ?? '-',
      bufferSeconds: Math.round(this.aheadSeconds() * 10) / 10,
      bufferMode: this.liveBuffer ? this.bufferPolicy.mode : null,
      holding: !!this.liveBuffer?.holding,
      stalls: this.bufferPolicy.totalStalls,
      droppedFrames: quality ? quality.droppedVideoFrames : null,
      totalFrames: quality ? quality.totalVideoFrames : null,
      events: [...this.eventLog],
    };
  }

  private logEvent(text: string): void {
    const seconds = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    this.eventLog.push(`${seconds} ${text} · tampon ${this.aheadSeconds().toFixed(1)}`);
    if (this.eventLog.length > EVENT_LOG_SIZE) this.eventLog.shift();
  }

  isPaused(): boolean {
    // Playback we paused ourselves to let the buffer fill is not a pause from the user's perspective.
    return this.video.paused && !this.liveBuffer?.holding;
  }
  moveTo(container: HTMLElement): void {
    this.logEvent('moveTo');
    this.moveGraceUntil = Date.now() + MOVE_GRACE_MS;
    container.append(this.video);
    // If the stream is already playing the video must stay visible: 'playing' may not arrive again during the move, and if the video stays hidden only the background shows.
    if (this.hasPlayed) this.video.style.visibility = 'visible';
    // The move can stop playback (in old TV browsers): there is no pausing in live, so if a stop we didn't request
    // happens, playback is restarted shortly.
    for (const delay of [300, 1000]) {
      setTimeout(() => {
        if (this.liveBuffer && this.video.paused && !this.liveBuffer.holding && !this.userPaused && this.hasPlayed) {
          this.logEvent('moveTo sonrası durdu → yeniden başlatıldı');
          void this.video.play().catch(() => {});
        }
      }, delay);
    }
  }

  // ---- audio / subtitles: delegated to the active engine (empty when there's no engine)
  getAudioTracks(): MediaTrack[] {
    return this.engine?.getAudioTracks() ?? [];
  }
  getAudioTrack(): number {
    return this.engine?.getAudioTrack() ?? -1;
  }
  setAudioTrack(id: number): void {
    this.engine?.setAudioTrack(id);
  }
  getSubtitleTracks(): MediaTrack[] {
    return this.engine?.getSubtitleTracks() ?? [];
  }
  getSubtitleTrack(): number {
    return this.engine?.getSubtitleTrack() ?? -1;
  }
  setSubtitleTrack(id: number): void {
    this.engine?.setSubtitleTrack(id);
  }

  override destroy(): void {
    this.teardownSource();
    this.video.remove();
    super.destroy();
  }

  /**
   * While a new stream loads, the video is hidden until the first frame arrives (an empty <video>
   * looks like a black box; let the UI behind it show through) and buffer-fill percentage reporting starts.
   */
  private beginLoading(): void {
    // If the previous stream put the element into an error state, the new stream can't write to it either: reset the element.
    if (this.video.error) {
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.video.style.visibility = 'hidden';
    this.hasPlayed = false;
    this.startBufferProgress();
  }

  /** When playback stalls on buffering, reports how much of the buffer (~2 s) needed to resume has filled. */
  private startBufferProgress(): void {
    if (this.bufferTimer) return;
    const threshold = (): number => this.liveBuffer?.resumeSeconds() ?? BUFFER_RESUME_SECONDS;
    const report = (): void => {
      this.emit('bufferprogress', Math.min(100, Math.round((this.aheadSeconds() / threshold()) * 100)));
    };
    report();
    this.bufferTimer = setInterval(report, BUFFER_REPORT_INTERVAL_MS);
  }

  /** Buffer ahead of the playback position (if the position hasn't entered the buffer yet, the whole buffer). */
  private aheadSeconds(): number {
    const t = this.video.currentTime;
    let ahead = 0;
    for (let i = 0; i < this.video.buffered.length; i++) {
      const end = this.video.buffered.end(i);
      if (end > t) ahead = Math.max(ahead, end - Math.max(this.video.buffered.start(i), t));
    }
    return ahead;
  }

  /** End of the buffered range that contains the playback position. */
  private bufferedEnd(): number {
    const t = this.video.currentTime;
    let end = t;
    for (let i = 0; i < this.video.buffered.length; i++) {
      if (this.video.buffered.end(i) > t && this.video.buffered.start(i) <= t + 0.05) end = Math.max(end, this.video.buffered.end(i));
    }
    return end;
  }

  private startLiveBuffer(): void {
    const video = this.video;
    const view: BufferedVideo = {
      get paused() {
        return video.paused;
      },
      aheadSeconds: () => this.aheadSeconds(),
      bufferedEnd: () => this.bufferedEnd(),
      pause: () => video.pause(),
      play: () => void video.play().catch(() => {}),
      setPlaybackRate: (rate) => {
        video.playbackRate = rate;
      },
    };
    this.liveBuffer = new LiveBufferController(view, this.bufferPolicy);
    this.liveBufferTimer = setInterval(() => this.liveBuffer?.tick(), LIVE_BUFFER_TICK_MS);
  }

  private stopLiveBuffer(): void {
    if (this.liveBufferTimer) clearInterval(this.liveBufferTimer);
    this.liveBufferTimer = null;
    this.liveBuffer?.cancel();
    this.liveBuffer = null;
  }

  private stopBufferProgress(): void {
    if (this.bufferTimer) clearInterval(this.bufferTimer);
    this.bufferTimer = null;
  }

  private teardownSource(): void {
    this.stopBufferProgress();
    this.stopLiveBuffer();
    this.engine?.destroy();
    this.engine = null;
    this.stopStatsTimer();
    this.lastFrames = 0;
    this.lastFramesAt = 0;
  }

  /** Emits resolution + instantaneous bitrate via the 'stats' event once a second (live only). */
  private startStatsTimer(): void {
    this.statsTimer = setInterval(() => {
      const width = this.video.videoWidth;
      const height = this.video.videoHeight;
      if (!width || !height) return;
      this.emit('stats', {
        width,
        height,
        kbps: this.engine?.bitrateKbps() ?? null,
        fps: this.engine?.fps() ?? this.measureFps(),
        codec: this.engine?.codec() ?? null,
      });
    }, STATS_INTERVAL_MS);
  }

  /** Frame rate: number of frames shown in the last second (rounded to common values). */
  private measureFps(): number | null {
    const q = this.video.getVideoPlaybackQuality?.();
    if (!q) return null;
    const now = Date.now();
    const frames = q.totalVideoFrames;
    const prevFrames = this.lastFrames;
    const prevAt = this.lastFramesAt;
    this.lastFrames = frames;
    this.lastFramesAt = now;
    if (!prevAt || now - prevAt <= 0 || frames <= prevFrames || this.video.paused) return null;
    const raw = ((frames - prevFrames) * 1000) / (now - prevAt);
    return COMMON_FPS.find((c) => Math.abs(c - raw) <= 1.5) ?? Math.round(raw);
  }

  private stopStatsTimer(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }
}
