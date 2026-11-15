import type { EpgService } from '../../../../core/src/epgService.ts';
import type { EpgProgram } from '../../../../core/src/epg.ts';
import type { MediaItem } from '../../../../core/src/types.ts';

/** Program list: programs starting within this much time from now. */
const EPG_WINDOW_AFTER_MS = 3 * 60 * 60000;
/** At most this many programs are listed (current + upcoming). */
const MAX_PROGRAMS = 3;

export interface EpgPanel {
  el: HTMLElement;
  /** Renders the focused channel's programs; shows a hint if there's no channel (null). */
  render(item: MediaItem | null): void;
}

/** The "Broadcast Schedule" panel at the bottom of the right column: the focused channel's current and upcoming programs. */
export class EpgTimelinePanel implements EpgPanel {
  readonly el: HTMLElement;
  private readonly epgService: EpgService | null;

  constructor(epgService: EpgService | null) {
    this.epgService = epgService;
    this.el = document.createElement('div');
    this.el.className = 'hide-scrollbar';
    Object.assign(this.el.style, {
      flex: '1',
      minHeight: '0',
      borderTop: '1.5px solid var(--border)',
      padding: '12px 8px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      overflow: 'hidden',
    });
  }

  render(item: MediaItem | null): void {
    this.el.innerHTML = '';
    if (!item) {
      this.showHint();
      return;
    }
    const programs = this.upcoming(item);
    if (programs.length === 0) {
      this.showEmpty('Bu kanal için yayın akışı yok', 'Program bilgisi sağlanmıyor, yayın kesintisiz devam ediyor.');
      return;
    }
    this.showPrograms(programs);
  }

  /** The channel's currently airing and soon-to-start programs (at most 3); empty if there's no EPG/it isn't loaded/the channel doesn't match. */
  private upcoming(item: MediaItem): EpgProgram[] {
    const service = this.epgService;
    if (!service || !service.isLoaded() || !item.tvgId) return [];
    const now = Date.now();
    return service
      .getPrograms(item.tvgId)
      .filter((p) => p.stop > now && p.start < now + EPG_WINDOW_AFTER_MS)
      .sort((x, y) => x.start - y.start)
      .slice(0, MAX_PROGRAMS);
  }

  private header(date?: string): HTMLElement {
    const head = document.createElement('div');
    Object.assign(head.style, { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' });
    const title = document.createElement('div');
    Object.assign(title.style, { fontSize: '28px', fontWeight: '800' });
    title.textContent = 'Yayın Akışı';
    head.append(title);
    if (date) {
      const d = document.createElement('div');
      Object.assign(d.style, { fontSize: '22px', fontWeight: '600', color: 'var(--text-dim)' });
      d.textContent = date;
      head.append(d);
    }
    return head;
  }

  /** Design: a single-line hint when no channel is selected. */
  private showHint(): void {
    const hint = document.createElement('div');
    hint.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;color:var(--text-dim);text-align:center';
    hint.textContent = 'Bir kanal seçtiğinde yayın akışı burada görünür.';
    this.el.append(this.header(), hint);
  }

  private showEmpty(title: string, sub: string): void {
    const body = document.createElement('div');
    Object.assign(body.style, { flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    body.innerHTML =
      '<div class="empty-ring" style="width:96px;height:96px;margin:0 28px 0 0"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg></div>' +
      '<div style="display:flex;flex-direction:column"><div style="font-size:30px;font-weight:800"></div><div style="font-size:26px;font-weight:600;color:var(--text-dim);margin-top:4px"></div></div>';
    body.querySelectorAll('div')[2].textContent = title;
    body.querySelectorAll('div')[3].textContent = sub;
    this.el.append(this.header(), body);
  }

  /**
   * Vertical timeline: a thin line along the left edge, a dot at the start of each program (the currently airing
   * one is a filled orange dot, the upcoming ones are empty rings).
   */
  private showPrograms(programs: EpgProgram[]): void {
    const now = Date.now();
    const list = document.createElement('div');
    Object.assign(list.style, {
      position: 'relative',
      flex: '1',
      minHeight: '0',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-around',
    });
    const line = document.createElement('div');
    Object.assign(line.style, { position: 'absolute', left: '8px', top: '16px', bottom: '16px', width: '2px', background: 'var(--border)' });
    list.append(line);
    for (const p of programs) list.append(this.programRow(p, p.start <= now && p.stop > now));
    this.el.append(this.header(new Date(now).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })), list);
  }

  private programRow(p: EpgProgram, current: boolean): HTMLElement {
    const fmt = (t: number): string => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    Object.assign(row.style, { position: 'relative', display: 'flex', alignItems: 'center', gap: '22px' });
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      position: 'relative',
      width: '18px',
      height: '18px',
      boxSizing: 'border-box',
      flex: 'none',
      borderRadius: '50%',
      background: current ? 'var(--accent)' : 'var(--surface)',
      border: current ? 'none' : '2px solid var(--text-dim)',
      boxShadow: current ? '0 0 0 6px var(--accent-ring-2)' : 'none',
    });
    const time = document.createElement('span');
    Object.assign(time.style, {
      width: '190px',
      flex: 'none',
      fontSize: '24px',
      fontWeight: current ? '700' : '600',
      color: current ? 'var(--peach)' : 'var(--text-dim)',
    });
    time.textContent = `${fmt(p.start)} – ${fmt(p.stop)}`;
    const title = document.createElement('span');
    Object.assign(title.style, {
      flex: '1',
      minWidth: '0',
      fontSize: '28px',
      fontWeight: current ? '800' : '700',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
    });
    title.textContent = p.title;
    row.append(dot, time, title);
    return row;
  }
}

/** Builds the "Broadcast Schedule" panel at the bottom of the right column. */
export function createEpgPanel(epgService: EpgService | null): EpgPanel {
  return new EpgTimelinePanel(epgService);
}
