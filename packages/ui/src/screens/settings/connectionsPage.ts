import type { FocusManager } from '../../focusManager.ts';
import { plusIconSvg } from '../../icons.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, noteLine, settingsButton, verticalChain } from '../settingsShell.ts';
import { buildConnectionCard } from './connectionCard.ts';
import type { SettingsPageContext, SettingsPageView } from './pageContext.ts';

/**
 * Connections: each connection is a card (name, type · last check, Active/Inactive badge, status). Enter on a
 * card -> Edit Connection (including making it active). At the bottom, "Add Connection" and "Retry All". Only
 * one connection can be active at a time; the list refreshes itself as connections are refreshed/activated.
 */
export class ConnectionsPage implements SettingsPageView {
  private readonly ctx: SettingsPageContext;
  private readonly list = document.createElement('div');

  constructor(ctx: SettingsPageContext) {
    this.ctx = ctx;
  }

  render(): FocusManager {
    const { container, playlist, cb } = this.ctx;
    const { screen, panel } = buildSettingsShell(
      container,
      'connections',
      'Bağlantılar',
      'Kanal listelerini buradan ekle, düzenle veya kaldır. Aynı anda yalnızca bir bağlantı aktif olabilir.',
      cb.onNavigate,
      cb.onHome,
    );
    this.list.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto';
    this.list.className = 'hide-scrollbar';
    panel.append(this.list);
    this.renderList();

    this.appendDeviceMac(panel);
    panel.append(
      buttonRow(
        settingsButton('add-btn', 'Bağlantı Ekle', 'primary', () => cb.onNavigate('add'), plusIconSvg(32)),
        settingsButton('retry-btn', 'Hepsini Yeniden Dene', 'secondary', () => void playlist.refreshAll()),
      ),
    );

    // Vertical order: cards top to bottom, then the button row.
    const fm = createSettingsFocus(screen, {
      onBack: cb.onHome,
      candidateFilter: verticalChain(() => [
        ...[...screen.querySelectorAll<HTMLElement>('[data-focus-id^="conn-"]')].map((el) => [el.dataset.focusId!]),
        ['add-btn', 'retry-btn'],
      ]),
    });
    // On entering the page, focus starts on the selected item in the left menu; Right moves into the content.
    fm.focus('nav-connections');
    // Cards update as connections are refreshed / activated; focus stays in the same position.
    fm.onDestroy(
      playlist.on((e) => {
        if (e.type !== 'connections-changed') return;
        this.renderList();
        fm.refresh();
      }),
    );
    return fm;
  }

  private renderList(): void {
    const { storage, playlist, cb } = this.ctx;
    this.list.innerHTML = '';
    const settings = storage.getSettings();
    // Active connection on top, others in the order they were added.
    const ordered = [...settings.connections].sort((a, b) => Number(b.id === settings.activeConnectionId) - Number(a.id === settings.activeConnectionId));
    if (ordered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:28px;font-weight:600;color:var(--text-dim);padding:24px 8px';
      empty.textContent = 'Henüz bağlantı eklenmedi.';
      this.list.append(empty);
      return;
    }
    ordered.forEach((c, i) => this.list.append(buildConnectionCard(c, i, c.id === settings.activeConnectionId, playlist.isRefreshing(c.id), () => cb.onNavigate('edit', c.id))));
  }

  /** If provided, shows the device's MAC address (for remote upload). */
  private appendDeviceMac(panel: HTMLElement): void {
    const getMac = this.ctx.cb.getDeviceMac;
    if (!getMac) return;
    const macLine = noteLine('Cihaz MAC adresi: ...');
    macLine.style.marginTop = '4px';
    panel.append(macLine);
    void Promise.resolve(getMac()).then(
      (mac) => {
        macLine.textContent = `Cihaz MAC adresi: ${mac}`;
      },
      () => {
        macLine.textContent = 'Cihaz MAC adresi okunamadı';
      },
    );
  }
}
