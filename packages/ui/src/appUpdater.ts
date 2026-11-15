/** Desktop (Electron) app updater as seen by the UI. Provided by the desktop shell only (window.moraDesktop.updater); web and Tizen don't have it. */
export type AppUpdateStatus = 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  /** auto: installs inside the app; manual: opens the releases page (unsigned macOS); disabled: development run. */
  policy: 'auto' | 'manual' | 'disabled';
  /** New version (available / downloading / ready). */
  version?: string;
  /** Download progress, 0-100 (downloading). */
  percent?: number;
  message?: string;
}

export interface AppUpdater {
  getState(): Promise<AppUpdateState | null>;
  check(): void;
  download(): void;
  install(): void;
  openReleases(): void;
  /** Returns the unsubscribe function. */
  onState(callback: (state: AppUpdateState) => void): () => void;
  /** The "Help → Check for Updates…" menu item was chosen. */
  onOpenUpdates(callback: () => void): () => void;
}

export type AppUpdateAction = 'check' | 'download' | 'install' | 'open-releases';

export interface AppUpdateView {
  status: string;
  detail: string;
  /** Label of the single contextual button, and what pressing it does (null = disabled). */
  label: string;
  action: AppUpdateAction | null;
  /** 0-100 when a progress bar should be shown. */
  progress: number | null;
}

/** Pure mapping state → what the Update page shows (texts, the contextual button). */
export function describeUpdate(state: AppUpdateState): AppUpdateView {
  const v = state.version ? ` ${state.version}` : '';
  switch (state.status) {
    case 'disabled':
      return { status: 'Güncellemeler kapalı', detail: 'Güncellemeler yalnızca kurulu uygulamada denetlenir (bu bir geliştirme çalıştırması).', label: 'Güncellemeleri denetle', action: null, progress: null };
    case 'checking':
      return { status: 'Denetleniyor…', detail: 'Yeni sürüm aranıyor.', label: 'Denetleniyor…', action: null, progress: null };
    case 'up-to-date':
      return { status: 'Güncelsin', detail: 'En son sürümü kullanıyorsun.', label: 'Tekrar denetle', action: 'check', progress: null };
    case 'available':
      return state.policy === 'manual'
        ? { status: `Yeni sürüm var:${v}`, detail: 'İndirme sayfasından yeni sürümü indirip mevcut uygulamanın üzerine kur.', label: 'İndirme sayfasını aç', action: 'open-releases', progress: null }
        : { status: `Yeni sürüm var:${v}`, detail: 'İndirmek istersen düğmeye bas. Güncelleme uygulamayı yeniden başlatınca kurulur.', label: 'İndir', action: 'download', progress: null };
    case 'downloading':
      return { status: `İndiriliyor… %${state.percent ?? 0}`, detail: `Sürüm${v} indiriliyor.`, label: 'İndiriliyor…', action: null, progress: state.percent ?? 0 };
    case 'ready':
      return { status: `Sürüm${v} kuruluma hazır`, detail: 'Uygulama yeniden başlayarak güncellemeyi tamamlar.', label: 'Yeniden başlat ve kur', action: 'install', progress: null };
    case 'error':
      return { status: 'Denetlenemedi', detail: state.message || 'Bilinmeyen hata.', label: 'Tekrar dene', action: 'check', progress: null };
    default:
      return { status: 'Hazır', detail: 'Yeni sürüm olup olmadığını denetlemek için düğmeye bas.', label: 'Güncellemeleri denetle', action: 'check', progress: null };
  }
}
