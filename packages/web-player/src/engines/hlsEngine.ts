import Hls, { type HlsConfig } from 'hls.js';
import { languageName, type MediaTrack } from '../../../ui/src/mediaTracks.ts';
import { codecLabel } from '../../../ui/src/playerAdapter.ts';
import type { EngineEmit, PlaybackEngine } from './playbackEngine.ts';
import { activeCuesToSubtitleEvent } from './subtitleCues.ts';

/** hls.js already retries internally with exponential backoff; kept short for live so the total duration doesn't stack up with the LiveWatchdog layered on top of it. */
const SHORT_RETRY = { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 };

/** In-place recovery is not attempted a second time within the same outage (the official pattern). */
const MEDIA_RECOVERY_COOLDOWN_MS = 5000;

const LIVE_CONFIG: Partial<HlsConfig> = {
  liveSyncDurationCount: 3, // RFC 8216 6.3.3: start at least 3 target durations behind the live edge
  maxBufferLength: 10, // 30s is unnecessary for live; keep it short for memory and latency
  maxMaxBufferLength: 20,
  backBufferLength: 30,
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10000,
      maxLoadTimeMs: 60000,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: SHORT_RETRY,
    },
  },
  playlistLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10000,
      maxLoadTimeMs: 20000,
      timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: SHORT_RETRY,
    },
  },
};

/** Different hls.js profile for live vs. movie: which config, error, and track events apply. */
export type HlsProfile = { kind: 'live' } | { kind: 'vod'; resumeSeconds: number };

/** HLS (.m3u8) stream — via hls.js; audio/subtitle tracks in the manifest are selectable. */
export class HlsEngine implements PlaybackEngine {
  readonly name = 'hls.js';
  private hls: Hls | null = null;
  private lastMediaRecovery = 0;
  /** Stored so the 'cuechange' listeners added for each selected subtitle track can be removed. */
  private cueCleanup: Array<() => void> = [];

  private readonly video: HTMLVideoElement;
  private readonly emit: EngineEmit;
  private readonly url: string;
  private readonly profile: HlsProfile;

  constructor(video: HTMLVideoElement, emit: EngineEmit, url: string, profile: HlsProfile) {
    this.video = video;
    this.emit = emit;
    this.url = url;
    this.profile = profile;
  }

  static isSupported(): boolean {
    return Hls.isSupported();
  }

  async start(): Promise<void> {
    const live = this.profile.kind === 'live';
    const hls = new Hls(live ? LIVE_CONFIG : { startPosition: this.profile.kind === 'vod' && this.profile.resumeSeconds > 0 ? this.profile.resumeSeconds : -1 });
    this.hls = hls;
    hls.subtitleDisplay = false; // the native WebVTT box is never shown (live + movie); we use our own 'subtitle' event
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (live && data.type === Hls.ErrorTypes.MEDIA_ERROR && Date.now() - this.lastMediaRecovery > MEDIA_RECOVERY_COOLDOWN_MS) {
        this.lastMediaRecovery = Date.now();
        hls.recoverMediaError();
        return;
      }
      this.emit('error');
    });
    if (!live) {
      const notify = (): void => this.emit('tracks');
      hls.on(Hls.Events.MANIFEST_PARSED, notify);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, notify);
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, notify);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, notify);
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, notify);
    }
    hls.loadSource(this.url);
    hls.attachMedia(this.video);
    this.bridgeSubtitleCues();
    await this.video.play().catch(() => {});
  }

  destroy(): void {
    this.clearCueListeners();
    this.hls?.destroy();
    this.hls = null;
  }

  bitrateKbps(): number | null {
    return this.hls ? Math.round(this.hls.bandwidthEstimate / 1000) : null;
  }
  codec(): string | null {
    const level = this.hls?.levels?.[this.hls.currentLevel];
    return level ? codecLabel(level.videoCodec, level.audioCodec) : null;
  }
  fps(): number | null {
    return null;
  }

  private toTracks(list: Array<{ id: number; lang?: string; name?: string }>): MediaTrack[] {
    return list.map((t) => ({ id: t.id, label: languageName(t.lang) ?? (t.name || `Parça ${t.id + 1}`) }));
  }
  getAudioTracks(): MediaTrack[] {
    return this.toTracks(this.hls?.audioTracks ?? []);
  }
  getAudioTrack(): number {
    return this.hls?.audioTrack ?? -1;
  }
  setAudioTrack(id: number): void {
    if (this.hls) this.hls.audioTrack = id;
  }
  getSubtitleTracks(): MediaTrack[] {
    return this.toTracks(this.hls?.subtitleTracks ?? []);
  }
  getSubtitleTrack(): number {
    return this.hls?.subtitleTrack ?? -1; // hls.js keeps -1 when nothing is selected
  }
  setSubtitleTrack(id: number): void {
    if (!this.hls) return;
    this.hls.subtitleTrack = id; // -1 = off
    this.emit('subtitle', '', 0); // clear the previous track's subtitle immediately (whether switching tracks or turning off)
    // We DELIBERATELY do not change subtitleDisplay: it was permanently set to false in start() (the native
    // WebVTT box is never shown). If we flipped it to true here, we'd go back to the "double rendering" bug
    // where two subtitles render at once alongside the bridge (bridgeSubtitleCues).
  }

  /**
   * We never enable hls.js's native WebVTT display (the browser's own caption box) — instead we listen for
   * each `TextTrack`'s `cuechange` event and translate it into the `'subtitle'` event that AVPlay already uses.
   * This keeps a single render point (`vod-caption`, see overlayVodBar.ts) and a single style source.
   * Only the selected track's `TextTrack.mode` becomes 'hidden' (hls.js does this on subtitleTrack assignment) —
   * tracks in 'hidden' mode process cues but don't display them; 'disabled' ones never process cues, so only the
   * selected track in the pool of WebVTT subtitle tracks actually fires. This reasoning only applies to
   * `kind === 'subtitles'` tracks: hls.js's default configuration also adds ID3 metadata and CEA-608/708
   * closed-caption tracks to `video.textTracks` (kinds 'metadata' and 'captions') — these are independent of the
   * `hls.subtitleTrack` selection and always process cues. If we listened to those too: (a) the ID3 track's
   * empty-text cues would trigger spurious 'subtitle' clear events, (b) even if the user turns off subtitles
   * (`setSubtitleTrack(-1)`), embedded CC text from the stream could leak through. So we only attach to tracks
   * where `kind === 'subtitles'`.
   */
  private bridgeSubtitleCues(): void {
    const attach = (track: TextTrack): void => {
      if (track.kind !== 'subtitles') return; // exclude ID3 metadata / CEA-608 caption tracks
      const handler = (): void => {
        const cues = track.activeCues ? Array.from(track.activeCues as unknown as ArrayLike<VTTCue>) : null;
        const { text, durationMs } = activeCuesToSubtitleEvent(cues?.map((c) => ({ text: c.text, startTime: c.startTime, endTime: c.endTime })) ?? null);
        this.emit('subtitle', text, durationMs);
      };
      track.addEventListener('cuechange', handler);
      this.cueCleanup.push(() => track.removeEventListener('cuechange', handler));
    };
    for (const t of Array.from(this.video.textTracks ?? [])) attach(t);
    const onAddTrack = (e: TrackEvent): void => {
      if (e.track) attach(e.track as TextTrack);
    };
    this.video.textTracks?.addEventListener?.('addtrack', onAddTrack); // older Tizen TV browsers may not have textTracks
    this.cueCleanup.push(() => this.video.textTracks?.removeEventListener?.('addtrack', onAddTrack));
  }

  private clearCueListeners(): void {
    for (const off of this.cueCleanup) off();
    this.cueCleanup = [];
  }
}
