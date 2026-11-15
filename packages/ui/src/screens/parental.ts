/**
 * Parental lock screens: the PIN keypad and PIN steps (`./parental/pinPad`, `pinScreens`), the Parental Lock page
 * (`parentalSettingsPage`), and the Specific categories list (`parentalCategoriesPage`). This file collects the public API.
 */
import type { SettingsStore } from '../../../core/src/storage.ts';
import type { FocusManager } from '../focusManager.ts';
import { ParentalCategoriesPage } from './parental/parentalCategoriesPage.ts';
import type { ParentalCallbacks } from './parental/parentalCallbacks.ts';
import { ParentalSettingsPage } from './parental/parentalSettingsPage.ts';

export { createPinPad, type PinPad } from './parental/pinPad.ts';
export { renderPinScreen, renderPinStep, type PinStepOptions } from './parental/pinScreens.ts';
export type { ParentalCallbacks } from './parental/parentalCallbacks.ts';

export function renderParentalSettings(container: HTMLElement, storage: SettingsStore, cb: ParentalCallbacks): FocusManager {
  return new ParentalSettingsPage(storage, cb).render(container);
}

export function renderParentalCategories(container: HTMLElement, storage: SettingsStore, cb: ParentalCallbacks): FocusManager {
  return new ParentalCategoriesPage(storage, cb).render(container);
}
