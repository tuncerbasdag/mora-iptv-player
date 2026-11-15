import { MediaElementEngine } from './mediaElementEngine.ts';
import type { EngineEmit } from './playbackEngine.ts';

/** Plain `<video src>`: plays MP4/MKV movies and native HLS (Safari). If `resumeSeconds` > 0, seeks there once metadata arrives. */
export class NativeEngine extends MediaElementEngine {
  readonly name = 'video';
  private onLoaded: (() => void) | null = null;
  private readonly url: string;
  private readonly resumeSeconds: number;

  constructor(video: HTMLVideoElement, emit: EngineEmit, url: string, resumeSeconds = 0) {
    super(video, emit);
    this.url = url;
    this.resumeSeconds = resumeSeconds;
  }

  async start(): Promise<void> {
    this.video.src = this.url;
    if (this.resumeSeconds > 0) {
      const onLoaded = (): void => {
        this.video.currentTime = this.resumeSeconds;
        this.video.removeEventListener('loadedmetadata', onLoaded);
        this.onLoaded = null;
      };
      this.onLoaded = onLoaded;
      this.video.addEventListener('loadedmetadata', onLoaded);
    }
    await this.video.play().catch(() => {});
  }

  destroy(): void {
    this.cleanupSubtitleCueListener();
    if (this.onLoaded) this.video.removeEventListener('loadedmetadata', this.onLoaded);
    this.onLoaded = null;
  }
}
