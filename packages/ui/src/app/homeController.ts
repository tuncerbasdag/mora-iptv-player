import { renderWelcomeScreen } from '../screens/welcome.ts';
import type { AppContext } from './appContext.ts';

/** Home screen: Live TV / Movies / Series / Settings cards and the parental lock button. */
export class HomeController {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  show(): void {
    const { host, parental, nav, pin, deps } = this.ctx;
    parental.resetSettingsAccess();
    host.replaceScreen(() =>
      renderWelcomeScreen(host.container, deps.playlist, {
        // Wrapped instead of passed as a direct reference: welcome.ts's card click handler can pass the DOM
        // click event through to the callback (see welcome.ts) — since `live` now takes an optional `resume`
        // parameter, that event object was mistakenly treated as `resume`, crashing on `resume.item.id` access.
        onOpenLive: () => nav.live(),
        onOpenMovies: () => nav.movies(),
        onOpenSeries: () => nav.series(),
        onOpenSettings: () => nav.settings(),
        ...(deps.appUpdater ? { appUpdater: deps.appUpdater, onOpenUpdates: () => nav.settings('updates') } : {}),
        getLibrary: () => this.ctx.library(),
        parentalState: () => parental.state(),
        onToggleParental: () => {
          if (parental.isUnlocked()) {
            parental.relock(); // manually re-lock
            this.show();
          } else {
            pin.requestUnlock('Kilitli içerikleri bu oturum boyunca açmak için PIN gir.', () => this.show(), () => this.show());
          }
        },
      }),
    );
  }
}
