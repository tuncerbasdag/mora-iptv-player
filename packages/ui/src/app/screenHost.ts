import { exitFullscreen } from '../mouseSupport.ts';
import type { PlayerOverlayHandle } from '../screens/playerOverlay.ts';

/** A screen: anything that releases its listeners/timers when closed (e.g. FocusManager). */
export interface Screen {
  destroy(): void;
}

/**
 * Screen lifecycle: keeps at most one screen and one fullscreen player open at a time. The previous screen must be
 * closed BEFORE the new one is set up (e.g. order matters when the Live TV preview's player is handed off to
 * fullscreen), so screens are set up via `replaceScreen(factory)`: the old one closes first, then the factory is called.
 */
export class ScreenHost {
  private screen: Screen | null = null;
  private player: PlayerOverlayHandle | null = null;

  readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Closes the open screen AND any open fullscreen player (the class invariant: at most one of each —
   * a plain screen-to-screen navigation, e.g. Live TV straight to Series, must not leave a fullscreen
   * player it never passed through `onBack`/`releasePlayer()` running in the background), sets up a new
   * screen with `create`, and stores it. */
  replaceScreen(create: () => Screen): void {
    this.clearPlayer();
    this.clearScreen();
    this.screen = create();
  }

  /** Stores the open fullscreen player, closing whatever player was already open (the class invariant:
   * at most one). Callers that hand a player off elsewhere must `releasePlayer()` first — that clears
   * the slot without destroying it, so this is a no-op for them; it only fires for a caller that forgot
   * to close the previous player, which otherwise leaks it (stream, audio, and all) running in the background. */
  setPlayer(player: PlayerOverlayHandle): void {
    if (this.player && this.player !== player) this.player.destroy();
    this.player = player;
  }

  getPlayer(): PlayerOverlayHandle | null {
    return this.player;
  }

  /** Releases the player without closing it (when handing ownership elsewhere: the caller does `destroy({ keepAdapterAlive })`). */
  releasePlayer(): PlayerOverlayHandle | null {
    const player = this.player;
    this.player = null;
    return player;
  }

  clearScreen(): void {
    this.screen?.destroy();
    this.screen = null;
  }

  /** Closes the player with nothing taking its place — unlike `setPlayer`'s swap, this also shrinks the
   * window back out of fullscreen (fullscreen is a player thing; it shouldn't carry over to browsing). */
  clearPlayer(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
      exitFullscreen();
    }
  }

  /** Closes everything (when the app is shutting down). */
  destroy(): void {
    this.clearPlayer();
    this.clearScreen();
  }
}
