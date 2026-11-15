import { checkAccountBlock } from '../../core/src/accountGuard.ts';
import type { Library } from '../../core/src/types.ts';
import { HomeController } from './app/homeController.ts';
import { LiveController } from './app/liveController.ts';
import { ParentalSession } from './app/parentalSession.ts';
import { PinPrompt } from './app/pinPrompt.ts';
import { ScreenHost } from './app/screenHost.ts';
import { SettingsController } from './app/settingsController.ts';
import { VodController } from './app/vodController.ts';
import { VodRestoreStore } from './app/vodRestoreStore.ts';
import type { AppContext, AppDeps, Navigation } from './app/appContext.ts';
import type { PlayerAdapter } from './playerAdapter.ts';
import type { LiveScreenResume } from './screens/liveScreen.ts';
import type { SettingsPage } from './screens/settings.ts';
import { SingleStreamGate } from './singleStream.ts';
import { applyTheme } from './themes.ts';

export type { AppDeps } from './app/appContext.ts';

/**
 * App shell (composition root + Mediator): wires up dependencies and connects the domain controllers
 * (Home, Settings, Live TV, Movies/Series) via `Navigation`, keeping them unaware of each other.
 * Not responsible for calling `PlaylistService.init()` — the platform's `main.ts` does that, before
 * calling `startApp`, once the library is ready.
 */
class App implements Navigation {
  private readonly host: ScreenHost;
  private readonly home_: HomeController;
  private readonly settings_: SettingsController;
  private readonly live_: LiveController;
  private readonly vod: VodController;

  constructor(deps: AppDeps) {
    // Only a single stream connection to the provider at a time: every player passes through this gate (see singleStream.ts).
    const fetchText = deps.fetchText;
    const gate = new SingleStreamGate({
      preflight: fetchText ? () => checkAccountBlock(fetchText, deps.playlist.getActiveConnection()?.url ?? '') : undefined,
    });

    // Theme: `data-theme` is applied on every startup and whenever the selection changes in Settings > Theme; the colors
    // live in styles.css as the `:root` (Default) and `:root[data-theme="…"]` variables.
    applyTheme(deps.storage.getSettings().theme);

    // Parental lock: the PIN is kept only on this device; session state lives in ParentalSession.
    const parental = new ParentalSession(() => deps.storage.getSettings().parental);
    this.host = new ScreenHost(deps.container);
    const ctx: AppContext = {
      deps,
      host: this.host,
      parental,
      pin: new PinPrompt(this.host, parental),
      nav: this,
      createPlayerAdapter: (videoContainer: HTMLElement): PlayerAdapter => gate.wrap(deps.createPlayerAdapter(videoContainer)),
      library: (): Library | null => parental.filter(deps.playlist.getLibrary()),
    };
    const vodRestore = new VodRestoreStore();
    this.home_ = new HomeController(ctx);
    this.settings_ = new SettingsController(ctx, vodRestore);
    this.live_ = new LiveController(ctx);
    this.vod = new VodController(ctx, vodRestore);
  }

  start(): () => void {
    this.home();
    return () => this.host.destroy();
  }

  home(): void {
    this.home_.show();
  }
  settings(page?: SettingsPage, connectionId?: string): void {
    this.settings_.show(page, connectionId);
  }
  live(resume?: LiveScreenResume, startCategoryId?: string): void {
    this.live_.show(resume, startCategoryId);
  }
  movies(restore?: boolean): void {
    this.vod.showMovies(restore);
  }
  series(restore?: boolean): void {
    this.vod.showSeries(restore);
  }
}

/** Starts the app; the returned function stops it (closes the open screen and the player). */
export function startApp(deps: AppDeps): () => void {
  return new App(deps).start();
}
