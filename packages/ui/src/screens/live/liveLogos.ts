import { sharedImageFailures, type UrlFailureCache } from '../../imageFailures.ts';

/** Channel logos: this many load right away, the rest load as the list is scrolled down. */
export const LOGO_INITIAL_COUNT = 30;
/** How many rows ahead of the last visible row logos get prepared. */
const LOGO_LOOKAHEAD_ROWS = 5;
const CHANNEL_ROW_PITCH = 86; // 78px row + 8px gap

interface LogoSlot {
  box: HTMLElement;
  initials: HTMLElement;
  url: string;
  index: number;
  started: boolean;
}

export interface LogoLoader {
  /** When a new list is rendered: resets the records of prior rows and the target. */
  reset(): void;
  /** Registers a row's logo (ignored if there's no URL or it previously failed to load). */
  add(box: HTMLElement, initials: HTMLElement, url: string | undefined, index: number): void;
  /** Starts not-yet-started logos with index < count. */
  loadUpTo(count: number): void;
  /** On scroll or focus change, loads a bit ahead of the last visible row. */
  loadMoreIfNeeded(): void;
  /** Drops pending loads (when the screen is being torn down). */
  cancel(): void;
}

/**
 * Channel logos: staged loading. In a list with thousands of channels, requesting all logos at
 * once caused stuttering on a weak connection (and on TV): the first LOGO_INITIAL_COUNT rows load
 * immediately; the rest are requested as the user scrolls down, up to LOGO_LOOKAHEAD_ROWS rows
 * past the last visible row. Logos that fail to load are recorded in the failure cache
 * (UrlFailureCache) and never requested again.
 */
export class ChannelLogoLoader implements LogoLoader {
  private readonly listEl: HTMLElement;
  /** Logo URLs that failed to load: not requested again even if the screen is re-rendered. */
  private readonly failures: UrlFailureCache;
  private slots: LogoSlot[] = [];
  private target = 0;

  constructor(listEl: HTMLElement, failures: UrlFailureCache = sharedImageFailures) {
    this.listEl = listEl;
    this.failures = failures;
    listEl.addEventListener('scroll', () => this.loadMoreIfNeeded());
  }

  reset(): void {
    this.target = 0;
    this.slots = [];
  }

  add(box: HTMLElement, initials: HTMLElement, url: string | undefined, index: number): void {
    if (url && !this.failures.has(url)) this.slots.push({ box, initials, url, index, started: false });
  }

  loadUpTo(count: number): void {
    this.target = Math.max(this.target, count);
    for (const slot of this.slots) {
      if (!slot.started && slot.index < this.target) this.start(slot);
    }
  }

  loadMoreIfNeeded(): void {
    const lastVisible = Math.ceil((this.listEl.scrollTop + this.listEl.clientHeight) / CHANNEL_ROW_PITCH);
    const wanted = lastVisible + LOGO_LOOKAHEAD_ROWS;
    if (wanted > this.target) this.loadUpTo(wanted);
  }

  cancel(): void {
    this.target = 0;
  }

  private start(slot: LogoSlot): void {
    slot.started = true;
    if (this.failures.has(slot.url)) return;
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    // Some hosts (e.g. imgur) return 403 based on the Referer header; not sending one fixes most of them.
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      this.failures.add(slot.url);
      img.remove();
    });
    img.addEventListener('load', () => {
      slot.initials.remove();
      slot.box.classList.add('has-logo');
    });
    img.src = slot.url;
    slot.box.append(img);
  }
}
