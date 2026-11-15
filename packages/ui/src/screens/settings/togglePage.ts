import { activeConnection } from '../../../../core/src/connections.ts';
import { updateSettings } from '../../../../core/src/storage.ts';
import type { Settings } from '../../../../core/src/types.ts';
import type { FocusManager } from '../../focusManager.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, formatWhen, noteLine, settingsButton, spacer, switchCard } from '../settingsShell.ts';
import type { SettingsPageContext, SettingsPageView } from './pageContext.ts';

/** Declaration for a toggle page: which setting key, which texts, and what happens when it changes. */
export interface ToggleSpec {
  navId: 'auto' | 'epg';
  key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
  title: string;
  subtitle: string;
  cardTitle: string;
  cardDescription: string;
  /** When the EPG setting changes, the caller reloads the guide. */
  notifiesEpg: boolean;
}

export const TOGGLE_SPECS: Record<'auto' | 'epg', ToggleSpec> = {
  auto: {
    navId: 'auto',
    key: 'autoRefreshOnStart',
    title: 'Açılışta Otomatik Güncelle',
    subtitle: 'Uygulama açılırken listenin kendiliğinden yenilenip yenilenmeyeceğini seç.',
    cardTitle: 'Açılışta otomatik güncelle',
    cardDescription: 'Uygulama her açıldığında kanal listeleri ve program rehberi güncellenir.',
    notifiesEpg: false,
  },
  epg: {
    navId: 'epg',
    key: 'epgEnabled',
    title: 'Program Rehberi (EPG)',
    subtitle: 'Kanalların yayın akışını göster veya gizle.',
    cardTitle: 'Program rehberini otomatik güncelle',
    cardDescription: 'Program rehberi, kanal listesiyle birlikte güncel tutulur.',
    notifiesEpg: true,
  },
};

/** A page that toggles a single boolean setting (Auto Update, EPG); its texts and key come from `ToggleSpec`. */
export class TogglePage implements SettingsPageView {
  private readonly ctx: SettingsPageContext;
  private readonly spec: ToggleSpec;

  constructor(ctx: SettingsPageContext, spec: ToggleSpec) {
    this.ctx = ctx;
    this.spec = spec;
  }

  render(): FocusManager {
    const { container, storage, cb } = this.ctx;
    const { spec } = this;
    const { screen, panel } = buildSettingsShell(container, spec.navId, spec.title, spec.subtitle, cb.onNavigate, cb.onHome);
    panel.append(
      switchCard(
        'toggle',
        spec.cardTitle,
        spec.cardDescription,
        () => storage.getSettings()[spec.key],
        () => {
          updateSettings(storage, (s) => ({ [spec.key]: !s[spec.key] }));
          if (spec.notifiesEpg) cb.onEpgChanged();
        },
      ),
    );
    const when = formatWhen(activeConnection(storage.getSettings())?.lastUpdated ?? null);
    panel.append(noteLine(`Son güncelleme: ${when ?? 'henüz yok'}`), spacer(), buttonRow(settingsButton('back-btn', 'Geri', 'secondary', cb.onHome)));
    const fm = createSettingsFocus(screen, { onBack: cb.onHome });
    fm.focus(`nav-${spec.navId}`);
    return fm;
  }
}
