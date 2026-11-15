import type { MediaItem, Show } from '../../../core/src/types.ts';
import { renderMovieBrowser } from '../screens/movieBrowser.ts';
import { renderPlayerOverlay } from '../screens/playerOverlay.ts';
import { renderSeriesBrowser } from '../screens/seriesBrowser.ts';
import { renderShowDetail } from '../screens/showDetail.ts';
import type { VodBrowserCallbacks } from '../screens/vodBrowser.ts';
import type { AppContext } from './appContext.ts';
import { EpisodeNavigator, type EpisodePosition } from './episodeNavigation.ts';
import type { VodKey, VodRestoreStore } from './vodRestoreStore.ts';

/** Movies and Series: browsers, show detail, and movie/episode playback (advancing to the next episode on end). */
export class VodController {
  private readonly ctx: AppContext;
  private readonly restoreStore: VodRestoreStore;

  constructor(ctx: AppContext, restoreStore: VodRestoreStore) {
    this.ctx = ctx;
    this.restoreStore = restoreStore;
  }

  showMovies(restore = false): void {
    const { host, deps } = this.ctx;
    if (!restore) this.restoreStore.clear('movies');
    const reopen = (): void => this.showMovies(true);
    host.replaceScreen(() =>
      renderMovieBrowser(host.container, this.ctx.library()?.movies ?? [], deps.storage, this.callbacks<MediaItem>('movies', reopen, (item) => this.playMovie(item, reopen), restore)),
    );
  }

  showSeries(restore = false): void {
    const { host, deps } = this.ctx;
    if (!restore) this.restoreStore.clear('series');
    const reopen = (): void => this.showSeries(true);
    host.replaceScreen(() =>
      renderSeriesBrowser(host.container, this.ctx.library()?.series ?? [], deps.storage, this.callbacks<Show>('series', reopen, (show) => this.showDetail(show), restore)),
    );
  }

  /** Shared events for the movie and series browsers: state saving, going back, and unlocking a category via PIN. */
  private callbacks<T>(key: VodKey, reopen: () => void, onSelect: (item: T) => void, restore: boolean): VodBrowserCallbacks<T> {
    return {
      onSelect,
      onBack: () => this.ctx.nav.home(),
      onOpen: (state) => this.restoreStore.set(key, state),
      restore: restore ? this.restoreStore.get(key) : undefined,
      onUnlockRequest: (state) => {
        this.restoreStore.set(key, state);
        this.ctx.pin.requestUnlock('Kilitli kategoriyi açmak için PIN gir.', reopen, reopen);
      },
    };
  }

  private showDetail(show: Show): void {
    const { host, deps } = this.ctx;
    host.replaceScreen(() =>
      renderShowDetail(host.container, show, deps.storage, {
        onPlayEpisode: (episode, seasonIndex, episodeIndex) => this.playEpisode(show, episode, { seasonIndex, episodeIndex }),
        onBack: () => this.showSeries(true),
      }),
    );
  }

  private playMovie(item: MediaItem, backTo: () => void): void {
    const { host, deps } = this.ctx;
    host.clearScreen();
    const player = renderPlayerOverlay(host.container, deps.storage, this.ctx.createPlayerAdapter, {
      onBack: () => this.backFromPlayer(backTo),
      onEnded: () => this.backFromPlayer(backTo),
    });
    host.setPlayer(player);
    void player.controller.playVod(item);
  }

  private playEpisode(show: Show, episode: MediaItem, pos: EpisodePosition): void {
    const { host, deps } = this.ctx;
    host.clearScreen();
    const episodes = new EpisodeNavigator(show);
    const next = episodes.next(pos);
    const prev = episodes.previous(pos);
    const player = renderPlayerOverlay(host.container, deps.storage, this.ctx.createPlayerAdapter, {
      onBack: () => this.backFromPlayer(() => this.showDetail(show)),
      onEnded: () => {
        if (next) this.playEpisode(show, next.episode, next.pos);
        else this.backFromPlayer(() => this.showDetail(show));
      },
      onPrevEpisode: prev ? () => this.playEpisode(show, prev.episode, prev.pos) : undefined,
      onNextEpisode: next ? () => this.playEpisode(show, next.episode, next.pos) : undefined,
    });
    host.setPlayer(player);
    void player.controller.playVod(episode);
  }

  private backFromPlayer(backTo: () => void): void {
    this.ctx.host.clearPlayer(); // also shrinks the window back out of fullscreen (see ScreenHost.clearPlayer)
    backTo();
  }
}
