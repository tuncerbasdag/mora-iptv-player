import type { Connection } from '../../../../core/src/types.ts';

/**
 * "Connection active" switch (edit mode only): activating this one deactivates the other connection,
 * and the app only shows this connection's data. A connection that is already active cannot be
 * deactivated directly (it only becomes inactive when another connection is activated).
 */
export class ActiveSwitch {
  readonly el: HTMLElement;
  private wantActive: boolean;
  private readonly alreadyActive: boolean;
  private readonly stateEl = document.createElement('span');
  private readonly track = document.createElement('span');

  constructor(isActive: boolean, otherActive: Connection | null) {
    this.alreadyActive = isActive;
    this.wantActive = isActive;
    const card = document.createElement('div');
    this.el = card;
    card.className = 'switch-card';
    card.style.marginTop = '20px';
    card.dataset.focusId = 'f-active';
    card.setAttribute('role', 'switch');
    const text = document.createElement('div');
    text.style.cssText = 'display:flex;flex-direction:column;min-width:0';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:32px;font-weight:800;margin-bottom:6px';
    title.textContent = 'Bağlantı aktif';
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:24px;font-weight:600;line-height:1.4;color:var(--text-dim)';
    desc.textContent = isActive
      ? 'Aynı anda yalnızca bir bağlantı aktif olabilir. Başka bir bağlantıyı aktif edersen bu pasif olur.'
      : otherActive
        ? `Bunu aktif edersen şu an aktif olan “${otherActive.name}” pasif olur.`
        : 'Bunu aktif edersen uygulama bu bağlantının verisini gösterir.';
    text.append(title, desc);
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;flex:none;margin-left:32px';
    this.stateEl.style.cssText = 'font-size:30px;font-weight:800;margin-right:20px';
    this.track.className = 'switch-track';
    const knob = document.createElement('span');
    knob.className = 'switch-knob';
    this.track.append(knob);
    right.append(this.stateEl, this.track);
    card.append(text, right);
    card.addEventListener('click', () => {
      if (this.alreadyActive) return; // an already-active connection can't be deactivated directly; it becomes inactive when another one is activated
      this.wantActive = !this.wantActive;
      this.paint();
    });
    this.paint();
  }

  /** Whether this connection should be activated on save (if it isn't already active and the user turned it on). */
  get shouldActivate(): boolean {
    return this.wantActive && !this.alreadyActive;
  }

  private paint(): void {
    this.el.setAttribute('aria-checked', String(this.wantActive));
    this.stateEl.textContent = this.wantActive ? 'Aktif' : 'Pasif';
    this.stateEl.style.color = this.wantActive ? 'var(--peach)' : 'var(--text-dim)';
    this.track.classList.toggle('on', this.wantActive);
  }
}
