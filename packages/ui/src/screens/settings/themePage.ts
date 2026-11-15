import { updateSettings } from '../../../../core/src/storage.ts';
import type { ThemeId } from '../../../../core/src/types.ts';
import type { FocusManager } from '../../focusManager.ts';
import { checkIconSvg } from '../../icons.ts';
import { applyTheme, THEMES, type ThemeDefinition } from '../../themes.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, settingsButton } from '../settingsShell.ts';
import type { SettingsPageContext, SettingsPageView } from './pageContext.ts';

interface ThemeCard {
  el: HTMLElement;
  name: HTMLElement;
  badge: HTMLElement;
}

/** Theme selection: each theme is a card (name, color dots, description); selecting it applies and saves it immediately. */
export class ThemePage implements SettingsPageView {
  private readonly ctx: SettingsPageContext;
  private readonly cards = new Map<ThemeId, ThemeCard>();

  constructor(ctx: SettingsPageContext) {
    this.ctx = ctx;
  }

  render(): FocusManager {
    const { container, cb } = this.ctx;
    const { screen, panel } = buildSettingsShell(container, 'theme', 'Tema', 'Uygulamanın görünümünü seç.', cb.onNavigate, cb.onHome);

    // Cards are laid out in rows of two columns: if they don't fit the panel, it scrolls (focusing a card scrolls it into view).
    const grid = document.createElement('div');
    grid.className = 'hide-scrollbar';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-gap:24px;flex:1;min-height:0;overflow-y:auto;align-content:start;padding:8px 8px 8px 0';
    for (const t of THEMES) grid.append(this.buildCard(t));
    this.paint();

    panel.append(grid, buttonRow(settingsButton('back-btn', 'Geri', 'secondary', cb.onHome)));
    const fm = createSettingsFocus(screen, { onBack: cb.onHome });
    fm.focus('nav-theme');
    return fm;
  }

  private select(id: ThemeId): void {
    const { storage } = this.ctx;
    if (storage.getSettings().theme !== id) {
      updateSettings(storage, () => ({ theme: id }));
      applyTheme(id);
    }
    this.paint();
  }

  private paint(): void {
    const selected = this.ctx.storage.getSettings().theme;
    for (const [id, c] of this.cards) {
      const on = id === selected;
      c.el.classList.toggle('on', on);
      c.el.setAttribute('aria-pressed', String(on));
      c.name.style.color = on ? 'var(--peach)' : '';
      c.badge.style.display = on ? 'flex' : 'none';
    }
  }

  private buildCard(t: ThemeDefinition): HTMLElement {
    const el = document.createElement('div');
    el.className = 'theme-card';
    el.dataset.focusId = `theme-${t.id}`;
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    const name = document.createElement('span');
    name.style.cssText = 'font-size:36px;font-weight:800';
    name.textContent = t.name;
    const badge = document.createElement('span');
    badge.style.cssText = 'width:44px;height:44px;border-radius:22px;background:var(--accent);color:var(--ink);display:none;align-items:center;justify-content:center';
    badge.innerHTML = checkIconSvg(26);
    top.append(name, badge);
    const dots = document.createElement('div');
    dots.style.cssText = 'display:flex';
    for (const c of t.palette) {
      const d = document.createElement('span');
      d.style.cssText = `width:44px;height:44px;border-radius:22px;margin-right:12px;background:${c};box-shadow:inset 0 0 0 2px rgba(255,255,255,0.25)`;
      dots.append(d);
    }
    const desc = document.createElement('span');
    desc.style.cssText = 'font-size:24px;font-weight:600;color:var(--text-dim)';
    desc.textContent = t.description;
    el.append(top, dots, desc);
    el.addEventListener('click', () => this.select(t.id));
    this.cards.set(t.id, { el, name, badge });
    return el;
  }
}
