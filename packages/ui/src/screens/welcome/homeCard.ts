import type { Library } from '../../../../core/src/types.ts';

export interface HomeCardSpec {
  id: string;
  title: string;
  icon: string;
  background: string;
  /** The large card on the left: spans 2 rows, with a bigger title/icon. */
  hero: boolean;
  getCountLabel: (lib: Library | null) => string;
  onOpen: () => void;
}

/** Home screen card (Live TV / Series / Movies): colored background, decorative circles, icon, title, and count. */
export class HomeCard {
  readonly el: HTMLElement;
  private readonly spec: HomeCardSpec;
  private readonly countEl: HTMLElement;
  private enabled = true;

  constructor(spec: HomeCardSpec) {
    this.spec = spec;
    const el = document.createElement('div');
    this.el = el;
    el.dataset.focusId = spec.id;
    Object.assign(el.style, {
      position: 'relative',
      overflow: 'hidden',
      cursor: 'pointer',
      borderRadius: '44px',
      background: spec.background,
      color: 'var(--on-card)',
      display: 'flex',
      flexDirection: spec.hero ? 'column' : 'row',
      alignItems: spec.hero ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      padding: spec.hero ? '52px' : '0 48px',
      gridRow: spec.hero ? '1 / 3' : 'auto',
    });

    // Decorative semi-transparent circles.
    const deco = (css: Partial<CSSStyleDeclaration>) => {
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'absolute', borderRadius: '50%', background: 'var(--deco-1)' }, css);
      return d;
    };
    if (spec.hero) {
      el.append(
        deco({ right: '-120px', bottom: '-140px', width: '480px', height: '480px' }),
        deco({ right: '150px', bottom: '150px', width: '140px', height: '140px', background: 'var(--deco-2)' }),
      );
    } else {
      el.append(deco({ right: '-60px', top: '-80px', width: '260px', height: '260px' }));
    }

    const iconWrap = document.createElement('div');
    iconWrap.style.position = 'relative';
    iconWrap.style.display = 'flex';
    iconWrap.innerHTML = spec.icon;
    const svg = iconWrap.querySelector('svg');
    if (svg) svg.setAttribute('stroke-width', spec.hero ? '1.4' : '1.5');

    const text = document.createElement('div');
    Object.assign(text.style, { position: 'relative', display: 'flex', flexDirection: 'column', gap: spec.hero ? '14px' : '6px' });
    const titleEl = document.createElement('div');
    Object.assign(titleEl.style, {
      fontSize: spec.hero ? '88px' : '56px',
      fontWeight: '800',
      letterSpacing: spec.hero ? '-0.03em' : '-0.02em',
      lineHeight: spec.hero ? '1' : '1.05',
    });
    titleEl.textContent = spec.title;
    this.countEl = document.createElement('div');
    Object.assign(this.countEl.style, { fontSize: spec.hero ? '36px' : '30px', fontWeight: '700', color: 'var(--on-card-dim)' });
    text.append(titleEl, this.countEl);

    // On the hero card, the icon goes on top with text below; on small cards, text is on the left, icon on the right.
    if (spec.hero) el.append(iconWrap, text);
    else el.append(text, iconWrap);

    // With no connection, the card is faded and won't open (click/Enter do nothing).
    el.addEventListener('click', () => {
      if (this.enabled) spec.onOpen();
    });
  }

  setLibrary(lib: Library | null): void {
    this.countEl.textContent = this.spec.getCountLabel(lib);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.el.style.opacity = enabled ? '1' : '0.45';
    this.el.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
}
