import { findNextFocus, type Direction, type FocusRect } from './focus.ts';
import { isBackKey } from './keys.ts';


const DIRECTION_BY_KEY: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export interface FocusManagerOptions {
  onBack?: () => void;
  /** Called whenever focus changes (e.g. to update the right panel when a category is focused). */
  onFocus?: (id: string) => void;
  /**
   * For single-column vertical menu screens (Settings, Theme): the Left key always triggers
   * onBack, with no spatial calculation. The reason this is a separate opt-in: a general
   * "go back if there's no candidate on the left" rule caused findNextFocus's center-based
   * cone test to wrongly score a narrow "Back" button (even far below the rows) as a target
   * "on the left" (a narrow element's center sits much further left relative to the center of
   * wide rows) — since this general rule would be dangerous on multi-column/grid screens (like
   * category/channel navigation), it's explicitly opted into only on screens that are truly
   * single-column.
   */
  leftIsBack?: boolean;
  /**
   * To narrow the candidate list in a given direction (e.g. in two adjacent long columns —
   * like category/channel lists — so that Down/Up at the end of a short list doesn't wrongly
   * jump to the adjacent column). If this returns `false` for a candidate, it's never sent to
   * findNextFocus; if omitted, all candidates are considered (the default, existing behavior).
   */
  candidateFilter?: (current: HTMLElement, candidate: HTMLElement, direction: Direction) => boolean;
}

/**
 * Spatial navigation via remote/keyboard: navigates between elements carrying data-focus-id
 * using arrow keys, triggers a click with Enter/OK, and calls onBack on Back.
 */
export class FocusManager {
  private readonly root: HTMLElement;
  private readonly opts: FocusManagerOptions;
  private currentId: string | null = null;
  private readonly keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);
  private readonly focusinHandler = (e: FocusEvent) => this.handleFocusIn(e);
  private readonly clickHandler = (e: MouseEvent) => this.handleClick(e);

  constructor(root: HTMLElement, opts: FocusManagerOptions = {}) {
    this.root = root;
    this.opts = opts;
    document.addEventListener('keydown', this.keydownHandler);
    // Synchronizes currentId when an element receives native focus via mouse (or touch) — otherwise
    // arrow-key navigation would be computed from the last keyboard-navigation position instead of
    // where the user actually focused (e.g. clicking a text field with the mouse and then pressing
    // an arrow key would compute "nearest" from the wrong element).
    document.addEventListener('focusin', this.focusinHandler);
    // Divs with data-focus-id don't receive native focus, so focusin isn't triggered on click; focus
    // is moved during the capture phase (before the element's own click handler) so that the
    // mouse-clicked element also becomes focused. Otherwise focus would stay on the old row and the
    // clicked row wouldn't look "active."
    root.addEventListener('click', this.clickHandler, true);
    this.refresh();
  }

  /** Must be called when the screen is re-rendered; moves to the first element if there's no focus. */
  refresh(): void {
    const els = this.elements();
    if (els.length === 0) return;
    if (!this.currentId || !els.some((el) => el.dataset.focusId === this.currentId)) {
      this.focus(els[0].dataset.focusId!);
    }
  }

  focus(id: string): void {
    for (const el of this.elements()) el.classList.toggle('focused', el.dataset.focusId === id);
    const changed = this.currentId !== id;
    this.currentId = id;
    this.elements()
      .find((el) => el.dataset.focusId === id)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (changed) this.opts.onFocus?.(id);
  }

  private readonly disposers: Array<() => void> = [];

  /** Registers a cleanup function to run when the screen closes (destroy); called in registration order. */
  onDestroy(fn: () => void): void {
    this.disposers.push(fn);
  }

  destroy(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    document.removeEventListener('keydown', this.keydownHandler);
    document.removeEventListener('focusin', this.focusinHandler);
    this.root.removeEventListener('click', this.clickHandler, true);
  }

  private handleClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-focus-id]');
    if (!el || !this.root.contains(el)) return;
    const id = el.dataset.focusId!;
    if (id !== this.currentId) this.focus(id);
  }

  private handleFocusIn(e: FocusEvent): void {
    const target = e.target as HTMLElement | null;
    const el = target?.closest<HTMLElement>('[data-focus-id]');
    if (!el || !this.root.contains(el)) return;
    const id = el.dataset.focusId!;
    if (id !== this.currentId) this.focus(id);
  }

  private elements(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('[data-focus-id]'));
  }

  private handleKeydown(e: KeyboardEvent): void {
    const active = document.activeElement as HTMLElement | null;
    if (active?.tagName === 'INPUT') {
      // In edit mode: Left/Right and Backspace are left for native text editing.
      // Since Up/Down have no cursor-movement meaning in a single-line field, they
      // exit the field and continue navigating in that direction (otherwise the user
      // would feel "stuck" inside the field — nothing indicates they need to press
      // Enter/Escape first).
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        active.blur();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        active.blur();
        this.move(e.key === 'ArrowUp' ? 'up' : 'down');
      }
      return;
    }
    if (isBackKey(e)) {
      e.preventDefault();
      this.opts.onBack?.();
      return;
    }
    if (e.key === 'ArrowLeft' && this.opts.leftIsBack) {
      e.preventDefault();
      this.opts.onBack?.();
      return;
    }
    const direction = DIRECTION_BY_KEY[e.key];
    if (direction) {
      e.preventDefault();
      this.move(direction);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.activateCurrent();
    }
  }

  private move(direction: Direction): void {
    const els = this.elements();
    const currentEl = els.find((el) => el.dataset.focusId === this.currentId);
    if (!currentEl) {
      this.refresh();
      return;
    }
    const toRect = (el: HTMLElement): FocusRect => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.focusId!, x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const currentRect = toRect(currentEl);
    let candidates = els.filter((el) => el !== currentEl);
    if (this.opts.candidateFilter) {
      const filter = this.opts.candidateFilter;
      candidates = candidates.filter((el) => filter(currentEl, el, direction));
    }
    const candidateRects = candidates.map(toRect);
    const nextId = findNextFocus(currentRect, candidateRects, direction);
    if (nextId) this.focus(nextId);
  }

  private activateCurrent(): void {
    this.elements()
      .find((el) => el.dataset.focusId === this.currentId)
      ?.click();
  }
}
