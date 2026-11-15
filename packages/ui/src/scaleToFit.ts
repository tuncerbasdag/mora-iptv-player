const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

/**
 * Scales and centers the fixed 1920x1080 "stage" (usually `#app`) to the window/screen size while
 * preserving aspect ratio. Real Tizen TV output is already exactly 1920x1080, so the scale there
 * usually stays at 1; on desktop browsers, no matter the window size (small, large, a different aspect
 * ratio), the whole app — including the top headers — always stays visible without being cropped.
 * The `stage`'s own CSS (the `#app` rule in `styles.css`) sets up the centering via
 * `position:fixed; top/left:50%`; here only `transform: translate(-50%,-50%) scale(s)` is applied.
 */
export function applyScaleToFit(stage: HTMLElement): () => void {
  function resize(): void {
    // Skip while a text field is focused: on Tizen, opening the on-screen keyboard shrinks
    // `window.innerHeight` to the area above it, and without this guard the whole stage would
    // rescale down to "fit" that shrunk area — visually splitting the screen in two. A TV app's
    // window is never legitimately resized while the user is mid-typing, so it's safe to just
    // keep the current scale and let the keyboard overlay the app instead.
    if ((document.activeElement as HTMLElement | null)?.tagName === 'INPUT') return;
    const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  resize();
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
}
