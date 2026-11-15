/**
 * Decorative shapes over the poster placeholder (shown when there's no cover image, or until it loads):
 * two semi-transparent shapes, one of 4 patterns. The pattern cycles in order (circle+circle,
 * diagonal-stripe+square, circle+bottom-band, circle+circle). Covered up once the image loads.
 * The 4th (dark-colored) poster uses light decoration colors. Colors are theme variables
 * (`--poster-deco-*`, see styles.css).
 */
export function addPosterDeco(poster: HTMLElement, index: number): void {
  const pattern = index % 4;
  poster.classList.add(`pat-${pattern}`);
  if (pattern === 3) poster.classList.add('dark');
  for (const n of ['s1', 's2']) {
    const s = document.createElement('span');
    s.className = `vod-deco ${n}`;
    poster.append(s);
  }
}
