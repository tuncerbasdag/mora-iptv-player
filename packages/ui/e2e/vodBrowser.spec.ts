/**
 * Characterization tests for the movie/series browser (vodBrowser.ts): in real Chrome, with fake data/store.
 * The goal is to verify that behavior doesn't change while splitting the file into parts. `npm run test:e2e`.
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__vodStart']>[0]>;

async function open(page: Page, opts: Opts = {}): Promise<void> {
  await page.goto('/vod');
  await page.evaluate((o) => window.__vodStart(o), opts);
}
const sideRows = (page: Page) => page.locator('.list-row.cat-row');
const cards = (page: Page) => page.locator('#vod-grid .vod-card');
const recents = (page: Page) => page.locator('.vod-card:has(.vod-play-badge)');
const titles = (page: Page) => page.locator('#vod-grid .vod-title').allTextContents();
const focusedId = (page: Page) => page.locator('.focused').first().getAttribute('data-focus-id');
const v = (page: Page) => page.evaluate(() => window.__v);
const search = (page: Page) => page.locator('input[type="search"]');
const press = (page: Page, key: string, times = 1) => page.keyboard.press(key, { delay: 0 }).then(async () => { for (let i = 1; i < times; i++) await page.keyboard.press(key); });
const sectionTitle = (page: Page) => page.locator('.hide-scrollbar > div').filter({ hasText: /^(Tüm|Son izlenenler|Aksiyon|Dram|Favoriler)/ }).first();

test.describe('left menu', () => {
  test('Favorites, Recents, All Movies and categories with counts; "Tüm Filmler" is selected and focused on open', async ({ page }) => {
    await open(page, { favorites: ['Aksiyon-1'], recents: [['Aksiyon-2', 100, 3600]] });
    const rows = await sideRows(page).allTextContents();
    expect(rows).toEqual(['Favoriler1', 'Son İzlenenler1', 'Tüm Filmler92', 'Aksiyon80', 'Dram12', 'Kilitli', 'Boş0']);
    await expect(sideRows(page).nth(2)).toHaveClass(/active/);
    expect(await focusedId(page)).toBe('vcat-all');
    await expect(sideRows(page).nth(5).locator('.vod-count')).toHaveAttribute('aria-label', 'Kilitli');
  });

  test('when a category is focused (without Enter) the content updates; Enter moves focus to the first card', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowDown'); // Aksiyon
    expect(await focusedId(page)).toBe('vcat-cat-0');
    await expect(sideRows(page).nth(3)).toHaveClass(/active/);
    expect((await titles(page))[0]).toBe('Aksiyon Film 001');
    await press(page, 'ArrowDown'); // Dram
    expect((await titles(page))[0]).toBe('Dram Film 001');
    expect(await cards(page).count()).toBe(12);
    await press(page, 'Enter');
    expect(await focusedId(page)).toBe('vi-0');
  });

  test('locked category: the PIN is requested, content is not loaded', async ({ page }) => {
    await open(page);
    await sideRows(page).filter({ hasText: 'Kilitli' }).click();
    expect((await v(page)).unlock).toEqual([{ view: 'cat-2', query: '', sort: 'list', entryId: '', from: 'grid' }]);
  });

  test('empty / no-favorites / unwatched views show the appropriate text', async ({ page }) => {
    await open(page);
    await sideRows(page).filter({ hasText: 'Boş' }).click();
    await expect(page.getByText('Bu kategoride içerik yok.')).toBeVisible();
    await sideRows(page).filter({ hasText: 'Favoriler' }).click();
    await expect(page.getByText(/Henüz favori eklenmedi/)).toBeVisible();
    await sideRows(page).filter({ hasText: 'Son İzlenenler' }).click();
    await expect(page.getByText('Henüz izlenen yok.')).toBeVisible();
  });
});

test.describe('grid and paging', () => {
  test('the title and the first 60 cards; the rest is added when nearing the end', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Tüm filmler', { exact: true })).toBeVisible();
    expect(await cards(page).count()).toBe(60);
    await sideRows(page).filter({ hasText: 'Tüm Filmler' }).click(); // to the first card
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-focus-id="vi-55"]')!.scrollIntoView());
    for (let i = 0; i < 11; i++) await press(page, 'ArrowDown'); // down until the 55th card
    await expect.poll(() => cards(page).count()).toBe(92);
  });

  test('the "Yeni" badge shows on items added in the last 14 days', async ({ page }) => {
    await open(page);
    // i % 40 < 14 → the first 14 movies are new; the 15th is not
    const first = cards(page).nth(0).locator('.vod-new');
    await expect(first).toHaveText('Yeni');
    await expect(cards(page).nth(13).locator('.vod-new')).toHaveCount(1);
    await expect(cards(page).nth(14).locator('.vod-new')).toHaveCount(0);
  });

  test('series view: the badge is "Yeni bölüm"', async ({ page }) => {
    await open(page, { landscape: true });
    await expect(cards(page).nth(0).locator('.vod-new')).toHaveText('Yeni bölüm');
  });

  test('the favorite star shows on the card', async ({ page }) => {
    await open(page, { favorites: ['Aksiyon-3'] });
    await expect(cards(page).nth(3).locator('.vod-star')).toHaveText('★');
    await expect(cards(page).nth(2).locator('.vod-star')).toHaveCount(0);
  });
});

test.describe('recents', () => {
  const R: Opts = { recents: [['Aksiyon-5', 1800, 3600], ['Dram-2', 3500, 3600], ['Aksiyon-9', 0, 0]] };

  test('in the "Tümü" view a row on top: remaining time, "İzlendi" (≥95%), a subtitle on a card without duration; progress bar', async ({ page }) => {
    await open(page, R);
    await expect(page.getByText('Son izlenenler', { exact: true })).toBeVisible();
    expect(await recents(page).count()).toBe(3);
    await expect(recents(page).nth(0).locator('.vod-sub')).toHaveText('30 dk kaldı');
    await expect(recents(page).nth(1).locator('.vod-sub')).toHaveText('İzlendi');
    await expect(recents(page).nth(2).locator('.vod-sub')).toHaveText('2009'); // no duration: normal subtitle
    await expect(recents(page).nth(0).locator('.vod-resume-pill')).toHaveText('Devam et');
    const fill = await recents(page).nth(0).locator('div[style*="width:50%"], div[style*="width: 50%"]').count();
    expect(fill).toBe(1);
  });

  test('the row is hidden when a search is typed', async ({ page }) => {
    await open(page, R);
    await search(page).fill('Film 00');
    await expect(recents(page)).toHaveCount(0);
  });

  test('Recents category: all cards in watch order', async ({ page }) => {
    await open(page, R);
    await sideRows(page).filter({ hasText: 'Son İzlenenler' }).click();
    expect(await titles(page)).toEqual(['Aksiyon Film 006', 'Dram Film 003', 'Aksiyon Film 010']);
  });
});

test.describe('search and sorting', () => {
  test('search filters by name (Turkish, case-insensitive); a message if there is no match', async ({ page }) => {
    await open(page);
    await search(page).fill('dram film 00');
    expect((await titles(page)).length).toBe(9);
    await search(page).fill('yok yok');
    await expect(page.getByText('Aramayla eşleşen sonuç yok.')).toBeVisible();
    await search(page).fill('');
    expect(await cards(page).count()).toBe(60);
  });

  test('Sort panel: year/added/duration options show if there is data; selecting changes the order; Back closes the panel', async ({ page }) => {
    await open(page);
    await page.locator('.vod-sort').click();
    expect(await page.locator('.vod-sort-opt').allTextContents()).toEqual(['Liste sırası', 'Ada göre (A–Z)', 'Ada göre (Z–A)', 'Yıla göre', 'Yeni eklenenler', 'Süreye göre']);
    expect(await focusedId(page)).toBe('vsort-opt-0');
    await page.locator('.vod-sort-opt', { hasText: 'Ada göre (Z–A)' }).click();
    await expect(page.locator('.vod-sort')).toContainText('Ada göre (Z–A)');
    expect((await titles(page))[0]).toBe('Dram Film 012');
    // reopen, close with Back (the browser doesn't close)
    await page.locator('.vod-sort').click();
    await expect(page.locator('.vod-sort-panel')).toBeVisible();
    await press(page, 'Escape');
    await expect(page.locator('.vod-sort-panel')).toBeHidden();
    expect((await v(page)).back).toBe(0);
    expect(await focusedId(page)).toBe('vsort');
  });

  test('by year: newest year first; by duration: longest first', async ({ page }) => {
    await open(page);
    await page.locator('.vod-sort').click();
    await page.locator('.vod-sort-opt', { hasText: 'Yıla göre' }).click();
    expect((await titles(page))[0]).toMatch(/Film (025|050|075|\d+)/); // the ones from 2024 come first
    const firstYear = await cards(page).nth(0).locator('.vod-sub').textContent();
    expect(firstYear).toBe('2024');
    await page.locator('.vod-sort').click();
    await page.locator('.vod-sort-opt', { hasText: 'Süreye göre' }).click();
    expect((await titles(page))[0]).toBe('Aksiyon Film 080');
  });

  test('only the 3 basic options if there is no year/added/duration data', async ({ page }) => {
    await open(page, { plain: true });
    await page.locator('.vod-sort').click();
    expect(await page.locator('.vod-sort-opt').allTextContents()).toEqual(['Liste sırası', 'Ada göre (A–Z)', 'Ada göre (Z–A)']);
  });

  test('while the sort panel is open focus moves only between the options', async ({ page }) => {
    await open(page);
    await page.locator('.vod-sort').click();
    await press(page, 'ArrowDown', 2);
    expect(await focusedId(page)).toBe('vsort-opt-2');
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vsort-opt-2');
    await press(page, 'ArrowLeft');
    expect(await focusedId(page)).toBe('vsort-opt-2');
  });
});

test.describe('navigation (5-column vertical grid)', () => {
  test('Right from the menu: to the first card; Right/Left/Down/Up between cards; at the left edge it returns to the menu', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vi-0');
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vi-1');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('vi-6');
    await press(page, 'ArrowLeft');
    expect(await focusedId(page)).toBe('vi-5');
    await press(page, 'ArrowLeft'); // first card in the row: to the menu
    expect(await focusedId(page)).toBe('vcat-all');
    await press(page, 'ArrowRight', 5);
    expect(await focusedId(page)).toBe('vi-4');
    await press(page, 'ArrowRight'); // end of row: stays in place
    expect(await focusedId(page)).toBe('vi-4');
  });

  test('Up from the first row: to recents if any, otherwise to search; search ↔ Sort ↔ content', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('vsearch');
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vsort');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('vi-0');
    await open(page, { recents: [['Aksiyon-1', 100, 3600], ['Aksiyon-2', 100, 3600]] });
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vr-0'); // Right from the menu: recently watched first
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vr-1');
    await press(page, 'ArrowRight'); // end of row
    expect(await focusedId(page)).toBe('vr-1');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('vi-1');
    await press(page, 'ArrowUp', 2); // grid first row → recently watched → search
    expect(await focusedId(page)).toBe('vsearch');
  });

  test('if the last row is not full, Down goes to the last card of the row below', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowDown', 2); // Dram: 12 kart (5+5+2)
    await press(page, 'Enter');
    await press(page, 'ArrowDown', 2); // vi-10
    expect(await focusedId(page)).toBe('vi-10');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight', 4); // vi-9 (right edge)
    expect(await focusedId(page)).toBe('vi-9');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('vi-11'); // the row below is shorter: last card
  });

  test('in the menu Up/Down moves only in the menu', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('vcat-recent');
    await press(page, 'ArrowUp', 3);
    expect(await focusedId(page)).toBe('vcat-fav'); // stays at the top, doesn't jump into the content
  });

  // Previously navigation counted every grid as 5 columns (the series grid has 4): Down went diagonally, Right went to the next row.
  test('horizontal (series) grid: 4 columns, Down goes to the card below', async ({ page }) => {
    await open(page, { landscape: true });
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('vi-0');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('vi-4');
    await press(page, 'ArrowRight', 3); // to the end of the 2nd row (4th column)
    expect(await focusedId(page)).toBe('vi-7');
    await press(page, 'ArrowRight'); // doesn't overflow to the next row
    expect(await focusedId(page)).toBe('vi-7');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('vi-3');
  });
});

test.describe('favorite shortcut and opening', () => {
  test('F: adds/removes the focused card to/from favorites, the menu count updates; an f typed in the search box does not count', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowRight');
    await press(page, 'f');
    expect(await page.evaluate(() => window.__v.favorites())).toEqual(['Aksiyon-0']);
    await expect(sideRows(page).first()).toContainText('1');
    await expect(cards(page).nth(0).locator('.vod-star')).toHaveText('★');
    expect(await focusedId(page)).toBe('vi-0');
    await press(page, 'f');
    expect(await page.evaluate(() => window.__v.favorites())).toEqual([]);
    await search(page).click();
    await page.keyboard.type('f');
    expect(await page.evaluate(() => window.__v.favorites())).toEqual([]);
  });

  test('in the Favorites view, when a card is removed focus moves to the nearest card/menu', async ({ page }) => {
    await open(page, { favorites: ['Aksiyon-0'] });
    await press(page, 'ArrowUp', 2); // Favoriler
    await press(page, 'Enter');
    expect(await focusedId(page)).toBe('vi-0');
    await press(page, 'f');
    expect(await cards(page).count()).toBe(0);
    expect(await focusedId(page)).toBe('vcat-fav');
  });

  test('clicking a card calls onOpen (browser state) then onSelect; from=recent when opened from recents', async ({ page }) => {
    await open(page, { recents: [['Aksiyon-5', 100, 3600]] });
    await search(page).fill('Film 003');
    await page.locator('#vod-grid .vod-card').first().click();
    let s = await v(page);
    expect(s.selected).toEqual(['Aksiyon-2']);
    expect(s.opened).toEqual([{ view: 'all', query: 'Film 003', sort: 'list', entryId: 'Aksiyon-2', from: 'grid' }]);
    await open(page, { recents: [['Aksiyon-5', 100, 3600]] });
    await recents(page).first().click();
    s = await v(page);
    expect(s.opened[0]).toEqual({ view: 'all', query: '', sort: 'list', entryId: 'Aksiyon-5', from: 'recent' });
  });

  test('clicking the menu title (Filmler) goes back', async ({ page }) => {
    await open(page);
    await page.getByText('Filmler', { exact: true }).click();
    expect((await v(page)).back).toBe(1);
  });

  test('the Back key calls onBack', async ({ page }) => {
    await open(page);
    await press(page, 'Escape');
    expect((await v(page)).back).toBe(1);
  });
});

test.describe('restore', () => {
  test('the same category, search and sort are rebuilt; focus goes to the opened card', async ({ page }) => {
    await open(page, { restore: { view: 'cat-1', query: 'film 00', sort: 'za', entryId: 'Dram-3', from: 'grid' } });
    await expect(sideRows(page).nth(4)).toHaveClass(/active/);
    await expect(search(page)).toHaveValue('film 00');
    await expect(page.locator('.vod-sort')).toContainText('Ada göre (Z–A)');
    // Dram, "film 00" → 9 cards, Z-A: 009..001; Dram-3 ("004") is at position 5 → vi-5
    expect(await focusedId(page)).toBe('vi-5');
  });

  test('paging is done for a card beyond the first page and it gets focus', async ({ page }) => {
    await open(page, { restore: { view: 'cat-0', query: '', sort: 'list', entryId: 'Aksiyon-70', from: 'grid' } });
    expect(await focusedId(page)).toBe('vi-70');
    expect(await cards(page).count()).toBeGreaterThan(70);
  });

  test('if opened from the "Son izlenenler" row it returns to that card; an invalid category falls back to "Tümü"', async ({ page }) => {
    await open(page, { recents: [['Aksiyon-1', 100, 3600], ['Dram-4', 100, 3600]], restore: { view: 'all', query: '', sort: 'list', entryId: 'Dram-4', from: 'recent' } });
    expect(await focusedId(page)).toBe('vr-1');
    await open(page, { restore: { view: 'cat-99', query: '', sort: 'list', entryId: 'yok', from: 'grid' } });
    expect(await focusedId(page)).toBe('vcat-all');
    await expect(sideRows(page).nth(2)).toHaveClass(/active/);
  });
});

test.describe('poster loading', () => {
  const hits = (page: Page, k: string) => page.evaluate(async (key) => (await fetch(`/__logo_count?k=${key}`)).json(), k);
  const key = () => `v${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  test('only visible (and slightly beyond) posters are requested; more as you scroll', async ({ page }) => {
    const k = key();
    await open(page, { logoKey: k });
    await page.waitForTimeout(800);
    const first = await hits(page, k);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(40); // not all 60 cards
    await page.locator('.hide-scrollbar').nth(1).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => hits(page, k)).toBeGreaterThan(first);
  });
});
