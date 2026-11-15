/**
 * Ayarlar ekranları karakterizasyon testleri (bağlantı listesi, Bağlantı Ekle/Düzenle formu, tema, dil, otomatik güncelleme,
 * EPG, ebeveyn kilidi sayfaları). Uygulama harness'ı (/app) üzerinden gerçek ekranlar, bellek deposu ve sahte oynatıcı ile.
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__appStart']>[0]>;

async function open(page: Page, opts: Opts = {}): Promise<void> {
  await page.goto('/app');
  await page.evaluate((o) => window.__appStart(o), opts);
}
async function openSettings(page: Page, opts: Opts = {}): Promise<void> {
  await open(page, opts);
  await page.locator('[data-focus-id="settings-btn"]').click();
}
const press = (page: Page, key: string, times = 1) => (async () => { for (let i = 0; i < times; i++) await page.keyboard.press(key); })();
const focusedId = (page: Page) => page.locator('.focused').first().getAttribute('data-focus-id');
const settings = (page: Page) => page.evaluate(() => window.__app.settings());
const field = (page: Page, id: string) => page.locator(`[data-focus-id="${id}"] input`);
const fieldError = (page: Page, id: string) => page.locator(`[data-focus-id="${id}"]`).locator('xpath=ancestor::*[contains(@class,"field-wrap") or self::div][1]').locator('.field-error');
const errors = (page: Page) => page.locator('.field-error').allTextContents();

test.describe('connections list', () => {
  test('active connection card, counts and actions; menu pages', async ({ page }) => {
    await openSettings(page, { second: true });
    await expect(page.getByText('Deneme Listesi')).toBeVisible();
    await expect(page.getByText('Bağlı · 6 kanal · 3 film · 1 dizi')).toBeVisible();
    await expect(page.getByText('İkinci Liste')).toBeVisible();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
    await expect(page.locator('[data-focus-id="retry-btn"]')).toBeVisible();
    expect(await page.locator('[data-focus-id^="nav-"]').allTextContents()).toEqual(['Bağlantılar', 'Açılışta Otomatik Güncelle', 'Program Rehberi (EPG)', 'Tema', 'Altyazı', 'Dil', 'Ebeveyn Kilidi']);
  });

  test('clicking a card opens the edit form; you can switch to another page from the menu; Back returns to the home page', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-focus-id="conn-0"]').click();
    await expect(page.locator('[data-focus-id="f-name"]')).toBeVisible();
    await page.locator('[data-focus-id="nav-theme"]').click();
    await expect(page.getByText('Uygulamanın görünümünü seç.')).toBeVisible();
    await press(page, 'Escape');
    await expect(page.getByText('IPTV Player', { exact: true })).toBeVisible();
  });
});

test.describe('Add Connection form', () => {
  async function openAdd(page: Page, opts: Opts = {}): Promise<void> {
    await openSettings(page, opts);
    await page.locator('[data-focus-id="add-btn"]').click();
    await expect(page.locator('[data-focus-id="f-name"]')).toBeVisible();
  }

  test('start: M3U selected, hint visible, focus on the name field', async ({ page }) => {
    await openAdd(page);
    await expect(page.locator('[data-focus-id="kind-m3u"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-focus-id="kind-xtream"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Adres, .m3u veya .m3u8 uzantılı bir kanal listesine çıkmalı.')).toBeVisible();
    await expect(page.getByText('Önce bağlantı türünü seç.')).toBeVisible();
    await expect(page.locator('[data-focus-id="remote-btn"]')).toHaveCount(0);
    expect(await focusedId(page)).toBe('f-name');
  });

  test('validation: first the name, then the address; the error clears when typing', async ({ page }) => {
    await openAdd(page);
    await page.locator('[data-focus-id="save-btn"]').click();
    expect(await errors(page)).toEqual(['İsim girmek zorunlu.']);
    expect(await focusedId(page)).toBe('f-name');
    await field(page, 'f-name').fill('Yeni');
    expect(await errors(page)).toEqual([]);
    await page.locator('[data-focus-id="save-btn"]').click();
    expect(await errors(page)).toEqual(['Adres girmek zorunlu.']);
    await expect(page.getByText('Adres, .m3u veya .m3u8 uzantılı bir kanal listesine çıkmalı.')).toBeHidden();
    expect(await focusedId(page)).toBe('f-url');
    await field(page, 'f-url').fill('http://a.test/x.m3u');
    expect(await errors(page)).toEqual([]);
    await expect(page.getByText('Adres, .m3u veya .m3u8 uzantılı bir kanal listesine çıkmalı.')).toBeVisible();
    expect((await settings(page)).connections.length).toBe(1); // kaydedilmedi
  });

  test('save M3U: the connection is added, returns to the list screen', async ({ page }) => {
    await openAdd(page);
    await field(page, 'f-name').fill('Yeni Liste');
    await field(page, 'f-url').fill('  http://a.test/x.m3u  ');
    await page.locator('[data-focus-id="save-btn"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible(); // liste
    const c = (await settings(page)).connections;
    expect(c.length).toBe(2);
    expect(c[1].name).toBe('Yeni Liste');
    expect(c[1].source).toEqual({ kind: 'm3u', url: 'http://a.test/x.m3u' });
    expect((await settings(page)).activeConnectionId).toBe('c1'); // aktif bağlantı değişmez
    await expect(page.getByText('Yeni Liste')).toBeVisible();
  });

  test('Xtream: the fields change when the type changes, the name is kept; missing-field errors; show/hide password; save', async ({ page }) => {
    await openAdd(page);
    await field(page, 'f-name').fill('Hesabım');
    await page.locator('[data-focus-id="kind-xtream"]').click();
    await expect(page.locator('[data-focus-id="kind-xtream"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(field(page, 'f-name')).toHaveValue('Hesabım');
    await expect(page.locator('[data-focus-id="f-url"]')).toHaveCount(0);
    for (const id of ['f-server', 'f-user', 'f-pass']) await expect(page.locator(`[data-focus-id="${id}"]`)).toBeVisible();
    await page.locator('[data-focus-id="save-btn"]').click();
    expect(await errors(page)).toEqual(['Sunucu adresi girmek zorunlu.', 'Kullanıcı adı girmek zorunlu.', 'Şifre girmek zorunlu.']);
    expect(await focusedId(page)).toBe('f-server');
    await field(page, 'f-server').fill('http://x.test:8080');
    expect(await errors(page)).toEqual(['Kullanıcı adı girmek zorunlu.', 'Şifre girmek zorunlu.']);
    await field(page, 'f-user').fill('ali');
    await field(page, 'f-pass').fill('p@ss');
    await expect(field(page, 'f-pass')).toHaveAttribute('type', 'password');
    await page.locator('[data-focus-id="f-pass-eye"]').click();
    await expect(field(page, 'f-pass')).toHaveAttribute('type', 'text');
    await page.locator('[data-focus-id="save-btn"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
    const c = (await settings(page)).connections;
    expect(c[1].source).toMatchObject({ kind: 'xtream', server: 'http://x.test:8080', username: 'ali', password: 'p@ss' });
  });

  test('Cancel returns to the list; "Uzaktan Yükle" is visible only if configured', async ({ page }) => {
    await openAdd(page, { remote: true });
    await expect(page.locator('[data-focus-id="remote-btn"]')).toBeVisible();
    await page.locator('[data-focus-id="remote-btn"]').click();
    await expect(page.getByText('MAC adresi')).toBeVisible();
    await press(page, 'Escape');
    await page.locator('[data-focus-id="add-btn"]').click();
    await page.locator('[data-focus-id="cancel-btn"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
    expect((await settings(page)).connections.length).toBe(1);
  });

  test('vertical navigation: type → name → address → buttons; Back returns to the list', async ({ page }) => {
    await openAdd(page);
    expect(await focusedId(page)).toBe('f-name');
    await press(page, 'ArrowUp');
    expect((await focusedId(page))?.startsWith('kind-')).toBe(true);
    await press(page, 'ArrowDown', 2);
    expect(await focusedId(page)).toBe('f-url');
    await press(page, 'ArrowDown');
    expect(await focusedId(page)).toBe('save-btn');
    await press(page, 'ArrowRight');
    expect(await focusedId(page)).toBe('cancel-btn');
    await press(page, 'Escape');
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
  });
});

test.describe('Edit Connection form', () => {
  test('active connection: name and address filled, status summary, the "Bağlantı aktif" switch is on and cannot be turned off; Delete is present, no type cards', async ({ page }) => {
    await openSettings(page, { second: true });
    await page.locator('[data-focus-id="conn-0"]').click();
    await expect(field(page, 'f-name')).toHaveValue('Deneme Listesi');
    await expect(field(page, 'f-url')).toHaveValue('http://fake.test/list.m3u');
    await expect(page.getByText(/^M3U listesi · Aktif · /)).toBeVisible();
    await expect(page.locator('[data-focus-id="kind-m3u"]')).toHaveCount(0);
    await expect(page.locator('[data-focus-id="f-active"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-focus-id="f-active"]').click();
    await expect(page.locator('[data-focus-id="f-active"]')).toHaveAttribute('aria-checked', 'true'); // aktif doğrudan pasife alınamaz
    await expect(page.getByText('Aynı anda yalnızca bir bağlantı aktif olabilir.')).toBeVisible();
    await expect(page.getByText(/^Son kontrol: /)).toBeVisible();
    await expect(page.locator('[data-focus-id="delete-btn"]')).toBeVisible();
  });

  test('the name changes and is saved', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-focus-id="conn-0"]').click();
    await field(page, 'f-name').fill('Yeni Ad');
    await page.locator('[data-focus-id="save-btn"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
    expect((await settings(page)).connections[0].name).toBe('Yeni Ad');
    await expect(page.getByText('Yeni Ad')).toBeVisible();
  });

  test('an Xtream connection is edited with account fields; when an inactive connection is activated the other becomes inactive', async ({ page }) => {
    await openSettings(page, { second: true });
    await page.locator('[data-focus-id="conn-1"]').click();
    await expect(field(page, 'f-server')).toHaveValue('http://x.test:8080');
    await expect(field(page, 'f-user')).toHaveValue('ali');
    await expect(field(page, 'f-pass')).toHaveValue('gizli');
    await expect(page.getByText('Bunu aktif edersen şu an aktif olan “Deneme Listesi” pasif olur.')).toBeVisible();
    await expect(page.locator('[data-focus-id="f-active"]')).toHaveAttribute('aria-checked', 'false');
    await page.locator('[data-focus-id="f-active"]').click();
    await expect(page.locator('[data-focus-id="f-active"]')).toHaveAttribute('aria-checked', 'true');
    await field(page, 'f-user').fill('veli');
    await page.locator('[data-focus-id="save-btn"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
    const s = await settings(page);
    expect(s.activeConnectionId).toBe('c2');
    expect(s.connections[1].source).toMatchObject({ kind: 'xtream', username: 'veli' });
  });

  test('Delete: confirmation window; the connection is removed when confirmed; stays if cancelled', async ({ page }) => {
    await openSettings(page, { second: true });
    await page.locator('[data-focus-id="conn-1"]').click();
    await page.locator('[data-focus-id="delete-btn"]').click();
    await expect(page.getByText('“İkinci Liste” bağlantısını silmek istediğine emin misin?')).toBeVisible();
    await press(page, 'Escape'); // Geri yalnızca diyaloğu kapatır, formdan çıkmaz
    await expect(page.getByText('“İkinci Liste” bağlantısını silmek istediğine emin misin?')).toBeHidden();
    await expect(page.locator('[data-focus-id="delete-btn"]')).toBeVisible();
    expect((await settings(page)).connections.length).toBe(2);
    await page.locator('[data-focus-id="delete-btn"]').click();
    await page.locator('[data-focus-id="confirm-cancel"]').click(); // Vazgeç düğmesi de kapatır
    await expect(page.locator('[data-focus-id="delete-btn"]')).toBeVisible();
    await page.locator('[data-focus-id="delete-btn"]').click();
    await page.locator('[data-focus-id="confirm-ok"]').click();
    await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
    expect((await settings(page)).connections.map((c) => c.id)).toEqual(['c1']);
  });
});
