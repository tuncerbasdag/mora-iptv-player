import { checkIconSvg } from '../../icons.ts';

type Kind = 'm3u' | 'xtream';

const KIND_INFO = {
  m3u: { title: 'M3U', desc: 'Liste adresiyle ekle' },
  xtream: { title: 'Xtream', desc: 'Kullanıcı adı ve şifreyle ekle' },
} as const;

/** Connection type selection (add mode only): two cards, `onChange` is called when the selected type changes. */
export class KindSelector {
  readonly el: HTMLElement;
  private kind: Kind;
  private readonly onChange: (kind: Kind) => void;
  private readonly cards: Record<Kind, HTMLElement> = { m3u: document.createElement('div'), xtream: document.createElement('div') };

  constructor(initial: Kind, onChange: (kind: Kind) => void) {
    this.kind = initial;
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-gap:24px';
    for (const k of ['m3u', 'xtream'] as const) {
      this.cards[k].dataset.focusId = `kind-${k}`;
      this.cards[k].addEventListener('click', () => {
        if (this.kind === k) return;
        this.kind = k;
        this.paint();
        this.onChange(k);
      });
      this.el.append(this.cards[k]);
    }
    this.paint();
  }

  private paint(): void {
    for (const k of ['m3u', 'xtream'] as const) {
      const on = this.kind === k;
      const card = this.cards[k];
      card.className = 'seg-option' + (on ? ' on' : '');
      card.setAttribute('aria-pressed', String(on));
      card.innerHTML =
        `<span style="display:flex;flex-direction:column"><span style="font-size:36px;font-weight:800;margin-bottom:4px;${on ? 'color:var(--peach)' : ''}">${KIND_INFO[k].title}</span><span style="font-size:24px;font-weight:600;color:var(--text-dim)">${KIND_INFO[k].desc}</span></span>` +
        (on ? `<span style="width:44px;height:44px;border-radius:22px;background:var(--accent);color:var(--ink);display:flex;align-items:center;justify-content:center">${checkIconSvg(26)}</span>` : '');
    }
  }
}
