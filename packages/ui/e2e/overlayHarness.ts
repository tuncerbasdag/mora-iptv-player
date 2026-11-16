/**
 * E2E test page for the player overlay (playerOverlay.ts): real PlayerController + real screen,
 * with a fake PlayerAdapter. Playwright tests set it up via `window.__ovStart(...)` and, via `window.__o`,
 * read player calls and send events.
 */
import { BasePlayerAdapter } from '../src/basePlayerAdapter.ts';
import type { DiagnosticsCapable, PlayerAdapter, PlayerAdapterEvent, PlayerDiagnostics } from '../src/playerAdapter.ts';
import { renderPlayerOverlay, type PlayerOverlayHandle } from '../src/screens/playerOverlay.ts';
import { applyScaleToFit } from '../src/scaleToFit.ts';
import { StreamBlockedError } from '../src/singleStream.ts';
import type { MediaTrack } from '../src/mediaTracks.ts';
import type { StorageAdapter, WatchProgress } from '../../core/src/storage.ts';
import { DEFAULT_SETTINGS, type MediaItem, type Settings } from '../../core/src/types.ts';

type PlayMode = 'ok' | 'fail' | 'blocked' | 'never';

interface OverlayOptions {
  playMode?: PlayMode;
  /** Time (ms) from the loadLive/loadVod call until 'playing'. */
  loadMs?: number;
  /** Movie/episode duration (sec). */
  duration?: number;
  /** Whether the series episode navigation buttons (previous/next) are visible. */
  episodeNav?: boolean;
  /** Whether audio/subtitle tracks are reported. */
  tracks?: boolean;
  /** Channel-switch targets (Up/Down); returns null if none. */
  channels?: MediaItem[];
  /** Subtitle style (if omitted, DEFAULT_SETTINGS.subtitleStyle). */
  subtitleStyle?: Settings['subtitleStyle'];
}

const LIVE: MediaItem = { id: 'l1', name: 'TR:ALPHA 1 HD', group: 'ULUSAL', kind: 'live', url: 'http://fake.test/live/alpha1.m3u8' };
const LIVE2: MediaItem = { id: 'l2', name: 'TR:BRAVO TV HD', group: 'ULUSAL', kind: 'live', url: 'http://fake.test/live/bravo.m3u8' };
export const ITEMS: Record<string, MediaItem> = {
  live: LIVE,
  live2: LIVE2,
  movie: { id: 'm1', name: 'Demir Köprü (2022)', group: 'Aksiyon', kind: 'movie', url: 'http://fake.test/movie/m1.mp4' },
  episode: {
    id: 'e1',
    name: 'Gece Yarısı S02E04 Kayıp Anahtar',
    group: 'Diziler',
    kind: 'series',
    url: 'http://fake.test/series/e1.mp4',
    episode: { show: 'Gece Yarısı', season: 2, episode: 4 },
  },
};

class FakeAdapter extends BasePlayerAdapter implements PlayerAdapter, DiagnosticsCapable {
  /** Set manually for the diagnostics panel test. */
  diagnostics: PlayerDiagnostics = { engine: 'hls.js', bufferSeconds: 3.2, bufferMode: 'low', holding: false, stalls: 1, droppedFrames: 12, totalFrames: 1450, events: ['12.3 waiting · tampon 0.4', '12.9 playing · tampon 2.1'] };
  getDiagnostics(): PlayerDiagnostics {
    return this.diagnostics;
  }
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  paused = true;
  time = 0;
  dur: number;
  audioTrack = 0;
  subTrack = -1;
  audio: MediaTrack[] = [];
  subs: MediaTrack[] = [];
  readonly calls = { loadLive: [] as string[], loadVod: [] as Array<{ url: string; resume: number }>, seek: [] as number[], play: 0, pause: 0, stop: 0, destroy: 0, setAudio: [] as number[], setSub: [] as number[] };

  constructor(private readonly o: Required<Pick<OverlayOptions, 'playMode' | 'loadMs'>>, duration: number) {
    super();
    this.dur = duration;
  }
  override emit(event: PlayerAdapterEvent, ...args: unknown[]): void {
    super.emit(event, ...args);
  }
  private begin(): void {
    const { playMode, loadMs } = this.o;
    if (playMode === 'fail') throw new Error('boom');
    if (playMode === 'blocked') throw new StreamBlockedError('Hesap başka bir cihazda kullanılıyor.');
    if (playMode === 'never') return;
    for (let t = 0; t < loadMs; t += 200) this.timers.push(setTimeout(() => this.emit('bufferprogress', 0), t));
    this.timers.push(
      setTimeout(() => {
        this.paused = false;
        this.emit('tracks'); // like real engines: the track list is (re)reported on every load
        this.emit('playing');
        this.emit('stats', { width: 1920, height: 1080, kbps: 4850, fps: 25, codec: 'H.264 · AAC' });
      }, loadMs),
    );
  }
  async loadLive(url: string): Promise<void> {
    this.calls.loadLive.push(url);
    this.begin();
  }
  async loadVod(url: string, resume: number): Promise<void> {
    this.calls.loadVod.push({ url, resume });
    this.time = resume;
    this.begin();
  }
  play(): void {
    this.calls.play++;
    this.paused = false;
  }
  pause(): void {
    this.calls.pause++;
    this.paused = true;
  }
  stop(): void {
    this.calls.stop++;
  }
  seek(s: number): void {
    this.calls.seek.push(s);
    this.time = s;
  }
  getCurrentTime(): number {
    return this.time;
  }
  getDuration(): number {
    return this.dur;
  }
  isPaused(): boolean {
    return this.paused;
  }
  moveTo(): void {}
  getAudioTracks(): MediaTrack[] {
    return this.audio;
  }
  getAudioTrack(): number {
    return this.audioTrack;
  }
  setAudioTrack(id: number): void {
    this.calls.setAudio.push(id);
    this.audioTrack = id;
  }
  getSubtitleTracks(): MediaTrack[] {
    return this.subs;
  }
  getSubtitleTrack(): number {
    return this.subTrack;
  }
  setSubtitleTrack(id: number): void {
    this.calls.setSub.push(id);
    this.subTrack = id;
  }
  override destroy(): void {
    this.calls.destroy++;
    this.timers.forEach(clearTimeout);
    super.destroy();
  }
}

function memoryStorage(settings: Settings): StorageAdapter {
  const resume = new Map<string, WatchProgress>();
  let last: string | null = null;
  return {
    getSettings: () => settings,
    setSettings: () => {},
    loadLibrary: async () => null,
    saveLibrary: async () => {},
    deleteLibrary: async () => {},
    getResume: (id) => resume.get(id)?.seconds ?? 0,
    setResume: (id, seconds, duration = 0) => void resume.set(id, { id, seconds, duration, at: Date.now() }),
    getProgress: (id) => resume.get(id) ?? null,
    getRecents: () => [...resume.values()],
    getLastLive: () => last,
    setLastLive: (id) => void (last = id),
    getFavorites: () => [],
    isFavorite: () => false,
    setFavorite: () => {},
  };
}

interface Overlay {
  adapter: FakeAdapter;
  handle: PlayerOverlayHandle;
  back: number;
  ended: number;
  prev: number;
  next: number;
  steps: number[];
  /** Starts the controller: playLive for live, playVod for movies/series. */
  play: (key: keyof typeof ITEMS) => void;
  emit: (event: PlayerAdapterEvent, ...args: unknown[]) => void;
  setTracks: (audio: MediaTrack[], subs: MediaTrack[]) => void;
  set: (patch: { time?: number; duration?: number; playMode?: PlayMode }) => void;
  destroy: (keep?: boolean) => void;
  opts: Required<Pick<OverlayOptions, 'playMode' | 'loadMs'>>;
}

declare global {
  interface Window {
    __ovStart: (o?: OverlayOptions) => void;
    __o: Overlay;
  }
}

window.__ovStart = (o: OverlayOptions = {}) => {
  const container = document.getElementById('app')!;
  applyScaleToFit(container);
  const opts = { playMode: o.playMode ?? 'ok', loadMs: o.loadMs ?? 300 };
  const adapter = new FakeAdapter(opts, o.duration ?? 6720);
  const state: Overlay = {
    adapter,
    handle: undefined as unknown as PlayerOverlayHandle,
    back: 0,
    ended: 0,
    prev: 0,
    next: 0,
    steps: [],
    play: (key) => {
      const item = ITEMS[key];
      void (item.kind === 'live' ? state.handle.controller.playLive(item) : state.handle.controller.playVod(item));
    },
    emit: (event, ...args) => adapter.emit(event, ...args),
    setTracks: (audio, subs) => {
      adapter.audio = audio;
      adapter.subs = subs;
      adapter.emit('tracks');
    },
    set: (p) => {
      if (p.time !== undefined) adapter.time = p.time;
      if (p.duration !== undefined) adapter.dur = p.duration;
      if (p.playMode) opts.playMode = p.playMode;
    },
    destroy: (keep) => state.handle.destroy(keep ? { keepAdapterAlive: true } : undefined),
    opts,
  };
  window.__o = state;
  const channels = o.channels ?? [];
  let ci = -1;
  state.handle = renderPlayerOverlay(
    container,
    memoryStorage({ ...DEFAULT_SETTINGS, subtitleStyle: o.subtitleStyle ?? DEFAULT_SETTINGS.subtitleStyle }),
    () => adapter,
    {
      onBack: () => void state.back++,
      onEnded: () => void state.ended++,
      onChannelStep: (dir) => {
        state.steps.push(dir);
        ci += dir;
        return channels[ci] ?? null;
      },
      ...(o.episodeNav ? { onPrevEpisode: () => void state.prev++, onNextEpisode: () => void state.next++ } : {}),
    },
  );
  state.handle.controller.vodRetryBaseMs = 200; // make retries fast in the test
  if (o.tracks) {
    adapter.audio = [
      { id: 0, label: 'Türkçe', detail: 'Stereo' },
      { id: 1, label: 'İngilizce', detail: '5.1' },
    ];
    adapter.subs = [{ id: 0, label: 'Türkçe' }];
    adapter.emit('tracks'); // real players report this once the track list is ready
  }
};
