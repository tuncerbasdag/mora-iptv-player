/**
 * Uygulama düzeyi karakterizasyon testleri (app.ts / startApp): ekranlar arası geçiş, Canlı TV ↔ tam ekran oynatıcı
 * devri, film/dizi geri dönüşü, dizi bölüm gezinmesi ve ebeveyn kilidi oturumu. Gerçek Chrome'da, sahte oynatıcı ile.
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__appStart']>[0]>;

async function open(page: Page, opts: Opts = {}): Promise<void> {
  await page.goto('/app');
  await page.evaluate((o) => window.__appStart(o), opts);
}
const press = (page: Page, key: string, times = 1) => (async () => { for (let i = 0; i < times; i++) await page.keyboard.press(key); })();
const adapters = (page: Page) => page.evaluate(() => window.__app.adapters.map((a) => ({ live: a.calls.loadLive, vod: a.calls.loadVod, stop: a.calls.stop, destroy: a.calls.destroy, moveTo: a.calls.moveTo })));
const emit = (page: Page, ev: string) => page.evaluate((e) => window.__app.emit(e as never), ev);

// Hangi ekranda olduğumuzu belirten işaretler
const welcome = (page: Page) => page.getByText('IPTV Player', { exact: true });
const liveScreen = (page: Page) => page.locator('.preview-box');
const liveOverlay = (page: Page) => page.locator('.status-bar'); // canlı tam ekranın durum çubuğu (mesaj yokken görünmez ama DOM'da)
const vodOverlay = (page: Page) => page.locator('.vod-bar');
const vodBrowser = (page: Page) => page.locator('#vod-grid');
const showDetail = (page: Page) => page.locator('[data-focus-id="play"]');
const pinScreen = (page: Page) => page.locator('.pin-grid');
const channelRows = (page: Page) => page.locator('.list-row[data-item-id]');
const catRow = (page: Page, name: string) => page.locator('.list-row.cat-row').filter({ hasText: name });
const card = (page: Page, text: string) => page.getByText(text, { exact: true }).first();

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const d of pin) await page.keyboard.press(d);
  await page.locator('[data-focus-id="pin-ok"]').click();
}

test.describe('home page and basic transitions', () => {
  test('connection name, counts and theme; cards open the related screen, Back returns to the home page', async ({ page }) => {
    await open(page, { theme: 'theme6' });
    await expect(welcome(page)).toBeVisible();
    await expect(page.getByText('Deneme Listesi')).toBeVisible();
    await expect(page.getByText('6 kanal')).toBeVisible();
    await expect(page.getByText('3 film')).toBeVisible();
    await expect(page.getByText('1 dizi')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('theme6');

    await card(page, 'Canlı TV').click();
    await expect(liveScreen(page)).toBeVisible();
    await press(page, 'Escape');
    await expect(welcome(page)).toBeVisible();

    await card(page, 'Filmler').click();
    await expect(vodBrowser(page)).toBeVisible();
    await press(page, 'Escape');
    await expect(welcome(page)).toBeVisible();

    await card(page, 'Diziler').click();
    await expect(vodBrowser(page)).toBeVisible();
    await press(page, 'Escape');
    await expect(welcome(page)).toBeVisible();
  });

  test('the Settings button (unlocked) opens the settings screen; there is no lock button', async ({ page }) => {
    await open(page);
    await page.locator('[data-focus-id="settings-btn"]').click();
    await expect(page.getByText('Bağlantılar').first()).toBeVisible();
    await expect(welcome(page)).toBeHidden();
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveCount(0);
  });
});

test.describe('Live TV ↔ fullscreen', () => {
  async function playSecond(page: Page): Promise<void> {
    await card(page, 'Canlı TV').click();
    await catRow(page, 'ULUSAL').click();
    await channelRows(page).nth(1).click();
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
  }

  test('Enter again on the previewed channel: the same player moves to fullscreen (not reloaded); Back returns to the preview with the same channel', async ({ page }) => {
    await open(page);
    await playSecond(page);
    await channelRows(page).nth(1).click(); // tekrar → tam ekran
    await expect(liveOverlay(page)).toBeAttached();
    await expect(liveScreen(page)).toBeHidden();
    let a = await adapters(page);
    expect(a.length).toBe(1);
    expect(a[0].live).toEqual(['http://fake.test/live/show.m3u8']);

    await press(page, 'Escape');
    await expect(liveScreen(page)).toBeVisible();
    await expect(channelRows(page).nth(1)).toHaveClass(/active/);
    a = await adapters(page);
    expect(a.length).toBe(1); // yeni oynatıcı açılmadı
    expect(a[0].live.length).toBe(1); // yeniden yüklenmedi
    expect(a[0].destroy).toBe(0);
    expect(a[0].moveTo).toBeGreaterThanOrEqual(2); // önizleme → tam ekran → önizleme
  });

  test('Down/Up in fullscreen: next/previous channel in the category the user is looking at; wraps to the start/end at the ends', async ({ page }) => {
    await open(page);
    await card(page, 'Canlı TV').click();
    await catRow(page, 'ULUSAL').click();
    await channelRows(page).nth(0).click();
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
    await channelRows(page).nth(0).click();
    await expect(liveOverlay(page)).toBeAttached();
    // Tek yayın koruması hızlı art arda kanal değişimlerini birleştirir; her adım beklenir.
    const lastLoaded = async () => {
      const urls = (await adapters(page))[0].live;
      return urls[urls.length - 1];
    };
    await press(page, 'ArrowDown');
    await expect.poll(lastLoaded).toBe('http://fake.test/live/show.m3u8');
    await press(page, 'ArrowDown');
    await expect.poll(lastLoaded).toBe('http://fake.test/live/star.m3u8');
    await press(page, 'ArrowDown'); // 3 kanal: başa sarar
    await expect.poll(lastLoaded).toBe('http://fake.test/live/trt1.m3u8');
    await press(page, 'ArrowUp'); // sona sarar
    await expect.poll(lastLoaded).toBe('http://fake.test/live/star.m3u8');
    // Geri: kanal değiştirilmişti → Canlı TV'ye şu an oynayan kanalla (STAR) dönülür
    await press(page, 'Escape');
    await expect(liveScreen(page)).toBeVisible();
    await expect(catRow(page, 'ULUSAL')).toHaveClass(/active/);
    await expect(channelRows(page).nth(2)).toHaveClass(/active/);
  });

  test('returning from the fullscreen of a channel opened from the Favorites category keeps Favorites open', async ({ page }) => {
    await open(page);
    await card(page, 'Canlı TV').click();
    await catRow(page, 'SPOR').click();
    await channelRows(page).nth(1).click();
    await expect(page.getByText('Favorilere ekle')).toBeVisible();
    await page.getByText('Favorilere ekle').click();
    await catRow(page, 'Favoriler').click();
    await channelRows(page).first().click(); // zaten önizlemede oynayan kanal: doğrudan tam ekran
    await expect(liveOverlay(page)).toBeAttached();
    await press(page, 'Escape');
    await expect(liveScreen(page)).toBeVisible();
    await expect(catRow(page, 'Favoriler')).toHaveClass(/active/);
  });

  test('Back from Live TV returns to the home page and closes the player', async ({ page }) => {
    await open(page);
    await playSecond(page);
    await press(page, 'Escape');
    await expect(welcome(page)).toBeVisible();
    expect((await adapters(page))[0].destroy).toBe(1);
  });
});

test.describe('movies', () => {
  test('open a movie → player; Back → the browser returns with the SAME search and focus; it resets when re-entering from the home page', async ({ page }) => {
    await open(page);
    await card(page, 'Filmler').click();
    await page.locator('input[type="search"]').fill('Film 2');
    await page.locator('#vod-grid .vod-card').first().click();
    await expect(vodOverlay(page)).toBeVisible();
    await expect(page.locator('.vod-bar-title')).toHaveText('Film 2');
    expect((await adapters(page))[0].vod).toEqual(['http://fake.test/movie/m2.mp4']);

    await press(page, 'Escape');
    await expect(vodBrowser(page)).toBeVisible();
    await expect(page.locator('input[type="search"]')).toHaveValue('Film 2');
    expect((await adapters(page))[0].destroy).toBe(1);

    await press(page, 'Escape'); // anasayfa
    await expect(welcome(page)).toBeVisible();
    await card(page, 'Filmler').click();
    await expect(page.locator('input[type="search"]')).toHaveValue('');
  });

  test('when a movie ends (ended) it returns to the browser', async ({ page }) => {
    await open(page);
    await card(page, 'Filmler').click();
    await page.locator('#vod-grid .vod-card').nth(1).click();
    await expect(page.locator('.vod-bar-title')).toHaveText('Film 2');
    await page.waitForTimeout(500);
    await emit(page, 'ended');
    await expect(vodBrowser(page)).toBeVisible();
  });
});

test.describe('series', () => {
  async function openEpisode(page: Page, season: number, episode: number): Promise<void> {
    await card(page, 'Diziler').click();
    await page.locator('#vod-grid .vod-card').first().click(); // dizi detayı
    await expect(showDetail(page)).toBeVisible();
    await page.locator(`[data-focus-id="ep-${season}-${episode}"]`).click();
    await expect(vodOverlay(page)).toBeVisible();
  }

  test('series → detail → episode: the player shows the episode info; Back to the detail, Back again to the series list', async ({ page }) => {
    await open(page);
    await openEpisode(page, 0, 0);
    await expect(page.locator('.vod-bar-title')).toHaveText('Gece Yarısı');
    await expect(page.locator('.vod-bar-sub')).toContainText('Sezon 1 · Bölüm 1');
    await press(page, 'Escape');
    await expect(showDetail(page)).toBeVisible();
    await press(page, 'Escape');
    await expect(vodBrowser(page)).toBeVisible();
    await press(page, 'Escape');
    await expect(welcome(page)).toBeVisible();
  });

  test('when an episode ends the next episode (crossing the season boundary too) opens automatically; at the last episode it returns to the detail', async ({ page }) => {
    await open(page);
    await openEpisode(page, 0, 0);
    const urls = async () => (await adapters(page)).flatMap((a) => a.vod);
    await page.waitForTimeout(500);
    await emit(page, 'ended');
    await expect.poll(urls).toEqual(['http://fake.test/series/s1e1.mp4', 'http://fake.test/series/s1e2.mp4']);
    await page.waitForTimeout(500);
    await emit(page, 'ended'); // 2. sezona geçer
    await expect.poll(urls).toContain('http://fake.test/series/s2e1.mp4');
    await page.waitForTimeout(500);
    await emit(page, 'ended');
    await expect.poll(urls).toContain('http://fake.test/series/s2e2.mp4');
    await page.waitForTimeout(500);
    await emit(page, 'ended'); // son bölüm: detaya dön
    await expect(showDetail(page)).toBeVisible();
  });

  test('previous/next episode buttons: no "previous" on the first episode, no "next" on the last', async ({ page }) => {
    await open(page);
    await openEpisode(page, 0, 0);
    await expect(page.locator('.vod-ctl[aria-label="Önceki bölüm"]')).toHaveCount(0);
    await expect(page.locator('.vod-ctl[aria-label="Sonraki bölüm"]')).toHaveCount(1);
    await press(page, 'Escape');
    await page.locator('[data-focus-id="season-1"]').click();
    await page.locator('[data-focus-id="ep-1-1"]').click();
    await expect(vodOverlay(page)).toBeVisible();
    await expect(page.locator('.vod-bar-sub')).toContainText('Sezon 2 · Bölüm 2');
    await expect(page.locator('.vod-ctl[aria-label="Sonraki bölüm"]')).toHaveCount(0);
    await expect(page.locator('.vod-ctl[aria-label="Önceki bölüm"]')).toHaveCount(1);
  });

  test('the next/previous button changes the episode (at a season boundary, to the previous season\'s last episode)', async ({ page }) => {
    await open(page);
    await card(page, 'Diziler').click();
    await page.locator('#vod-grid .vod-card').first().click();
    await page.locator('[data-focus-id="season-1"]').click();
    await page.locator('[data-focus-id="ep-1-0"]').click(); // S2E1
    await expect(vodOverlay(page)).toBeVisible();
    await page.waitForTimeout(500);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown'); // düğmelere
    await press(page, 'ArrowLeft', 2); // oynat → geri 10 → önceki bölüm
    await press(page, 'Enter');
    await expect.poll(async () => (await adapters(page)).flatMap((a) => a.vod)).toContain('http://fake.test/series/s1e2.mp4');
    await expect(page.locator('.vod-bar-sub')).toContainText('Sezon 1 · Bölüm 2');
  });
});

test.describe('parental lock', () => {
  test('with the lock off there is no lock button and the adult category is free', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveCount(0);
    await card(page, 'Canlı TV').click();
    await catRow(page, 'XXX ADULT').click();
    await expect(page.getByText('TR:GİZLİ KANAL')).toBeVisible();
  });

  test('locked category: the PIN is asked; wrong PIN message; the correct PIN opens the category and the session becomes open', async ({ page }) => {
    await open(page, { parental: true });
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveAttribute('aria-label', 'Kilitli içerikleri aç');
    await card(page, 'Canlı TV').click();
    await expect(catRow(page, 'XXX ADULT').locator('.cat-lock')).toHaveCount(1);
    await catRow(page, 'XXX ADULT').click();
    await expect(pinScreen(page)).toBeVisible();
    await enterPin(page, '1234');
    await expect(page.getByText('Yanlış PIN. Tekrar dene.')).toBeVisible();
    await enterPin(page, '0000');
    await expect(liveScreen(page)).toBeVisible();
    await expect(catRow(page, 'XXX ADULT')).toHaveClass(/active/);
    await expect(page.getByText('TR:GİZLİ KANAL')).toBeVisible();
    await press(page, 'Escape');
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveAttribute('aria-label', 'Yeniden kilitle');
  });

  test('if cancelled on the PIN screen it returns to Live TV, the category stays locked', async ({ page }) => {
    await open(page, { parental: true });
    await card(page, 'Canlı TV').click();
    await catRow(page, 'XXX ADULT').click();
    await expect(pinScreen(page)).toBeVisible();
    await press(page, 'Escape');
    await expect(liveScreen(page)).toBeVisible();
    await expect(catRow(page, 'XXX ADULT').locator('.cat-lock')).toHaveCount(1);
  });

  test('the lock button on the home page: opens with the PIN, locks again when pressed again', async ({ page }) => {
    await open(page, { parental: true });
    await page.locator('[data-focus-id="lock-btn"]').click();
    await expect(pinScreen(page)).toBeVisible();
    await enterPin(page, '0000');
    await expect(welcome(page)).toBeVisible();
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveAttribute('aria-label', 'Yeniden kilitle');
    await page.locator('[data-focus-id="lock-btn"]').click();
    await expect(welcome(page)).toBeVisible();
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveAttribute('aria-label', 'Kilitli içerikleri aç');
  });

  test('if Settings is locked (lockSettings) it asks for the PIN; once per visit, again when returning to the home page', async ({ page }) => {
    await open(page, { parental: true, lockSettings: true });
    await page.locator('[data-focus-id="settings-btn"]').click();
    await expect(pinScreen(page)).toBeVisible();
    await expect(page.getByText('Ayarlara girmek için PIN gir.')).toBeVisible();
    await enterPin(page, '0000');
    await expect(page.getByText('Bağlantılar').first()).toBeVisible();
    await expect(pinScreen(page)).toHaveCount(0);
    await press(page, 'Escape'); // anasayfa
    await expect(welcome(page)).toBeVisible();
    await page.locator('[data-focus-id="settings-btn"]').click();
    await expect(pinScreen(page)).toBeVisible(); // yeniden sorar
  });

  test('the Parental Lock pages always ask for the PIN (even if lockSettings is off)', async ({ page }) => {
    await open(page, { parental: true });
    await page.locator('[data-focus-id="settings-btn"]').click();
    await expect(page.getByText('Bağlantılar').first()).toBeVisible(); // Ayarlar serbest
    await page.getByText('Ebeveyn Kilidi').first().click();
    await expect(pinScreen(page)).toBeVisible();
    await expect(page.getByText('Ebeveyn kilidi ayarlarını değiştirmek için PIN gir.')).toBeVisible();
    await enterPin(page, '0000');
    await expect(pinScreen(page)).toHaveCount(0);
    await expect(page.getByText('Ebeveyn Kilidi').first()).toBeVisible();
  });
});

test('stop(): the open player is closed', async ({ page }) => {
  await open(page);
  await card(page, 'Canlı TV').click();
  await catRow(page, 'ULUSAL').click();
  await channelRows(page).first().click();
  await expect(page.getByText('1080p · 25 fps')).toBeVisible();
  await page.evaluate(() => window.__app.stop());
  expect((await adapters(page))[0].destroy).toBe(1);
});
