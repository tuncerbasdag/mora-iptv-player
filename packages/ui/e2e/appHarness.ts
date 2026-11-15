/**
 * Uygulama düzeyi (startApp: ekranlar arası geçiş, ebeveyn kilidi oturumu, oynatıcı devri) E2E test sayfası.
 * Gerçek PlaylistService + gerçek ekranlar; depo bellekte, oynatıcı sahte. Playwright `window.__appStart(...)` ile kurar.
 */
import { BasePlayerAdapter } from '../src/basePlayerAdapter.ts';
import { startApp } from '../src/app.ts';
import type { PlayerAdapter, PlayerAdapterEvent } from '../src/playerAdapter.ts';
import { applyScaleToFit } from '../src/scaleToFit.ts';
import { PlaylistService } from '../../core/src/playlistService.ts';
import type { StorageAdapter, WatchProgress } from '../../core/src/storage.ts';
import type { AppUpdateState, AppUpdater } from '../src/appUpdater.ts';
import { DEFAULT_SETTINGS, type Library, type MediaItem, type Settings, type Show } from '../../core/src/types.ts';

interface AppOptions {
  /** Ebeveyn kilidi açık: "XXX ADULT" kategorisi ve (lockSettings ile) Ayarlar kilitli. PIN: 0000 (varsayılan). */
  parental?: boolean;
  lockSettings?: boolean;
  /** Tema kimliği (data-theme'e uygulanmalı). */
  theme?: Settings['theme'];
  /** Altyazı stili başlangıç değeri (verilmezse DEFAULT_SETTINGS.subtitleStyle). */
  subtitleStyle?: Settings['subtitleStyle'];
  /** Oynatma sahte oynatıcıda 'playing'e kadar geçen ms. */
  loadMs?: number;
  /** İkinci (pasif, Xtream) bağlantı: düzenleme/aktif etme/silme testleri için. */
  second?: boolean;
  /** Uzaktan yükleme yapılandırılmış: Bağlantı Ekle'de "Uzaktan Yükle" düğmesi çıkar. */
  remote?: boolean;
  /** EPG ve otomatik güncelleme gibi ayarların başlangıç değerleri. */
  autoRefresh?: boolean;
  /** Hiç bağlantı yok (ilk kurulum): anasayfa kartları soluk, "Bağlantı seç". */
  noConnection?: boolean;
  /** Aktif bağlantının son durumu (anasayfa rozetindeki nokta rengi). */
  status?: 'ok' | 'error' | 'none';
  /** Dizi detayı testleri için ek diziler: numarasız bölümlü ve 20 bölümlü (küçük resimli) dizi. */
  extraShows?: boolean;
  /** İzleme kayıtları tohumu: [bölüm/film kimliği, izlenen sn, süre sn] (eski → yeni sırayla; en yeni başta görünür). */
  progress?: Array<[string, number, number]>;
  /** Verilirse bölüm küçük resimleri /logo/ üzerinden bu anahtarla istenir (sunucuda sayılır). */
  logoKey?: string;
  /** Masaüstü güncelleyicisi (sahte): verilirse Ayarlar'da "Güncelleme" sayfası çıkar. `__app.updater` ile sürülür. */
  updater?: Partial<AppUpdateState>;
}

const live = (id: string, name: string, group: string): MediaItem => ({ id, name, group, kind: 'live', url: `http://fake.test/live/${id}.m3u8` });
const movie = (i: number): MediaItem => ({ id: `m${i}`, name: `Film ${i} (20${10 + i})`, group: 'Aksiyon', kind: 'movie', url: `http://fake.test/movie/m${i}.mp4` });
const ep = (s: number, e: number): MediaItem => ({
  id: `s${s}e${e}`,
  name: `Gece Yarısı S0${s}E0${e} Bölüm ${e}`,
  group: 'Dizi A',
  kind: 'series',
  url: `http://fake.test/series/s${s}e${e}.mp4`,
  episode: { show: 'Gece Yarısı', season: s, episode: e },
});

const SHOW: Show = {
  id: 'show1',
  title: 'Gece Yarısı (2021)',
  seasons: [
    { number: 1, episodes: [ep(1, 1), ep(1, 2)] },
    { number: 2, episodes: [ep(2, 1), ep(2, 2)] },
  ],
};

const PLAIN_SHOW: Show = {
  id: 'plain',
  title: 'Numarasız Dizi',
  seasons: [{ number: 1, episodes: [1, 2, 3].map((i): MediaItem => ({ id: `pl${i}`, name: `Numarasız Dizi - Kayıt ${i}`, group: 'Dizi A', kind: 'series', url: `http://fake.test/series/pl${i}.mp4` })) }],
};

function longShow(logoKey: string | undefined): Show {
  return {
    id: 'long',
    title: 'Uzun Dizi',
    seasons: [
      {
        number: 1,
        episodes: Array.from({ length: 20 }, (_, i): MediaItem => ({
          id: `lg${i + 1}`,
          name: `Uzun Dizi S01E${String(i + 1).padStart(2, '0')} Bölüm ${i + 1}`,
          group: 'Dizi A',
          kind: 'series',
          url: `http://fake.test/series/lg${i + 1}.mp4`,
          episode: { show: 'Uzun Dizi', season: 1, episode: i + 1 },
          ...(logoKey ? { logo: `/logo/ok-ep${i + 1}.svg?k=${logoKey}` } : {}),
        })),
      },
    ],
  };
}

const LIBRARY: Library = {
  live: [
    { name: 'ULUSAL', items: [live('trt1', 'TR:TRT 1 HD', 'ULUSAL'), live('show', 'TR:SHOW TV HD', 'ULUSAL'), live('star', 'TR:STAR TV HD', 'ULUSAL')] },
    { name: 'SPOR', items: [live('bein1', 'TR:BEINSPORTS 1 HD', 'SPOR'), live('bein2', 'TR:BEINSPORTS 2 HD', 'SPOR')] },
    { name: 'XXX ADULT', items: [live('gizli', 'TR:GİZLİ KANAL', 'XXX ADULT')] },
  ],
  movies: [{ name: 'Aksiyon', items: [movie(1), movie(2), movie(3)] }],
  series: [{ name: 'Dizi A', items: [SHOW] }],
  counts: { live: 6, movies: 3, series: 1, episodes: 4 },
};

/** İkinci bağlantının kütüphanesi: daha az kanal (aktif etmek anasayfa sayaçlarını günceller). */
const SECOND_LIBRARY: Library = { ...LIBRARY, live: LIBRARY.live.slice(0, 1), counts: { live: 3, movies: 3, series: 1, episodes: 4 } };

class FakeAdapter extends BasePlayerAdapter implements PlayerAdapter {
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  paused = true;
  time = 0;
  readonly calls = { loadLive: [] as string[], loadVod: [] as string[], stop: 0, destroy: 0, moveTo: 0 };
  constructor(private readonly h: AppHarness) {
    super();
    h.adapters.push(this);
  }
  override emit(event: PlayerAdapterEvent, ...args: unknown[]): void {
    super.emit(event, ...args);
  }
  private begin(): void {
    this.timers.push(
      setTimeout(() => {
        this.paused = false;
        this.emit('playing');
        this.emit('stats', { width: 1920, height: 1080, kbps: 4850, fps: 25, codec: 'H.264 · AAC' });
      }, this.h.loadMs),
    );
  }
  async loadLive(url: string): Promise<void> {
    this.calls.loadLive.push(url);
    this.begin();
  }
  async loadVod(url: string): Promise<void> {
    this.calls.loadVod.push(url);
    this.begin();
  }
  play(): void {
    this.paused = false;
  }
  pause(): void {
    this.paused = true;
  }
  stop(): void {
    this.calls.stop++;
  }
  seek(s: number): void {
    this.time = s;
  }
  getCurrentTime(): number {
    return this.time;
  }
  getDuration(): number {
    return 6000;
  }
  isPaused(): boolean {
    return this.paused;
  }
  moveTo(): void {
    this.calls.moveTo++;
  }
  override destroy(): void {
    this.calls.destroy++;
    this.timers.forEach(clearTimeout);
    super.destroy();
  }
}

function memoryStorage(settings: Settings, library: Library, seed: Array<[string, number, number]> = []): StorageAdapter {
  let st = settings;
  const fav = new Set<string>();
  const progress = new Map<string, WatchProgress>();
  seed.forEach(([id, seconds, duration], i) => progress.set(id, { id, seconds, duration, at: 1000 + i }));
  let last: string | null = null;
  return {
    getSettings: () => st,
    setSettings: (s) => void (st = s),
    loadLibrary: async (id) => (id === 'c2' ? SECOND_LIBRARY : library),
    saveLibrary: async () => {},
    deleteLibrary: async () => {},
    getResume: (id) => progress.get(id)?.seconds ?? 0,
    setResume: (id, seconds, duration = 0) => void progress.set(id, { id, seconds, duration, at: Date.now() }),
    getProgress: (id) => progress.get(id) ?? null,
    getRecents: () => [...progress.values()].sort((a, b) => b.at - a.at),
    getLastLive: () => last,
    setLastLive: (id) => void (last = id),
    getFavorites: () => [...fav],
    isFavorite: (id) => fav.has(id),
    setFavorite: (id, v) => void (v ? fav.add(id) : fav.delete(id)),
  };
}

interface AppHarness {
  loadMs: number;
  adapters: FakeAdapter[];
  /** Son oluşturulan oynatıcıya olay gönderir. */
  emit: (event: PlayerAdapterEvent, ...args: unknown[]) => void;
  settings: () => Settings;
  playlist: PlaylistService;
  stop: () => void;
  /** Sahte güncelleyici: durumu değiştirir (arayüze iletilir) ve yapılan çağrıları kaydeder. */
  updater: { set: (s: Partial<AppUpdateState>) => void; calls: string[]; menuOpen: () => void };
}

declare global {
  interface Window {
    __appStart: (o?: AppOptions) => Promise<void>;
    __app: AppHarness;
  }
}

window.__appStart = async (o: AppOptions = {}) => {
  const container = document.getElementById('app')!;
  applyScaleToFit(container);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    autoRefreshOnStart: !!o.autoRefresh,
    theme: o.theme ?? 'default',
    subtitleStyle: o.subtitleStyle ?? DEFAULT_SETTINGS.subtitleStyle,
    connections: o.noConnection ? [] : [
      { id: 'c1', name: 'Deneme Listesi', source: { kind: 'm3u', url: 'http://fake.test/list.m3u' }, url: 'http://fake.test/list.m3u', addedAt: 1, lastUpdated: 1, lastHash: null, status: o.status ?? 'ok', counts: LIBRARY.counts },
      ...(o.second
        ? [{ id: 'c2', name: 'İkinci Liste', source: { kind: 'xtream' as const, server: 'http://x.test:8080', username: 'ali', password: 'gizli' }, url: 'http://x.test:8080/get.php?username=ali&password=gizli&type=m3u_plus&output=ts', addedAt: 2, lastUpdated: null, lastHash: null, status: 'none' as const, counts: null }]
        : []),
    ],
    activeConnectionId: o.noConnection ? null : 'c1',
    parental: { ...DEFAULT_SETTINGS.parental, enabled: !!o.parental, lockSettings: !!o.lockSettings },
  };
  const library: Library = o.extraShows
    ? { ...LIBRARY, series: [{ name: 'Dizi A', items: [SHOW, PLAIN_SHOW, longShow(o.logoKey)] }], counts: { ...LIBRARY.counts, series: 3 } }
    : LIBRARY;
  const storage = memoryStorage(settings, library, o.progress);
  const playlist = new PlaylistService(storage, async () => {
    throw new Error('ağ yok (test)'); // yenilemeler başarısız olur, önbellekteki kütüphane korunur
  });
  await playlist.init();
  const h: AppHarness = {
    loadMs: o.loadMs ?? 300,
    adapters: [],
    emit: (event, ...args) => h.adapters[h.adapters.length - 1].emit(event, ...args),
    settings: () => storage.getSettings(),
    playlist,
    stop: () => {},
    updater: { set: () => {}, calls: [], menuOpen: () => {} },
  };
  let appUpdater: AppUpdater | undefined;
  if (o.updater) {
    let state: AppUpdateState = { status: 'idle', currentVersion: '0.0.1', policy: 'auto', ...o.updater };
    const stateListeners = new Set<(s: AppUpdateState) => void>();
    const menuListeners = new Set<() => void>();
    h.updater = {
      calls: [],
      set: (s) => {
        state = { ...state, ...s };
        for (const l of stateListeners) l(state);
      },
      menuOpen: () => menuListeners.forEach((l) => l()),
    };
    appUpdater = {
      getState: async () => state,
      check: () => void h.updater.calls.push('check'),
      download: () => void h.updater.calls.push('download'),
      install: () => void h.updater.calls.push('install'),
      openReleases: () => void h.updater.calls.push('open-releases'),
      onState: (cb) => (stateListeners.add(cb), () => void stateListeners.delete(cb)),
      onOpenUpdates: (cb) => (menuListeners.add(cb), () => void menuListeners.delete(cb)),
    };
  }
  window.__app = h;
  h.stop = startApp({
    container,
    playlist,
    storage,
    epgService: null,
    appUpdater,
    ...(o.remote ? { remoteSetup: { portalUrl: 'http://portal.test:8788', getDeviceMac: async () => '02:AA:BB:CC:DD:EE' } } : {}),
    createPlayerAdapter: () => new FakeAdapter(h),
  });
};
