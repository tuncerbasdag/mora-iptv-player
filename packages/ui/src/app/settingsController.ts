import { isPinChangePage, PinChangeFlow } from '../pinChangeFlow.ts';
import { renderConnectionForm } from '../screens/connections.ts';
import { renderParentalCategories, renderParentalSettings } from '../screens/parental.ts';
import { renderRemoteSetup } from '../screens/remoteSetup.ts';
import { enableUpdatesNav } from '../screens/settingsShell.ts';
import { renderSettingsScreen, type SettingsPage } from '../screens/settings.ts';
import type { AppContext } from './appContext.ts';
import type { ParentalChange } from './parentalSession.ts';
import type { VodRestoreStore } from './vodRestoreStore.ts';

/** Settings: pages, connection form, remote upload, parental lock pages, and the PIN gate. */
export class SettingsController {
  private readonly ctx: AppContext;
  private readonly vodRestore: VodRestoreStore;
  private readonly pinChange: PinChangeFlow;

  constructor(ctx: AppContext, vodRestore: VodRestoreStore) {
    this.ctx = ctx;
    this.vodRestore = vodRestore;
    this.pinChange = new PinChangeFlow({
      container: ctx.host.container,
      storage: ctx.deps.storage,
      verifyCurrentPin: (pin) => ctx.parental.verifyPinMessage(pin),
      navigate: (pg) => this.show(pg),
      onHome: () => ctx.nav.home(),
    });
    // Desktop app: the "Help → Check for Updates…" menu item opens the Update page and starts a check.
    const updater = ctx.deps.appUpdater;
    if (updater) {
      enableUpdatesNav();
      updater.onOpenUpdates(() => {
        this.show('updates');
        updater.check();
      });
    }
  }

  /** `connectionId`: only for 'edit', the connection being edited. */
  show(page: SettingsPage = 'connections', connectionId?: string): void {
    const { deps, host, parental, pin, nav } = this.ctx;
    if (page === 'edit' && !deps.playlist.getConnections().some((c) => c.id === connectionId)) {
      page = 'connections'; // connection deleted/missing: go back to the list
    }
    const inParental = page.startsWith('parental');
    if (parental.requiresSettingsPin(inParental)) {
      const target = page;
      pin.ask(
        'PIN gir',
        inParental ? 'Ebeveyn kilidi ayarlarını değiştirmek için PIN gir.' : 'Ayarlara girmek için PIN gir.',
        () => {
          parental.grantSettingsAccess();
          this.show(target, connectionId);
        },
        () => nav.home(),
      );
      return;
    }
    host.clearScreen();
    if (inParental) {
      this.showParentalPage(page);
      return;
    }
    const navigate = (p: SettingsPage, id?: string): void => this.show(p, id);
    if (page === 'add' || page === 'edit') {
      host.replaceScreen(() =>
        renderConnectionForm(host.container, deps.storage, deps.playlist, page, connectionId, {
          onNavigate: navigate,
          onHome: () => nav.home(),
          onDone: () => this.show('connections'),
          onRemote: deps.remoteSetup ? () => this.show('remote') : undefined,
        }),
      );
      return;
    }
    if (page === 'remote' && deps.remoteSetup) {
      const remoteSetup = deps.remoteSetup;
      host.replaceScreen(() =>
        renderRemoteSetup(host.container, deps.playlist, remoteSetup, {
          onNavigate: navigate,
          onHome: () => nav.home(),
          onDone: () => this.show('connections'),
        }),
      );
      return;
    }
    host.replaceScreen(() =>
      renderSettingsScreen(host.container, deps.storage, deps.playlist, page as Exclude<SettingsPage, 'add' | 'edit'>, {
        onHome: () => nav.home(),
        onNavigate: navigate,
        onEpgChanged: () => deps.onEpgSettingsChanged?.(),
        getDeviceMac: deps.remoteSetup?.getDeviceMac,
        appUpdater: deps.appUpdater,
      }),
    );
  }

  private showParentalPage(page: SettingsPage): void {
    const { host, deps, parental, nav } = this.ctx;
    if (isPinChangePage(page)) {
      host.replaceScreen(() => this.pinChange.render(page));
      return;
    }
    const cb = {
      onNavigate: (pg: SettingsPage) => this.show(pg),
      onHome: () => nav.home(),
      onChanged: (change: ParentalChange) => {
        parental.onSettingsChanged(change);
        this.vodRestore.clear();
      },
      getLibrary: () => deps.playlist.getLibrary(),
    };
    host.replaceScreen(() => (page === 'parental-categories' ? renderParentalCategories(host.container, deps.storage, cb) : renderParentalSettings(host.container, deps.storage, cb)));
  }
}
