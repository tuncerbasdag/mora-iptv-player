import { updateSettings } from '../../../../core/src/storage.ts';
import type { SubtitleStyle } from '../../../../core/src/types.ts';
import type { FocusManager } from '../../focusManager.ts';
import { checkIconSvg } from '../../icons.ts';
import {
  SAMPLE_SUBTITLE_TEXT,
  SUBTITLE_BACKGROUND_OPTIONS,
  SUBTITLE_COLOR_OPTIONS,
  SUBTITLE_POSITION_OPTIONS,
  SUBTITLE_SIZE_OPTIONS,
  subtitleStyleCss,
} from '../../subtitleStyle.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, settingsButton } from '../settingsShell.ts';
import type { SettingsPageContext, SettingsPageView } from './pageContext.ts';

type Field = 'size' | 'color' | 'background' | 'position';

interface Group<T extends string> {
  field: Field;
  title: string;
  options: { id: T; label: string }[];
}

/** Four groups, each a single-select set of `seg-option` cards (see the same pattern in connection/kindSelector.ts):
 * the selection is saved immediately and the sample text above is restyled. */
export class SubtitleStylePage implements SettingsPageView {
  private readonly ctx: SettingsPageContext;
  private readonly cards = new Map<string, HTMLElement>();
  private preview!: HTMLElement;

  constructor(ctx: SettingsPageContext) {
    this.ctx = ctx;
  }

  render(): FocusManager {
    const { container, cb } = this.ctx;
    const { screen, panel } = buildSettingsShell(container, 'subtitle', 'Altyazı', 'Boyut, renk, arkaplan ve konumu seç.', cb.onNavigate, cb.onHome);

    const previewBox = document.createElement('div');
    previewBox.style.cssText = 'position:relative;height:160px;border-radius:24px;background:#1a1a1a;box-shadow:inset 0 0 0 2px var(--border);overflow:hidden;flex:none';
    this.preview = document.createElement('div');
    this.preview.style.cssText = 'position:absolute;left:0;right:0;text-align:center;font-weight:700;line-height:1.3;white-space:pre-line';
    this.preview.textContent = SAMPLE_SUBTITLE_TEXT;
    previewBox.append(this.preview);

    const groups = document.createElement('div');
    groups.className = 'hide-scrollbar';
    groups.style.cssText = 'display:flex;flex-direction:column;gap:28px;flex:1;min-height:0;overflow-y:auto;padding:8px 8px 8px 0';
    groups.append(
      this.buildGroup({ field: 'size', title: 'Boyut', options: SUBTITLE_SIZE_OPTIONS }),
      this.buildGroup({ field: 'color', title: 'Renk', options: SUBTITLE_COLOR_OPTIONS }),
      this.buildGroup({ field: 'background', title: 'Arkaplan', options: SUBTITLE_BACKGROUND_OPTIONS }),
      this.buildGroup({ field: 'position', title: 'Konum', options: SUBTITLE_POSITION_OPTIONS }),
    );

    panel.append(previewBox, groups, buttonRow(settingsButton('back-btn', 'Geri', 'secondary', cb.onHome)));
    this.paintPreview();
    const fm = createSettingsFocus(screen, { onBack: cb.onHome });
    fm.focus('nav-subtitle');
    return fm;
  }

  private buildGroup<T extends string>(group: Group<T>): HTMLElement {
    const wrap = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = group.title;
    title.style.cssText = 'font-size:28px;font-weight:800;margin-bottom:14px';
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${group.options.length},minmax(0,1fr));grid-gap:20px`;
    for (const opt of group.options) {
      const card = document.createElement('div');
      card.dataset.focusId = `subtitle-${group.field}-${opt.id}`;
      card.addEventListener('click', () => this.select(group.field, opt.id));
      this.cards.set(`${group.field}:${opt.id}`, card);
      grid.append(card);
    }
    wrap.append(title, grid);
    return wrap;
  }

  private select(field: Field, id: string): void {
    const { storage } = this.ctx;
    const current = storage.getSettings().subtitleStyle;
    if (current[field] === id) return;
    updateSettings(storage, (s) => ({ subtitleStyle: { ...s.subtitleStyle, [field]: id } as SubtitleStyle }));
    this.paintPreview();
  }

  private paintPreview(): void {
    const style = this.ctx.storage.getSettings().subtitleStyle;
    Object.assign(this.preview.style, subtitleStyleCss(style));
    // The preview box has a fixed height of 160px; the real player's 260px/420px/80px positions don't fit in it,
    // so only the relative "top/middle/bottom" position is reflected (size/color/background are shown exactly).
    const pos = style.position;
    this.preview.style.top = pos === 'top' ? '16px' : 'auto';
    this.preview.style.bottom = pos === 'bottom' ? '16px' : pos === 'middle-bottom' ? '56px' : 'auto';
    this.paintCards();
  }

  private paintCards(): void {
    const style = this.ctx.storage.getSettings().subtitleStyle;
    const selected: Record<Field, string> = { size: style.size, color: style.color, background: style.background, position: style.position };
    for (const [key, card] of this.cards) {
      const [field, id] = key.split(':') as [Field, string];
      const on = selected[field] === id;
      card.className = 'seg-option' + (on ? ' on' : '');
      card.setAttribute('aria-pressed', String(on));
      const label = this.labelOf(field, id);
      card.innerHTML =
        `<span style="font-size:28px;font-weight:800;${on ? 'color:var(--peach)' : ''}">${label}</span>` +
        (on ? `<span style="width:40px;height:40px;border-radius:20px;background:var(--accent);color:var(--ink);display:flex;align-items:center;justify-content:center;flex:none">${checkIconSvg(22)}</span>` : '');
    }
  }

  private labelOf(field: Field, id: string): string {
    const options = { size: SUBTITLE_SIZE_OPTIONS, color: SUBTITLE_COLOR_OPTIONS, background: SUBTITLE_BACKGROUND_OPTIONS, position: SUBTITLE_POSITION_OPTIONS }[field];
    return (options as { id: string; label: string }[]).find((o) => o.id === id)?.label ?? id;
  }
}
