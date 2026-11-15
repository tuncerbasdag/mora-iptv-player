import type { FavoriteStore } from '../../../../core/src/storage.ts';
import type { Category, MediaItem } from '../../../../core/src/types.ts';

/** Fixed id of the Favorites category; other categories are `cat-<index>`. */
export const FAV_CAT_ID = 'cat-fav';

/** Category from a `cat-<index>` id; undefined for Favorites or an invalid id. */
export function categoryById(categories: Category<MediaItem>[], catId: string): Category<MediaItem> | undefined {
  return categories[Number(catId.slice(4))];
}

/**
 * Channels in a category (without search filtering): Favorites = channels marked as favorite
 * (in category order), others `cat-<index>`. Both the Live TV screen and Up/Down channel
 * switching in fullscreen use this same list.
 */
export function liveCategoryItems(categories: Category<MediaItem>[], storage: FavoriteStore, catId: string): MediaItem[] {
  if (catId === FAV_CAT_ID) {
    const favIds = new Set(storage.getFavorites());
    const out: MediaItem[] = [];
    for (const cat of categories) for (const it of cat.items) if (favIds.has(it.id)) out.push(it);
    return out;
  }
  return categoryById(categories, catId)?.items ?? [];
}

/**
 * Channels to show in the list: the category's channels if there's no search; if there is a
 * search, it searches by name across all unlocked categories regardless of category (same
 * channel appears once), and the channel matching the selected category's position number
 * ("03") is also included.
 */
export function searchLiveItems(categories: Category<MediaItem>[], storage: FavoriteStore, catId: string, query: string): MediaItem[] {
  const all = liveCategoryItems(categories, storage, catId);
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return all;
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const cat of categories) {
    if (cat.locked) continue;
    for (const it of cat.items) {
      if (seen.has(it.id) || !it.name.toLocaleLowerCase('tr-TR').includes(q)) continue;
      seen.add(it.id);
      out.push(it);
    }
  }
  const byNumber = all.find((_, i) => String(i + 1).padStart(2, '0') === q);
  if (byNumber && !seen.has(byNumber.id)) out.unshift(byNumber);
  return out;
}
