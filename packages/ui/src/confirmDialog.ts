import type { FocusManager } from './focusManager.ts';
import { isBackKey } from './keys.ts';

/**
 * A simple confirmation dialog: opens a translucent layer over `screen`, temporarily removes
 * the data-focus-id's in the background (so the background can't be navigated while the dialog
 * is open), and moves focus to the dialog buttons. The background becomes navigable again once
 * the dialog closes.
 */
export function showConfirmDialog(
  focusManager: FocusManager,
  screen: HTMLElement,
  message: string,
  onConfirm: () => void,
  /** The id focus returns to when the dialog closes — if omitted, FocusManager jumps to the
   * first DOM element (which could, for example, trigger the wrong tab on a tabbed screen), so
   * it's safer to pass the id of the button that opened the dialog. */
  returnFocusId?: string,
): void {
  const bgEls = Array.from(screen.querySelectorAll<HTMLElement>('[data-focus-id]'));
  const stashed = bgEls.map((el) => [el, el.dataset.focusId as string] as const);
  for (const [el] of stashed) delete el.dataset.focusId;

  const previousPosition = screen.style.position;
  if (!previousPosition) screen.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(5, 6, 10, 0.72)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '10';

  const card = document.createElement('div');
  card.className = 'card';
  card.style.width = '720px';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '32px';
  card.style.padding = '40px';

  const text = document.createElement('div');
  text.textContent = message;
  text.style.fontSize = 'var(--fs-md)';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '16px';
  row.style.justifyContent = 'flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'button';
  cancelBtn.dataset.focusId = 'confirm-cancel';
  cancelBtn.textContent = 'Vazgeç';

  const okBtn = document.createElement('button');
  okBtn.className = 'button';
  okBtn.dataset.focusId = 'confirm-ok';
  okBtn.textContent = 'Onayla';

  /** The back key only closes the dialog (the screen behind it does not also run its "back"): swallowed at the capture phase. */
  const onBackKey = (e: KeyboardEvent): void => {
    if (!overlay.isConnected) {
      document.removeEventListener('keydown', onBackKey, true); // in case the screen was closed some other way
      return;
    }
    if (!isBackKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  document.addEventListener('keydown', onBackKey, true);

  function close(): void {
    document.removeEventListener('keydown', onBackKey, true);
    overlay.remove();
    screen.style.position = previousPosition;
    for (const [el, id] of stashed) el.dataset.focusId = id;
    if (returnFocusId) focusManager.focus(returnFocusId);
    else focusManager.refresh();
  }

  cancelBtn.addEventListener('click', close);
  okBtn.addEventListener('click', () => {
    close();
    onConfirm();
  });

  row.append(cancelBtn, okBtn);
  card.append(text, row);
  overlay.append(card);
  screen.append(overlay);

  // Default focus is on Cancel to prevent accidental confirmation of destructive actions (delete, etc.).
  focusManager.focus('confirm-cancel');
}
