import { isCategoryLocked } from '../../../../core/src/parental.ts';
import type { SettingsStore } from '../../../../core/src/storage.ts';
import type { ParentalSettings } from '../../../../core/src/types.ts';
import type { FocusManager } from '../../focusManager.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, settingsButton, verticalChain } from '../settingsShell.ts';
import { patchParental, type ParentalCallbacks } from './parentalCallbacks.ts';
import { SwitchRow } from './switchRow.ts';

/** Specific categories (not in the design; a list in the language of Parental Lock): one switch row per category name in the library. */
export class ParentalCategoriesPage {
  private readonly storage: SettingsStore;
  private readonly cb: ParentalCallbacks;
  /** Category name → which kinds it exists in (Live / Movie / Series); ordered by name. */
  private readonly kinds = new Map<string, Set<string>>();
  private readonly names: string[];

  constructor(storage: SettingsStore, cb: ParentalCallbacks) {
    this.storage = storage;
    this.cb = cb;
    const lib = cb.getLibrary();
    this.addKind(lib?.live.map((c) => c.name) ?? [], 'Canlı');
    this.addKind(lib?.movies.map((c) => c.name) ?? [], 'Film');
    this.addKind(lib?.series.map((c) => c.name) ?? [], 'Dizi');
    this.names = [...this.kinds.keys()].sort((a, b) => a.localeCompare(b, 'tr'));
  }

  render(container: HTMLElement): FocusManager {
    const { cb, names } = this;
    const { screen, panel } = buildSettingsShell(container, 'parental-categories', 'Belirli kategoriler', 'PIN girilmeden açılmayacak kategorileri seç.', cb.onNavigate, cb.onHome);
    const list = document.createElement('div');
    list.className = 'hide-scrollbar';
    list.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto';
    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:28px;font-weight:600;color:var(--text-dim);padding:24px 8px';
      empty.textContent = 'Kategori bulunamadı. Önce bir bağlantı ekleyip listeyi yükle.';
      list.append(empty);
    }
    names.forEach((name, i) => {
      const row = this.buildRow(name, i);
      row.el.style.marginBottom = '12px';
      row.el.style.flex = 'none';
      list.append(row.el);
    });
    panel.append(list, buttonRow(settingsButton('back-btn', 'Geri', 'secondary', () => cb.onNavigate('parental'))));
    const fm = createSettingsFocus(screen, {
      onBack: () => cb.onNavigate('parental'),
      candidateFilter: verticalChain(() => [...names.map((_, i) => [`pc-${i}`]), ['back-btn']]),
    });
    fm.focus(names.length > 0 ? 'pc-0' : 'back-btn');
    return fm;
  }

  private p(): ParentalSettings {
    return this.storage.getSettings().parental;
  }

  private addKind(names: string[], kind: string): void {
    names.forEach((n) => (this.kinds.get(n) ?? this.kinds.set(n, new Set()).get(n)!).add(kind));
  }

  private buildRow(name: string, i: number): SwitchRow {
    const byRule = (): boolean => isCategoryLocked(this.p(), name) && !this.p().lockedCategories.includes(name);
    return new SwitchRow({
      id: `pc-${i}`,
      title: name,
      desc: () => [...this.kinds.get(name)!].join(' · ') + (byRule() ? ' · Yetişkin kategorisi olarak zaten kilitli' : ''),
      isOn: () => this.p().lockedCategories.includes(name),
      onToggle: () => {
        const cur = this.p().lockedCategories;
        patchParental(this.storage, { lockedCategories: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name] });
        this.cb.onChanged('rules');
      },
      large: false,
      showLock: () => isCategoryLocked(this.p(), name),
    });
  }
}
