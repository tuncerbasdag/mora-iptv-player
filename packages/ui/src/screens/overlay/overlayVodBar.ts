import type { MediaItem, SubtitleStyle } from '../../../../core/src/types.ts';
import { clock, runtimeLabel } from '../../format.ts';
import { subtitleStyleCss } from '../../subtitleStyle.ts';
import type { PlayerStats } from '../../playerAdapter.ts';
import type { PlayerStatus } from '../../playerController.ts';
import { titleOf, yearOf } from '../movieBrowser.ts';
import { episodeTitle } from '../showDetail.ts';
import { BACK10_ICON, FWD10_ICON, NEXT_ICON, PAUSE_ICON, PLAY_ICON, PREV_ICON } from './overlayIcons.ts';

export interface VodBarCallbacks {
  /** Seeks by ±seconds (with an indicator; the caller shows it via `flashSeek`). */
  seek(delta: number): void;
  togglePause(): void;
  /** If provided, previous/next episode buttons are shown. */
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  /** The bar needs repainting when button focus changes (while the bar is visible). */
  requestPaint(): void;
}

/** The player's instantaneous state for painting the bar (plain data, independent of the DOM). */
export interface VodPaintModel {
  item: MediaItem;
  /** Duration (s) reported by the player; 0 if unknown. */
  duration: number;
  /** Whether the video has loaded (playing/paused/buffering); if not, position/duration aren't shown. */
  playable: boolean;
  currentTime: number;
  /** Target position while scrubbing; null otherwise. */
  scrubTarget: number | null;
  /** The playback position when scrubbing started (for the tick mark). */
  scrubFrom: number;
  /** Progress bar is focused (reached by pressing Down from the content). */
  trackFocus: boolean;
  status: PlayerStatus;
  stats?: PlayerStats;
}

export interface PillUi {
  wrap: HTMLElement;
  pill: HTMLElement;
  menu: HTMLElement;
}

export interface VodBar {
  el: HTMLElement;
  /** The ±10s indicator and caption text: added to the screen alongside the bar, with their own z-order. */
  seekInd: HTMLElement;
  captionEl: HTMLElement;
  /** Notification briefly shown in the top right when audio/subtitle changes ("Audio: German"). */
  trackToastEl: HTMLElement;
  audioUi: PillUi;
  subUi: PillUi;
  isVisible(): boolean;
  paint(model: VodPaintModel): void;
  /** Is a button focused in the control row (reached via Down)? */
  readonly controlFocused: boolean;
  enterControls(): void;
  leaveControls(): void;
  /** +1: the button to the right, -1: to the left (stops at the ends). */
  moveControl(delta: 1 | -1): void;
  activateControl(): void;
  /** Audio/subtitle pills are appended to the end of the list; the focus index is clamped to the new length. */
  setPills(audioText: string, subText: string, onAudio: () => void, onSub: () => void): void;
  /** Briefly highlights the indicator and the relevant button when skipping by ±10s. */
  flashSeek(delta: number): void;
  showCaption(text: string, durationMs: number): void;
  /** Applies the size/color/background/position from Settings to the `vod-caption` element (once per session, at setup). */
  setSubtitleStyle(style: SubtitleStyle): void;
  /** While the control bar is visible/opening, lifts the caption clear of it (it otherwise sits just above the bar's top edge). */
  setCaptionBarOpen(open: boolean): void;
  /** Shows briefly in the top right (e.g. "Audio: German") and disappears on its own. */
  showTrackToast(text: string): void;
  destroy(): void;
}

/** Roughly the bar's own height (seek row + info row + padding, see `.vod-bar` in styles.css) plus a small gap,
 * added to the caption's `bottom` while the bar is open so long captions don't crowd its controls. */
const BAR_CLEARANCE_PX = 220;

function el(className: string, tag: 'div' | 'span' = 'div'): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/**
 * Movie/series bar (design: Movie/Series Player): progress bar + duration, title/subtitle, control buttons
 * (previous/back 10/play/forward 10/next), audio and subtitle pills. Handles only rendering and button focus;
 * scrubbing, the menu, and key handling live elsewhere.
 */
export class VodBarView implements VodBar {
  readonly el: HTMLElement;
  readonly seekInd: HTMLElement;
  readonly captionEl: HTMLElement;
  readonly trackToastEl: HTMLElement;
  readonly audioUi: PillUi;
  readonly subUi: PillUi;

  private readonly cb: VodBarCallbacks;
  private readonly elapsedEl: HTMLElement;
  private readonly remainEl: HTMLElement;
  private readonly track: HTMLElement;
  private readonly trackFill: HTMLElement;
  private readonly trackKnob: HTMLElement;
  private readonly scrubTick: HTMLElement;
  private readonly scrubPop: HTMLElement;
  private readonly scrubBubble: HTMLElement;
  private readonly vodTitle: HTMLElement;
  private readonly vodSub: HTMLElement;
  private readonly vodStats: HTMLElement;
  private readonly btnBack: HTMLElement;
  private readonly btnPlay: HTMLElement;
  private readonly btnFwd: HTMLElement;
  private readonly controlButtons: HTMLElement[] = [];
  private readonly controlActions: Array<() => void> = [];
  /** Pill buttons are appended/removed after these. */
  private readonly baseControlCount: number;
  /** Button focus: Down enters the control row, Up leaves it; Left/Right move between buttons. */
  private controlIndex = -1;
  private seekIndTimer: ReturnType<typeof setTimeout> | null = null;
  private captionTimer: ReturnType<typeof setTimeout> | null = null;
  private trackToastTimer: ReturnType<typeof setTimeout> | null = null;
  private subtitleStyle: SubtitleStyle | null = null;
  private barOpen = false;

  constructor(cb: VodBarCallbacks) {
    this.cb = cb;
    this.el = el('vod-bar');
    this.el.style.display = 'none';

    this.elapsedEl = el('vod-time', 'span');
    this.remainEl = el('vod-time right', 'span');
    this.track = el('vod-track');
    this.trackFill = el('vod-track-fill');
    this.trackKnob = el('vod-track-knob', 'span');
    // While scrubbing: a thin tick marking the playback position, and a time bubble above the target
    // (no frame preview: opening a second stream connection would break the single-stream rule).
    this.scrubTick = el('vod-tick', 'span');
    this.scrubPop = el('vod-scrub-pop');
    this.scrubBubble = el('vod-scrub-bubble', 'span');
    this.vodTitle = el('vod-bar-title');
    this.vodSub = el('vod-bar-sub');
    this.vodStats = el('vod-bar-stats');
    this.vodStats.style.flex = 'none';
    this.vodStats.style.marginLeft = '8px';
    this.btnBack = this.ctl('10 saniye geri', BACK10_ICON);
    this.btnPlay = this.ctl('Duraklat', PAUSE_ICON, true);
    this.btnFwd = this.ctl('10 saniye ileri', FWD10_ICON);
    const controlsEl = this.buildControls();
    this.baseControlCount = this.controlButtons.length;
    this.audioUi = this.makePill();
    this.subUi = this.makePill();

    this.el.append(this.buildSeekRow(), this.buildInfoRow(controlsEl));

    // AVPlay doesn't render subtitles itself (video is on a separate layer): the text is shown here, above the bar.
    this.captionEl = el('vod-caption');
    this.captionEl.style.display = 'none';
    // Briefly shows a "−10 sn" / "+10 sn" indicator on the left/right when skipping by ±10s.
    this.seekInd = el('vod-seek-ind');
    this.seekInd.style.display = 'none';
    // Notification briefly shown in the top right when audio/subtitle changes.
    this.trackToastEl = el('vod-track-toast');
  }

  /** Progress row: elapsed time, bar (+ scrub tick/bubble), remaining time. */
  private buildSeekRow(): HTMLElement {
    this.scrubPop.append(this.scrubBubble);
    this.track.append(this.trackFill, this.scrubTick, this.trackKnob, this.scrubPop);
    const row = el('vod-seek-row');
    row.append(this.elapsedEl, this.track, this.remainEl);
    return row;
  }

  /** Info row: titles, control buttons, right group (audio/subtitle pills appear only when tracks are reported + resolution · codec). */
  private buildInfoRow(controlsEl: HTMLElement): HTMLElement {
    const titles = el('');
    titles.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column';
    titles.append(this.vodTitle, this.vodSub);
    const right = el('vod-right');
    right.append(this.audioUi.wrap, this.subUi.wrap, this.vodStats);
    const row = el('vod-info-row');
    row.append(titles, controlsEl, right);
    return row;
  }

  get controlFocused(): boolean {
    return this.controlIndex >= 0;
  }

  isVisible(): boolean {
    return this.el.style.display !== 'none';
  }

  paint(m: VodPaintModel): void {
    const { item, duration: dur, playable, scrubTarget, scrubFrom, trackFocus } = m;
    this.vodTitle.textContent = item.episode?.show ?? titleOf(item.name);
    this.vodSub.textContent = this.subtitleOf(item, dur);
    // Position/duration aren't shown if the video hasn't loaded (the browser may return a stale position when there's no media).
    const playing = playable ? m.currentTime : 0;
    // While scrubbing, the bar shows the TARGET position alongside the tick (playback position).
    // While the bar is selected (MoviePlayerSeek) or while scrubbing: thick bar, large tick, and time bubble.
    const scrubbing = playable && dur > 0 && (scrubTarget !== null || (trackFocus && this.controlIndex < 0));
    const cur = scrubTarget !== null && scrubbing ? scrubTarget : playing;
    const ratio = playable && dur > 0 ? Math.min(1, cur / dur) : 0;
    this.elapsedEl.textContent = clock(cur);
    this.remainEl.textContent = playable && dur > 0 ? `-${clock(dur - cur)}` : '';
    this.trackFill.style.width = `${ratio * 100}%`;
    this.trackKnob.style.left = `${ratio * 100}%`;
    this.track.classList.toggle('scrub', scrubbing);
    this.elapsedEl.classList.toggle('scrub', scrubbing);
    this.btnPlay.classList.toggle('outlined', scrubbing);
    if (scrubbing) {
      this.scrubTick.style.left = `${Math.min(1, (scrubTarget !== null ? scrubFrom : playing) / dur) * 100}%`;
      this.scrubPop.style.left = `${ratio * 100}%`;
      this.scrubBubble.textContent = clock(cur);
    }
    const paused = m.status === 'paused';
    this.btnPlay.innerHTML = paused || m.status === 'error' ? PLAY_ICON : PAUSE_ICON;
    this.btnPlay.setAttribute('aria-label', m.status === 'error' ? 'Tekrar dene' : paused ? 'Oynat' : 'Duraklat');
    const st = m.stats;
    this.vodStats.textContent = st ? [`${st.height}p`, st.codec].filter(Boolean).join(' · ') : '';
  }

  enterControls(): void {
    this.controlIndex = this.controlButtons.indexOf(this.btnPlay);
    this.paintControls();
  }

  leaveControls(): void {
    this.controlIndex = -1;
    this.paintControls();
  }

  moveControl(delta: 1 | -1): void {
    const last = this.controlButtons.length - 1;
    this.controlIndex = delta > 0 ? Math.min(last, this.controlIndex + 1) : Math.max(0, this.controlIndex - 1);
    this.paintControls();
  }

  activateControl(): void {
    this.controlActions[this.controlIndex]?.();
  }

  setPills(audioText: string, subText: string, onAudio: () => void, onSub: () => void): void {
    // Pills are always visible for movies/series; they show "Default" / "None" when there's no track.
    this.audioUi.wrap.style.display = 'flex';
    this.subUi.wrap.style.display = 'flex';
    this.audioUi.pill.textContent = audioText;
    this.subUi.pill.textContent = subText;
    this.controlButtons.length = this.baseControlCount;
    this.controlActions.length = this.baseControlCount;
    this.controlButtons.push(this.audioUi.pill, this.subUi.pill);
    this.controlActions.push(onAudio, onSub);
    if (this.controlIndex >= this.controlButtons.length) this.controlIndex = this.controlButtons.length - 1;
    this.paintControls();
  }

  flashSeek(delta: number): void {
    const back = delta < 0;
    this.seekInd.innerHTML = (back ? BACK10_ICON.replace(/width="40" height="40"/, 'width="76" height="76"') : FWD10_ICON.replace(/width="40" height="40"/, 'width="76" height="76"')) + `<span>${back ? '−' : '+'}${Math.abs(delta)} sn</span>`;
    this.seekInd.classList.toggle('right', !back);
    this.seekInd.style.display = 'flex';
    this.btnBack.classList.toggle('active', back);
    this.btnFwd.classList.toggle('active', !back);
    if (this.seekIndTimer) clearTimeout(this.seekIndTimer);
    this.seekIndTimer = setTimeout(() => {
      this.seekIndTimer = null;
      this.seekInd.style.display = 'none';
      this.btnBack.classList.remove('active');
      this.btnFwd.classList.remove('active');
    }, 800);
  }

  setSubtitleStyle(style: SubtitleStyle): void {
    this.subtitleStyle = style;
    this.applyCaptionPosition();
  }

  setCaptionBarOpen(open: boolean): void {
    if (this.barOpen === open) return;
    this.barOpen = open;
    this.applyCaptionPosition();
  }

  private applyCaptionPosition(): void {
    if (!this.subtitleStyle) return;
    const css = subtitleStyleCss(this.subtitleStyle);
    Object.assign(this.captionEl.style, css);
    if (this.barOpen && typeof css.bottom === 'string' && css.bottom !== 'auto') {
      this.captionEl.style.bottom = `${parseInt(css.bottom, 10) + BAR_CLEARANCE_PX}px`;
    }
  }

  showCaption(text: string, durationMs: number): void {
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionEl.textContent = text;
    this.captionEl.style.display = text ? 'block' : 'none';
    if (text) this.captionTimer = setTimeout(() => (this.captionEl.style.display = 'none'), durationMs);
  }

  showTrackToast(text: string): void {
    if (this.trackToastTimer) clearTimeout(this.trackToastTimer);
    this.trackToastEl.textContent = text;
    this.trackToastEl.classList.add('show');
    this.trackToastTimer = setTimeout(() => {
      this.trackToastTimer = null;
      this.trackToastEl.classList.remove('show');
    }, 2500);
  }

  destroy(): void {
    if (this.captionTimer) clearTimeout(this.captionTimer);
    if (this.seekIndTimer) clearTimeout(this.seekIndTimer);
    if (this.trackToastTimer) clearTimeout(this.trackToastTimer);
  }

  /** Movie: "2022 · 2h 04m" (year from the name if present, duration from the player); series: "Season 2 · Episode 4 · Episode title". */
  private subtitleOf(item: MediaItem, dur: number): string {
    const runtime = runtimeLabel(dur);
    if (item.episode && item.episode.episode > 0) {
      // If there's no episode title, episodeTitle returns "Episode N": skipped to avoid writing the same thing twice.
      const label = `Bölüm ${item.episode.episode}`;
      const title = episodeTitle(item, item.episode.episode - 1);
      return [`Sezon ${item.episode.season}`, label, title === label ? '' : title].filter(Boolean).join(' · ');
    }
    if (item.episode) {
      // Season/episode number is unknown (fallback assumption): a made-up "Season 1" is not shown; if the name matches the series name, it's not repeated at all.
      const t = episodeTitle(item, 0);
      return t === item.episode.show ? '' : t;
    }
    return [yearOf(item.name), runtime].filter(Boolean).join(' · ');
  }

  /**
   * Control buttons: [previous] back10 play forward10 [next]. The previous/next episode buttons are shown only if
   * the corresponding action was provided (no "previous" on the first episode, no "next" on the last).
   */
  private buildControls(): HTMLElement {
    const { cb } = this;
    const controlsEl = document.createElement('div');
    controlsEl.className = 'vod-ctls';
    const add = (el: HTMLElement, action: () => void): void => {
      this.controlButtons.push(el);
      this.controlActions.push(action);
      controlsEl.append(el);
    };
    if (cb.onPrevEpisode) add(this.ctl('Önceki bölüm', PREV_ICON), cb.onPrevEpisode);
    add(this.btnBack, () => cb.seek(-10));
    add(this.btnPlay, () => cb.togglePause());
    add(this.btnFwd, () => cb.seek(10));
    if (cb.onNextEpisode) add(this.ctl('Sonraki bölüm', NEXT_ICON), cb.onNextEpisode);
    return controlsEl;
  }

  private ctl(label: string, icon: string, big = false): HTMLElement {
    const b = document.createElement('div');
    b.className = 'vod-ctl' + (big ? ' big' : '');
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    return b;
  }

  private makePill(): PillUi {
    const wrap = document.createElement('div');
    wrap.className = 'vod-pill-wrap';
    wrap.style.display = 'none';
    const pill = document.createElement('div');
    pill.className = 'vod-pill';
    const menu = document.createElement('div');
    menu.className = 'vod-menu';
    menu.style.display = 'none';
    wrap.append(pill, menu);
    return { wrap, pill, menu };
  }

  private paintControls(): void {
    this.controlButtons.forEach((b, i) => b.classList.toggle('focused', i === this.controlIndex));
    if (this.isVisible()) this.cb.requestPaint(); // bar's selected/unselected appearance
  }
}

/** Builds the movie/series bar. */
export function createVodBar(cb: VodBarCallbacks): VodBar {
  return new VodBarView(cb);
}
