/**
 * Dizi detayı (showDetail.ts) karakterizasyon testleri: bilgi paneli, "Oynat/Devam et" hedefi, favori, sezon sekmeleri,
 * bölüm listesi (durum metinleri, küçük resimler) ve ok tuşu gezinme sırası. Uygulama harness'ı (/app) üzerinden.
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__appStart']>[0]>;

async function openShow(page: Page, title: string, opts: Opts = {}): Promise<void> {
  await page.goto('/app');
  await page.evaluate((o) => window.__appStart({ extraShows: true, ...o }), opts);
  await page.getByText('Diziler', { exact: true }).first().click();
  await page.locator('input[type="search"]').fill(title);
  await page.locator('#vod-grid .vod-card').first().click();
  await expect(page.locator('[data-focus-id="play"]')).toBeVisible();
}
const press = (page: Page, key: string, times = 1) => (async () => { for (let i = 0; i < times; i++) await page.keyboard.press(key); })();
const focusedId = (page: Page) => page.locator('.focused').first().getAttribute('data-focus-id');
const play = (page: Page) => page.locator('[data-focus-id="play"]');
const fav = (page: Page) => page.locator('[data-focus-id="fav"]');
const rows = (page: Page) => page.locator('.vod-ep');
const rowNames = (page: Page) => page.locator('.vod-ep-name').allTextContents();

test.describe('info panel', () => {
  test('title, subtitle line, year/genre/season/episode count in the left column', async ({ page }) => {
    await openShow(page, 'Gece');
    await expect(page.getByText('Gece Yarısı (2021)', { exact: true })).toBeVisible();
    await expect(page.getByText('2 sezon · Dizi A · 2021')).toBeVisible();
    const side = page.locator('.settings-frame > div').first();
    await expect(side).toContainText('Yapım yılı');
    await expect(side).toContainText('2021');
    await expect(side).toContainText('Tür');
    await expect(side).toContainText('Sezon');
    await expect(side).toContainText('Bölüm');
    await expect(side.getByText('Diziler', { exact: true })).toBeVisible();
  });

  test('season info and tabs are not shown for a series with unnumbered episodes', async ({ page }) => {
    await openShow(page, 'Numarasız');
    await expect(page.locator('[data-focus-id^="season-"]')).toHaveCount(0);
    await expect(page.getByText(/sezon/)).toHaveCount(0);
    await expect(play(page)).toHaveText('Oynat'); // "S1 B1" eki yok
    expect(await rowNames(page)).toEqual(['Numarasız Dizi - Kayıt 1', 'Numarasız Dizi - Kayıt 2', 'Numarasız Dizi - Kayıt 3']);
    expect(await page.locator('.vod-ep-num').allTextContents()).toEqual(['1', '2', '3']); // sıra numarası
  });

  test('the Back key and the "Diziler" heading return to the browser', async ({ page }) => {
    await openShow(page, 'Gece');
    await press(page, 'Escape');
    await expect(page.locator('#vod-grid')).toBeVisible();
    await page.locator('#vod-grid .vod-card').first().click();
    await page.getByText('Diziler', { exact: true }).first().click();
    await expect(page.locator('#vod-grid')).toBeVisible();
  });
});

test.describe('Play / Continue target', () => {
  test('the first episode if nothing was watched: "Oynat · S1 B1"', async ({ page }) => {
    await openShow(page, 'Gece');
    await expect(play(page)).toContainText('Oynat · S1 B1');
    expect(await focusedId(page)).toBe('play');
  });

  test('a half-watched episode: "Devam et" the same episode; a finished episode: the next; end of season: the first of the next season; end of series: the same episode', async ({ page }) => {
    await openShow(page, 'Gece', { progress: [['s1e2', 1000, 3000]] });
    await expect(play(page)).toContainText('Devam et · S1 B2');
    await openShow(page, 'Gece', { progress: [['s1e1', 2990, 3000]] });
    await expect(play(page)).toContainText('Oynat · S1 B2');
    await openShow(page, 'Gece', { progress: [['s1e2', 2990, 3000]] });
    await expect(play(page)).toContainText('Oynat · S2 B1');
    await expect(page.locator('[data-focus-id="season-1"]')).toHaveClass(/active/); // hedefin sezonu açık gelir
    await openShow(page, 'Gece', { progress: [['s2e2', 2990, 3000]] });
    await expect(play(page)).toContainText('Oynat · S2 B2');
  });

  test('Play plays the target episode (id and position); another series\' record is ignored', async ({ page }) => {
    await openShow(page, 'Gece', { progress: [['lg3', 100, 3000], ['s1e2', 1000, 3000]] });
    await expect(play(page)).toContainText('Devam et · S1 B2');
    await play(page).click();
    await expect(page.locator('.vod-bar-sub')).toContainText('Sezon 1 · Bölüm 2');
  });

  test('on the series detail Enter is focused on the play button and clicking opens the episode', async ({ page }) => {
    await openShow(page, 'Gece');
    await press(page, 'Enter');
    await expect(page.locator('.vod-bar')).toBeVisible();
    await expect(page.locator('.vod-bar-sub')).toContainText('Sezon 1 · Bölüm 1');
  });
});

test.describe('favorite', () => {
  test('the button adds/removes the favorite and changes the label', async ({ page }) => {
    await openShow(page, 'Gece');
    await expect(fav(page)).toHaveText('Favorilere ekle');
    await fav(page).click();
    await expect(fav(page)).toHaveText('Favorilerden çıkar');
    await fav(page).click();
    await expect(fav(page)).toHaveText('Favorilere ekle');
  });
});

test.describe('season tabs and episode list', () => {
  test('tabs "Sezon N"; the first season is open, episode count; when a tab is FOCUSED (without Enter) the episodes update', async ({ page }) => {
    await openShow(page, 'Gece');
    expect(await page.locator('[data-focus-id^="season-"]').allTextContents()).toEqual(['Sezon 1', 'Sezon 2']);
    await expect(page.locator('[data-focus-id="season-0"]')).toHaveClass(/active/);
    await expect(page.getByText('2 bölüm', { exact: true })).toBeVisible();
    expect(await rowNames(page)).toEqual(['Bölüm 1', 'Bölüm 2']);
    await press(page, 'ArrowDown'); // sezon 1 sekmesi
    await press(page, 'ArrowRight'); // sezon 2 sekmesi
    expect(await focusedId(page)).toBe('season-1');
    await expect(page.locator('[data-focus-id="season-1"]')).toHaveClass(/active/);
    await expect(page.locator('[data-focus-id="ep-1-0"]')).toBeVisible();
    await page.locator('[data-focus-id="season-0"]').click(); // tıklama da seçer
    await expect(page.locator('[data-focus-id="ep-0-0"]')).toBeVisible();
  });

  test('episode row: number, name, status text ("✓ İzlendi", "N dk kaldı"), progress bar; clicking plays that episode', async ({ page }) => {
    await openShow(page, 'Gece', { progress: [['s1e1', 3000, 3000], ['s1e2', 600, 3000]] });
    await expect(rows(page).nth(0).locator('.vod-ep-status')).toHaveText('✓ İzlendi');
    await expect(rows(page).nth(1).locator('.vod-ep-status')).toHaveText('40 dk kaldı');
    await expect(rows(page).nth(1).locator('.vod-thumb div[style*="width:20%"], .vod-thumb div[style*="width: 20%"]')).toHaveCount(1);
    await expect(rows(page).nth(0).locator('.vod-ep-num')).toHaveText('1');
    await rows(page).nth(1).click();
    await expect(page.locator('.vod-bar-sub')).toContainText('Sezon 1 · Bölüm 2');
  });

  test('thumbnails: the first 12 immediately, the rest load as focus advances', async ({ page }) => {
    const k = `d${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const hits = () => page.evaluate(async (key) => (await fetch(`/__logo_count?k=${key}`)).json(), k);
    await openShow(page, 'Uzun', { logoKey: k });
    await expect(rows(page)).toHaveCount(20);
    await expect.poll(hits).toBe(12);
    await press(page, 'ArrowDown'); // sekme
    await press(page, 'ArrowDown'); // ep-0-0
    await press(page, 'ArrowDown', 11); // ep-0-11 → sonraki 6 satırın resmi
    await expect.poll(hits).toBeGreaterThan(12);
  });
});

test.describe('arrow-key navigation order', () => {
  test('Play ↔ Favorite; Down: season tab → first episode → episodes below; Up goes back', async ({ page }) => {
    await openShow(page, 'Gece');
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('fav');
    await press(page, 'ArrowRight'); // başka yok
    expect(await focusedId(page)).toBe('fav');
    await press(page, 'ArrowLeft');
    expect(await focusedId(page)).toBe('play');
    await press(page, 'ArrowUp'); // en üst
    expect(await focusedId(page)).toBe('play');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('season-0');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('ep-0-0');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('ep-0-1');
    await press(page, 'ArrowDown'); // son bölüm: yerinde
    expect(await focusedId(page)).toBe('ep-0-1');
    await press(page, 'ArrowRight'); // bölümde Sol/Sağ yok
    expect(await focusedId(page)).toBe('ep-0-1');
    await press(page, 'ArrowUp', 2);
    expect(await focusedId(page)).toBe('season-0');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('play');
  });

  test('Down on a tab always goes to the first episode of the OPEN season; Down from Favorite to the tab', async ({ page }) => {
    await openShow(page, 'Gece');
    await press(page, 'ArrowRight'); // fav
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('season-0');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('ep-1-0');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('season-1');
  });

  test('in a series without numbers Down goes straight to the first episode, Up to the play button', async ({ page }) => {
    await openShow(page, 'Numarasız');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('ep-0-0');
    await press(page, 'ArrowDown', 2);
    expect(await focusedId(page)).toBe('ep-0-2');
    await press(page, 'ArrowUp', 2);
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('play');
  });
});
