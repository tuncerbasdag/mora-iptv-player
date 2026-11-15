import type { MediaItem } from '../../../core/src/types.ts';
import { exitFullscreen } from '../mouseSupport.ts';
import type { PlayerAdapter } from '../playerAdapter.ts';
import { liveCategoryItems, renderLiveScreen, type LiveScreenResume } from '../screens/liveScreen.ts';
import { renderPlayerOverlay } from '../screens/playerOverlay.ts';
import type { AppContext } from './appContext.ts';

/** Live TV: channel list/preview screen and the fullscreen live player (the player is handed off between the two without reloading). */
export class LiveController {
  /**
   * Carries the category the user came from, from `playFullscreen` to `backFromFullscreen` — not the channel's own
   * "real" category, but the category the user is currently LOOKING AT, such as Favorites (see LiveScreenResume.categoryId).
   */
  private returnCategoryId: string | null = null;

  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  show(resume?: LiveScreenResume, startCategoryId?: string): void {
    const { host, deps, nav, pin } = this.ctx;
    host.replaceScreen(() =>
      renderLiveScreen(
        host.container,
        this.ctx.library()?.live ?? [],
        deps.storage,
        deps.epgService,
        this.ctx.createPlayerAdapter,
        {
          onBack: () => nav.home(),
          onFullscreen: (item, adapter, categoryId) => this.playFullscreen(item, adapter, categoryId),
          connectivity: deps.connectivity,
          onUnlockRequest: (categoryId) => pin.requestUnlock('Kilitli kategoriyi açmak için PIN gir.', () => nav.live(undefined, categoryId), () => nav.live()),
        },
        resume,
        startCategoryId,
      ),
    );
  }

  /**
   * If `existingAdapter` is given (when switching from the Live TV preview to fullscreen), the stream is not
   * reloaded — the already-playing adapter is handed over here (see LiveScreenCallbacks.onFullscreen). `categoryId`
   * is the category the user is currently looking at (e.g. Favorites) — it is carried through to `backFromFullscreen`
   * so the correct category can be focused on return.
   */
  private playFullscreen(item: MediaItem, existingAdapter: PlayerAdapter | undefined, categoryId: string): void {
    const { host, deps } = this.ctx;
    host.clearScreen();
    this.returnCategoryId = categoryId;
    const player = renderPlayerOverlay(
      host.container,
      deps.storage,
      this.ctx.createPlayerAdapter,
      { onBack: () => this.backFromFullscreen(item), onChannelStep: (direction) => this.stepChannel(direction) },
      existingAdapter,
      deps.connectivity,
    );
    host.setPlayer(player);
    if (existingAdapter) player.controller.resumeLive(item);
    else void player.controller.playLive(item);
  }

  /**
   * Up/Down in fullscreen: the next/previous channel within the category the user is looking at (including
   * Favorites); wraps around at the ends. Returns null (no change) if the category has only one channel.
   */
  private stepChannel(direction: 1 | -1): MediaItem | null {
    const current = this.ctx.host.getPlayer()?.controller.getCurrentItem();
    const categories = this.ctx.library()?.live ?? [];
    if (!current || !this.returnCategoryId) return null;
    const items = liveCategoryItems(categories, this.ctx.deps.storage, this.returnCategoryId);
    if (items.length < 2) return null;
    const i = items.findIndex((it) => it.id === current.id);
    return items[i < 0 ? 0 : (i + direction + items.length) % items.length];
  }

  /**
   * Return from fullscreen to Live TV: the adapter is handed over to the Live TV screen's preview box without
   * being stopped/destroyed (keepAdapterAlive) — the other end of the handoff chain that fixes the "reloads on
   * going back" complaint (in both directions).
   */
  private backFromFullscreen(item: MediaItem): void {
    exitFullscreen(); // leaving the fullscreen player: the window shrinks back down, independent of the stream handoff below
    const player = this.ctx.host.releasePlayer();
    if (!player) {
      this.show();
      return;
    }
    const adapter = player.controller.getAdapter();
    const categoryId = this.returnCategoryId;
    // The channel may have been changed in fullscreen: return to Live TV with whatever channel is currently playing.
    const playing = player.controller.getCurrentItem() ?? item;
    player.destroy({ keepAdapterAlive: true });
    if (categoryId) this.show({ item: playing, adapter, categoryId });
    else this.show();
  }
}
