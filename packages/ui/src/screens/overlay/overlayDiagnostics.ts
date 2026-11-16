import { diagnosticsOf, type PlayerAdapter, type PlayerDiagnostics } from '../../playerAdapter.ts';

const REFRESH_MS = 500;
/** Number of latest events shown in the panel. */
const EVENT_LINES = 6;

/** Converts diagnostics info into lines for on-screen display (pure function). To distinguish the cause of a freeze: if the buffer is dropping to zero it's network, if frames are dropping it's the processor. */
export function formatDiagnostics(d: PlayerDiagnostics | null): string[] {
  if (!d) return ['Tanı bilgisi yok (oynatıcı desteklemiyor)'];
  const lines = [`Oynatıcı: ${d.engine}`];
  if (d.bufferSeconds !== null) lines.push(`Tampon: ${d.bufferSeconds.toFixed(1)} sn${d.holding ? ' (dolması bekleniyor)' : ''}`);
  if (d.bufferMode) lines.push(`Mod: ${d.bufferMode === 'stable' ? 'kararlı (~5 sn)' : 'düşük gecikme'} · Kesinti: ${d.stalls}`);
  if (d.droppedFrames !== null && d.totalFrames !== null) lines.push(`Düşen kare: ${d.droppedFrames} / ${d.totalFrames}`);
  if (lines.length === 1 && d.engine === 'avplay') lines.push('AVPlay tampon/kare bilgisini vermiyor');
  if (d.events.length > 0) lines.push('Son olaylar:', ...d.events.slice(-EVENT_LINES).map((e) => `  ${e}`));
  return lines;
}

/** Diagnostics panel that opens/closes in the corner of the fullscreen player (remote Info/Green key, keyboard I). */
export class DiagnosticsPanel {
  readonly el: HTMLElement;
  private readonly adapter: PlayerAdapter;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(adapter: PlayerAdapter) {
    this.adapter = adapter;
    this.el = document.createElement('div');
    this.el.setAttribute('role', 'status');
    Object.assign(this.el.style, {
      position: 'absolute',
      top: '32px',
      left: '32px',
      padding: '14px 20px',
      borderRadius: '12px',
      background: 'rgba(0,0,0,0.72)',
      color: '#fff',
      fontSize: '24px',
      lineHeight: '1.5',
      whiteSpace: 'pre',
      display: 'none',
    });
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  private show(): void {
    this.refresh();
    this.el.style.display = 'block';
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  private hide(): void {
    this.el.style.display = 'none';
    this.stopTimer();
  }

  private refresh(): void {
    this.el.textContent = formatDiagnostics(diagnosticsOf(this.adapter)).join('\n');
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  destroy(): void {
    this.stopTimer();
  }
}
