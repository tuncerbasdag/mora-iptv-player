import { describeUpdate, type AppUpdateAction, type AppUpdateState, type AppUpdater } from '../../appUpdater.ts';
import type { FocusManager } from '../../focusManager.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, settingsButton, spacer } from '../settingsShell.ts';
import type { SettingsPageContext, SettingsPageView } from './pageContext.ts';

/**
 * Update (desktop app only): current version, status, and a single contextual button
 * (Check → Download → Restart and install). The state comes from the desktop shell (see AppUpdater); the page repaints on every change.
 */
export class UpdatePage implements SettingsPageView {
  private readonly ctx: SettingsPageContext;
  private readonly updater: AppUpdater;
  private action: AppUpdateAction | null = null;

  constructor(ctx: SettingsPageContext, updater: AppUpdater) {
    this.ctx = ctx;
    this.updater = updater;
  }

  render(): FocusManager {
    const { container, cb } = this.ctx;
    const { screen, panel } = buildSettingsShell(container, 'updates', 'Güncelleme', 'Uygulamanın yeni sürümünü denetle ve istersen güncelle.', cb.onNavigate, cb.onHome);

    const card = document.createElement('div');
    card.className = 'switch-card';
    card.style.cssText = 'flex-direction:column;align-items:stretch;gap:14px;cursor:default';
    const version = document.createElement('div');
    version.style.cssText = 'font-size:26px;font-weight:600;color:var(--text-dim)';
    const status = document.createElement('div');
    status.dataset.testid = 'update-status';
    status.style.cssText = 'font-size:34px;font-weight:800';
    const detail = document.createElement('div');
    detail.style.cssText = 'font-size:26px;font-weight:600;line-height:1.4;color:var(--text-dim)';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:14px;border-radius:7px;background:rgba(255,255,255,.12);overflow:hidden;display:none';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:0;background:var(--accent)';
    bar.append(fill);
    card.append(version, status, detail, bar);

    const act = settingsButton('update-action', 'Güncellemeleri denetle', 'primary', () => this.run());
    panel.append(card, spacer(), buttonRow(act, settingsButton('back-btn', 'Geri', 'secondary', cb.onHome)));

    const paint = (state: AppUpdateState): void => {
      const view = describeUpdate(state);
      this.action = view.action;
      version.textContent = `Mevcut sürüm: ${state.currentVersion}`;
      status.textContent = view.status;
      detail.textContent = view.detail;
      bar.style.display = view.progress === null ? 'none' : 'block';
      fill.style.width = `${view.progress ?? 0}%`;
      act.textContent = view.label;
      act.style.opacity = view.action ? '' : '0.5';
      act.setAttribute('aria-disabled', String(!view.action));
    };

    const fm = createSettingsFocus(screen, { onBack: cb.onHome });
    fm.focus('nav-updates');
    fm.onDestroy(this.updater.onState(paint));
    void this.updater.getState().then((s) => s && paint(s));
    return fm;
  }

  private run(): void {
    if (this.action === 'check') this.updater.check();
    else if (this.action === 'download') this.updater.download();
    else if (this.action === 'install') this.updater.install();
    else if (this.action === 'open-releases') this.updater.openReleases();
  }
}
