/**
 * E2E test sayfası: renderLiveScreen'i gerçek bir tarayıcıda, sahte oynatıcı/depo/kategorilerle çalıştırır.
 * Gerçek yayın, sağlayıcı ya da ağ gerekmez. Playwright testleri `window.__start(...)` ile ekranı kurar,
 * `window.__h` ile geri çağrıları ve oynatıcı çağrılarını okur.
 */
import { BasePlayerAdapter } from '../src/basePlayerAdapter.ts';
import type { PlayerAdapter } from '../src/playerAdapter.ts';
import { applyScaleToFit } from '../src/scaleToFit.ts';
import { renderLiveScreen, type LiveScreenResume } from '../src/screens/liveScreen.ts';
import { StreamBlockedError } from '../src/singleStream.ts';
import type { EpgService } from '../../core/src/epgService.ts';
import type { StorageAdapter } from '../../core/src/storage.ts';
import { DEFAULT_SETTINGS, type Category, type MediaItem } from '../../core/src/types.ts';

type PlayMode = 'ok' | 'fail' | 'blocked' | 'never';

interface StartOptions {
  playMode?: PlayMode;
  /** loadLive çağrısından ilk karenin ('playing') gelmesine kadar geçen süre. */
  loadMs?: number;
  favorites?: string[];
  /** true: ekran, tam ekrandan dönüşmüş gibi `resume` ile kurulur (zaten oynayan kanal). */
  resume?: boolean;
  /** true: EPG servisi yüklü gelir ('epg1' kanalında şu an + sonraki program). */
  epg?: boolean;
  /** Verilirse LOGOLU kategorisi eklenir; logo istekleri bu anahtarla sunucuda sayılır. */
  logoKey?: string;
}

const mk = (id: string, name: string, group: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  name,
  group,
  kind: 'live',
  url: `http://fake.test/live/${id}.m3u8`,
  ...extra,
});

export const CATEGORIES: Category<MediaItem>[] = [
  {
    name: 'ULUSAL',
    items: [
      mk('trt1', 'TR:TRT 1 HD', 'ULUSAL'),
      mk('show', 'TR:SHOW TV HD', 'ULUSAL'),
      mk('star', 'TR:STAR TV HD', 'ULUSAL'),
      mk('atv', 'TR:ATV HD', 'ULUSAL'),
      mk('kanald', 'TR:KANAL D HD', 'ULUSAL'),
    ],
  },
  {
    name: 'SPOR',
    items: [mk('bein1', 'TR:BEINSPORTS 1 HD', 'SPOR'), mk('bein2', 'TR:BEINSPORTS 2 HD', 'SPOR'), mk('ssport', 'TR:S SPORT', 'SPOR')],
  },
  {
    name: 'YEREL',
    items: [mk('brt1', 'TR:BRT 1 HD', 'YEREL'), mk('brt3', 'TR:BRT 3 HD', 'YEREL'), mk('brt3k', 'TR:BRT 3 (KIBRIS)', 'YEREL')],
  },
  { name: 'KİLİTLİ', locked: true, items: [mk('gizli', 'TR:GİZLİ KANAL', 'KİLİTLİ')] },
  {
    name: 'EPG DENEME',
    items: [
      mk('epg-a', 'EPG KANAL A', 'EPG DENEME', { tvgId: 'epg1' }),
      mk('epg-b', 'EPG KANAL B', 'EPG DENEME', { tvgId: 'bos' }),
      mk('epg-c', 'EPG KANAL C', 'EPG DENEME'),
      mk('long', 'ÇOK UZUN BİR KANAL ADI Kİ SATIRA SIĞMAYIP KAYAN YAZI OLARAK GÖSTERİLMELİ', 'EPG DENEME'),
    ],
  },
];

/** Logo yükleme testi için: 60 kanal (ilk 30'u hemen, kalanı kaydırdıkça yüklenir) + 1 bozuk logo. */
export function logoCategory(key: string): Category<MediaItem> {
  const items = Array.from({ length: 60 }, (_, i) =>
    mk(`logo${i}`, `LOGO ${String(i + 1).padStart(2, '0')}`, 'LOGOLU', { logo: `/logo/ok-${i}.svg?k=${key}` }),
  );
  items[1] = mk('logo1', 'LOGO 02', 'LOGOLU', { logo: `/logo/bad.png?k=${key}` });
  return { name: 'LOGOLU', items };
}

class FakeAdapter extends BasePlayerAdapter implements PlayerAdapter {
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  constructor(private readonly h: Harness) {
    super();
    h.adapters.push(this);
  }
  /** Testlerin gerçek oynatıcıdan gelen olayı (buffering, error...) simüle etmesi için. */
  override emit(event: Parameters<BasePlayerAdapter['on']>[0], ...args: unknown[]): void {
    super.emit(event, ...args);
  }
  async loadLive(url: string): Promise<void> {
    this.h.calls.loadLive.push(url);
    const { playMode, loadMs } = this.h.opts;
    if (playMode === 'fail') throw new Error('boom');
    if (playMode === 'blocked') throw new StreamBlockedError('Hesap başka bir cihazda kullanılıyor.');
    if (playMode === 'never') return;
    // Gerçek oynatıcı gibi: tampon yüzdesi ilk kareye kadar 0 bildirilir, sonra 'playing' gelir.
    for (let t = 0; t < loadMs; t += 200) this.timers.push(setTimeout(() => this.emit('bufferprogress', 0), t));
    this.timers.push(
      setTimeout(() => {
        this.emit('playing');
        this.emit('stats', { width: 1920, height: 1080, kbps: 4850, fps: 25, codec: 'H.264 · AAC' });
      }, loadMs),
    );
  }
  async loadVod(): Promise<void> {}
  play(): void {}
  pause(): void {}
  stop(): void {
    this.h.calls.stop++;
  }
  seek(): void {}
  getCurrentTime(): number {
    return 0;
  }
  getDuration(): number {
    return 0;
  }
  isPaused(): boolean {
    return false;
  }
  moveTo(): void {}
  override destroy(): void {
    this.timers.forEach(clearTimeout);
    super.destroy();
  }
}

function memoryStorage(favs: string[]): StorageAdapter {
  const fav = new Set(favs);
  let lastLive: string | null = null;
  return {
    getSettings: () => DEFAULT_SETTINGS,
    setSettings: () => {},
    loadLibrary: async () => null,
    saveLibrary: async () => {},
    deleteLibrary: async () => {},
    getResume: () => 0,
    setResume: () => {},
    getProgress: () => null,
    getRecents: () => [],
    getLastLive: () => lastLive,
    setLastLive: (id) => {
      lastLive = id;
    },
    getFavorites: () => [...fav],
    isFavorite: (id) => fav.has(id),
    setFavorite: (id, v) => void (v ? fav.add(id) : fav.delete(id)),
  };
}

interface Harness {
  opts: Required<Pick<StartOptions, 'playMode' | 'loadMs'>>;
  calls: { loadLive: string[]; stop: number };
  back: number;
  fullscreen: Array<{ id: string; categoryId: string }>;
  unlock: string[];
  favorites: () => string[];
  /** Ekranda oluşturulan oynatıcı sayısı (kanal değiştirince yenisi açılmamalı). */
  adaptersCreated: number;
  adapters: FakeAdapter[];
  /** Son oynatıcıya olay gönderir. */
  emit: (event: Parameters<FakeAdapter['emit']>[0], ...args: unknown[]) => void;
}

declare global {
  interface Window {
    __start: (o?: StartOptions) => void;
    __h: Harness;
  }
}

window.__start = (o: StartOptions = {}) => {
  const container = document.getElementById('app')!;
  applyScaleToFit(container); // gerçek uygulamadaki gibi sahneyi ortalar/ölçekler
  const storage = memoryStorage(o.favorites ?? []);
  const h: Harness = {
    opts: { playMode: o.playMode ?? 'ok', loadMs: o.loadMs ?? 300 },
    calls: { loadLive: [], stop: 0 },
    back: 0,
    fullscreen: [],
    unlock: [],
    favorites: () => storage.getFavorites(),
    adaptersCreated: 0,
    adapters: [],
    emit: (event, ...args) => h.adapters[h.adapters.length - 1].emit(event, ...args),
  };
  window.__h = h;
  let resume: LiveScreenResume | undefined;
  if (o.resume) {
    const item = CATEGORIES[0].items[1];
    const adapter = new FakeAdapter(h);
    resume = { item, adapter, categoryId: 'cat-0' };
  }
  const cats = o.logoKey ? [...CATEGORIES, logoCategory(o.logoKey)] : CATEGORIES;
  const now = Date.now();
  const epg = o.epg
    ? ({
        isLoaded: () => true,
        getPrograms: (id: string) =>
          id === 'epg1'
            ? [
                { channelId: id, start: now - 30 * 60000, stop: now + 30 * 60000, title: 'Akşam Haberleri' },
                { channelId: id, start: now + 30 * 60000, stop: now + 90 * 60000, title: 'Gece Filmi' },
              ]
            : [],
      } as unknown as EpgService)
    : null;
  renderLiveScreen(
    container,
    cats,
    storage,
    epg,
    () => {
      h.adaptersCreated++;
      return new FakeAdapter(h);
    },
    {
      onBack: () => void h.back++,
      onFullscreen: (item, _adapter, categoryId) => void h.fullscreen.push({ id: item.id, categoryId }),
      onUnlockRequest: (id) => void h.unlock.push(id),
    },
    resume,
  );
};
