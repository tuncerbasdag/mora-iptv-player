import { updateSettings } from '../../../../core/src/storage.ts';
import type { FocusManager } from '../../focusManager.ts';
import { checkIconSvg } from '../../icons.ts';
import { LANGUAGES, type LanguageDefinition } from '../../languages.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, noteLine, settingsButton, spacer } from '../settingsShell.ts';
import type { SettingsPageContext, SettingsPageView } from './pageContext.ts';

interface LanguageCard {
  el: HTMLElement;
  name: HTMLElement;
  note: HTMLElement;
  badge: HTMLElement;
}

/**
 * Language: a single-select list. Selectable languages are focusable cards; ones that aren't ready yet are
 * disabled (can't receive focus) and show a "Coming soon" badge. Until the translation infrastructure arrives,
 * only the selection itself is stored.
 */
export class LanguagePage implements SettingsPageView {
  private readonly ctx: SettingsPageContext;
  private readonly cards = new Map<string, LanguageCard>();

  constructor(ctx: SettingsPageContext) {
    this.ctx = ctx;
  }

  render(): FocusManager {
    const { container, cb } = this.ctx;
    const { screen, panel } = buildSettingsShell(container, 'language', 'Dil', 'Uygulamanın dilini seç.', cb.onNavigate, cb.onHome);
    const list = document.createElement('div');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Dil');
    list.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    for (const lang of LANGUAGES) list.append(this.buildCard(lang));
    this.paint();

    panel.append(list, noteLine('Şimdilik yalnızca Türkçe kullanılabilir. Diğer diller sonraki sürümlerde eklenecek.'), spacer(), buttonRow(settingsButton('back-btn', 'Geri', 'secondary', cb.onHome)));
    const fm = createSettingsFocus(screen, { onBack: cb.onHome });
    fm.focus('nav-language');
    return fm;
  }

  private paint(): void {
    const selected = this.ctx.storage.getSettings().language;
    for (const lang of LANGUAGES) {
      const c = this.cards.get(lang.id)!;
      const on = lang.available && lang.id === selected;
      c.el.classList.toggle('on', on);
      c.el.setAttribute('aria-checked', String(on));
      c.name.style.color = on ? 'var(--peach)' : '';
      c.note.textContent = on ? 'Şu an kullanılan dil' : lang.note;
      c.badge.style.display = on ? 'flex' : 'none';
    }
  }

  private buildCard(lang: LanguageDefinition): HTMLElement {
    const el = document.createElement('div');
    el.className = 'lang-card' + (lang.available ? '' : ' soon');
    el.setAttribute('role', 'radio');
    el.setAttribute('aria-checked', 'false');
    const text = document.createElement('span');
    text.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0';
    const name = document.createElement('span');
    name.style.cssText = 'font-size:34px;font-weight:800';
    name.textContent = lang.name;
    const note = document.createElement('span');
    note.style.cssText = 'font-size:24px;font-weight:600;color:var(--text-dim)';
    text.append(name, note);

    const badge = document.createElement('span');
    badge.style.cssText = 'width:44px;height:44px;border-radius:22px;background:var(--accent);color:var(--ink);display:none;align-items:center;justify-content:center;flex:none';
    badge.innerHTML = checkIconSvg(26);
    el.append(text, badge);
    if (lang.available) {
      el.dataset.focusId = `lang-${lang.id}`;
      el.addEventListener('click', () => {
        updateSettings(this.ctx.storage, () => ({ language: lang.id }));
        this.paint();
      });
    } else {
      el.setAttribute('aria-disabled', 'true');
      const soon = document.createElement('span');
      soon.className = 'soon-pill';
      soon.textContent = 'Yakında';
      el.append(soon);
    }
    this.cards.set(lang.id, { el, name, note, badge });
    return el;
  }
}
