import type { FocusManager } from '../../focusManager.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, settingsButton, spacer, type SettingsPage } from '../settingsShell.ts';
import { createPinPad, type PinPad } from './pinPad.ts';

export interface PinStepOptions {
  title: string;
  subtitle: string;
  /** Shown if it returns an error message and the input is cleared; accepted if it returns null. */
  verify: (pin: string) => string | null;
  onSuccess: (pin: string) => void;
  onCancel: () => void;
  /** If provided, shown in the error row as soon as the page opens (e.g. a PIN that didn't match in the previous step). */
  initialMessage?: string;
}

/**
 * Grid navigation: Left/Right move to the neighbor in the same row, Up/Down move to the SAME column in the
 * adjacent row (the middle column when leaving/entering a single-item row — Cancel). `verticalChain` is for form
 * rows and selects the first item of the row.
 */
function gridChain(rows: string[][]): NonNullable<Parameters<typeof createSettingsFocus>[1]['candidateFilter']> {
  return (current, candidate, direction) => {
    const from = current.dataset.focusId ?? '';
    const to = candidate.dataset.focusId ?? '';
    const r = rows.findIndex((row) => row.includes(from));
    if (r < 0) return true;
    const c = rows[r].indexOf(from);
    if (direction === 'left' || direction === 'right') return to === rows[r][c + (direction === 'left' ? -1 : 1)];
    const next = rows[r + (direction === 'down' ? 1 : -1)];
    if (!next) return false;
    const col = rows[r].length === 1 || next.length === 1 ? Math.floor(next.length / 2) : c;
    return to === next[Math.min(col, next.length - 1)];
  };
}

/** Focus manager for the keypad + Cancel: grid navigation, Back = cancel, default focus on the 5 key. */
function wirePad(screen: HTMLElement, pad: PinPad, opts: PinStepOptions, cancelId: string): FocusManager {
  const fm = createSettingsFocus(screen, {
    onBack: opts.onCancel,
    candidateFilter: gridChain([['pin-1', 'pin-2', 'pin-3'], ['pin-4', 'pin-5', 'pin-6'], ['pin-7', 'pin-8', 'pin-9'], ['pin-del', 'pin-0', 'pin-ok'], [cancelId]]),
  });
  fm.onDestroy(() => pad.destroy());
  fm.focus('pin-5');
  return fm;
}

/** Keypad: shows an error or reports success depending on the verification result. */
function createVerifyingPad(opts: PinStepOptions): PinPad {
  const pad: PinPad = createPinPad((pin) => {
    const err = opts.verify(pin);
    if (err) pad.showError(err);
    else opts.onSuccess(pin);
  });
  return pad;
}

/** PIN step within the settings shell (Change PIN 1/2 and 2/2). The menu is shared, Cancel is on the bottom row. */
export function renderPinStep(container: HTMLElement, page: SettingsPage, opts: PinStepOptions, onNavigate: (page: SettingsPage) => void, onHome: () => void): FocusManager {
  const { screen, panel } = buildSettingsShell(container, page, opts.title, opts.subtitle, onNavigate, onHome);
  const pad = createVerifyingPad(opts);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;justify-content:center;margin-top:8px';
  wrap.append(pad.el);
  panel.append(wrap, spacer(), buttonRow(settingsButton('cancel-btn', 'Vazgeç', 'secondary', opts.onCancel)));
  if (opts.initialMessage) pad.showError(opts.initialMessage);
  return wirePad(screen, pad, opts, 'cancel-btn');
}

/**
 * PIN prompt outside Settings (entering locked Settings, opening locked content): a standalone fullscreen card.
 * Back/Cancel calls `onCancel`.
 */
export function renderPinScreen(container: HTMLElement, opts: PinStepOptions): FocusManager {
  container.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'screen pin-screen';
  const card = document.createElement('div');
  card.className = 'pin-card';
  const title = document.createElement('div');
  title.className = 'settings-title';
  title.textContent = opts.title;
  const sub = document.createElement('div');
  sub.className = 'settings-subtitle';
  sub.style.cssText = 'margin:6px 0 28px;text-align:center;max-width:760px';
  sub.textContent = opts.subtitle;
  const pad = createVerifyingPad(opts);
  const cancel = settingsButton('cancel-btn', 'Vazgeç', 'secondary', opts.onCancel);
  cancel.style.marginTop = '28px';
  card.append(title, sub, pad.el, cancel);
  screen.append(card);
  container.append(screen);
  return wirePad(screen, pad, opts, 'cancel-btn');
}
