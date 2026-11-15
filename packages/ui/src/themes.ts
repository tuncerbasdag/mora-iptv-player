import type { ThemeId } from '../../core/src/types.ts';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  /** Sample color swatches shown on the card: background, surface, accent, poster background, and the second and third poster colors (in design order). */
  palette: string[];
}

/**
 * Theme registry: a new theme = a line here + `:root[data-theme="…"]` variables in styles.css (+ ThemeId in
 * core/types.ts). The Settings screen renders this list as-is.
 */
export const THEMES: readonly ThemeDefinition[] = [
  { id: 'default', name: 'Varsayılan', description: 'Koyu zemin, turuncu vurgu', palette: ['#242323', '#2D2C2C', '#E68137', '#F6CBA7', '#D3CAEE', '#C3DDC6'] },
  { id: 'theme6', name: 'Tema 1', description: 'Kırmızı-beyaz', palette: ['#8E0A14', '#B30D1A', '#FFFFFF', '#FFFFFF', '#FFC9CE', '#F2F2F2'] },
  { id: 'theme2', name: 'Tema 2', description: 'Koyu zemin, beyaz vurgu, bordo-mavi gradyan', palette: ['#08080B', '#101016', '#FFFFFF', '#D4D5E2', '#2A5BFF', '#D4D5E2'] },
  { id: 'theme3', name: 'Tema 3', description: 'Siyah-beyaz', palette: ['#050505', '#101010', '#FFFFFF', '#F2F2F2', '#9A9A9A', '#CFCFCF'] },
  { id: 'theme4', name: 'Tema 4', description: 'Lacivert-sarı', palette: ['#081748', '#0F2468', '#FFD60A', '#FFD60A', '#4F73E0', '#E4E9F8'] },
  { id: 'theme5', name: 'Tema 5', description: 'Kırmızı-sarı', palette: ['#2A0510', '#40091A', '#FFC20E', '#FFC20E', '#F0305E', '#F3E6C4'] },
];

/** Applies the selected theme to the document root (colors are styles.css variables). */
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
}
