import type { MediaItem } from '../../../../core/src/types.ts';
import { createLoadProgress, type LoadProgressHandle } from '../../loadProgress.ts';
import type { PlayerStats } from '../../playerAdapter.ts';

export type ConnKind = 'connecting' | 'ok' | 'slow' | 'lost';

/** The state the card should currently show (plain data, independent of playback logic). */
export interface PreviewCardState {
  /** The channel whose name is shown: the playing one, or if none, the last one that failed to open. */
  shownItem: MediaItem | null;
  /** Whether a channel is currently playing in the preview (the favorite button and stats are shown). */
  playing: boolean;
  /** The last attempt failed to open (the video area shows "Stream could not be opened"). */
  failed: boolean;
  /** The playing channel's position number in the list (0 = none). */
  number: number;
  favorite: boolean;
}

export interface PreviewCardView {
  el: HTMLElement;
  /** The video box (its data-focus-id is assigned once playback succeeds). */
  wrap: HTMLElement;
  /** The container the player places the <video> element into. */
  videoContainer: HTMLElement;
  progress: LoadProgressHandle;
  onVideoClick(fn: () => void): void;
  onFavClick(fn: () => void): void;
  /** Message overlaid on the video (error reason, "stream dropped"). */
  setLabel(text: string): void;
  getLabel(): string;
  /** Whether the video box and favorite button can be focused via arrow keys (only once the stream opens successfully). */
  setFocusable(on: boolean): void;
  setProgressVisible(show: boolean): void;
  setStats(st: PlayerStats): void;
  clearStats(): void;
  setConn(kind: ConnKind | null): void;
  render(state: PreviewCardState): void;
}

/**
 * The preview card at the top of the right column: a 16:9 video box (loading spinner, focus ring, hint/error
 * text) with the channel name, number, Add to Favorites button, and resolution/bitrate/codec/connection info
 * below it. This is view-only: playback and timers live in livePreview.ts.
 */
export class PreviewCard implements PreviewCardView {
  readonly el: HTMLElement;
  readonly wrap: HTMLElement;
  readonly videoContainer: HTMLElement;
  readonly progress: LoadProgressHandle;

  private readonly hint: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly label: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly numberEl: HTMLElement;
  private readonly favRow: HTMLElement;
  private readonly favIcon: HTMLElement;
  private readonly favText: HTMLElement;
  private readonly statLabelEls: HTMLElement[] = [];
  private readonly statRes: HTMLElement;
  private readonly statBitrate: HTMLElement;
  private readonly statCodec: HTMLElement;
  private readonly statConn: HTMLElement;
  private readonly connDot: HTMLElement;
  private readonly connText: HTMLElement;

  constructor() {
    this.el = this.buildCard();

    // ---- video box
    this.wrap = this.buildVideoBox();
    this.videoContainer = document.createElement('div');
    this.videoContainer.style.position = 'absolute';
    this.videoContainer.style.inset = '0';
    this.hint = this.buildHint();
    this.hintText = this.hint.lastElementChild as HTMLElement;
    this.label = this.buildLabel();
    this.progress = this.buildProgress();
    this.wrap.append(this.videoContainer, this.progress.el, this.hint, this.label, this.buildFocusRing());

    // ---- info bar
    this.nameEl = this.buildNameEl();
    this.numberEl = document.createElement('div');
    Object.assign(this.numberEl.style, { fontSize: '24px', fontWeight: '600', color: 'var(--on-card-dim)', flex: 'none' });
    this.favRow = document.createElement('div');
    this.favRow.className = 'fav-btn';
    // Like previewWrap's data-focus-id, this is initially ABSENT, added once the stream loads successfully.
    this.favIcon = document.createElement('span');
    this.favIcon.style.display = 'flex';
    this.favText = document.createElement('span');
    this.favRow.append(this.favIcon, this.favText);

    const stats = this.buildStatsGrid();
    this.statRes = this.makeStat(stats, 'Çözünürlük');
    this.statBitrate = this.makeStat(stats, 'Bit hızı');
    this.statBitrate.style.color = 'var(--on-card-strong)';
    this.statCodec = this.makeStat(stats, 'Codec');
    this.statConn = this.makeStat(stats, 'Bağlantı');
    Object.assign(this.statConn.style, { display: 'flex', alignItems: 'center' });
    this.connDot = document.createElement('span');
    Object.assign(this.connDot.style, { width: '14px', height: '14px', borderRadius: '7px', marginRight: '10px', flex: 'none', display: 'none' });
    this.connText = document.createElement('span');
    this.statConn.append(this.connDot, this.connText);

    this.el.append(this.wrap, this.buildInfoBar(stats));
  }

  /** The preview card: the same background as the Live TV card on the Home screen (peach in Default, gradient in other themes) and its text color. */
  private buildCard(): HTMLElement {
    const card = document.createElement('div');
    Object.assign(card.style, { flex: 'none', borderRadius: '28px', overflow: 'hidden', background: 'var(--card-live)', color: 'var(--on-card)' });
    return card;
  }

  private buildProgress(): LoadProgressHandle {
    const progress = createLoadProgress(160);
    Object.assign(progress.el.style, { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'none' });
    return progress;
  }

  private buildStatsGrid(): HTMLElement {
    const stats = document.createElement('div');
    Object.assign(stats.style, { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' });
    return stats;
  }

  /** Bottom of the card: channel name + number (not focusable) and the Add/Remove Favorite button (the only focusable target, favRow); stats below it. */
  private buildInfoBar(stats: HTMLElement): HTMLElement {
    const infoBar = document.createElement('div');
    Object.assign(infoBar.style, { padding: '12px 28px 16px', display: 'flex', flexDirection: 'column', gap: '6px' });
    const infoTop = document.createElement('div');
    Object.assign(infoTop.style, { display: 'flex', alignItems: 'center', gap: '16px', minHeight: '52px' });
    infoTop.append(this.nameEl, this.numberEl, this.favRow);
    infoBar.append(infoTop, stats);
    return infoBar;
  }

  onVideoClick(fn: () => void): void {
    this.wrap.addEventListener('click', fn);
  }

  onFavClick(fn: () => void): void {
    this.favRow.addEventListener('click', fn);
  }

  setLabel(text: string): void {
    this.label.textContent = text;
  }

  getLabel(): string {
    return this.label.textContent ?? '';
  }

  setFocusable(on: boolean): void {
    if (on) {
      this.wrap.dataset.focusId = 'preview';
      this.favRow.dataset.focusId = 'preview-info';
    } else {
      delete this.wrap.dataset.focusId;
      delete this.favRow.dataset.focusId;
    }
  }

  setProgressVisible(show: boolean): void {
    this.progress.el.style.display = show ? 'flex' : 'none';
  }

  setStats(st: PlayerStats): void {
    this.statRes.textContent = st.fps ? `${st.height}p · ${st.fps} fps` : `${st.height}p`;
    this.statBitrate.textContent = st.kbps == null ? '' : `${Math.round(st.kbps).toLocaleString('tr-TR')} kbit/s`;
    this.statCodec.textContent = st.codec ?? '';
    if (!this.connText.textContent) this.setConn('ok');
  }

  clearStats(): void {
    this.statRes.textContent = '';
    this.statBitrate.textContent = '';
    this.statCodec.textContent = '';
  }

  /** Connection state: derived from player events (playing/buffering/error). */
  setConn(kind: ConnKind | null): void {
    const map = {
      connecting: ['var(--accent)', 'Bağlanıyor'],
      ok: ['var(--ok-strong)', 'Kararlı'],
      slow: ['var(--slow)', 'Takılıyor'],
      lost: ['var(--lost)', 'Kesildi'],
    } as const;
    this.connDot.style.display = kind ? 'inline-block' : 'none';
    if (kind) this.connDot.style.background = map[kind][0];
    this.connText.textContent = kind ? map[kind][1] : '';
  }

  render(s: PreviewCardState): void {
    const { shownItem, playing, failed, number, favorite } = s;
    this.nameEl.textContent = shownItem?.name ?? 'Kanal seçilmedi';
    this.numberEl.textContent = playing && number ? `Kanal ${String(number).padStart(2, '0')}` : '';
    this.favIcon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="${favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    this.favText.textContent = favorite ? 'Favorilerden çıkar' : 'Favorilere ekle';
    this.favRow.style.visibility = playing ? 'visible' : 'hidden';
    const has = !!shownItem;
    // Design (Live TV · no channel selected): when empty the card uses the background color and has a border,
    // text is dimmed, info reads "—"; once a channel is selected it switches to the Home screen's Live TV
    // card background (gradient / peach) and text color.
    this.el.style.background = has ? 'var(--card-live)' : 'var(--bg)';
    this.el.style.color = has ? 'var(--on-card)' : 'var(--text-dim)';
    this.el.style.boxSizing = 'border-box';
    this.el.style.border = has ? '1.5px solid transparent' : '1.5px solid var(--border)';
    this.wrap.style.background = has ? 'linear-gradient(135deg, var(--video-a), var(--video-b))' : 'var(--bg)';
    this.wrap.style.borderBottom = has ? 'none' : '1.5px solid var(--border)';
    this.hint.style.display = playing ? 'none' : 'flex';
    this.hintText.textContent = !playing && failed ? 'Yayın açılamadı' : 'Önizleme için bir kanal seç';
    for (const l of this.statLabelEls) l.style.color = has ? 'var(--on-card-dim)' : 'var(--text-dim)';
    // statConn is handled separately (below): it contains dot + text elements that would be destroyed if cleared via textContent.
    for (const v of [this.statRes, this.statBitrate, this.statCodec]) {
      if (!has) v.textContent = '—';
      else if (v.textContent === '—') v.textContent = '';
    }
    this.statBitrate.style.color = has ? 'var(--on-card-strong)' : 'var(--text-dim)';
    if (!has) {
      this.statConn.textContent = '—';
      this.statConn.style.color = 'var(--text-dim)';
    } else {
      this.statConn.style.color = '';
      if (!this.statConn.contains(this.connText)) {
        this.statConn.textContent = '';
        this.statConn.append(this.connDot, this.connText);
        this.setConn(null);
      }
    }
  }

  /**
   * data-focus-id is initially ABSENT: without an actively playing channel this box shouldn't be reachable via
   * navigation (there's nothing to go fullscreen with). It's added once the stream loads successfully
   * (setFocusable), and removed if it fails to load (or no channel is selected at all). Uses the classic
   * "padding-top percentage" technique instead of CSS aspect-ratio: Tizen's old Chromium (chrome56 target, see
   * HANDOFF) may not support aspect-ratio. height:0 + paddingTop:56.25% fixes the box's height relative to its
   * width; the video/overlay children fill this box via position:absolute inset:0.
   */
  private buildVideoBox(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'preview-box';
    Object.assign(wrap.style, {
      position: 'relative',
      width: '100%',
      height: '0',
      paddingTop: '56.25%',
      background: 'linear-gradient(135deg, var(--video-a), var(--video-b))',
      overflow: 'hidden',
      cursor: 'pointer',
    });
    return wrap;
  }

  /** Shows "Select a channel to preview" when empty, "Stream could not be opened" for a channel that failed to open. */
  private buildHint(): HTMLElement {
    const hint = document.createElement('div');
    hint.innerHTML =
      '<svg aria-hidden="true" width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M8 3l4 4 4-4"/><path d="M7 20v1.5M17 20v1.5"/></svg><div style="margin-top:18px">Önizleme için bir kanal seç</div>';
    Object.assign(hint.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-dim)',
      fontSize: '28px',
      fontWeight: '700',
      textAlign: 'center',
      padding: '0 32px',
    });
    return hint;
  }

  /** Message overlaid on the video (error reason, "stream dropped"). */
  private buildLabel(): HTMLElement {
    const label = document.createElement('div');
    Object.assign(label.style, {
      position: 'absolute',
      left: '16px',
      right: '16px',
      bottom: '12px',
      fontSize: 'var(--fs-sm)',
      color: 'var(--text)',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
    });
    return label;
  }

  /** Focus ring + "Fullscreen" badge: only visible while the video box is .focused (see styles.css). */
  private buildFocusRing(): HTMLElement {
    const ring = document.createElement('div');
    ring.className = 'preview-ring';
    ring.innerHTML =
      '<span class="preview-ring-badge"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>Tam ekran</span>';
    return ring;
  }

  private buildNameEl(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      fontSize: '30px',
      fontWeight: '800',
      letterSpacing: '-0.02em',
      userSelect: 'none',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      minWidth: '0',
    });
    return el;
  }

  private makeStat(stats: HTMLElement, label: string): HTMLElement {
    const wrap = document.createElement('div');
    const l = document.createElement('div');
    Object.assign(l.style, { fontSize: '22px', fontWeight: '600', color: 'var(--on-card-dim)' });
    l.textContent = label;
    this.statLabelEls.push(l);
    const v = document.createElement('div');
    Object.assign(v.style, { fontSize: '26px', fontWeight: '800', minHeight: '36px' });
    wrap.append(l, v);
    stats.append(wrap);
    return v;
  }
}

/** Builds the preview card. */
export function createPreviewCard(): PreviewCardView {
  return new PreviewCard();
}
