import type { TextField } from '../settingsShell.ts';

const ALERT_ICON =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/></svg>';

/** Shows/hides the error line under the field and colors the box with the error color. */
export function setFieldError(field: TextField, message: string | null): void {
  const box = field.wrap.querySelector('.field') as HTMLElement;
  box.classList.toggle('error', !!message);
  let err = field.wrap.querySelector('.field-error') as HTMLElement | null;
  if (!message) {
    err?.remove();
    return;
  }
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    field.wrap.append(err);
  }
  err.innerHTML = ALERT_ICON;
  err.append(document.createTextNode(message));
}
