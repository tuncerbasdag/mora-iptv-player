import type { SubtitleBackground, SubtitleColor, SubtitlePosition, SubtitleSize, SubtitleStyle } from '../../core/src/types.ts';

/** Fixed sample text shown on top of the cards on the Settings page (live preview). */
export const SAMPLE_SUBTITLE_TEXT = 'Bu bir örnek altyazı metnidir.';

export const SUBTITLE_SIZE_OPTIONS: { id: SubtitleSize; label: string }[] = [
  { id: 'small', label: 'Küçük' },
  { id: 'medium', label: 'Orta' },
  { id: 'large', label: 'Büyük' },
  { id: 'xlarge', label: 'Çok Büyük' },
];

export const SUBTITLE_COLOR_OPTIONS: { id: SubtitleColor; label: string }[] = [
  { id: 'white', label: 'Beyaz' },
  { id: 'yellow', label: 'Sarı' },
  { id: 'cyan', label: 'Açık Mavi' },
  { id: 'lightgreen', label: 'Açık Yeşil' },
];

export const SUBTITLE_BACKGROUND_OPTIONS: { id: SubtitleBackground; label: string }[] = [
  { id: 'none', label: 'Yok' },
  { id: 'translucent', label: 'Hafif Saydam' },
  { id: 'opaque', label: 'Koyu Opak' },
];

export const SUBTITLE_POSITION_OPTIONS: { id: SubtitlePosition; label: string }[] = [
  { id: 'bottom', label: 'Alt' },
  { id: 'middle-bottom', label: 'Orta-Alt' },
  { id: 'top', label: 'Üst' },
];

const SIZE_PX: Record<SubtitleSize, number> = { small: 32, medium: 44, large: 56, xlarge: 72 };
const COLOR_HEX: Record<SubtitleColor, string> = { white: '#ffffff', yellow: '#ffe066', cyan: '#8be9fd', lightgreen: '#b8f2b0' };
const BACKGROUND_CSS: Record<SubtitleBackground, { background: string; padding: string; borderRadius: string }> = {
  none: { background: 'transparent', padding: '0', borderRadius: '0' },
  translucent: { background: 'rgba(0, 0, 0, 0.55)', padding: '6px 24px', borderRadius: '12px' },
  opaque: { background: 'rgba(0, 0, 0, 0.92)', padding: '6px 24px', borderRadius: '12px' },
};
/** `.vod-caption` (styles.css) is positioned with `position:absolute`; only one of top/bottom should be active,
 * the other must be explicitly cancelled with `auto` (if both stay set, the box stretches vertically). */
const POSITION_CSS: Record<SubtitlePosition, { top: string; bottom: string }> = {
  bottom: { top: 'auto', bottom: '110px' },
  'middle-bottom': { top: 'auto', bottom: '270px' },
  top: { top: '80px', bottom: 'auto' },
};

/** Pure function: doesn't touch the DOM, returns the inline style properties to apply (testable without the DOM). */
export function subtitleStyleCss(style: SubtitleStyle): Partial<CSSStyleDeclaration> {
  const bg = BACKGROUND_CSS[style.background];
  const pos = POSITION_CSS[style.position];
  return {
    fontSize: `${SIZE_PX[style.size]}px`,
    color: COLOR_HEX[style.color],
    background: bg.background,
    padding: bg.padding,
    borderRadius: bg.borderRadius,
    top: pos.top,
    bottom: pos.bottom,
    // The background box shouldn't fill `.vod-caption`'s wide band (left/right:160px) — it should wrap the text instead (auto margin centers it).
    width: 'fit-content',
    marginLeft: 'auto',
    marginRight: 'auto',
  };
}
