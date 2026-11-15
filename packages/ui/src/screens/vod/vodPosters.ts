import { sharedImageFailures, type UrlFailureCache } from '../../imageFailures.ts';
import { attachPosterImage, hasImageFailed } from '../../posterImage.ts';

export interface PosterLoader {
  /** Loads the poster once it becomes visible (immediately if there's no IntersectionObserver). Skipped if there's no URL or it failed to load before. */
  readonly lazyImage: (poster: HTMLElement, url?: string) => void;
  /** Drops pending items and observers while content is being redrawn. */
  reset(): void;
  destroy(): void;
}

/** Poster loading (visible ones only): posters up to a bit past the scroll viewport are requested. */
export class LazyPosterLoader implements PosterLoader {
  private readonly scroller: HTMLElement;
  private readonly failures: UrlFailureCache;
  private observer: IntersectionObserver | null = null;
  private readonly pending = new Map<Element, string>();

  constructor(scroller: HTMLElement, failures: UrlFailureCache = sharedImageFailures) {
    this.scroller = scroller;
    this.failures = failures;
  }

  /** Arrow-function field so it can be passed as a callback (keeps `this` bound). */
  readonly lazyImage = (poster: HTMLElement, url?: string): void => {
    if (!url || hasImageFailed(url, this.failures)) return;
    this.ensureObserver();
    if (!this.observer) {
      attachPosterImage(poster, url, 'start', this.failures);
      return;
    }
    this.pending.set(poster, url);
    this.observer.observe(poster);
  };

  reset(): void {
    this.pending.clear();
    this.observer?.disconnect();
  }

  destroy(): void {
    this.observer?.disconnect();
  }

  private ensureObserver(): void {
    if (this.observer || typeof IntersectionObserver === 'undefined') return;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const url = this.pending.get(e.target);
          this.pending.delete(e.target);
          this.observer?.unobserve(e.target);
          if (url) attachPosterImage(e.target as HTMLElement, url, 'start', this.failures);
        }
      },
      { root: this.scroller, rootMargin: '400px 0px' },
    );
  }
}
