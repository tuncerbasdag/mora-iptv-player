import { lockIconSvg } from '../../icons.ts';

export interface SwitchRowOptions {
  id: string;
  title: string;
  /** The description is re-read on every repaint (it can change based on state). */
  desc: () => string;
  isOn: () => boolean;
  onToggle: () => void;
  /** Master switch (34px title, 132px switch); otherwise a small row (28px, 104px switch). */
  large: boolean;
  /** If provided, a lock icon appears next to the title whenever it returns true. */
  showLock?: () => boolean;
}

/** Switch card (on/off row): title, description, "On/Off" text, and the switch; clicking calls `onToggle` and repaints. */
export class SwitchRow {
  readonly el: HTMLElement;
  private readonly o: SwitchRowOptions;
  private readonly card: HTMLElement;
  private readonly desc: HTMLElement;
  private readonly lock: HTMLElement;
  private readonly state: HTMLElement;
  private readonly track: HTMLElement;

  constructor(o: SwitchRowOptions) {
    this.o = o;
    const { large } = o;
    const card = document.createElement('div');
    card.className = 'switch-card' + (large ? '' : ' sm');
    card.dataset.focusId = o.id;
    card.setAttribute('role', 'switch');
    this.card = card;
    this.el = card;
    const text = document.createElement('div');
    text.style.cssText = 'display:flex;flex-direction:column;min-width:0';
    const t = document.createElement('div');
    t.style.cssText = `font-size:${large ? 34 : 28}px;font-weight:800;margin-bottom:${large ? 6 : 2}px`;
    t.style.display = 'flex';
    t.style.alignItems = 'center';
    const tText = document.createElement('span');
    tText.textContent = o.title;
    this.lock = document.createElement('span');
    this.lock.style.cssText = 'display:none;margin-left:14px;color:var(--peach);flex:none';
    this.lock.innerHTML = lockIconSvg(30);
    this.lock.setAttribute('aria-label', 'Kilitli');
    t.append(tText, this.lock);
    this.desc = document.createElement('div');
    this.desc.style.cssText = `font-size:${large ? 26 : 22}px;font-weight:600;line-height:1.4;color:var(--text-dim)`;
    text.append(t, this.desc);
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;flex:none';
    this.state = document.createElement('span');
    this.state.style.cssText = `font-size:${large ? 30 : 26}px;font-weight:800;margin-right:${large ? 20 : 16}px`;
    this.track = document.createElement('span');
    this.track.className = 'switch-track';
    const knob = document.createElement('span');
    knob.className = 'switch-knob';
    this.track.append(knob);
    right.append(this.state, this.track);
    card.append(text, right);
    this.repaint();
    card.addEventListener('click', () => {
      o.onToggle();
      this.repaint();
    });
  }

  repaint(): void {
    const on = this.o.isOn();
    this.card.setAttribute('aria-checked', String(on));
    this.desc.textContent = this.o.desc();
    this.lock.style.display = this.o.showLock?.() ? 'flex' : 'none';
    this.state.textContent = on ? 'Açık' : 'Kapalı';
    this.state.style.color = on ? 'var(--peach)' : 'var(--text-dim)';
    this.track.classList.toggle('on', on);
  }
}
