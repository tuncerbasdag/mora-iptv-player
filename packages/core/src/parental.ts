import { hash } from './hash.ts';
import { genresOf } from './library.ts';
import type { Category, Library, MediaItem, ParentalSettings, Show } from './types.ts';

export const DEFAULT_PIN = '0000';
export const PIN_LENGTH = 4;
/** After this many consecutive wrong attempts, PIN entry is locked out for `LOCKOUT_MS`. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

export const DEFAULT_PARENTAL: ParentalSettings = {
  enabled: false,
  pinSalt: '',
  pinHash: null,
  lockAdult: true,
  lockSettings: false,
  lockedCategories: [],
};

/** Salted, iterated hash. Since a 4-digit PIN only has 10,000 possibilities, the goal is to avoid storing plaintext, not unbreakability. */
export function hashPin(pin: string, salt: string): string {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < 2000; i++) h = hash(`${salt}|${h}|${i}`);
  return h;
}

/** If no PIN has been set, the default PIN (0000) is valid. */
export function verifyPin(p: ParentalSettings, pin: string): boolean {
  if (p.pinHash === null) return pin === DEFAULT_PIN;
  return hashPin(pin, p.pinSalt) === p.pinHash;
}

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length === PIN_LENGTH;
}

export function withNewPin(p: ParentalSettings, pin: string, salt = Math.random().toString(36).slice(2)): ParentalSettings {
  return { ...p, pinSalt: salt, pinHash: hashPin(pin, salt) };
}

const ADULT = /(\bxxx\b|\badults?\b|\+\s?18|\b18\s?\+|\bporn\w*|\berotic\w*|\berotik\w*|\by[eé]tişkin|\byetiskin|\bsex\b|\bsexy\b)/i;

/** Whether the category name signals adult content ("XXX", "Adult", "+18", localized equivalents, ...). */
export function isAdultCategory(name: string): boolean {
  return ADULT.test(name);
}

export function isCategoryLocked(p: ParentalSettings, name: string): boolean {
  if (!p.enabled) return false;
  if (p.lockedCategories.includes(name)) return true;
  return p.lockAdult && isAdultCategory(name);
}

const groupLocked = (p: ParentalSettings, group: string): boolean => genresOf(group).some((g) => isCategoryLocked(p, g)) || isCategoryLocked(p, group);

/**
 * When the lock is enabled and the PIN hasn't been entered this session, locked categories remain
 * in the list with `locked: true` and empty content (shown with a lock icon, PIN is requested);
 * locked-type content that also appears under another category is removed too. Derived views like
 * search, favorites, and recently watched are fed from this filtered library, so they never leak
 * locked content.
 * Returns the same object unchanged if the lock is not enabled.
 */
export function applyParental(lib: Library, p: ParentalSettings, unlocked: boolean): Library {
  if (!p.enabled || unlocked) return lib;
  const cleanItems = (cats: Category<MediaItem>[]): Category<MediaItem>[] =>
    cats
      .map((c): Category<MediaItem> => (isCategoryLocked(p, c.name) ? { name: c.name, items: [], locked: true } : { ...c, items: c.items.filter((i) => !groupLocked(p, i.group)) }))
      .filter((c) => c.locked || c.items.length > 0);
  const showLocked = (s: Show): boolean => s.seasons.some((se) => se.episodes.some((e) => groupLocked(p, e.group)));
  const live = cleanItems(lib.live);
  const movies = cleanItems(lib.movies);
  const series = lib.series
    .map((c): Category<Show> => (isCategoryLocked(p, c.name) ? { name: c.name, items: [], locked: true } : { ...c, items: c.items.filter((s) => !showLocked(s)) }))
    .filter((c) => c.locked || c.items.length > 0);
  const sum = <T>(cats: Category<T>[]): number => cats.reduce((a, c) => a + c.items.length, 0);
  const episodes = series.reduce((a, c) => a + c.items.reduce((b, s) => b + s.seasons.reduce((n, se) => n + se.episodes.length, 0), 0), 0);
  return { live, movies, series, counts: { live: sum(live), movies: sum(movies), series: sum(series), episodes } };
}

/** Counts wrong PIN attempts; rejects entry for `LOCKOUT_MS` after `MAX_ATTEMPTS` consecutive failures. */
export class PinAttempts {
  private failures = 0;
  private lockedUntil = 0;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** Remaining time (ms) if locked out, otherwise 0. */
  remainingMs(): number {
    return Math.max(0, this.lockedUntil - this.now());
  }

  /** True if `pin` is correct; always false while locked out (even a correct PIN is not accepted). */
  attempt(p: ParentalSettings, pin: string): boolean {
    if (this.remainingMs() > 0) return false;
    if (verifyPin(p, pin)) {
      this.failures = 0;
      return true;
    }
    this.failures++;
    if (this.failures >= MAX_ATTEMPTS) {
      this.failures = 0;
      this.lockedUntil = this.now() + LOCKOUT_MS;
    }
    return false;
  }
}
