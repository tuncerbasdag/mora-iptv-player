import type { MediaItem } from '../../../../core/src/types.ts';
import { createLoadProgress } from '../../loadProgress.ts';
import type { PlayerControllerState } from '../../playerController.ts';
import { BannerLoadingIndicator } from './overlayLoading.ts';

/** Shows "Stream" loading when live, "Episode" for series, "Movie" for movies: a movie/series is not a live stream. */
function loadingText(item: MediaItem | null): string {
  if (!item || item.kind === 'live') return 'Yayın yükleniyor';
  return item.kind === 'series' || item.episode ? 'Bölüm yükleniyor' : 'Film yükleniyor';
}

const STATUS_MESSAGES: Record<PlayerControllerState['status'], string | null> = {
  idle: null,
  loading: 'Yükleniyor...',
  playing: null,
  paused: 'Duraklatıldı',
  buffering: 'Arabelleğe alınıyor...',
  reconnecting: 'Bağlantı kesildi, yeniden deneniyor...',
  offline: 'İnternet bağlantısı yok, bağlantı bekleniyor...',
  error: null, // message comes from state.message
  ended: null,
};

export interface StatusLayer {
  /** Status layers on top of the video (z-order is determined by the caller's `append` order). */
  loadingBanner: HTMLElement;
  centerMsg: HTMLElement;
  pausedBadge: HTMLElement;
  /** Live stream bottom bar: channel name/group, resolution, bitrate, codec, connection. Caller manages its visibility. */
  bottomBar: HTMLElement;
  /** Reflects controller state onto these layers (live bar text, loading banner, center message, paused badge). */
  apply(state: PlayerControllerState, item: MediaItem | null): void;
  /** Releases the banner's timers. */
  destroy(): void;
}

/**
 * Status view for the player layer: a top loading/buffering/reconnecting/offline banner, a large center
 * message (movie/series playback error only), a paused badge, and a live stream bottom bar (channel info +
 * stats + connection status).
 */
export class OverlayStatusLayer implements StatusLayer {
  readonly loadingBanner: HTMLElement;
  readonly centerMsg: HTMLElement;
  readonly pausedBadge: HTMLElement;
  readonly bottomBar: HTMLElement;

  private readonly loading: BannerLoadingIndicator;
  private readonly barName: HTMLElement;
  private readonly barGroup: HTMLElement;
  private readonly barLogo: HTMLElement;
  private readonly barStatus: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly resValue: HTMLElement;
  private readonly rateValue: HTMLElement;
  private readonly codecValue: HTMLElement;
  private readonly connDot: HTMLElement;
  private readonly connText: HTMLElement;

  constructor() {
    const banner = this.buildLoadingBanner();
    this.loadingBanner = banner.el;
    this.loading = new BannerLoadingIndicator(banner.el, banner.text, banner.percent, banner.ring);

    this.barLogo = this.buildBarLogo();
    this.barName = this.buildBarName();
    this.barGroup = this.buildBarGroup();
    const status = this.buildBarStatus();
    this.barStatus = status.el;
    this.statusText = status.text;

    const stats = this.buildBarStats();
    this.resValue = stats.res;
    this.rateValue = stats.rate;
    this.codecValue = stats.codec;
    this.connDot = stats.connDot;
    this.connText = stats.connText;
    this.bottomBar = this.buildBottomBar(stats.el);

    this.centerMsg = this.buildCenterMessage();
    this.pausedBadge = this.buildPausedBadge();
  }

  /** Top status banner (dropped down like a notification): a small ring icon, the status message, and its own
   * "%N" text, in an accent-bordered pill — centered horizontally, just below the top edge. */
  private buildLoadingBanner(): { el: HTMLElement; text: HTMLElement; percent: HTMLElement; ring: ReturnType<typeof createLoadProgress> } {
    const el = document.createElement('div');
    el.dataset.role = 'load-banner';
    Object.assign(el.style, {
      position: 'absolute',
      top: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'none',
      alignItems: 'center',
      gap: '16px',
      padding: '14px 28px',
      borderRadius: '999px',
      background: 'var(--bar-bg)',
      border: '2px solid var(--accent)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    });
    const ring = createLoadProgress(36, false);
    const text = document.createElement('div');
    text.dataset.role = 'load-banner-text';
    Object.assign(text.style, { fontSize: '28px', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap' });
    const percent = document.createElement('div');
    // Fixed width (sized for "%100", the widest value) so the pill doesn't stretch/shrink as the percentage ticks up.
    Object.assign(percent.style, { fontSize: '28px', fontWeight: '800', color: 'var(--accent)', whiteSpace: 'nowrap', width: '84px', textAlign: 'right' });
    el.append(ring.el, text, percent);
    return { el, text, percent, ring };
  }

  private buildBarGroup(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, { fontSize: '26px', fontWeight: '600', color: 'var(--text-dim)' });
    return el;
  }

  /** Status (paused/error) stays inside the bar; a small badge below the channel name. */
  private buildBarStatus(): { el: HTMLElement; text: HTMLElement } {
    const el = document.createElement('div');
    el.className = 'status-bar';
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    const text = document.createElement('span');
    el.append(dot, text);
    return { el, text };
  }

  /** Stat columns on the right: Resolution, Bitrate, Codec, Connection. */
  private buildBarStats(): { el: HTMLElement; res: HTMLElement; rate: HTMLElement; codec: HTMLElement; connDot: HTMLElement; connText: HTMLElement } {
    const el = document.createElement('div');
    Object.assign(el.style, { display: 'flex', flex: 'none', marginLeft: '48px' });
    const res = this.statCol(el, 'Çözünürlük', false);
    const rate = this.statCol(el, 'Bit hızı', true);
    const codec = this.statCol(el, 'Codec', false);
    const connValue = this.statCol(el, 'Bağlantı', false);
    Object.assign(connValue.style, { display: 'flex', alignItems: 'center' });
    const connDot = document.createElement('span');
    Object.assign(connDot.style, { width: '16px', height: '16px', borderRadius: '8px', marginRight: '12px', flex: 'none' });
    const connText = document.createElement('span');
    connValue.append(connDot, connText);
    return { el, res, rate, codec, connDot, connText };
  }

  /** Live bottom bar: channel/content info on the left, stat columns on the right. */
  private buildBottomBar(stats: HTMLElement): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      height: '148px',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 72px',
      background: 'var(--bar-bg)',
      borderTop: '1.5px solid var(--border)',
      opacity: '0',
      transition: 'opacity 0.6s ease',
    });
    const text = document.createElement('div');
    Object.assign(text.style, { display: 'flex', flexDirection: 'column', minWidth: '0' });
    text.append(this.barName, this.barGroup, this.barStatus);
    const left = document.createElement('div');
    Object.assign(left.style, { display: 'flex', alignItems: 'center', minWidth: '0' });
    left.append(this.barLogo, text);
    bar.append(left, stats);
    return bar;
  }

  /** Loading/reconnecting message: large centered text below the progress ring. */
  private buildCenterMessage(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '50%',
      marginTop: '150px',
      textAlign: 'center',
      fontSize: '50px',
      fontWeight: '700',
      color: 'var(--loading-text)',
      display: 'none',
      whiteSpace: 'pre-line',
      lineHeight: '1.4',
    });
    return el;
  }

  /** Large pause badge centered on screen when paused. */
  private buildPausedBadge(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'vod-paused-badge';
    el.style.display = 'none';
    el.innerHTML = '<svg width="84" height="84" viewBox="0 0 24 24"><rect x="6" y="5" width="4.5" height="14" rx="1" style="fill:var(--peach)"/><rect x="13.5" y="5" width="4.5" height="14" rx="1" style="fill:var(--peach)"/></svg>';
    return el;
  }

  apply(state: PlayerControllerState, item: MediaItem | null): void {
    const live = item?.kind === 'live';
    this.barName.textContent = item?.name ?? '';
    this.barGroup.textContent = item?.group ?? '';
    this.barLogo.style.backgroundImage = item?.logo ? `url("${item.logo}")` : '';
    const isError = state.status === 'error';
    const centerText = this.centerTextOf(state, item);
    this.loading.apply(state, centerText);
    this.pausedBadge.style.display = state.status === 'paused' && !live ? 'flex' : 'none';
    this.barStatus.classList.toggle('error', isError);
    this.barStatus.classList.toggle('loading', state.status === 'loading' || state.status === 'buffering' || state.status === 'reconnecting' || state.status === 'offline');
    const message = isError ? (state.message ?? 'Hata oluştu.') : (state.message ?? STATUS_MESSAGES[state.status]);
    this.paintStats(state);
    this.paintConnection(state);
    // The status bar message only appears if the top banner isn't already saying the same thing (so loading/reconnecting doesn't show in 3 places at once).
    const showBarMessage = !!message && !centerText;
    this.barStatus.style.visibility = showBarMessage ? 'visible' : 'hidden';
    this.statusText.textContent = showBarMessage ? message : '';
    // Movie/series error: show an explicit message + a retry hint instead of waiting silently (while live, the status bar already shows it).
    const vodError = isError && !live;
    this.centerMsg.textContent = vodError ? `${state.message ?? 'Video oynatılamadı.'}\nTekrar denemek için oynat tuşuna bas.` : '';
    this.centerMsg.style.display = vodError ? 'block' : 'none';
  }

  destroy(): void {
    this.loading.stop();
  }

  private paintStats(state: PlayerControllerState): void {
    this.resValue.textContent = state.stats ? (state.stats.fps ? `${state.stats.height}p · ${state.stats.fps} fps` : `${state.stats.height}p`) : '—';
    this.rateValue.textContent = state.stats?.kbps != null ? `${Math.round(state.stats.kbps).toLocaleString('tr-TR')} kbit/s` : '— kbit/s';
    this.rateValue.style.color = state.stats?.kbps != null ? 'var(--peach)' : 'var(--text-dim)'; // design: dimmed when there's no bitrate
    this.codecValue.textContent = state.stats?.codec ?? '—';
  }

  private paintConnection(state: PlayerControllerState): void {
    const conn =
      state.status === 'offline'
        ? { color: 'var(--danger)', text: 'Bağlantı yok' }
        : state.status === 'error'
          ? { color: 'var(--danger)', text: 'Kesildi' }
          : state.status === 'buffering'
            ? { color: 'var(--accent)', text: 'Arabellekte' }
            : state.status === 'loading' || state.status === 'reconnecting'
              ? { color: 'var(--accent)', text: state.status === 'reconnecting' ? 'Yeniden bağlanıyor' : 'Bağlanıyor' } // design: accent-colored dot while reconnecting
              : { color: 'var(--ok)', text: 'Kararlı' };
    this.connDot.style.background = conn.color;
    this.connText.textContent = conn.text;
  }

  /** Large center message (loading / buffering / no connection / reconnecting); empty if none applies. */
  private centerTextOf(state: PlayerControllerState, item: MediaItem | null): string {
    if (state.status === 'loading') return state.message ?? loadingText(item);
    if (state.status === 'buffering') return 'Arabelleğe alınıyor';
    if (state.status === 'offline') return 'İnternet bağlantısı yok';
    if (state.status === 'reconnecting') return state.message ? 'Yayın sunucusuna ulaşılamıyor' : 'Yayın yeniden bağlanıyor';
    return '';
  }

  /** 80px logo box on the left (channel logo is set as the background). */
  private buildBarLogo(): HTMLElement {
    const logo = document.createElement('span');
    Object.assign(logo.style, {
      width: '80px',
      height: '80px',
      flex: 'none',
      marginRight: '24px',
      border: '2px solid var(--border)',
      borderRadius: '20px',
      background: 'var(--surface-2)',
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    });
    return logo;
  }

  private buildBarName(): HTMLElement {
    const name = document.createElement('div');
    Object.assign(name.style, {
      fontSize: '44px',
      fontWeight: '800',
      letterSpacing: '-0.02em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    return name;
  }

  private statCol(parent: HTMLElement, label: string, accent: boolean): HTMLElement {
    const col = document.createElement('div');
    Object.assign(col.style, { display: 'flex', flexDirection: 'column', marginLeft: '48px' });
    const l = document.createElement('div');
    Object.assign(l.style, { fontSize: '24px', fontWeight: '600', color: 'var(--text-dim)' });
    l.textContent = label;
    const v = document.createElement('div');
    Object.assign(v.style, { fontSize: '32px', fontWeight: '800', color: accent ? 'var(--peach)' : 'var(--text)' });
    col.append(l, v);
    parent.append(col);
    return v;
  }
}

/** Builds the status layer. */
export function createStatusLayer(): StatusLayer {
  return new OverlayStatusLayer();
}
