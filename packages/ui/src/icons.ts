/** Simple, self-contained SVG icons used instead of emoji — for empty states and the status bar. */

export function emptyBoxIconSvg(size = 64): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M3 7l9-4 9 4-9 4-9-4z" stroke-linejoin="round"/>
    <path d="M3 7v10l9 4 9-4V7" stroke-linejoin="round"/>
    <path d="M12 11v10" />
  </svg>`;
}

export function warningIconSvg(size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 3l10 18H2L12 3z" stroke-linejoin="round"/>
    <path d="M12 10v4" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
  </svg>`;
}

export function tvIconSvg(size = 56): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="6" width="18" height="12" rx="2"/>
    <path d="M8 21h8" stroke-linecap="round"/>
    <path d="M12 18v3"/>
    <path d="M8 3l4 3 4-3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/** Clapperboard: open (tilted) top lid with a striped band + rounded-bottom body. */
export function movieIconSvg(size = 56): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <g transform="rotate(-12 4 9)">
      <rect x="4" y="5" width="16" height="4" rx="1"/>
      <path d="M7 5l2 4M11 5l2 4M15 5l2 4M19 5l1 4"/>
    </g>
    <path d="M4 9H20V16A3 3 0 0 1 17 19H7A3 3 0 0 1 4 16Z"/>
  </svg>`;
}

/** A player screen (with a play triangle) + a scrub bar (slider) below it. */
export function seriesIconSvg(size = 56): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="3.5" width="16" height="12" rx="1.8"/>
    <path d="M10.3 6.7l4 2.8-4 2.8V6.7z" fill="currentColor" stroke="none"/>
    <line x1="4" y1="19.5" x2="20" y2="19.5"/>
    <circle cx="9.5" cy="19.5" r="1.6" fill="currentColor" stroke="none"/>
  </svg>`;
}

/** A neutral icon for content types that are not yet known/may be added in the future. */
export function categoryIconSvg(size = 56): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.2"/>
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2"/>
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2"/>
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2"/>
  </svg>`;
}

/** Gear (settings): outer ring + 8 teeth + a hollow hub. */
export function settingsIconSvg(size = 24): string {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((deg) => `<rect x="10.9" y="3" width="2.2" height="3" rx="0.6" fill="currentColor" stroke="none" transform="rotate(${deg} 12 12)"/>`)
    .join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    ${teeth}
    <circle cx="12" cy="12" r="7"/>
    <circle cx="12" cy="12" r="2.8"/>
  </svg>`;
}

const stroked = (size: number, body: string): string =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${body}</svg>`;

/** Settings menu: chain link (Connections). */
export function linkIconSvg(size = 40): string {
  return stroked(size, '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
}

/** Settings menu: circular arrow (Auto update). */
export function autoUpdateIconSvg(size = 40): string {
  return stroked(size, '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>');
}

/** Settings menu: download arrow (Update). */
export function downloadIconSvg(size = 40): string {
  return stroked(size, '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>');
}

/** Settings menu: calendar (EPG). */
export function calendarIconSvg(size = 40): string {
  return stroked(size, '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>');
}

/** Settings menu: palette (Theme). */
export function paletteIconSvg(size = 40): string {
  return stroked(
    size,
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.1-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  );
}

/** Settings menu: subtitles (CC box + two lines). */
export function subtitleIconSvg(size = 40): string {
  return stroked(size, '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h4M7 14h7M14 10h3"/>');
}

/** Settings menu: globe (Language). */
export function globeIconSvg(size = 40): string {
  return stroked(size, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/>');
}

export function trashIconSvg(size = 32): string {
  return stroked(size, '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
}

export function plusIconSvg(size = 32): string {
  return stroked(size, '<path d="M12 5v14M5 12h14"/>');
}

export function checkIconSvg(size = 26): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
}

export function eyeIconSvg(size = 36): string {
  return stroked(size, '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
}

export function lockIconSvg(size = 40): string {
  return stroked(size, '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
}

export function lockOpenIconSvg(size = 40): string {
  return stroked(size, '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>');
}

export function chevronRightIconSvg(size = 32): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;
}
