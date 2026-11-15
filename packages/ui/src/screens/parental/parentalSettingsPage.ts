import type { SettingsStore } from '../../../../core/src/storage.ts';
import type { ParentalSettings } from '../../../../core/src/types.ts';
import type { FocusManager } from '../../focusManager.ts';
import { chevronRightIconSvg } from '../../icons.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, settingsButton, spacer, verticalChain } from '../settingsShell.ts';
import { patchParental, type ParentalCallbacks } from './parentalCallbacks.ts';
import { SwitchRow } from './switchRow.ts';

/** Focus order: master switch → PIN → content options → Back (dependent rows don't receive focus while the lock is off). */
const FOCUS_ORDER = ['p-master', 'p-pin', 'p-adult', 'p-settings', 'p-cats', 'back-btn'];

/**
 * Parental Lock page (SettingsParental / SettingsParentalOff): the master switch, the PIN row, and the content
 * options to lock. The PIN row and content options become dimmed and unfocusable while the lock is off.
 */
export class ParentalSettingsPage {
  private readonly storage: SettingsStore;
  private readonly cb: ParentalCallbacks;
  private readonly master: SwitchRow;
  private readonly adult: SwitchRow;
  private readonly settingsLock: SwitchRow;
  private readonly pin: HTMLElement;
  private readonly cats: HTMLElement;
  private readonly section: HTMLElement;
  private readonly dependents: Array<[HTMLElement, string]>;

  constructor(storage: SettingsStore, cb: ParentalCallbacks) {
    this.storage = storage;
    this.cb = cb;
    this.master = new SwitchRow({
      id: 'p-master',
      title: 'Ebeveyn kilidi',
      desc: () => (this.p().enabled ? 'Açıkken seçtiğin içerikler PIN girilmeden açılmaz.' : 'Kapalıyken tüm içerik PIN sorulmadan açılır.'),
      isOn: () => this.p().enabled,
      onToggle: () => {
        const on = !this.p().enabled;
        patchParental(storage, { enabled: on });
        cb.onChanged(on ? 'enabled' : 'disabled');
        this.paintDisabled();
      },
      large: true,
    });
    this.adult = new SwitchRow({
      id: 'p-adult',
      title: 'Yetişkin kategorileri',
      desc: () => '+18 olarak işaretli kategoriler PIN ister.',
      isOn: () => this.p().lockAdult,
      onToggle: () => {
        patchParental(storage, { lockAdult: !this.p().lockAdult });
        cb.onChanged('rules');
      },
      large: false,
    });
    this.settingsLock = new SwitchRow({
      id: 'p-settings',
      title: 'Ayarlar',
      desc: () => 'Ayarlara girerken PIN sor.',
      isOn: () => this.p().lockSettings,
      onToggle: () => {
        patchParental(storage, { lockSettings: !this.p().lockSettings });
        cb.onChanged('rules');
      },
      large: false,
    });
    this.pin = this.buildPinRow();
    this.cats = this.buildCategoriesRow();
    this.section = document.createElement('div');
    this.section.style.cssText = 'font-size:26px;font-weight:800;color:var(--text-dim);padding:8px 8px 0';
    this.section.textContent = 'Kilitlenecek içerikler';
    this.dependents = [[this.pin, 'p-pin'], [this.adult.el, 'p-adult'], [this.settingsLock.el, 'p-settings'], [this.cats, 'p-cats']];
  }

  render(container: HTMLElement): FocusManager {
    const { cb } = this;
    const { screen, panel } = buildSettingsShell(container, 'parental', 'Ebeveyn Kilidi', 'Seçtiğin içerikleri 4 haneli PIN ile koru.', cb.onNavigate, cb.onHome);
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column';
    [this.adult.el, this.settingsLock.el, this.cats].forEach((e, i) => {
      if (i) e.style.marginTop = '12px';
      list.append(e);
    });
    panel.append(this.master.el, this.pin, this.section, list, spacer(), buttonRow(settingsButton('back-btn', 'Geri', 'secondary', cb.onHome)));
    this.paintDisabled();

    const exists = (id: string): boolean => !!screen.querySelector(`[data-focus-id="${id}"]`);
    const fm = createSettingsFocus(screen, {
      onBack: cb.onHome,
      candidateFilter: verticalChain(() => FOCUS_ORDER.filter(exists).map((id) => [id])),
    });
    fm.focus('nav-parental');
    return fm;
  }

  private p(): ParentalSettings {
    return this.storage.getSettings().parental;
  }

  /** The PIN row and content options become dimmed and unfocusable while the lock is off (SettingsParentalOff). */
  private paintDisabled(): void {
    const on = this.p().enabled;
    for (const [el, id] of this.dependents) {
      el.classList.toggle('dim', !on);
      if (on) el.dataset.focusId = id;
      else delete el.dataset.focusId;
    }
    this.section.classList.toggle('dim', !on);
    this.master.repaint();
  }

  private buildPinRow(): HTMLElement {
    const pin = document.createElement('div');
    pin.className = 'switch-card';
    pin.style.cssText = 'height:100px;padding:0 32px;border-radius:24px';
    pin.dataset.focusId = 'p-pin';
    const pinText = document.createElement('div');
    pinText.style.cssText = 'display:flex;flex-direction:column';
    const pinTitle = document.createElement('div');
    pinTitle.style.cssText = 'font-size:28px;font-weight:800;margin-bottom:4px';
    pinTitle.textContent = 'PIN';
    const pinDesc = document.createElement('div');
    pinDesc.style.cssText = 'font-size:22px;font-weight:600;color:var(--text-dim)';
    pinDesc.textContent = this.p().pinHash === null ? 'Varsayılan PIN: 0 0 0 0 · Güvenliğin için değiştir' : 'PIN belirlendi · İstediğin zaman değiştirebilirsin';
    pinText.append(pinTitle, pinDesc);
    const pinRight = document.createElement('div');
    pinRight.style.cssText = 'display:flex;align-items:center;flex:none';
    const dots = document.createElement('span');
    dots.style.cssText = 'font-size:36px;font-weight:800;letter-spacing:0.3em;margin-right:24px';
    dots.textContent = '••••';
    const pill = document.createElement('span');
    pill.style.cssText = 'display:flex;align-items:center;height:56px;padding:0 24px;box-sizing:border-box;border:2px solid var(--border);border-radius:28px;font-size:24px;font-weight:700';
    pill.textContent = "PIN'i değiştir";
    pinRight.append(dots, pill);
    pin.append(pinText, pinRight);
    pin.addEventListener('click', () => this.cb.onNavigate('parental-pin-current'));
    return pin;
  }

  private buildCategoriesRow(): HTMLElement {
    const cats = document.createElement('div');
    cats.className = 'switch-card sm';
    cats.dataset.focusId = 'p-cats';
    const catsText = document.createElement('div');
    catsText.style.cssText = 'display:flex;flex-direction:column;min-width:0';
    const catsTitle = document.createElement('div');
    catsTitle.style.cssText = 'font-size:28px;font-weight:800;margin-bottom:2px';
    catsTitle.textContent = 'Belirli kategoriler';
    const catsDesc = document.createElement('div');
    catsDesc.style.cssText = 'font-size:22px;font-weight:600;color:var(--text-dim)';
    const chosen = this.p().lockedCategories;
    catsDesc.textContent = chosen.length === 0 ? 'Kategori seçilmedi' : `${chosen.length} kategori seçili · ${chosen.slice(0, 3).join(', ')}${chosen.length > 3 ? '…' : ''}`;
    catsText.append(catsTitle, catsDesc);
    const chev = document.createElement('span');
    chev.style.cssText = 'color:var(--text-dim);flex:none';
    chev.innerHTML = chevronRightIconSvg(32);
    cats.append(catsText, chev);
    cats.addEventListener('click', () => this.cb.onNavigate('parental-categories'));
    return cats;
  }
}
