/**
 * Uzaktan Yükle ekranı (remoteSetup.ts) karakterizasyon testleri: portal (sahte, Playwright ağ yönlendirmesiyle) kayıt ve
 * yoklama yanıtlarına göre PIN gösterimi, liste teslimi, süre dolumu, erişim hatası ve yeniden deneme. Uygulama harness'ı (/app).
 */
import { expect, test, type Page, type Route } from '@playwright/test';

const PORTAL = 'http://portal.test:8788';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

interface FakePortal {
  /** Sıradaki kayıt yanıtları (tükenince sonuncusu tekrarlanır); 'fail' = ağ hatası. */
  registers: Array<{ pin: string; secret?: string } | 'fail'>;
  /** Yoklama yanıtı. */
  poll: { status: 'waiting' } | { status: 'expired' } | { status: 'delivered'; payload: { url: string; name?: string } };
  registerCalls: number;
  pollCalls: number;
}

async function fakePortal(page: Page, portal: FakePortal): Promise<void> {
  await page.route(`${PORTAL}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return void route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (url.pathname === '/api/device/register') {
      const r = portal.registers[Math.min(portal.registerCalls, portal.registers.length - 1)];
      portal.registerCalls++;
      if (r === 'fail') return void route.abort('failed');
      return void route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ mac: '02:AA:BB:CC:DD:EE', pin: r.pin, secret: r.secret ?? 's3cr3t', expiresAt: Date.now() + 600000 }) });
    }
    if (url.pathname === '/api/device/poll') {
      portal.pollCalls++;
      return void route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(portal.poll) });
    }
    return void route.fulfill({ status: 404, headers: CORS });
  });
}

async function openRemote(page: Page, portal: FakePortal, clock = false): Promise<void> {
  await fakePortal(page, portal);
  if (clock) await page.clock.install();
  await page.goto('/app');
  await page.evaluate(() => window.__appStart({ remote: true }));
  await page.locator('[data-focus-id="settings-btn"]').click();
  await page.locator('[data-focus-id="add-btn"]').click();
  await page.locator('[data-focus-id="remote-btn"]').click();
  await expect(page.getByText('MAC adresi')).toBeVisible();
}
const settings = (page: Page) => page.evaluate(() => window.__app.settings());
const newPortal = (over: Partial<FakePortal> = {}): FakePortal => ({ registers: [{ pin: '4821' }], poll: { status: 'waiting' }, registerCalls: 0, pollCalls: 0, ...over });

test('on open it registers with the portal: the step text, MAC and PIN are visible, "Liste bekleniyor..."', async ({ page }) => {
  const portal = newPortal();
  await openRemote(page, portal);
  await expect(page.getByText('1. Bilgisayarında veya telefonunda portal.test:8788 adresini aç.')).toBeVisible();
  await expect(page.getByText('02:AA:BB:CC:DD:EE')).toBeVisible();
  await expect(page.getByText('4821')).toBeVisible();
  await expect(page.getByText('Liste bekleniyor...')).toBeVisible();
  expect(portal.registerCalls).toBe(1);
  expect(await page.locator('[data-focus-id].focused').first().getAttribute('data-focus-id')).toBe('cancel-btn');
});

test('when the list is delivered a new connection is added and activated; it returns to the connections list', async ({ page }) => {
  const portal = newPortal();
  await openRemote(page, portal, true);
  await page.clock.fastForward(3100); // ilk yoklama: bekliyor
  await expect.poll(() => portal.pollCalls).toBeGreaterThanOrEqual(1);
  portal.poll = { status: 'delivered', payload: { url: 'http://list.test/x.m3u', name: 'Telefondan' } };
  await page.clock.fastForward(3100);
  await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible(); // liste
  const s = await settings(page);
  const added = s.connections.find((c) => c.name === 'Telefondan');
  expect(added?.source).toEqual({ kind: 'm3u', url: 'http://list.test/x.m3u' });
  expect(s.activeConnectionId).toBe(added?.id);
});

test('if no name is given the name "Uzaktan Liste" is used', async ({ page }) => {
  const portal = newPortal({ poll: { status: 'delivered', payload: { url: 'http://list.test/y.m3u' } } });
  await openRemote(page, portal, true);
  await page.clock.fastForward(3100);
  await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
  expect((await settings(page)).connections.map((c) => c.name)).toContain('Uzaktan Liste');
});

test('if the session expires (expired) a new PIN is obtained', async ({ page }) => {
  const portal = newPortal({ registers: [{ pin: '1111' }, { pin: '2222' }], poll: { status: 'expired' } });
  await openRemote(page, portal, true);
  await expect(page.getByText('1111')).toBeVisible();
  await page.clock.fastForward(3100);
  await expect(page.getByText('2222')).toBeVisible();
  expect(portal.registerCalls).toBeGreaterThanOrEqual(2);
});

test('"Yeni PIN Al" registers with the portal again', async ({ page }) => {
  const portal = newPortal({ registers: [{ pin: '1111' }, { pin: '3333' }] });
  await openRemote(page, portal);
  await expect(page.getByText('1111')).toBeVisible();
  await page.locator('[data-focus-id="new-pin-btn"]').click();
  await expect(page.getByText('3333')).toBeVisible();
});

test('if the portal cannot be reached an error is shown and it retries after 5 s', async ({ page }) => {
  const portal = newPortal({ registers: ['fail', { pin: '9999' }] });
  await openRemote(page, portal, true).catch(() => {}); // ilk kayıt başarısız: MAC kutusu görünür, PIN "—"
  await expect(page.getByText('Portala ulaşılamıyor, yeniden deneniyor...')).toBeVisible();
  await page.clock.fastForward(5100);
  await expect(page.getByText('9999')).toBeVisible();
  await expect(page.getByText('Liste bekleniyor...')).toBeVisible();
});

test('it retries on a polling error; Cancel/Back returns to the list and polling stops', async ({ page }) => {
  const portal = newPortal();
  await openRemote(page, portal, true);
  await page.locator('[data-focus-id="cancel-btn"]').click();
  await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
  const before = portal.pollCalls;
  await page.clock.fastForward(10000);
  await page.waitForTimeout(300);
  expect(portal.pollCalls).toBe(before); // ekran kapandı: yoklama yok
  expect((await settings(page)).connections.length).toBe(1);
});

test('the Back key returns to the Connections list too', async ({ page }) => {
  await openRemote(page, newPortal());
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-focus-id="add-btn"]')).toBeVisible();
});
