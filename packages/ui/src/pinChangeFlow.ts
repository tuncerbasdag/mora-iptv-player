import { withNewPin } from '../../core/src/parental.ts';
import { updateSettings, type SettingsStore } from '../../core/src/storage.ts';
import type { FocusManager } from './focusManager.ts';
import { renderPinStep, type PinStepOptions } from './screens/parental.ts';
import type { SettingsPage } from './screens/settingsShell.ts';

export type PinChangePage = 'parental-pin-current' | 'parental-pin-new' | 'parental-pin-confirm';

export function isPinChangePage(page: SettingsPage): page is PinChangePage {
  return page === 'parental-pin-current' || page === 'parental-pin-new' || page === 'parental-pin-confirm';
}

export interface PinChangeDeps {
  container: HTMLElement;
  storage: SettingsStore;
  /** Error message, or null if accepted. */
  verifyCurrentPin: (pin: string) => string | null;
  navigate: (page: SettingsPage) => void;
  onHome: () => void;
}

/**
 * PIN change wizard (3 steps: current → new → confirm). Intermediate state (the first-entered new
 * PIN, the mismatch flag) is held only in memory, on this object; it is not persisted.
 */
export class PinChangeFlow {
  private readonly deps: PinChangeDeps;
  /** The first-entered new PIN, compared against during the confirm step. */
  private pendingPin: string | null = null;
  /** If the confirmation didn't match, the new-PIN step reopens with an error message. */
  private mismatch = false;

  constructor(deps: PinChangeDeps) {
    this.deps = deps;
  }

  render(page: PinChangePage): FocusManager {
    const d = this.deps;
    const step = (title: string, subtitle: string, rest: Omit<PinStepOptions, 'title' | 'subtitle'>): FocusManager =>
      renderPinStep(d.container, page, { title, subtitle, ...rest }, d.navigate, d.onHome);

    switch (page) {
      case 'parental-pin-current':
        return step("PIN'i Değiştir", "Adım 1/3 · Mevcut PIN'ini gir. Hiç değiştirmediysen varsayılan PIN 0 0 0 0'dır.", {
          verify: d.verifyCurrentPin,
          onSuccess: () => d.navigate('parental-pin-new'),
          onCancel: () => d.navigate('parental'),
        });
      case 'parental-pin-new':
        return step('Yeni PIN Belirle', "Adım 2/3 · Yeni 4 haneli PIN'ini gir. 0000 veya 1234 gibi kolay PIN'lerden kaçın.", {
          initialMessage: this.mismatch ? "PIN'ler eşleşmedi. Yeni PIN'i baştan gir." : undefined,
          verify: () => null,
          onSuccess: (pin) => {
            this.pendingPin = pin;
            this.mismatch = false;
            d.navigate('parental-pin-confirm');
          },
          onCancel: () => this.cancel(),
        });
      case 'parental-pin-confirm':
        // The new PIN is asked for twice so a typo doesn't become permanent (old PIN once, new PIN twice).
        return step("Yeni PIN'i Onayla", "Adım 3/3 · Yeni PIN'ini bir kez daha gir.", {
          verify: () => null,
          onSuccess: (pin) => this.confirm(pin),
          onCancel: () => this.cancel(),
        });
    }
  }

  private confirm(pin: string): void {
    if (pin !== this.pendingPin) {
      // Mismatch: there may have been a typo on the first entry; go back to the new PIN step with an error message.
      this.pendingPin = null;
      this.mismatch = true;
      this.deps.navigate('parental-pin-new');
      return;
    }
    updateSettings(this.deps.storage, (s) => ({ parental: withNewPin(s.parental, pin) }));
    this.pendingPin = null;
    this.deps.navigate('parental');
  }

  private cancel(): void {
    this.pendingPin = null;
    this.mismatch = false;
    this.deps.navigate('parental');
  }
}
