import { tracksOf, type PlayerAdapter, type TrackCapable } from '../../playerAdapter.ts';
import { isBackKey } from '../../keys.ts';
import type { PlayerController } from '../../playerController.ts';
import { CHECK_ICON } from './overlayIcons.ts';
import type { VodBar } from './overlayVodBar.ts';

type TrackKind = 'audio' | 'sub';
/** Placeholder row in the menu when there's no track info; selecting it does nothing to the player. */
const NO_TRACK = -2;

interface MenuRow {
  id: number;
  label: string;
  detail?: string;
}

export interface TrackMenu {
  isOpen(): boolean;
  /** Handles the key while the menu is open (Up/Down row, OK selects, Back closes); returns true if handled. Returns false if the menu is closed. */
  handleKey(e: KeyboardEvent): boolean;
  /** Updates the pills and the focusable button list when the track list changes. */
  syncPills(): void;
}

export interface TrackMenuDeps {
  adapter: PlayerAdapter;
  vodBar: VodBar;
  /** For delegating track selection (pause → reload with the selected track → resume seamlessly, see VodPlayback.changeTrack). */
  controller: PlayerController;
  /** Keeps the bar from closing while the menu is open (persistent=true); returns to the normal timer once closed. */
  showBar(persistent: boolean): void;
  /** Hides the bar immediately once a track is selected, instead of waiting, so focus returns to fullscreen (see PlayerOverlay.hideBarForTrackChange). */
  hideBar(): void;
}

/**
 * Audio / subtitle: pill buttons on the bar and the selection menu. Reads track info from the player
 * (if the player doesn't report any, "Default"/"None" placeholders are shown).
 */
export class TrackMenuController implements TrackMenu {
  private readonly adapter: PlayerAdapter;
  private readonly vodBar: VodBar;
  private readonly controller: PlayerController;
  private readonly showBar: (persistent: boolean) => void;
  private readonly hideBar: () => void;
  /** The player's track interface; a no-op (Null Object) if it's not supported. For reads only (list/selected track). */
  private readonly trackApi: TrackCapable;
  private menu: { kind: TrackKind; rows: MenuRow[]; index: number } | null = null;
  /** True if playback was active when the menu opened: canceling with Back resumes from where it left off
   * (if a track is selected instead, changeTrack()'s own reload flow takes over resuming). */
  private pausedForMenu = false;

  constructor({ adapter, vodBar, controller, showBar, hideBar }: TrackMenuDeps) {
    this.adapter = adapter;
    this.vodBar = vodBar;
    this.controller = controller;
    this.showBar = showBar;
    this.hideBar = hideBar;
    this.trackApi = tracksOf(adapter);
  }

  isOpen(): boolean {
    return this.menu !== null;
  }

  /** Arrow function field so `syncPills` can be passed as a callback (keeps `this` bound). */
  readonly syncPills = (): void => {
    const hasSubs = this.trackApi.getSubtitleTracks().length > 0;
    this.vodBar.setPills(
      `Ses · ${this.currentLabel('audio') || 'Varsayılan'}`,
      `Altyazı · ${hasSubs ? this.currentLabel('sub') : 'Yok'}`,
      () => this.openMenu('audio'),
      () => this.openMenu('sub'),
    );
  };

  handleKey(e: KeyboardEvent): boolean {
    const menu = this.menu;
    if (!menu) return false;
    // Audio/subtitle menu open: Up/Down move between rows, OK selects, Back closes the menu (doesn't exit the player).
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      menu.index = Math.max(0, Math.min(menu.rows.length - 1, menu.index + (e.key === 'ArrowDown' ? 1 : -1)));
      this.paintMenu();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.chooseMenuRow();
    } else if (isBackKey(e)) {
      e.preventDefault();
      this.closeMenu(true); // canceled: resume if we paused for it
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
    }
    return true;
  }

  private currentLabel(kind: TrackKind): string {
    const api = this.trackApi;
    if (kind === 'audio') {
      const id = api.getAudioTrack();
      return api.getAudioTracks().find((t) => t.id === id)?.label ?? '';
    }
    const id = api.getSubtitleTrack();
    return id < 0 ? 'Kapalı' : (api.getSubtitleTracks().find((t) => t.id === id)?.label ?? 'Kapalı');
  }

  private menuRows(kind: TrackKind): MenuRow[] {
    // If the player doesn't report tracks (e.g. Chrome doesn't expose embedded tracks), the menu still opens and explains why.
    if (kind === 'audio') {
      const tracks = this.trackApi.getAudioTracks();
      return tracks.length > 0 ? tracks.map((t) => ({ id: t.id, label: t.label, detail: t.detail })) : [{ id: NO_TRACK, label: 'Varsayılan', detail: 'Bu oynatıcıda tek ses parçası var' }];
    }
    const subs = this.trackApi.getSubtitleTracks();
    return [{ id: -1, label: 'Kapalı', detail: subs.length > 0 ? undefined : 'Bu oynatıcıda altyazı yok' }, ...subs.map((t) => ({ id: t.id, label: t.label, detail: t.detail }))];
  }

  private selectedId(kind: TrackKind): number {
    const api = this.trackApi;
    return kind === 'audio' ? (api.getAudioTracks().length > 0 ? api.getAudioTrack() : NO_TRACK) : api.getSubtitleTrack();
  }

  private paintMenu(): void {
    const { audioUi, subUi } = this.vodBar;
    for (const ui of [audioUi, subUi]) ui.menu.style.display = 'none';
    const menu = this.menu;
    if (!menu) return;
    const ui = menu.kind === 'audio' ? audioUi : subUi;
    const selected = this.selectedId(menu.kind);
    ui.menu.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'vod-menu-title';
    title.textContent = menu.kind === 'audio' ? 'Ses' : 'Altyazı';
    ui.menu.append(title);
    menu.rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'vod-menu-row' + (i === menu.index ? ' focused' : '');
      const text = document.createElement('span');
      text.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column';
      const l = document.createElement('span');
      l.className = 'vod-menu-label' + (r.id === selected ? ' on' : '');
      l.textContent = r.label;
      text.append(l);
      if (r.detail) {
        const d = document.createElement('span');
        d.className = 'vod-menu-detail';
        d.textContent = r.detail;
        text.append(d);
      }
      row.append(text);
      if (r.id === selected) row.insertAdjacentHTML('beforeend', CHECK_ICON);
      row.addEventListener('click', () => {
        menu.index = i;
        this.chooseMenuRow();
      });
      ui.menu.append(row);
    });
    ui.menu.style.display = 'flex';
  }

  private openMenu(kind: TrackKind): void {
    const rows = this.menuRows(kind);
    if (rows.length === 0) return;
    const selected = this.selectedId(kind);
    this.menu = { kind, rows, index: Math.max(0, rows.findIndex((r) => r.id === selected)) };
    this.paintMenu();
    this.showBar(true); // the bar doesn't close while the menu is open
    // Playback is paused while the audio/subtitle menu is open — it shouldn't keep playing before a selection is made.
    this.pausedForMenu = !this.adapter.isPaused();
    if (this.pausedForMenu) this.adapter.pause();
  }

  /** `resume=true`: the menu closed without a selection (via Back), resume if we paused for it. `resume=false`: a track
   * was selected, and changeTrack()'s own reload flow (resumes once the reload finishes to 'playing') takes over from here. */
  private closeMenu(resume: boolean): void {
    this.menu = null;
    this.paintMenu();
    this.showBar(false);
    if (resume && this.pausedForMenu) this.adapter.play();
    this.pausedForMenu = false;
  }

  /**
   * Once a track is selected: the menu closes, and the bar hides immediately instead of waiting for the
   * normal 5s timer (the user has made their choice, so focus returns directly to fullscreen) and a
   * message briefly appears in the top right announcing which track was selected — the bar itself doesn't
   * stay open to confirm the change.
   */
  private chooseMenuRow(): void {
    const menu = this.menu;
    if (!menu) return;
    const row = menu.rows[menu.index];
    let changed = false;
    if (menu.kind === 'audio') {
      if (row.id !== NO_TRACK) {
        this.controller.changeTrack('audio', row.id);
        changed = true;
      }
    } else if (row.id !== -1 || this.trackApi.getSubtitleTracks().length > 0) {
      this.controller.changeTrack('subtitle', row.id);
      changed = true;
    }
    this.menu = null;
    this.paintMenu();
    this.pausedForMenu = false; // changeTrack()'s own pause/reload/resume flow takes over from here
    if (changed) {
      this.hideBar();
      this.vodBar.showTrackToast(`${menu.kind === 'audio' ? 'Ses' : 'Altyazı'}: ${row.label}`);
    } else {
      this.showBar(false);
    }
    this.syncPills();
  }
}
