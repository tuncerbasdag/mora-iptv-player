import { applyParental, PinAttempts } from '../../../core/src/parental.ts';
import type { Library, ParentalSettings } from '../../../core/src/types.ts';

export type ParentalState = 'off' | 'locked' | 'open';
/** The type of change made on the parental lock settings screen. */
export type ParentalChange = 'enabled' | 'disabled' | 'rules';

/**
 * Parental lock SESSION (not the persistent settings, but state specific to this run): whether locked content
 * was unlocked in this session, whether the PIN was entered during this Settings visit, and failed PIN attempts.
 * Knows nothing about the DOM; reads settings via the provided function.
 */
export class ParentalSession {
  /** PIN was entered in this session: locked content is visible. */
  private unlocked = false;
  /** PIN was entered during this Settings visit; reset on returning to Home. Independent of the content lock (`unlocked`). */
  private settingsOk = false;

  private readonly settings: () => ParentalSettings;
  private readonly attempts: PinAttempts;

  constructor(settings: () => ParentalSettings, attempts: PinAttempts = new PinAttempts()) {
    this.settings = settings;
    this.attempts = attempts;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  unlock(): void {
    this.unlocked = true;
  }

  /** Manually re-lock. */
  relock(): void {
    this.unlocked = false;
  }

  /** The state of the lock button on the home screen: lock off / locked / unlocked in this session. */
  state(): ParentalState {
    return this.settings().enabled ? (this.unlocked ? 'open' : 'locked') : 'off';
  }

  /** A view of the library with locked categories removed until the PIN is entered; all screens are fed from here. */
  filter(library: Library | null): Library | null {
    return library ? applyParental(library, this.settings(), this.unlocked) : null;
  }

  /** An error message, or null if accepted. Input is locked out for a period after repeated wrong attempts. */
  verifyPinMessage(pin: string): string | null {
    const wait = (): string => `Çok fazla yanlış deneme. ${Math.ceil(Math.max(this.attempts.remainingMs(), 1) / 1000)} sn sonra tekrar dene.`;
    if (this.attempts.remainingMs() > 0) return wait();
    if (this.attempts.attempt(this.settings(), pin)) return null;
    return this.attempts.remainingMs() > 0 ? wait() : 'Yanlış PIN. Tekrar dene.';
  }

  /**
   * Does this Settings page require a PIN? While the lock is enabled, the Parental Lock pages always require it;
   * other pages require it only if "Settings" is locked. Once entered during a visit, it isn't asked again.
   */
  requiresSettingsPin(isParentalPage: boolean): boolean {
    const p = this.settings();
    return p.enabled && !this.settingsOk && (isParentalPage || p.lockSettings);
  }

  grantSettingsAccess(): void {
    this.settingsOk = true;
  }

  /** On returning to Home: the PIN will be requested again for Settings. */
  resetSettingsAccess(): void {
    this.settingsOk = false;
  }

  /**
   * Parental lock settings changed: the session is re-locked when the lock is re-enabled or the rules change;
   * disabling it removes the restriction anyway. If it was just enabled without a PIN, the PIN isn't asked again
   * during the same visit.
   */
  onSettingsChanged(change: ParentalChange): void {
    if (change !== 'disabled') this.unlocked = false;
    if (change === 'enabled') this.settingsOk = true;
  }
}
