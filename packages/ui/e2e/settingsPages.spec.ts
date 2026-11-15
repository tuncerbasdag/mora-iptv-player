/**
 * Ayarlar sayfaları karakterizasyon testleri: Otomatik Güncelle, EPG, Tema, Dil ve Ebeveyn Kilidi (ana sayfa, PIN değiştirme
 * sihirbazı, kategori kilitleri). Uygulama harness'ı (/app) üzerinden gerçek ekranlar ve bellek deposu ile.
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__appStart']>[0]>;

async function openPage(page: Page, nav: 'auto' | 'epg' | 'theme' | 'subtitle' | 'language' | 'parental', opts: Opts = {}): Promise<void> {
  await page.goto('/app');
  await page.evaluate((o) => window.__appStart(o), opts);
  await page.locator('[data-focus-id="settings-btn"]').click();
  await page.locator(`[data-focus-id="nav-${nav}"]`).click();
}
const press = (page: Page, key: string, times = 1) => (async () => { for (let i = 0; i < times; i++) await page.keyboard.press(key); })();
const focusedId = (page: Page) => page.locator('.focused').first().getAttribute('data-focus-id');
const settings = (page: Page) => page.evaluate(() => window.__app.settings());
async function enterPin(page: Page, pin: string): Promise<void> {
  for (const d of pin) await page.keyboard.press(d);
  await page.locator('[data-focus-id="pin-ok"]').click();
}
/** Ebeveyn Kilidi sayfasına PIN (0000) ile girer. */
async function openParental(page: Page, opts: Opts = {}): Promise<void> {
  await openPage(page, 'parental', { parental: true, ...opts });
  await enterPin(page, '0000');
  await expect(page.locator('[data-focus-id="p-master"]')).toBeVisible();
}

test.describe('auto-update and EPG on open', () => {
  test('the switch toggles Off ↔ On and writes to the setting; "Son güncelleme" is visible', async ({ page }) => {
    await openPage(page, 'auto');
    const toggle = page.locator('[data-focus-id="toggle"]');
    await expect(toggle).toContainText('Kapalı');
    await expect(page.getByText(/^Son güncelleme: /)).toBeVisible();
    await toggle.click();
    await expect(toggle).toContainText('Açık');
    expect((await settings(page)).autoRefreshOnStart).toBe(true);
    await toggle.click();
    await expect(toggle).toContainText('Kapalı');
    expect((await settings(page)).autoRefreshOnStart).toBe(false);
  });

  test('the EPG switch changes the epgEnabled setting; Back returns to the home page', async ({ page }) => {
    await openPage(page, 'epg');
    await page.locator('[data-focus-id="toggle"]').click();
    await expect(page.locator('[data-focus-id="toggle"]')).toContainText('Açık');
    expect((await settings(page)).epgEnabled).toBe(true);
    await press(page, 'Escape');
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
  });

  test('Back button and navigation: switch → Back', async ({ page }) => {
    await openPage(page, 'auto');
    expect(await focusedId(page)).toBe('nav-auto'); // sayfaya menüden girildi: odak menüde
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('toggle');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('back-btn');
    await press(page, 'Enter');
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
  });
});

test.describe('theme and language', () => {
  test('six themes are listed; selecting applies data-theme, writes to the setting and marks the selected card', async ({ page }) => {
    await openPage(page, 'theme');
    expect(await page.locator('[data-focus-id^="theme-"]').count()).toBe(6);
    await expect(page.locator('[data-focus-id="theme-default"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-focus-id="theme-theme6"]').click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('theme6');
    expect((await settings(page)).theme).toBe('theme6');
    await expect(page.locator('[data-focus-id="theme-theme6"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-focus-id="theme-default"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-focus-id="theme-default"]').click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('default');
  });

  test('the saved theme is selected on open', async ({ page }) => {
    await openPage(page, 'theme', { theme: 'theme3' });
    await expect(page.locator('[data-focus-id="theme-theme3"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('four subtitle style groups are listed; selecting a card in each writes to the setting and is marked selected', async ({ page }) => {
    await openPage(page, 'subtitle');
    await expect(page.locator('[data-focus-id="subtitle-size-medium"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-focus-id="subtitle-size-large"]').click();
    expect((await settings(page)).subtitleStyle.size).toBe('large');
    await expect(page.locator('[data-focus-id="subtitle-size-large"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-focus-id="subtitle-size-medium"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-focus-id="subtitle-color-yellow"]').click();
    expect((await settings(page)).subtitleStyle.color).toBe('yellow');
    await page.locator('[data-focus-id="subtitle-background-opaque"]').click();
    expect((await settings(page)).subtitleStyle.background).toBe('opaque');
    await page.locator('[data-focus-id="subtitle-position-top"]').click();
    expect((await settings(page)).subtitleStyle.position).toBe('top');
  });

  test('the saved subtitle style is selected on open', async ({ page }) => {
    await openPage(page, 'subtitle', { subtitleStyle: { size: 'xlarge', color: 'cyan', background: 'translucent', position: 'middle-bottom' } });
    await expect(page.locator('[data-focus-id="subtitle-size-xlarge"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-focus-id="subtitle-color-cyan"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-focus-id="subtitle-background-translucent"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-focus-id="subtitle-position-middle-bottom"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('language: Turkish selected; English is "Yakında" and not selectable', async ({ page }) => {
    await openPage(page, 'language');
    await expect(page.locator('[data-focus-id="lang-tr"]')).toContainText('Şu an kullanılan dil');
    await expect(page.getByText('Yakında')).toBeVisible();
    await expect(page.getByText('Şimdilik yalnızca Türkçe kullanılabilir.')).toBeVisible();
    await page.getByText('English').click({ force: true }); // seçilemez (disabled görünümlü)
    expect((await settings(page)).language).toBe('tr');
  });
});

test.describe('parental lock page', () => {
  test('main switch: needs the PIN; turning off and on changes the setting', async ({ page }) => {
    await openParental(page);
    await expect(page.locator('[data-focus-id="p-master"]')).toContainText('Açık');
    await page.locator('[data-focus-id="p-master"]').click();
    await expect(page.locator('[data-focus-id="p-master"]')).toContainText('Kapalı');
    expect((await settings(page)).parental.enabled).toBe(false);
    // kapalıyken PIN ve içerik satırları gizli/pasif
    await expect(page.locator('[data-focus-id="p-adult"]')).toHaveCount(0);
    await page.locator('[data-focus-id="p-master"]').click();
    await expect(page.locator('[data-focus-id="p-adult"]')).toBeVisible();
    expect((await settings(page)).parental.enabled).toBe(true);
  });

  test('the adult categories and "Ayarlar" lock switches are written to the setting', async ({ page }) => {
    await openParental(page);
    await expect(page.locator('[data-focus-id="p-adult"]')).toContainText('Açık');
    await page.locator('[data-focus-id="p-adult"]').click();
    expect((await settings(page)).parental.lockAdult).toBe(false);
    await expect(page.locator('[data-focus-id="p-settings"]')).toContainText('Kapalı');
    await page.locator('[data-focus-id="p-settings"]').click();
    expect((await settings(page)).parental.lockSettings).toBe(true);
  });

  test('category locks: list (the adult category with an "already locked" note), the selected ones are written to the setting and the summary updates', async ({ page }) => {
    await openParental(page);
    await expect(page.getByText('Kategori seçilmedi')).toBeVisible();
    await page.locator('[data-focus-id="p-cats"]').click();
    expect(await page.locator('[data-focus-id^="pc-"]').count()).toBe(5);
    await expect(page.locator('[data-focus-id="pc-4"]')).toContainText('Yetişkin kategorisi olarak zaten kilitli');
    await page.locator('[data-focus-id="pc-2"]').click(); // SPOR
    await expect(page.locator('[data-focus-id="pc-2"]')).toContainText('Açık');
    expect((await settings(page)).parental.lockedCategories).toEqual(['SPOR']);
    await page.locator('[data-focus-id="back-btn"]').click();
    await expect(page.getByText('1 kategori')).toBeVisible();
  });

  test('a locked category is filtered from the library: SPOR now asks for the PIN in Live TV', async ({ page }) => {
    await openParental(page);
    await page.locator('[data-focus-id="p-cats"]').click();
    await page.locator('[data-focus-id="pc-2"]').click();
    await page.locator('[data-focus-id="back-btn"]').click();
    await press(page, 'Escape'); // Ayarlar → anasayfa
    await page.getByText('Canlı TV', { exact: true }).first().click();
    await expect(page.locator('.list-row.cat-row').filter({ hasText: 'SPOR' }).locator('.cat-lock')).toHaveCount(1);
  });
});

test.describe('PIN change wizard', () => {
  test('3 steps: current PIN, new PIN, confirm; start over if they do not match; after success the new PIN is valid, the old one is not', async ({ page }) => {
    await openParental(page);
    await page.locator('[data-focus-id="p-pin"]').click();
    await expect(page.getByText('Adım 1/3 · Mevcut PIN\'ini gir.')).toBeVisible();
    await enterPin(page, '0000');
    await expect(page.getByText('Adım 2/3 · Yeni 4 haneli PIN\'ini gir.')).toBeVisible();
    await enterPin(page, '4321');
    await expect(page.getByText('Adım 3/3 · Yeni PIN\'ini bir kez daha gir.')).toBeVisible();
    await enterPin(page, '1111'); // eşleşmedi
    await expect(page.getByText('PIN\'ler eşleşmedi. Yeni PIN\'i baştan gir.')).toBeVisible();
    await expect(page.getByText('Adım 2/3')).toBeVisible();
    await enterPin(page, '4321');
    await enterPin(page, '4321');
    await expect(page.locator('[data-focus-id="p-master"]')).toBeVisible(); // ebeveyn sayfasına dönüldü
    expect((await settings(page)).parental.pinHash).not.toBeNull();
    // anasayfada kilit düğmesi: eski PIN artık reddedilir, yenisi kabul edilir
    await press(page, 'Escape');
    await page.locator('[data-focus-id="lock-btn"]').click();
    await enterPin(page, '0000');
    await expect(page.getByText('Yanlış PIN. Tekrar dene.')).toBeVisible();
    await enterPin(page, '4321');
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveAttribute('aria-label', 'Yeniden kilitle');
  });

  test('a wrong current PIN gives an error at step 1; Cancel returns to the parental page', async ({ page }) => {
    await openParental(page);
    await page.locator('[data-focus-id="p-pin"]').click();
    await enterPin(page, '9999');
    await expect(page.getByText('Yanlış PIN. Tekrar dene.')).toBeVisible();
    await expect(page.getByText('Adım 1/3')).toBeVisible();
    await page.locator('[data-focus-id="cancel-btn"]').click();
    await expect(page.locator('[data-focus-id="p-master"]')).toBeVisible();
  });
});

test.describe('PIN keypad', () => {
  test('digits fill the boxes, Delete undoes, OK is inactive before 4 digits; Cancel/Back cancels', async ({ page }) => {
    await openPage(page, 'parental', { parental: true });
    const dots = () => page.locator('.pin-dot').count();
    await press(page, '1', 1);
    await page.keyboard.press('2');
    expect(await dots()).toBe(2);
    await page.locator('[data-focus-id="pin-del"]').click();
    expect(await dots()).toBe(1);
    await expect(page.locator('[data-focus-id="pin-ok"]')).toHaveClass(/disabled/);
    await page.locator('[data-focus-id="pin-ok"]').click(); // pasif: bir şey olmaz
    await expect(page.locator('.pin-grid')).toBeVisible();
    await page.locator('[data-focus-id="pin-5"]').click(); // ekran tuşuna tıklayarak da girilir
    expect(await dots()).toBe(2);
    await page.locator('[data-focus-id="cancel-btn"]').click();
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
  });
});

test.describe('update (desktop app only)', () => {
  const updates = (page: Page, opts: Opts = {}) => openPage(page, 'updates' as never, { updater: {}, ...opts });
  const call = (page: Page) => page.evaluate(() => window.__app.updater.calls);

  test('the menu item exists only when the platform provides an updater', async ({ page }) => {
    await page.goto('/app');
    await page.evaluate(() => window.__appStart({}));
    await page.locator('[data-focus-id="settings-btn"]').click();
    await expect(page.locator('[data-focus-id="nav-auto"]')).toBeVisible();
    await expect(page.locator('[data-focus-id="nav-updates"]')).toHaveCount(0);
    await page.goto('/app');
    await page.evaluate(() => window.__appStart({ updater: {} }));
    await page.locator('[data-focus-id="settings-btn"]').click();
    await expect(page.locator('[data-focus-id="nav-updates"]')).toBeVisible();
  });

  test('shows the current version; the button checks; the state drives the texts', async ({ page }) => {
    await updates(page);
    await expect(page.getByText('Mevcut sürüm: 0.0.1')).toBeVisible();
    await page.locator('[data-focus-id="update-action"]').click();
    expect(await call(page)).toEqual(['check']);
    await page.evaluate(() => window.__app.updater.set({ status: 'checking' }));
    await expect(page.getByTestId('update-status')).toHaveText('Denetleniyor…');
    await page.locator('[data-focus-id="update-action"]').click(); // disabled while checking
    expect(await call(page)).toEqual(['check']);
    await page.evaluate(() => window.__app.updater.set({ status: 'up-to-date' }));
    await expect(page.getByTestId('update-status')).toHaveText('Güncelsin');
  });

  test('new version → Download → progress → Restart and install', async ({ page }) => {
    await updates(page);
    await page.evaluate(() => window.__app.updater.set({ status: 'available', version: '0.0.2' }));
    await expect(page.getByTestId('update-status')).toContainText('0.0.2');
    await page.locator('[data-focus-id="update-action"]').click();
    expect(await call(page)).toEqual(['download']);
    await page.evaluate(() => window.__app.updater.set({ status: 'downloading', percent: 40 }));
    await expect(page.getByTestId('update-status')).toHaveText('İndiriliyor… %40');
    await page.evaluate(() => window.__app.updater.set({ status: 'ready' }));
    await expect(page.locator('[data-focus-id="update-action"]')).toHaveText('Yeniden başlat ve kur');
    await page.locator('[data-focus-id="update-action"]').click();
    expect(await call(page)).toEqual(['download', 'install']);
  });

  test('unsigned macOS (manual policy): the button opens the releases page instead of downloading', async ({ page }) => {
    await updates(page, { updater: { policy: 'manual', status: 'available', version: '0.0.2' } });
    await expect(page.locator('[data-focus-id="update-action"]')).toHaveText('İndirme sayfasını aç');
    await page.locator('[data-focus-id="update-action"]').click();
    expect(await call(page)).toEqual(['open-releases']);
  });

  test('error is shown with a retry; the Help menu opens the page and starts a check; Back returns home', async ({ page }) => {
    await updates(page, { updater: { status: 'error', message: 'ağ yok' } });
    await expect(page.getByTestId('update-status')).toHaveText('Denetlenemedi');
    await expect(page.getByText('ağ yok')).toBeVisible();
    await press(page, 'Escape');
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
    await page.evaluate(() => window.__app.updater.menuOpen());
    await expect(page.getByTestId('update-status')).toBeVisible();
    expect(await call(page)).toEqual(['check']);
  });
});
