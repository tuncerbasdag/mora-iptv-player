/**
 * Canlı TV ekranı (liveScreen.ts) karakterizasyon testleri: gerçek Chrome'da, sahte oynatıcı/depo ile.
 * Amaç, ekranı parçalara bölerken (refactor) davranışın değişmediğini doğrulamak. `npm run test:e2e`.
 */
import { expect, test, type Page } from '@playwright/test';

type StartOptions = Parameters<Window['__start']>[0];

async function open(page: Page, opts: StartOptions = {}): Promise<void> {
  await page.goto('/');
  await page.evaluate((o) => window.__start(o), opts);
}

const categoryRows = (page: Page) => page.locator('.list-row.cat-row');
const channelRows = (page: Page) => page.locator('.list-row[data-item-id]');
const channelNames = (page: Page) => channelRows(page).locator('.row-label').allTextContents();
const search = (page: Page) => page.locator('input[type="search"]');
const focusedId = (page: Page) => page.locator('.focused').first().getAttribute('data-focus-id');
const calls = (page: Page) => page.evaluate(() => window.__h);
/** Önizleme kartındaki kanal adı (listedeki satır etiketleri <span>, bu bir <div>). */
const previewName = (page: Page, name: string) => page.locator(`div:text-is("${name}")`);
/** Görünür yükleme halkasının yüzdesi; görünmüyorsa null. */
const ring = (page: Page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="progressbar"]')].find((e) => getComputedStyle(e).display !== 'none');
    return el ? Number(el.getAttribute('aria-valuenow')) : null;
  });

async function selectCategory(page: Page, name: string): Promise<void> {
  await categoryRows(page).filter({ hasText: name }).click();
}

test.describe('list and categories', () => {
  test('Favorites + all categories are listed; Favorites is selected and empty on open', async ({ page }) => {
    await open(page);
    expect(await categoryRows(page).locator('.row-label').allTextContents()).toEqual(['Favoriler', 'ULUSAL', 'SPOR', 'YEREL', 'KİLİTLİ', 'EPG DENEME']);
    await expect(categoryRows(page).first()).toHaveClass(/active/);
    await expect(page.getByText('Favori listen boş')).toBeVisible();
  });

  test('when a category is selected the channels are numbered in order', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    expect(await channelNames(page)).toEqual(['TR:BEINSPORTS 1 HD', 'TR:BEINSPORTS 2 HD', 'TR:S SPORT']);
    expect(await channelRows(page).locator('.row-number').allTextContents()).toEqual(['01', '02', '03']);
    await expect(categoryRows(page).filter({ hasText: 'SPOR' })).toHaveClass(/active/);
  });

  test('a channel without a logo shows the abbreviation (initials)', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'ULUSAL');
    await expect(channelRows(page).first().locator('.channel-initials')).toHaveText('T1');
  });

  test('when a locked category is selected the PIN is requested, channels are not shown', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'KİLİTLİ');
    expect((await calls(page)).unlock).toEqual(['cat-3']);
    await expect(page.getByText('TR:GİZLİ KANAL')).toHaveCount(0);
  });
});

test.describe('search', () => {
  test('is independent of the category: channels in other categories are found too', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'ULUSAL');
    await search(page).fill('BRT');
    expect(await channelNames(page)).toEqual(['TR:BRT 1 HD', 'TR:BRT 3 HD', 'TR:BRT 3 (KIBRIS)']);
    await expect(page.getByText('3 sonuç')).toBeVisible();
    await expect(channelRows(page).first().locator('.hl')).toHaveText('BRT');
  });

  test('case-insensitive and Turkish-character-insensitive', async ({ page }) => {
    await open(page);
    await search(page).fill('kibris');
    expect(await channelNames(page)).toEqual([]);
    await search(page).fill('kıbrıs');
    expect(await channelNames(page)).toEqual(['TR:BRT 3 (KIBRIS)']);
  });

  test('channels in a locked category do not appear in search', async ({ page }) => {
    await open(page);
    await search(page).fill('GİZLİ');
    expect(await channelNames(page)).toEqual([]);
    await expect(page.getByText('Aramayla eşleşen kanal yok.')).toBeVisible();
  });

  test('the same channel is not listed more than once', async ({ page }) => {
    await open(page);
    await search(page).fill('TR:');
    const names = await channelNames(page);
    expect(names.length).toBe(new Set(names).size);
    expect(names.length).toBe(11); // 5 + 3 + 3 (kilitli hariç)
  });

  test('when cleared the selected category\'s channels come back', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    await search(page).fill('BRT');
    await page.locator('input[type="search"]').fill('');
    expect(await channelNames(page)).toEqual(['TR:BEINSPORTS 1 HD', 'TR:BEINSPORTS 2 HD', 'TR:S SPORT']);
  });
});

test.describe('preview and loading', () => {
  test('clicking a channel starts the stream, the row becomes active, statistics appear', async ({ page }) => {
    await open(page, { loadMs: 300 });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).nth(1).click();
    expect((await calls(page)).calls.loadLive).toEqual(['http://fake.test/live/show.m3u8']);
    await expect(channelRows(page).nth(1)).toHaveClass(/active/);
    await expect(previewName(page, 'TR:SHOW TV HD')).toBeVisible();
    await expect(page.getByText('Kanal 02')).toBeVisible();
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
    await expect(page.getByText('4.850 kbit/s')).toBeVisible();
    await expect(page.getByText('H.264 · AAC')).toBeVisible();
  });

  test('the same player is reused when the channel changes', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).nth(0).click();
    await channelRows(page).nth(2).click();
    const h = await calls(page);
    expect(h.adaptersCreated).toBe(1);
    expect(h.calls.loadLive).toEqual(['http://fake.test/live/trt1.m3u8', 'http://fake.test/live/star.m3u8']);
  });

  test('the loading ring progresses smoothly between 0 and 100%, never falls back and closes when the stream starts', async ({ page }) => {
    await open(page, { loadMs: 2500 });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).first().click();
    const seen: number[] = [];
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(150);
      const v = await ring(page);
      if (v !== null) seen.push(v);
    }
    expect(seen.length).toBeGreaterThan(5);
    // Tampon yüzdesi hep 0 bildirilse bile halka 0'da donmaz...
    expect(Math.max(...seen.slice(0, 15))).toBeGreaterThan(10);
    // ...ve asla geri düşmez.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    // İlk kare gelince %100'e tamamlanıp kapanır.
    await expect.poll(() => ring(page), { timeout: 5000 }).toBeNull();
  });

  test('if the stream cannot open, "Yayın açılamadı" is shown and the ring closes', async ({ page }) => {
    await open(page, { playMode: 'fail' });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).first().click();
    await expect(page.getByText('Yayın açılamadı')).toBeVisible();
    await expect(page.getByText('Yayın yüklenemedi.')).toBeVisible();
    expect(await ring(page)).toBeNull();
  });

  test('a provider block (account on another device) message is shown as is', async ({ page }) => {
    await open(page, { playMode: 'blocked' });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).first().click();
    await expect(page.getByText('Hesap başka bir cihazda kullanılıyor.')).toBeVisible();
  });
});

test.describe('favorites', () => {
  test('the playing channel is added to/removed from favorites; it is reflected in the Favorites category', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    await channelRows(page).nth(1).click();
    const fav = page.getByText('Favorilere ekle');
    await expect(fav).toBeVisible();
    await fav.click();
    await expect(page.getByText('Favorilerden çıkar')).toBeVisible();
    expect(await page.evaluate(() => window.__h.favorites())).toEqual(['bein2']);
    await expect(channelRows(page).nth(1).locator('.favorite-star')).toHaveText('★');

    await selectCategory(page, 'Favoriler');
    expect(await channelNames(page)).toEqual(['TR:BEINSPORTS 2 HD']);

    await page.getByText('Favorilerden çıkar').click();
    expect(await page.evaluate(() => window.__h.favorites())).toEqual([]);
  });

  test('the Favorites category shows favorite-marked channels in category order', async ({ page }) => {
    await open(page, { favorites: ['brt3', 'trt1', 'bein2'] });
    expect(await channelNames(page)).toEqual(['TR:TRT 1 HD', 'TR:BEINSPORTS 2 HD', 'TR:BRT 3 HD']);
  });
});

test.describe('navigation and callbacks', () => {
  test('Enter: goes fullscreen on the playing channel (with the category id)', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).nth(1).click();
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
    await channelRows(page).nth(1).click(); // oynayan kanala tekrar
    await expect.poll(async () => (await calls(page)).fullscreen).toEqual([{ id: 'show', categoryId: 'cat-0' }]);
  });

  test('the Back key calls onBack', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Escape');
    expect((await calls(page)).back).toBe(1);
  });

  test('arrow keys: category → channel list → between channels', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'ULUSAL');
    expect(await focusedId(page)).toBe('ch-cat-0-0'); // seçince ilk kanala odak
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('ch-cat-0-1');
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('ch-cat-0-2');
    await page.keyboard.press('ArrowUp');
    expect(await focusedId(page)).toBe('ch-cat-0-1');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('cat-0'); // kanal listesinden sola: açık kategoriye
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('cat-1');
    // Açık olmayan kategoriden sağa basınca kanal listesine geçilmez (önce Enter ile açılmalı).
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('cat-1');
    await page.keyboard.press('ArrowUp');
    expect(await focusedId(page)).toBe('cat-0');
    await page.keyboard.press('ArrowRight'); // açık kategoriden sağa: kanal listesine
    expect((await focusedId(page))?.startsWith('ch-cat-0-')).toBe(true);
  });

  test('a channel is selected with Enter (the remote\'s OK key)', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await calls(page)).calls.loadLive).toEqual(['http://fake.test/live/bein2.m3u8']);
  });
});

test('return from fullscreen (resume): the playing channel continues in the preview without reloading', async ({ page }) => {
  await open(page, { resume: true });
  expect((await calls(page)).calls.loadLive).toEqual([]);
  await expect(previewName(page, 'TR:SHOW TV HD')).toBeVisible();
  await expect(channelRows(page).nth(1)).toHaveClass(/active/);
  await expect(categoryRows(page).filter({ hasText: 'ULUSAL' })).toHaveClass(/active/);
});

test.describe('program guide (EPG)', () => {
  test('hint when no channel is selected; when focused, that channel\'s programmes are listed', async ({ page }) => {
    await open(page, { epg: true });
    await expect(page.getByText('Bir kanal seçtiğinde yayın akışı burada görünür.')).toBeVisible();
    await selectCategory(page, 'EPG DENEME');
    await expect(page.getByText('Yayın Akışı')).toBeVisible();
    await expect(page.getByText('Akşam Haberleri')).toBeVisible();
    await expect(page.getByText('Gece Filmi')).toBeVisible();
    await expect(page.getByText(/^\d{2}:\d{2} – \d{2}:\d{2}$/)).toHaveCount(2);
  });

  test('a channel with no programmes or no tvgId says "no program guide"', async ({ page }) => {
    await open(page, { epg: true });
    await selectCategory(page, 'EPG DENEME');
    await page.keyboard.press('ArrowDown'); // B: tvgId var ama program yok
    await expect(page.getByText('Bu kanal için yayın akışı yok')).toBeVisible();
    await page.keyboard.press('ArrowDown'); // C: tvgId yok
    await expect(page.getByText('Bu kanal için yayın akışı yok')).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // tekrar A
    await expect(page.getByText('Akşam Haberleri')).toBeVisible();
  });

  test('says "no program guide" if there is no EPG service; returns to the hint when going back to the category', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'EPG DENEME');
    await expect(page.getByText('Bu kanal için yayın akışı yok')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('Bir kanal seçtiğinde yayın akışı burada görünür.')).toBeVisible();
  });
});

test.describe('channel logos', () => {
  const logoCount = (page: Page, key: string) => page.evaluate(async (k) => (await fetch(`/__logo_count?k=${k}`)).json(), key);
  const key = () => `k${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  test('the abbreviation disappears when the logo loads, stays when it fails', async ({ page }) => {
    const k = key();
    await open(page, { logoKey: k });
    await selectCategory(page, 'LOGOLU');
    await expect(channelRows(page).nth(0)).toHaveClass(/list-row/);
    await expect(channelRows(page).nth(0).locator('.channel-logo')).toHaveClass(/has-logo/);
    await expect(channelRows(page).nth(0).locator('.channel-initials')).toHaveCount(0);
    // 2. kanalın logosu 404: kısaltma kalır, bir daha istenmez
    await expect(channelRows(page).nth(1).locator('.channel-initials')).toHaveText('L0');
    await expect(channelRows(page).nth(1).locator('.channel-logo')).not.toHaveClass(/has-logo/);
  });

  test('logos load in stages: the first 30 first, the rest as you scroll', async ({ page }) => {
    const k = key();
    await open(page, { logoKey: k });
    await selectCategory(page, 'LOGOLU');
    await expect.poll(() => logoCount(page, k)).toBe(30);
    await page.waitForTimeout(500);
    expect(await logoCount(page, k)).toBe(30);
    await channelRows(page).last().scrollIntoViewIfNeeded();
    await expect.poll(() => logoCount(page, k)).toBe(60);
  });
});

test.describe('long names (marquee)', () => {
  test('a name that does not fit in the focused row scrolls; stops when focus leaves', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'EPG DENEME');
    const longRow = channelRows(page).nth(3);
    await expect(longRow.locator('.row-label')).not.toHaveClass(/marquee/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(longRow.locator('.row-label')).toHaveClass(/marquee/);
    await page.keyboard.press('ArrowUp');
    await expect(longRow.locator('.row-label')).not.toHaveClass(/marquee/);
  });

  test('a row with a short name does not scroll', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    await expect(channelRows(page).first().locator('.row-label')).not.toHaveClass(/marquee/);
  });
});

test.describe('buffering and connection state while playing', () => {
  const emit = (page: Page, ev: string, ...args: unknown[]) => page.evaluate(([e, a]) => window.__h.emit(e as never, ...(a as unknown[])), [ev, args] as const);
  const conn = (page: Page) => page.getByText(/^(Bağlanıyor|Kararlı|Takılıyor|Kesildi)$/);

  async function play(page: Page): Promise<void> {
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).first().click();
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
    await expect(conn(page)).toHaveText('Kararlı');
  }

  test('before the first frame arrives a stall says "Bağlanıyor", not "Takılıyor"; after the first frame it says "Takılıyor"', async ({ page }) => {
    await open(page, { playMode: 'never' });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).first().click();
    await emit(page, 'buffering'); // ilk kare henüz gelmedi
    await expect(conn(page)).toHaveText('Bağlanıyor');
    await emit(page, 'playing');
    await expect(conn(page)).toHaveText('Kararlı');
    await emit(page, 'buffering'); // artık oynuyordu, bu gerçek bir kesinti
    await expect(conn(page)).toHaveText('Takılıyor');
  });

  test('the ring does not appear on a short pause', async ({ page }) => {
    await open(page);
    await play(page);
    await emit(page, 'buffering');
    await expect(conn(page)).toHaveText('Takılıyor');
    await emit(page, 'playing');
    await page.waitForTimeout(600);
    expect(await ring(page)).toBeNull();
    await expect(conn(page)).toHaveText('Kararlı');
  });

  test('on a long pause the ring shows the buffer fill, completes to 100% and closes when playback resumes', async ({ page }) => {
    await open(page);
    await play(page);
    await emit(page, 'buffering');
    await page.waitForTimeout(550);
    expect(await ring(page)).toBe(0);
    await emit(page, 'bufferprogress', 60);
    expect(await ring(page)).toBe(60);
    await emit(page, 'playing');
    expect(await ring(page)).toBe(100);
    await expect.poll(() => ring(page), { timeout: 3000 }).toBeNull();
    await expect(conn(page)).toHaveText('Kararlı');
  });

  test('if the player errors the connection is retried (the same address is loaded again)', async ({ page }) => {
    await open(page);
    await play(page);
    // Yeniden bağlanınca yayın hemen gelmesin: "Takılıyor" durumu kararlı biçimde gözlenebilsin.
    await page.evaluate(() => (window.__h.opts.playMode = 'never'));
    await emit(page, 'error');
    await expect(conn(page)).toHaveText('Kesildi');
    await expect.poll(async () => (await calls(page)).calls.loadLive.length, { timeout: 6000 }).toBe(2);
    expect((await calls(page)).calls.loadLive).toEqual(['http://fake.test/live/trt1.m3u8', 'http://fake.test/live/trt1.m3u8']);
    await expect(conn(page)).toHaveText('Takılıyor');
  });

  test('if the first frame does not arrive within 15 seconds an error is shown', async ({ page }) => {
    await page.clock.install();
    await open(page, { playMode: 'never' });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).first().click();
    expect(await ring(page)).not.toBeNull();
    await page.clock.fastForward(16_000);
    await expect(page.getByText('15 saniye içinde yayın başlatılamadı.')).toBeVisible();
    await expect(page.getByText('Yayın açılamadı')).toBeVisible();
    expect(await ring(page)).toBeNull();
  });

  test('when a new channel is selected the result of the previous load does not break the new one', async ({ page }) => {
    await open(page, { loadMs: 1500 });
    await selectCategory(page, 'ULUSAL');
    await channelRows(page).nth(0).click();
    await channelRows(page).nth(2).click(); // ilki yüklenirken ikincisi
    await expect(previewName(page, 'TR:STAR TV HD')).toBeVisible();
    await expect(page.getByText('1080p · 25 fps')).toBeVisible({ timeout: 6000 });
    await expect(channelRows(page).nth(2)).toHaveClass(/active/);
    await expect(channelRows(page).nth(0)).not.toHaveClass(/active/);
  });
});

test.describe('keyboard shortcut and focus rules', () => {
  test('the F key adds/removes the focused channel to/from favorites; an f typed in the search box does not count', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    await page.keyboard.press('ArrowDown'); // 2. kanal
    await page.keyboard.press('f');
    expect(await page.evaluate(() => window.__h.favorites())).toEqual(['bein2']);
    await page.keyboard.press('f');
    expect(await page.evaluate(() => window.__h.favorites())).toEqual([]);
    await search(page).click();
    await page.keyboard.type('f');
    expect(await page.evaluate(() => window.__h.favorites())).toEqual([]);
  });

  async function playAndGoRight(page: Page): Promise<void> {
    await selectCategory(page, 'ULUSAL');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // 3. kanal
    await page.keyboard.press('Enter');
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
  }

  test('right from the channel list: first the preview box, then Down to the favorite button', async ({ page }) => {
    await open(page);
    await playAndGoRight(page);
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('preview');
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('preview-info');
  });

  test('left from the preview: returns to the playing channel\'s row (even if scrolled in the list)', async ({ page }) => {
    await open(page);
    await playAndGoRight(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown'); // favori düğmesi
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('ch-cat-0-2');
  });

  test('if the playing channel is not visible in the open category, left from the preview goes to the FIRST row of the list', async ({ page }) => {
    await open(page);
    await playAndGoRight(page);
    await categoryRows(page).filter({ hasText: 'YEREL' }).click(); // başka kategori açıldı
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('preview');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('ch-cat-2-0');
  });

  test('return left to the open category: left from the channel list always goes to the OPEN category', async ({ page }) => {
    await open(page);
    await selectCategory(page, 'SPOR');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('cat-1');
  });

  test('Enter on the preview box: fullscreen; up/down does not jump between groups', async ({ page }) => {
    await open(page);
    await playAndGoRight(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await calls(page)).fullscreen).toEqual([{ id: 'star', categoryId: 'cat-0' }]);
    await page.keyboard.press('ArrowUp');
    expect(await focusedId(page)).toBe('preview'); // en üstte: kategori/kanal listesine sıçramaz
  });
});
