import type { PlaylistPort } from '../../../core/src/playlistService.ts';
import type { Library } from '../../../core/src/types.ts';
import { FocusManager } from '../focusManager.ts';
import { movieIconSvg, seriesIconSvg, tvIconSvg } from '../icons.ts';
import { HomeCard, type HomeCardSpec } from './welcome/homeCard.ts';
import type { AppUpdateState, AppUpdater } from '../appUpdater.ts';
import { buildWelcomeHeader, setUpdateBadge } from './welcome/welcomeHeader.ts';
import { welcomeCandidateFilter } from './welcome/welcomeNav.ts';

/** Injected by the web/Tizen builds (esbuild `define`, from package.json); absent in other bundles (e.g. tests). */
declare const __APP_VERSION__: string | undefined;

export interface WelcomeScreenCallbacks {
  onOpenLive: () => void;
  onOpenMovies: () => void;
  onOpenSeries: () => void;
  onOpenSettings: () => void;
  /** Parental lock state: 'off' when disabled (button hidden), 'locked' when enabled but PIN hasn't been entered yet, 'open' once it has. */
  parentalState?: () => 'off' | 'locked' | 'open';
  /** Enter on the lock button: prompts for the PIN when locked, re-locks when open. */
  onToggleParental?: () => void;
  /** Library already filtered to exclude locked categories (so the counters don't leak locked content); falls back to the playlist's library if not provided. */
  getLibrary?: () => Library | null;
  /** Desktop app only: shows a "new version" badge when the updater finds one. */
  appUpdater?: AppUpdater;
  onOpenUpdates?: () => void;
}

/**
 * Home screen: a large "Live TV" card on the left, with "Series" and "Movies" cards stacked on the right (colored,
 * with icons). Logo (Mora IPTV Player) on the left, lock/connection badge/Settings in the top right. Cards don't open
 * until a connection has been added (they appear faded and clicking/pressing does nothing). Clears the container and
 * sets up its own FocusManager; the caller must call the returned FocusManager.destroy() on screen change.
 */
export function renderWelcomeScreen(container: HTMLElement, playlist: PlaylistPort, cb: WelcomeScreenCallbacks): FocusManager {
  container.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'screen';
  Object.assign(screen.style, { padding: '56px 160px', gap: '0' });

  const header = buildWelcomeHeader({
    active: playlist.getActiveConnection(),
    parentalState: cb.parentalState?.() ?? 'off',
    onOpenSettings: cb.onOpenSettings,
    onToggleParental: cb.onToggleParental,
    ...(cb.appUpdater && cb.onOpenUpdates ? { onOpenUpdates: cb.onOpenUpdates } : {}),
  });

  const grid = document.createElement('div');
  Object.assign(grid.style, { flex: '1', minHeight: '0', display: 'flex', alignItems: 'center' });
  const gridInner = document.createElement('div');
  Object.assign(gridInner.style, {
    width: '100%',
    height: '600px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
    gap: '32px',
  });
  grid.append(gridInner);

  const specs: HomeCardSpec[] = [
    { id: 'live-card', title: 'Canlı TV', icon: tvIconSvg(180), background: 'var(--card-live)', hero: true, getCountLabel: (l) => (l ? `${l.counts.live} kanal` : ''), onOpen: cb.onOpenLive },
    { id: 'series-card', title: 'Diziler', icon: seriesIconSvg(112), background: 'var(--card-series)', hero: false, getCountLabel: (l) => (l ? `${l.counts.series} dizi` : ''), onOpen: cb.onOpenSeries },
    { id: 'movies-card', title: 'Filmler', icon: movieIconSvg(112), background: 'var(--card-movies)', hero: false, getCountLabel: (l) => (l ? `${l.counts.movies} film` : ''), onOpen: cb.onOpenMovies },
  ];
  const cards = specs.map((s) => new HomeCard(s));
  gridInner.append(...cards.map((c) => c.el));

  screen.append(header, grid);

  // Small version label, bottom right (web, Electron and Tizen builds).
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) {
    const ver = document.createElement('div');
    ver.textContent = `v${__APP_VERSION__}`;
    ver.setAttribute('data-testid', 'app-version');
    Object.assign(ver.style, { position: 'absolute', right: '160px', bottom: '20px', fontSize: '18px', color: 'var(--text-dim, rgba(255,255,255,0.45))', pointerEvents: 'none' });
    screen.style.position = 'relative';
    screen.append(ver);
  }
  container.append(screen);

  const libraryNow = (): Library | null => (cb.getLibrary ? cb.getLibrary() : playlist.getLibrary());
  const applyLibrary = (lib: Library | null): void => cards.forEach((c) => c.setLibrary(lib));
  const applyConnectionState = (): void => {
    const connected = !!playlist.getActiveConnection();
    cards.forEach((c) => c.setEnabled(connected));
  };
  applyLibrary(libraryNow());
  applyConnectionState();

  const unsubscribe = playlist.on((e) => {
    if (e.type === 'library-loaded') applyLibrary(libraryNow());
    if (e.type === 'refresh-success') {
      applyLibrary(libraryNow());
      applyConnectionState();
    }
  });

  const focusManager = new FocusManager(screen, {
    onBack: () => {
      /* the back button does nothing on the welcome screen */
    },
    candidateFilter: welcomeCandidateFilter,
  });
  // The constructor focuses the first element in DOM order (the Settings icon) — we explicitly focus the first
  // card (Live TV) to make it the default selection.
  focusManager.focus(cards[0].el.dataset.focusId!);
  focusManager.onDestroy(unsubscribe);
  if (cb.appUpdater) {
    const paint = (st: AppUpdateState | null): void => setUpdateBadge(header, st ? updateBadgeText(st) : null);
    const offState = cb.appUpdater.onState(paint);
    void cb.appUpdater.getState().then(paint);
    focusManager.onDestroy(offState);
  }
  return focusManager;
}

/** Text of the home-screen update pill for an updater state (null = nothing to show). */
export function updateBadgeText(st: AppUpdateState): string | null {
  const v = st.version ? ` ${st.version}` : '';
  if (st.status === 'available') return `Yeni sürüm${v}`;
  if (st.status === 'downloading') return `Güncelleme indiriliyor${st.percent != null ? ` %${Math.round(st.percent)}` : ''}`;
  if (st.status === 'ready') return `Güncelleme hazır${v}`;
  return null;
}
