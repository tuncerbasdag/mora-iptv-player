import { renderPinScreen } from '../screens/parental.ts';
import type { ParentalSession } from './parentalSession.ts';
import type { ScreenHost } from './screenHost.ts';

/** Fullscreen PIN prompt and the "unlock locked content for this session" flow. */
export class PinPrompt {
  private readonly host: ScreenHost;
  private readonly parental: ParentalSession;

  constructor(host: ScreenHost, parental: ParentalSession) {
    this.host = host;
    this.parental = parental;
  }

  /** Fullscreen PIN prompt; calls `onOk` if correct, `onCancel` on Cancel/Back. */
  ask(title: string, subtitle: string, onOk: () => void, onCancel: () => void): void {
    this.host.replaceScreen(() =>
      renderPinScreen(this.host.container, { title, subtitle, verify: (pin) => this.parental.verifyPinMessage(pin), onSuccess: onOk, onCancel }),
    );
  }

  /** Prompts for a PIN to unlock locked content for this session; calls `onUnlocked` if correct, `onCancel` if cancelled. */
  requestUnlock(subtitle: string, onUnlocked: () => void, onCancel: () => void): void {
    this.ask(
      'PIN gir',
      subtitle,
      () => {
        this.parental.unlock();
        onUnlocked();
      },
      onCancel,
    );
  }
}
