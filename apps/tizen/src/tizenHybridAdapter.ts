import type { MediaTrack } from '../../../packages/ui/src/mediaTracks.ts';
import { BasePlayerAdapter } from '../../../packages/ui/src/basePlayerAdapter.ts';
import {
  diagnosticsOf,
  EMPTY_DIAGNOSTICS,
  isPendingTrackCapable,
  tracksOf,
  type DiagnosticsCapable,
  type PendingTrackCapable,
  type PlayerAdapter,
  type PlayerAdapterEvent,
  type PlayerDiagnostics,
  type TrackCapable,
} from '../../../packages/ui/src/playerAdapter.ts';
import { WebPlayerAdapter } from '../../../packages/web-player/src/webPlayerAdapter.ts';
import { TizenPlayerAdapter } from './tizenPlayerAdapter.ts';

/** Fallback switch: writing 'avplay' to localStorage makes live playback use AVPlay again, as before. */
const LIVE_PLAYER_KEY = 'iptv.livePlayer';
/** html/body become transparent so the video layer behind AVPlay is visible (see styles.css). */
const AVPLAY_ACTIVE_CLASS = 'avplay-active';

type BackendKind = 'web' | 'avplay';

/** Player policy for live playback: defaults to hls.js/mpegts.js (in the DOM, so preview works); AVPlay via the fallback switch. */
function liveBackend(): BackendKind {
  return localStorage.getItem(LIVE_PLAYER_KEY) === 'avplay' ? 'avplay' : 'web';
}

const EVENTS: PlayerAdapterEvent[] = ['playing', 'timeupdate', 'ended', 'error', 'buffering', 'bufferprogress', 'stats', 'tracks', 'subtitle'];

/**
 * Tizen player: live playback goes through hls.js/mpegts.js via a <video> element (since the
 * video is inside the DOM, the preview box and rounded corners work), while movies/series use
 * AVPlay (for MKV and similar formats). AVPlay renders video on a separate layer BEHIND the
 * page, so the page background is only made transparent while in VOD fullscreen.
 */
export class TizenHybridAdapter extends BasePlayerAdapter implements PlayerAdapter, TrackCapable, PendingTrackCapable, DiagnosticsCapable {
  private container: HTMLElement;
  private web: WebPlayerAdapter | null = null;
  private avplay: TizenPlayerAdapter | null = null;
  private active: PlayerAdapter | null = null;
  private unsubs: Array<() => void> = [];

  constructor(videoContainer: HTMLElement) {
    super();
    this.container = videoContainer;
  }

  async loadLive(url: string): Promise<void> {
    await this.use(liveBackend()).loadLive(url);
  }

  async loadVod(url: string, resumeSeconds: number): Promise<void> {
    await this.use('avplay').loadVod(url, resumeSeconds);
  }

  play(): void {
    this.active?.play();
  }
  pause(): void {
    this.active?.pause();
  }
  stop(): void {
    this.active?.stop();
    document.documentElement.classList.remove(AVPLAY_ACTIVE_CLASS);
  }
  seek(seconds: number): void {
    this.active?.seek(seconds);
  }
  getCurrentTime(): number {
    return this.active?.getCurrentTime() ?? 0;
  }
  getDuration(): number {
    return this.active?.getDuration() ?? 0;
  }
  isPaused(): boolean {
    return this.active?.isPaused() ?? false;
  }
  moveTo(container: HTMLElement): void {
    this.container = container;
    this.active?.moveTo(container);
  }
  // Audio/subtitle tracks come from the active sub-player (web player in live mode: no tracks).
  getDiagnostics(): PlayerDiagnostics {
    return diagnosticsOf(this.active) ?? EMPTY_DIAGNOSTICS;
  }

  getAudioTracks(): MediaTrack[] {
    return tracksOf(this.active).getAudioTracks();
  }
  getAudioTrack(): number {
    return tracksOf(this.active).getAudioTrack();
  }
  setAudioTrack(id: number): void {
    tracksOf(this.active).setAudioTrack(id);
  }
  getSubtitleTracks(): MediaTrack[] {
    return tracksOf(this.active).getSubtitleTracks();
  }
  getSubtitleTrack(): number {
    return tracksOf(this.active).getSubtitleTrack();
  }
  setSubtitleTrack(id: number): void {
    tracksOf(this.active).setSubtitleTrack(id);
  }
  // VodPlayback.changeTrack(): forwarded only if the active sub-player supports it (AVPlay); web engines
  // don't have this interface at all, so the caller (based on tracksOf) applies it after loading finishes instead.
  setPendingTracks(audioId: number, subtitleId: number): void {
    if (this.active && isPendingTrackCapable(this.active)) this.active.setPendingTracks(audioId, subtitleId);
  }

  override destroy(): void {
    this.stop();
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.web?.destroy();
    this.avplay?.destroy();
    this.web = null;
    this.avplay = null;
    this.active = null;
    super.destroy();
  }

  /** Activates the requested sub-player; stops the other one (only one runs at a time). */
  private use(kind: BackendKind): PlayerAdapter {
    this.active = kind === 'web' ? this.activateWeb() : this.activateAvplay();
    return this.active;
  }

  private activateWeb(): WebPlayerAdapter {
    this.avplay?.stop();
    document.documentElement.classList.remove(AVPLAY_ACTIVE_CLASS);
    if (!this.web) {
      this.web = new WebPlayerAdapter(this.container, { proxy: false });
      this.forward(this.web);
    }
    return this.web;
  }

  private activateAvplay(): TizenPlayerAdapter {
    // AVPlay: the web player is removed so its empty <video> box doesn't cover the layer behind it.
    this.web?.stop();
    this.web?.destroy();
    this.web = null;
    if (!this.avplay) {
      this.avplay = new TizenPlayerAdapter(this.container);
      this.forward(this.avplay);
    }
    document.documentElement.classList.add(AVPLAY_ACTIVE_CLASS);
    return this.avplay;
  }

  /** Forwards sub-player events outward only while that sub-player is the active one. */
  private forward(source: PlayerAdapter): void {
    for (const event of EVENTS) {
      this.unsubs.push(
        source.on(event, (...args) => {
          if (this.active !== source) return;
          this.emit(event, ...args);
        }),
      );
    }
  }
}
