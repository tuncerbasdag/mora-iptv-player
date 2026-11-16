/**
 * Mouse support (Back buttons, reveal-on-mouse-move bars). Enabled by the web entry point only (browser + Electron desktop);
 * Tizen (remote control) never enables it, so none of the mouse UI is created there.
 */
let enabled = false;

export function enableMouseSupport(): void {
  enabled = true;
}

export function hasMouseSupport(): boolean {
  return enabled;
}

/** Electron desktop shell only (preload exposes window.moraDesktop). */
export function isDesktopApp(): boolean {
  return !!(window as unknown as { moraDesktop?: unknown }).moraDesktop;
}


/** "<" chevron icon for the mouse Back buttons (inherits the text color). */
export function backChevronSvg(size = 24): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 5l-7 7 7 7"/></svg>`;
}

/** Electron/macOS: shows or hides the window's close/minimize/zoom buttons (no-op elsewhere). */
export function setWindowControlsVisible(visible: boolean): void {
  (window as unknown as { moraDesktop?: { setWindowControlsVisible?: (v: boolean) => void } }).moraDesktop?.setWindowControlsVisible?.(visible);
}

/** Corner-brackets AT the four corners, opening inward ("enter fullscreen") for the mouse fullscreen button. */
export function fullscreenEnterIconSvg(size = 24): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5"/><path d="M21 8V3h-5"/><path d="M3 16v5h5"/><path d="M16 21h5v-5"/></svg>`;
}

/** Corner-brackets pulled in from the four corners, opening toward them ("exit fullscreen") for the mouse fullscreen button. */
export function fullscreenExitIconSvg(size = 24): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v5H3"/><path d="M21 8h-5V3"/><path d="M3 16h5v5"/><path d="M16 21v-5h5"/></svg>`;
}

/** Toggles fullscreen: the Electron window on desktop, the Fullscreen API elsewhere (plain browser). */
export function toggleFullscreen(): void {
  const desktop = (window as unknown as { moraDesktop?: { toggleFullscreen?: () => void } }).moraDesktop;
  if (desktop?.toggleFullscreen) {
    desktop.toggleFullscreen();
    return;
  }
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

/** Leaving playback (Back, or VOD ending with nothing next) should also shrink the window back down —
 * fullscreen is a player thing, it shouldn't carry over to Live TV/Movies/Series browsing. No-op if not fullscreen. */
export function exitFullscreen(): void {
  if (typeof window === 'undefined') return; // ScreenHost.clearPlayer() also runs under plain node:test, with no DOM
  const desktop = (window as unknown as { moraDesktop?: { setFullscreen?: (v: boolean) => void } }).moraDesktop;
  if (desktop?.setFullscreen) {
    desktop.setFullscreen(false);
    return;
  }
  if (document.fullscreenElement) void document.exitFullscreen();
}

/** Calls back on every fullscreen change (desktop window or browser Fullscreen API); returns an unsubscribe. */
export function onFullscreenChange(cb: (fullscreen: boolean) => void): () => void {
  const desktop = (window as unknown as { moraDesktop?: { onFullscreenChange?: (cb: (v: boolean) => void) => () => void } }).moraDesktop;
  if (desktop?.onFullscreenChange) return desktop.onFullscreenChange(cb);
  const handler = (): void => cb(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}

/**
 * Round "<" Back button shown to the left of a screen title when mouse support is on (desktop + browser; never on Tizen).
 * Not focusable: remote/keyboard users go back with Back/Esc. Returns null when mouse support is off.
 */
export function createMouseBackButton(onBack: () => void): HTMLButtonElement | null {
  if (!hasMouseSupport()) return null;
  const back = document.createElement('button');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back');
  back.innerHTML = backChevronSvg(24);
  Object.assign(back.style, {
    width: '44px', height: '44px', flex: 'none', marginRight: '14px', borderRadius: '50%', cursor: 'pointer',
    border: '1.5px solid var(--border)', background: 'transparent', color: 'inherit', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', top: '-3px', // capital letters sit above the line box's centre: lift the circle to the text's optical centre
  });
  back.addEventListener('click', (e) => {
    e.stopPropagation();
    onBack();
  });
  return back;
}
