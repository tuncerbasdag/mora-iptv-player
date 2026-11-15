import { languageName, type MediaTrack } from '../../../ui/src/mediaTracks.ts';
import type { EngineEmit, PlaybackEngine } from './playbackEngine.ts';
import { activeCuesToSubtitleEvent } from './subtitleCues.ts';

interface NativeAudioTrack {
  enabled: boolean;
  language?: string;
  label?: string;
}

/**
 * Common base for engines that use the `<video>` element's own audio/subtitle tracks (Template Method:
 * subclasses only provide `start`/`destroy` and measurements). Chrome mostly doesn't provide audioTracks → empty list.
 */
export abstract class MediaElementEngine implements PlaybackEngine {
  private selectedSubtitleId = -1;
  /** Stored so the 'cuechange' listener added for the selected subtitle track can be removed. */
  private cueCleanup: (() => void) | null = null;

  protected readonly video: HTMLVideoElement;
  protected readonly emit: EngineEmit;
  abstract readonly name: string;

  constructor(video: HTMLVideoElement, emit: EngineEmit) {
    this.video = video;
    this.emit = emit;
  }

  abstract start(): Promise<void>;
  abstract destroy(): void;

  bitrateKbps(): number | null {
    return null;
  }
  codec(): string | null {
    return null;
  }
  fps(): number | null {
    return null;
  }

  private nativeAudio(): NativeAudioTrack[] {
    const list = (this.video as unknown as { audioTracks?: ArrayLike<NativeAudioTrack> }).audioTracks;
    return list ? Array.from(list) : [];
  }
  private nativeText(): TextTrack[] {
    return Array.from(this.video.textTracks ?? []).filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
  }

  getAudioTracks(): MediaTrack[] {
    return this.nativeAudio().map((t, i) => ({ id: i, label: languageName(t.language) ?? (t.label || `Parça ${i + 1}`) }));
  }
  getAudioTrack(): number {
    return this.nativeAudio().findIndex((t) => t.enabled);
  }
  setAudioTrack(id: number): void {
    this.nativeAudio().forEach((t, i) => (t.enabled = i === id));
    this.emit('tracks');
  }
  getSubtitleTracks(): MediaTrack[] {
    return this.nativeText().map((t, i) => ({ id: i, label: languageName(t.language) ?? (t.label || `Parça ${i + 1}`) }));
  }
  getSubtitleTrack(): number {
    return this.selectedSubtitleId;
  }
  /**
   * Same pattern as in `hlsEngine.ts`: instead of the native WebVTT box (NOT 'showing', 'hidden'), we bridge
   * the selected track's cues to our own 'subtitle' event — so a single render point (vod-caption) is preserved across all engines.
   */
  setSubtitleTrack(id: number): void {
    this.cleanupSubtitleCueListener();
    this.selectedSubtitleId = id;
    const tracks = this.nativeText();
    tracks.forEach((t, i) => {
      t.mode = i === id ? 'hidden' : 'disabled';
    });
    const selected = tracks[id];
    if (selected) {
      const handler = (): void => {
        const cues = selected.activeCues ? Array.from(selected.activeCues as unknown as ArrayLike<VTTCue>) : null;
        const { text, durationMs } = activeCuesToSubtitleEvent(cues?.map((c) => ({ text: c.text, startTime: c.startTime, endTime: c.endTime })) ?? null);
        this.emit('subtitle', text, durationMs);
      };
      selected.addEventListener('cuechange', handler);
      this.cueCleanup = () => selected.removeEventListener('cuechange', handler);
    }
    this.emit('subtitle', '', 0); // clear the previous track's subtitle immediately
    this.emit('tracks');
  }

  /** Must be called in subclasses' `destroy()` (the engine instance is recreated on every channel/movie change). */
  protected cleanupSubtitleCueListener(): void {
    this.cueCleanup?.();
    this.cueCleanup = null;
  }
}
