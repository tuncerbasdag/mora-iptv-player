export interface Marquee {
  /** Starts the marquee if the focused row's (data-focus-id) name doesn't fit; stops the previous one. */
  update(focusId: string): void;
  clear(): void;
}

/**
 * A long channel/category name on the focused row is kept on a single line and truncated (with
 * the default "...") so it doesn't wrap to a second line; if it doesn't fit (scrollWidth >
 * clientWidth), the full text is made visible via a slow scrolling-text animation (marquee).
 * Only on the row that's currently focused — the others stay truncated with a fixed "...",
 * since multiple rows scrolling at once would be distracting.
 */
export class FocusMarquee implements Marquee {
  private readonly root: HTMLElement;
  private label: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  clear(): void {
    const label = this.label;
    if (!label) return;
    label.classList.remove('marquee');
    label.style.removeProperty('--marquee-distance');
    label.style.removeProperty('--marquee-duration');
    this.label = null;
  }

  update(id: string): void {
    this.clear();
    const row = this.root.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(id)}"]`);
    const label = row?.querySelector<HTMLElement>('.row-label');
    if (!label) return;
    let inner = label.querySelector<HTMLElement>('.marquee-inner');
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'marquee-inner';
      inner.append(...Array.from(label.childNodes));
      label.append(inner);
    }
    const distance = inner.offsetWidth - label.clientWidth;
    if (distance <= 2) return;
    const duration = Math.min(10, Math.max(4, distance / 18));
    label.style.setProperty('--marquee-distance', `-${distance}px`);
    label.style.setProperty('--marquee-duration', `${duration}s`);
    label.classList.add('marquee');
    this.label = label;
  }
}
