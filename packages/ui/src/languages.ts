import type { LanguageId } from '../../core/src/types.ts';

export interface LanguageDefinition {
  id: LanguageId;
  /** The language's own name, written in that language. */
  name: string;
  /** Subtitle shown on the card (replaced with "Currently in use" when selected). */
  note: string;
  /** If false, the card is inactive and shows a "Coming soon" badge; it cannot be selected. */
  available: boolean;
}

/**
 * Language registry: a new language = add a line here (+ set `available: true` once translated strings are ready).
 * The Settings > Language screen renders this list as-is.
 */
export const LANGUAGES: readonly LanguageDefinition[] = [
  { id: 'tr', name: 'Türkçe', note: 'Türkçe', available: true },
  { id: 'en', name: 'English', note: 'İngilizce', available: false },
];
