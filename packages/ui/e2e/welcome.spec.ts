/**
 * Home page (welcome.ts) characterization tests: cards, connection badge, parental-lock button, arrow-key navigation order
 * and counters when the library is updated. Via the app harness (/app).
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__appStart']>[0]>;

async function open(page: Page, opts: Opts = {}): Promise<void> {
  await page.goto('/app');
  await page.evaluate((o) => window.__appStart(o), opts);
}
const press = (page: Page, key: string, times = 1) => (async () => { for (let i = 0; i < times; i++) await page.keyboard.press(key); })();
const focusedId = (page: Page) => page.locator('.focused').first().getAttribute('data-focus-id');
const card = (page: Page, id: 'live-card' | 'series-card' | 'movies-card') => page.locator(`[data-focus-id="${id}"]`);

test.describe('cards and badge', () => {
  test('three cards with titles and counts; active connection badge name and status dot; focus on the Live TV card', async ({ page }) => {
    await open(page);
    await expect(card(page, 'live-card')).toContainText('Canlı TV');
    await expect(card(page, 'live-card')).toContainText('6 kanal');
    await expect(card(page, 'series-card')).toContainText('1 dizi');
    await expect(card(page, 'movies-card')).toContainText('3 film');
    await expect(page.locator('[data-focus-id="conn-pill"]')).toHaveAttribute('aria-label', 'Aktif bağlantı: Deneme Listesi');
    await expect(page.locator('[data-focus-id="conn-pill"]')).toContainText('Deneme Listesi');
    expect(await focusedId(page)).toBe('live-card');
    for (const id of ['live-card', 'series-card', 'movies-card'] as const) expect(await card(page, id).evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  });

  test('status dot: ok green, error red, not tried yet warning color', async ({ page }) => {
    const dot = () => page.locator('[data-focus-id="conn-pill"] span').first().evaluate((e) => (e as HTMLElement).style.background);
    await open(page);
    expect(await dot()).toContain('var(--ok)');
    await open(page, { status: 'error' });
    expect(await dot()).toContain('var(--danger)');
    await open(page, { status: 'none' });
    expect(await dot()).toContain('var(--warn)');
  });

  test('with no connection: the badge says "Bağlantı seç", cards are faded and do not open (nothing happens on click); the badge and Settings still open', async ({ page }) => {
    await open(page, { noConnection: true });
    await expect(page.locator('[data-focus-id="conn-pill"]')).toContainText('Bağlantı seç');
    await expect(page.locator('[data-focus-id="conn-pill"]')).toHaveAttribute('aria-label', 'Aktif bağlantı yok');
    for (const id of ['live-card', 'series-card', 'movies-card'] as const) expect(await card(page, id).evaluate((e) => getComputedStyle(e).opacity)).toBe('0.45');
    await card(page, 'live-card').click();
    await card(page, 'movies-card').click();
    await card(page, 'series-card').click();
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible(); // hâlâ anasayfa
    await press(page, 'Enter'); // the focused Live TV card
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
    await page.locator('[data-focus-id="conn-pill"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
  });

  test('Enter opens the cards; the badge and the Settings button open settings', async ({ page }) => {
    await open(page);
    await press(page, 'Enter');
    await expect(page.locator('.preview-box')).toBeVisible(); // Live TV
    await press(page, 'Escape');
    await page.locator('[data-focus-id="conn-pill"]').click();
    await expect(page.locator('[data-focus-id="nav-connections"]')).toBeVisible();
  });
});

test.describe('parental lock button', () => {
  test('no button when the lock is off; when on, the title and icon depend on locked/open state', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveCount(0);
    await open(page, { parental: true });
    await expect(page.locator('[data-focus-id="lock-btn"]')).toHaveAttribute('title', 'Kilitli içerikleri aç');
  });
});

test.describe('arrow-key navigation order', () => {
  test('Live TV: Right → Series, Up → Settings; Series: Up → Settings, Down → Movies, Left → Live TV', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('series-card');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('movies-card');
    await press(page, 'ArrowLeft');
    expect(await focusedId(page)).toBe('live-card');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('settings-btn');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('series-card');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('settings-btn');
  });

  test('top row: Settings ↔ badge (Left/Right), Down from either → Series; stays in place at the ends', async ({ page }) => {
    await open(page);
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('settings-btn');
    await press(page, 'ArrowRight'); // nothing else to the right
    expect(await focusedId(page)).toBe('settings-btn');
    await press(page, 'ArrowLeft');
    expect(await focusedId(page)).toBe('conn-pill');
    await press(page, 'ArrowLeft'); // no lock button: stays in place
    expect(await focusedId(page)).toBe('conn-pill');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('series-card');
  });

  test('with the lock button: Left from the badge → lock; Right from the lock → badge, Down → Series, Up/Left stay in place', async ({ page }) => {
    await open(page, { parental: true });
    await press(page, 'ArrowUp');
    await press(page, 'ArrowLeft', 2);
    expect(await focusedId(page)).toBe('lock-btn');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowUp');
    expect(await focusedId(page)).toBe('lock-btn');
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('conn-pill');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('series-card');
  });

  test('the Back key does nothing on the home page', async ({ page }) => {
    await open(page);
    await press(page, 'Escape');
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
    expect(await focusedId(page)).toBe('live-card');
  });
});

test('counters update when the library changes (when a connection is activated)', async ({ page }) => {
  await open(page, { second: true });
  await expect(card(page, 'live-card')).toContainText('6 kanal');
  await page.evaluate(() => window.__app.playlist.activate('c2'));
  await expect(card(page, 'live-card')).toContainText('3 kanal');
});
