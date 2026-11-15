import { sharedImageFailures, type UrlFailureCache } from './imageFailures.ts';

export function hasImageFailed(url: string, failures: UrlFailureCache = sharedImageFailures): boolean {
  return failures.has(url);
}

/**
 * Appends the poster/thumbnail image into `parent`. If it fails to load, it removes itself and
 * remembers the URL. `at: 'start'` places the image at the bottom (so badges/progress bar on top
 * stay visible), 'end' appends it last.
 */
export function attachPosterImage(parent: HTMLElement, url: string, at: 'start' | 'end' = 'start', failures: UrlFailureCache = sharedImageFailures): void {
  if (failures.has(url)) return;
  const img = document.createElement('img');
  img.className = 'vod-img';
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  img.onerror = () => {
    failures.add(url);
    img.remove();
  };
  img.src = url;
  if (at === 'start') parent.insertBefore(img, parent.firstChild);
  else parent.append(img);
}
