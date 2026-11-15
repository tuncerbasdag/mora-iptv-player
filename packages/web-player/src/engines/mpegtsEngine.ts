import mpegts from 'mpegts.js';
import { codecLabel } from '../../../ui/src/playerAdapter.ts';
import { MediaElementEngine } from './mediaElementEngine.ts';
import type { EngineEmit } from './playbackEngine.ts';

/** Raw MPEG-TS live stream (.ts) — via mpegts.js over MSE. */
export class MpegtsEngine extends MediaElementEngine {
  readonly name = 'mpegts.js';
  private player: ReturnType<typeof mpegts.createPlayer> | null = null;
  /** Latest speed from the STATISTICS_INFO event (KB/s → converted to kbps). */
  private kbps: number | null = null;
  private codecText: string | null = null;
  private fpsValue: number | null = null;

  private readonly url: string;

  constructor(video: HTMLVideoElement, emit: EngineEmit, url: string) {
    super(video, emit);
    this.url = url;
  }

  static isSupported(): boolean {
    return mpegts.isSupported();
  }

  async start(): Promise<void> {
    if (!mpegts.isSupported()) throw new Error('Bu tarayıcı mpegts.js akışını desteklemiyor.');
    // enableWorker: moves TS demuxing to a separate Web Worker; the main thread (UI + video decode) doesn't
    // contend with this load. When disabled, on weak CPUs (e.g. Tizen TV) the video can briefly freeze even
    // when the buffer is full (demuxing blocks the main thread).
    const player = mpegts.createPlayer({ type: 'mse', isLive: true, url: this.url }, { enableWorker: true });
    this.player = player;
    player.on(mpegts.Events.ERROR, () => this.emit('error'));
    player.on(mpegts.Events.STATISTICS_INFO, (info: { speed?: number }) => {
      this.kbps = typeof info?.speed === 'number' ? Math.round(info.speed * 8) : null;
    });
    player.on(mpegts.Events.MEDIA_INFO, (info: { videoCodec?: string; audioCodec?: string; fps?: number }) => {
      this.codecText = codecLabel(info?.videoCodec, info?.audioCodec);
      this.fpsValue = typeof info?.fps === 'number' && info.fps > 0 ? Math.round(info.fps) : null;
    });
    player.attachMediaElement(this.video);
    player.load();
    player.play();
  }

  destroy(): void {
    this.cleanupSubtitleCueListener();
    // destroy() alone is not enough: mpegts.js's loader (the fetch/XHR loop that keeps retrying on
    // errors, including the "StartupStallJumper" stuck-at-0 recovery) is only stopped by unload() —
    // skipping it leaves that loop running in the background (console spam + network requests) even
    // though the <video> element and the player object are both gone.
    try {
      this.player?.pause();
      this.player?.unload();
      this.player?.detachMediaElement();
    } catch {
      // best-effort teardown: a player already in a broken state (e.g. mid-error) can throw here
    }
    this.player?.destroy();
    this.player = null;
  }

  override bitrateKbps(): number | null {
    return this.kbps;
  }
  override codec(): string | null {
    return this.codecText;
  }
  override fps(): number | null {
    return this.fpsValue;
  }
}
