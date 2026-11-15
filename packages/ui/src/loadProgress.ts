/**
 * Percentage load indicator: an SVG ring (track + orange arc) with "%N" in the middle. The
 * background is transparent, so it also works over video/gradients. Proportions come from the
 * design: at 160px, radius is 64 and stroke is 14; the center text is 23% of the size. Used in
 * loading/connecting states (see the preview box in liveScreen.ts, full screen in playerOverlay.ts).
 */
export interface LoadProgressHandle {
  el: HTMLElement;
  setPercent(pct: number): void;
}

/** `showLabel: false` omits the centered "%N" text — used as a small icon beside its own percent text (see the top status banner in overlayStatusLayer.ts). */
export function createLoadProgress(size = 72, showLabel = true): LoadProgressHandle {
  const el = document.createElement('div');
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, position: 'relative', flex: 'none' });
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');

  const stroke = Math.max(6, Math.round(size * 0.0875));
  const r = size * 0.4;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  el.innerHTML =
    `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">` +
    `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" style="stroke:var(--line-25)" stroke-width="${stroke}"/>` +
    `<circle class="lp-arc" cx="${mid}" cy="${mid}" r="${r}" fill="none" style="stroke:var(--accent);transition:stroke-dasharray 0.3s ease-out" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="0 ${c}"/>` +
    `</svg>`;
  const arc = el.querySelector<SVGCircleElement>('.lp-arc')!;

  let label: HTMLElement | null = null;
  if (showLabel) {
    label = document.createElement('div');
    Object.assign(label.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size >= 120 ? `${Math.round(size * 0.2375)}px` : 'var(--fs-xs)',
      fontWeight: '800',
      color: 'var(--text)',
    });
    el.append(label);
  }

  function setPercent(pct: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    arc.setAttribute('stroke-dasharray', `${(c * clamped) / 100} ${c}`);
    if (label) label.textContent = `%${Math.round(clamped)}`;
    el.setAttribute('aria-valuenow', String(Math.round(clamped)));
  }
  setPercent(0);

  return { el, setPercent };
}

/**
 * Estimator for the initial load percentage. The real buffer percentage reported by the player
 * mostly stays at 0 until the first frame (the MSE buffer is empty), which would make the ring look
 * frozen. Here the shown percentage is the larger of the real buffer percentage and a curve that
 * slows down over time as it approaches 90%, and it never decreases; the caller supplies 100% once
 * the first frame arrives.
 */
export function createLoadEstimator(): (bufferPercent: number | null) => number {
  const startedAt = Date.now();
  let shown = 0;
  return (bufferPercent) => {
    const eased = 90 * (1 - Math.exp(-(Date.now() - startedAt) / 3000));
    shown = Math.max(shown, eased, bufferPercent ?? 0);
    return Math.min(shown, 100);
  };
}
