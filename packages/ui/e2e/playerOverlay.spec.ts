/**
 * Oynatıcı katmanı (playerOverlay.ts) karakterizasyon testleri: gerçek Chrome'da, gerçek PlayerController,
 * sahte oynatıcı ile. Amaç, dosyayı parçalara bölerken davranışın değişmediğini doğrulamak. `npm run test:e2e`.
 */
import { expect, test, type Page } from '@playwright/test';

type Opts = NonNullable<Parameters<Window['__ovStart']>[0]>;

async function open(page: Page, opts: Opts = {}, clock = false): Promise<void> {
  if (clock) await page.clock.install();
  await page.goto('/overlay');
  await page.evaluate((o) => window.__ovStart(o), opts);
}
const play = (page: Page, key: 'live' | 'live2' | 'movie' | 'episode') => page.evaluate((k) => window.__o.play(k), key);
const emit = (page: Page, ev: string, ...args: unknown[]) => page.evaluate(([e, a]) => window.__o.emit(e as never, ...(a as unknown[])), [ev, args] as const);
const o = (page: Page) => page.evaluate(() => ({ back: window.__o.back, ended: window.__o.ended, prev: window.__o.prev, next: window.__o.next, steps: window.__o.steps, calls: window.__o.adapter.calls, time: window.__o.adapter.time, paused: window.__o.adapter.paused }));
const press = (page: Page, key: string) => page.keyboard.press(key);
/** `repeat: true` ile tuş (basılı tutma). */
/** Playwright'ın tanımadığı tuşlar (MediaPlay...) için doğrudan olay. */
const pressMedia = (page: Page, key: string) => page.evaluate((k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), key);
const pressRepeat = (page: Page, key: string) => page.evaluate((k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat: true, bubbles: true })), key);

const ring = (page: Page) =>
  page.evaluate(() => {
    const banner = document.querySelector<HTMLElement>('[data-role="load-banner"]');
    if (!banner || banner.style.display === 'none') return null;
    const el = banner.querySelector<HTMLElement>('[role="progressbar"]');
    const v = el?.getAttribute('aria-valuenow');
    return v == null ? null : Number(v);
  });
/** Canlı alt çubuğu (148px yüksekliğindeki bar): görünürlük ve saydamlık. */
const liveBar = (page: Page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('div')].find((d) => d.style.height === '148px');
    return el ? { display: el.style.display, opacity: el.style.opacity } : null;
  });
const vodBar = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.vod-bar');
    return el ? { display: el.style.display, opacity: el.style.opacity } : null;
  });
const centerMsg = (page: Page) =>
  page.evaluate(() => {
    const vodErr = [...document.querySelectorAll<HTMLElement>('div')].find((d) => d.style.marginTop === '150px');
    if (vodErr && vodErr.style.display !== 'none') return vodErr.textContent;
    const banner = document.querySelector<HTMLElement>('[data-role="load-banner"]');
    if (!banner || banner.style.display === 'none') return null;
    return banner.querySelector<HTMLElement>('[data-role="load-banner-text"]')?.textContent ?? null;
  });
const focusedCtl = (page: Page) => page.locator('.vod-ctl.focused, .vod-pill.focused').first().getAttribute('aria-label');
const clockOf = (page: Page) => page.locator('.vod-time').first().textContent();

test.describe('live stream', () => {
  test('loading: ring and "Yayın yükleniyor"; once playing the bottom bar shows name, group, resolution, bitrate, codec, "Kararlı"', async ({ page }) => {
    await open(page, { loadMs: 1200 });
    await play(page, 'live');
    await expect.poll(() => centerMsg(page)).toBe('Yayın yükleniyor');
    await expect.poll(() => ring(page)).toBeGreaterThan(0);
    await expect(page.getByText('TR:TRT 1 HD')).toBeVisible();
    await expect(page.getByText('ULUSAL')).toBeVisible();
    await expect(page.getByText('Bağlanıyor')).toBeVisible();
    // ilk kare gelince
    await expect(page.getByText('1080p · 25 fps')).toBeVisible();
    await expect(page.getByText('4.850 kbit/s')).toBeVisible();
    await expect(page.getByText('H.264 · AAC')).toBeVisible();
    await expect(page.getByText('Kararlı')).toBeVisible();
    await expect.poll(() => centerMsg(page)).toBeNull();
    await expect.poll(() => ring(page), { timeout: 3000 }).toBeNull();
    expect((await o(page)).calls.loadLive).toEqual(['http://fake.test/live/trt1.m3u8']);
  });

  test('the loading ring does not fall back', async ({ page }) => {
    await open(page, { loadMs: 2500 });
    await play(page, 'live');
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(150);
      const v = await ring(page);
      if (v !== null) seen.push(v);
    }
    expect(seen.length).toBeGreaterThan(5);
    expect(Math.max(...seen)).toBeGreaterThan(10);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  test('the bottom bar shows for 5 s once playing then disappears; reappears on a key press', async ({ page }) => {
    await open(page, {}, true);
    await play(page, 'live');
    await page.clock.fastForward(1000);
    await expect(page.getByText('Kararlı')).toBeVisible();
    expect(await liveBar(page)).toEqual({ display: 'flex', opacity: '1' });
    await page.clock.fastForward(5100);
    expect((await liveBar(page))?.opacity).toBe('0');
    await page.clock.fastForward(700);
    expect((await liveBar(page))?.display).toBe('none');
    await press(page, 'Enter'); // canlıda duraklatma yok; Tamam çubuğu gösterir
    expect(await liveBar(page)).toEqual({ display: 'flex', opacity: '1' });
    expect((await o(page)).calls.pause).toBe(0);
  });

  test('Down: shows the bottom bar but does not change channel; Up does nothing', async ({ page }) => {
    await open(page, { channels: [{ id: 'l2', name: 'TR:SHOW TV HD', group: 'ULUSAL', kind: 'live', url: 'http://fake.test/live/show.m3u8' }] }, true);
    await play(page, 'live');
    await page.clock.fastForward(1000);
    await expect(page.getByText('Kararlı')).toBeVisible();
    await page.clock.fastForward(5800); // bar kaybolsun, tuşla yeniden görünsün diye
    await press(page, 'ArrowDown');
    expect((await o(page)).steps).toEqual([]);
    expect((await o(page)).calls.loadLive).toEqual(['http://fake.test/live/trt1.m3u8']);
    expect(await liveBar(page)).toEqual({ display: 'flex', opacity: '1' });
    await press(page, 'ArrowUp');
    expect((await o(page)).steps).toEqual([]);
    expect((await o(page)).calls.loadLive.length).toBe(1);
  });

  test('remote CH+ / CH-: next / previous channel; holding does not skip repeatedly', async ({ page }) => {
    await open(page, { channels: [{ id: 'l2', name: 'TR:SHOW TV HD', group: 'ULUSAL', kind: 'live', url: 'http://fake.test/live/show.m3u8' }] });
    await play(page, 'live');
    await expect(page.getByText('Kararlı')).toBeVisible();
    // Tizen kumandası yalnızca keyCode gönderir (427 = CH+, 428 = CH-).
    const pressCode = (code: number, repeat = false) =>
      page.evaluate(([c, r]) => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: c as number, repeat: r as boolean, bubbles: true })), [code, repeat] as const);
    await pressCode(427);
    await expect.poll(async () => (await o(page)).calls.loadLive).toEqual(['http://fake.test/live/trt1.m3u8', 'http://fake.test/live/show.m3u8']);
    await pressCode(427, true);
    expect((await o(page)).steps).toEqual([1]);
    await pressCode(428);
    expect((await o(page)).steps).toEqual([1, -1]);
    await pressMedia(page, 'ChannelUp'); // tarayıcıdaki tuş adı da çalışır
    expect((await o(page)).steps).toEqual([1, -1, 1]);
  });

  test('diagnostics panel: "i" (or remote Info) toggles it; it shows buffer, mode and dropped frames and updates live', async ({ page }) => {
    await open(page);
    await play(page, 'live');
    await expect(page.getByText('Kararlı')).toBeVisible();
    await expect(page.getByText('Oynatıcı: hls.js')).toBeHidden();
    await press(page, 'i');
    await expect(page.getByText('Oynatıcı: hls.js')).toBeVisible();
    await expect(page.getByText('Tampon: 3.2 sn')).toBeVisible();
    await expect(page.getByText('Mod: düşük gecikme · Kesinti: 1')).toBeVisible();
    await expect(page.getByText('Düşen kare: 12 / 1450')).toBeVisible();
    await expect(page.getByText('12.3 waiting · tampon 0.4')).toBeVisible();
    await page.evaluate(() => {
      window.__o.adapter.diagnostics = { ...window.__o.adapter.diagnostics, bufferSeconds: 0.2, holding: true, droppedFrames: 40 };
    });
    await expect(page.getByText('Tampon: 0.2 sn (dolması bekleniyor)')).toBeVisible(); // 500 ms'de bir güncellenir
    await expect(page.getByText('Düşen kare: 40 / 1450')).toBeVisible();
    // Tizen kumandası Bilgi tuşunu yalnızca keyCode ile gönderir (457).
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 457, bubbles: true })));
    await expect(page.getByText('Oynatıcı: hls.js')).toBeHidden();
  });

  test('the Back key calls onBack', async ({ page }) => {
    await open(page);
    await play(page, 'live');
    await press(page, 'Escape');
    expect((await o(page)).back).toBe(1);
  });

  test('media keys do not pause live', async ({ page }) => {
    await open(page);
    await play(page, 'live');
    await expect(page.getByText('Kararlı')).toBeVisible();
    await pressMedia(page, 'MediaPlayPause');
    expect((await o(page)).calls.pause).toBe(0);
  });

  test('provider block: the error message is in the bar, "Kesildi"', async ({ page }) => {
    await open(page, { playMode: 'blocked' });
    await play(page, 'live');
    await expect(page.getByText('Hesap başka bir cihazda kullanılıyor.')).toBeVisible();
    await expect(page.getByText('Kesildi')).toBeVisible();
    expect(await ring(page)).toBeNull();
  });

  test('drop: "Yayın yeniden bağlanıyor", banner ring estimate; recovers when the stream returns', async ({ page }) => {
    await open(page);
    await play(page, 'live');
    await expect(page.getByText('Kararlı')).toBeVisible();
    await page.evaluate(() => window.__o.set({ playMode: 'never' })); // yeniden bağlanınca yayın hemen gelmesin
    await emit(page, 'error');
    await expect.poll(() => centerMsg(page), { timeout: 4000 }).toBe('Yayın yeniden bağlanıyor');
    await expect(page.getByText('Yeniden bağlanıyor', { exact: true })).toBeVisible();
    await expect.poll(() => ring(page), { timeout: 3000 }).toBeGreaterThan(0);
    await page.evaluate(() => window.__o.emit('playing')); // yayın geri geldi
    await expect(page.getByText('Kararlı')).toBeVisible();
    await expect.poll(() => centerMsg(page)).toBeNull();
  });

  test('buffering while playing: "Arabelleğe alınıyor" and the ring shows the buffer fill', async ({ page }) => {
    await open(page);
    await play(page, 'live');
    await expect(page.getByText('Kararlı')).toBeVisible();
    await emit(page, 'buffering');
    await expect.poll(() => centerMsg(page), { timeout: 3000 }).toBe('Arabelleğe alınıyor');
    await emit(page, 'bufferprogress', 40);
    await expect.poll(() => ring(page)).toBe(40);
    await emit(page, 'playing');
    await expect.poll(() => centerMsg(page)).toBeNull();
    await expect.poll(() => ring(page), { timeout: 3000 }).toBeNull();
  });

  test('destroy: listeners are released; the adapter is stopped (not stopped with keepAdapterAlive)', async ({ page }) => {
    await open(page);
    await play(page, 'live');
    await expect(page.getByText('Kararlı')).toBeVisible();
    await page.evaluate(() => window.__o.destroy(true));
    await press(page, 'Escape');
    let r = await o(page);
    expect(r.back).toBe(0);
    expect(r.calls.stop).toBe(0);
    expect(r.calls.destroy).toBe(0);
    await page.evaluate(() => window.__o.destroy());
    r = await o(page);
    expect(r.calls.stop).toBe(1);
    expect(r.calls.destroy).toBe(1);
  });
});

test.describe('movie/series', () => {
  async function playing(page: Page, key: 'movie' | 'episode' = 'movie', opts: Opts = {}): Promise<void> {
    await open(page, opts);
    await play(page, key);
    await expect.poll(async () => (await o(page)).calls.loadVod.length).toBe(1);
    await expect(page.locator('.vod-ctl[aria-label="Duraklat"]')).toBeAttached();
    await page.waitForTimeout(450); // 'playing' gelsin
  }

  test('movie bar: title, year · duration, duration indicators', async ({ page }) => {
    await playing(page);
    await expect(page.locator('.vod-bar-title')).toHaveText('Demir Köprü');
    await expect(page.locator('.vod-bar-sub')).toHaveText('2022 · 1s 52dk');
    expect(await clockOf(page)).toBe('00:00');
    await expect(page.locator('.vod-time.right')).toHaveText('-1:52:00');
    expect(await vodBar(page)).toEqual({ display: 'flex', opacity: '1' });
    expect(await liveBar(page)).toEqual({ display: 'none', opacity: '0' }.display === 'none' ? { display: 'none', opacity: '0' } : null);
  });

  test('series bar: series name, "Season · Episode · name"', async ({ page }) => {
    await playing(page, 'episode');
    await expect(page.locator('.vod-bar-title')).toHaveText('Gece Yarısı');
    await expect(page.locator('.vod-bar-sub')).toHaveText('Sezon 2 · Bölüm 4 · Kayıp Anahtar');
  });

  test('the bar disappears 5 s after playing; comes back with a key', async ({ page }) => {
    await open(page, {}, true);
    await play(page, 'movie');
    await page.clock.fastForward(1000);
    expect((await vodBar(page))?.opacity).toBe('1');
    await page.clock.fastForward(5100);
    expect((await vodBar(page))?.opacity).toBe('0');
    await page.clock.fastForward(700);
    expect((await vodBar(page))?.display).toBe('none');
    await press(page, 'Enter'); // duraklat + çubuk
    expect((await vodBar(page))?.display).toBe('flex');
  });

  test('with the content selected Right/Left seeks ±10 s and the indicator appears; 30 s when held', async ({ page }) => {
    await playing(page);
    await page.evaluate(() => window.__o.set({ time: 100 }));
    await press(page, 'ArrowRight');
    await expect(page.locator('.vod-seek-ind')).toBeVisible();
    await expect(page.locator('.vod-seek-ind')).toContainText('+10 sn');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.vod-seek-ind')).toContainText('−10 sn');
    await pressRepeat(page, 'ArrowRight');
    expect((await o(page)).calls.seek).toEqual([110, 100, 130]);
    await expect(page.locator('.vod-seek-ind')).toBeHidden({ timeout: 2500 });
  });

  test('OK pauses/plays: pause badge, "Oynat" button, the bar becomes persistent', async ({ page }) => {
    await playing(page);
    await press(page, 'Enter');
    await expect(page.locator('.vod-paused-badge')).toBeVisible();
    await expect(page.locator('.vod-ctl.big')).toHaveAttribute('aria-label', 'Oynat');
    expect((await o(page)).paused).toBe(true);
    await press(page, 'Enter');
    await expect(page.locator('.vod-paused-badge')).toBeHidden();
    await expect(page.locator('.vod-ctl.big')).toHaveAttribute('aria-label', 'Duraklat');
    expect((await o(page)).paused).toBe(false);
  });

  test('media keys: Play/Pause/Play-Pause', async ({ page }) => {
    await playing(page);
    await pressMedia(page, 'MediaPause');
    expect((await o(page)).paused).toBe(true);
    await pressMedia(page, 'MediaPause'); // zaten duraklatılmış: değişmez
    expect((await o(page)).paused).toBe(true);
    await pressMedia(page, 'MediaPlay');
    expect((await o(page)).paused).toBe(false);
    await pressMedia(page, 'MediaPlayPause');
    expect((await o(page)).paused).toBe(true);
  });

  test('seeking on the bar: Down → Right moves the target, applied after 700 ms; Back cancels; OK applies immediately', async ({ page }) => {
    await playing(page);
    await page.evaluate(() => window.__o.set({ time: 600 }));
    await press(page, 'ArrowDown'); // içerikten çubuğa
    await press(page, 'ArrowRight');
    await expect(page.locator('.vod-track')).toHaveClass(/scrub/);
    expect(await clockOf(page)).toBe('10:10'); // hedef 610 sn
    await expect(page.locator('.vod-scrub-bubble')).toHaveText('10:10');
    await expect.poll(async () => (await o(page)).calls.seek, { timeout: 2000 }).toEqual([610]);
    await expect(page.locator('.vod-track')).toHaveClass(/scrub/); // sarma uygulandı ama çubuk hâlâ seçili

    await press(page, 'ArrowLeft');
    await press(page, 'Escape'); // Geri: yalnızca sarmayı iptal eder
    let r = await o(page);
    expect(r.back).toBe(0);
    await page.waitForTimeout(900);
    expect((await o(page)).calls.seek).toEqual([610]);
    expect(await clockOf(page)).toBe('10:10');

    await press(page, 'ArrowRight');
    await press(page, 'Enter'); // bekleyen sarmayı hemen uygula
    r = await o(page);
    expect(r.calls.seek).toEqual([610, 620]);
  });

  test('button row: Down twice; Left/Right navigates; Up leaves; OK runs the action', async ({ page }) => {
    await playing(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown'); // düğmelere
    expect(await focusedCtl(page)).toBe('Duraklat');
    await press(page, 'ArrowLeft');
    expect(await focusedCtl(page)).toBe('10 saniye geri');
    await press(page, 'ArrowLeft'); // en soldan öteye gitmez
    expect(await focusedCtl(page)).toBe('10 saniye geri');
    await page.evaluate(() => window.__o.set({ time: 50 }));
    await press(page, 'Enter');
    expect((await o(page)).calls.seek).toEqual([40]);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    expect(await focusedCtl(page)).toBe('10 saniye ileri');
    await press(page, 'ArrowUp');
    await expect(page.locator('.vod-ctl.focused')).toHaveCount(0);
  });

  test('series episode buttons: previous/next', async ({ page }) => {
    await playing(page, 'episode', { episodeNav: true });
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    expect(await focusedCtl(page)).toBe('Duraklat');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    expect(await focusedCtl(page)).toBe('Sonraki bölüm');
    await press(page, 'Enter');
    expect((await o(page)).next).toBe(1);
    for (let i = 0; i < 4; i++) await press(page, 'ArrowLeft');
    expect(await focusedCtl(page)).toBe('Önceki bölüm');
    await press(page, 'Enter');
    expect((await o(page)).prev).toBe(1);
  });

  test('audio/subtitles: pill labels, opening the menu, selection (pause → reload with the chosen track → resume), Back closes the menu (does not leave the player)', async ({ page }) => {
    // loadMs büyütülüyor: parça değişince tetiklenen yeniden yüklemenin "Film yükleniyor" penceresini
    // (reconnecting DEĞİL) güvenilir şekilde yakalayabilmek için.
    await playing(page, 'movie', { tracks: true, loadMs: 1000 });
    await expect(page.locator('.vod-pill').nth(0)).toHaveText('Ses · Türkçe');
    await expect(page.locator('.vod-pill').nth(1)).toHaveText('Altyazı · Kapalı');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight'); // oynat → ileri → Ses hapı
    expect(await focusedCtl(page)).toBeNull(); // hapların aria-label'ı yok
    await expect(page.locator('.vod-pill.focused')).toHaveText('Ses · Türkçe');
    await press(page, 'Enter');
    await expect(page.locator('.vod-menu').first()).toBeVisible();
    await expect(page.locator('.vod-menu-title').first()).toHaveText('Ses');
    await expect(page.locator('.vod-menu-row:visible')).toHaveCount(2);
    await expect(page.locator('.vod-menu-label.on')).toHaveText('Türkçe');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    // Parça değişince: duraklatılır, seçilen parçayla yeniden yüklenir ("Film yükleniyor" — "Yeniden bağlanıyor" DEĞİL),
    // yükleme bitince (yeni 'tracks' olayında) seçim uygulanıp kesintisiz devam eder.
    await expect.poll(async () => (await o(page)).calls.pause).toBeGreaterThan(0);
    await expect.poll(async () => (await o(page)).calls.loadVod.length).toBe(2);
    await expect(page.getByText('Film yükleniyor')).toBeVisible();
    await expect(page.getByText('Yeniden bağlanıyor')).toHaveCount(0);
    await expect.poll(async () => (await o(page)).calls.setAudio, { timeout: 3000 }).toEqual([1]);
    await expect(page.locator('.vod-ctl[aria-label="Duraklat"]')).toBeAttached();
    await expect(page.locator('.vod-pill').nth(0)).toHaveText('Ses · İngilizce');
    // altyazı menüsü: Geri yalnızca menüyü kapatır
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('.vod-menu-row:visible')).toHaveCount(2); // Kapalı + Türkçe
    await press(page, 'Escape');
    await expect(page.locator('.vod-menu-row:visible')).toHaveCount(0);
    expect((await o(page)).back).toBe(0);
  });

  test('if there are no tracks the pills say "Varsayılan"/"Yok" and the menu explains why', async ({ page }) => {
    await playing(page);
    await expect(page.locator('.vod-pill').nth(0)).toHaveText('Ses · Varsayılan');
    await expect(page.locator('.vod-pill').nth(1)).toHaveText('Altyazı · Yok');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    for (let i = 0; i < 2; i++) await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.getByText('Bu oynatıcıda tek ses parçası var')).toBeVisible();
  });

  test('subtitle text is shown above the bar (tags are cleaned) and disappears when its time ends', async ({ page }) => {
    await playing(page);
    await emit(page, 'subtitle', '<i>Merhaba</i> dünya', 1000);
    await expect(page.locator('.vod-caption')).toHaveText('Merhaba dünya');
    await expect(page.locator('.vod-caption')).toBeHidden({ timeout: 3000 });
  });

  test('the subtitle style from the settings reaches the caption element (size/color/position)', async ({ page }) => {
    await playing(page, 'movie', { subtitleStyle: { size: 'large', color: 'yellow', background: 'none', position: 'bottom' } });
    await emit(page, 'subtitle', 'Merhaba dünya', 5000);
    await expect(page.locator('.vod-caption')).toHaveText('Merhaba dünya');
    const css = await page.evaluate(() => {
      const el = document.querySelector('.vod-caption')!;
      const s = getComputedStyle(el);
      return { fontSize: s.fontSize, color: s.color, bottom: s.bottom };
    });
    expect(css.fontSize).toBe('56px'); // 'large' → 56px
    expect(css.color).toBe('rgb(255, 224, 102)'); // 'yellow' → #ffe066
    expect(css.bottom).toBe('260px'); // 'bottom'
  });

  test('onEnded is called when it ends', async ({ page }) => {
    await playing(page);
    await emit(page, 'ended');
    expect((await o(page)).ended).toBe(1);
  });

  test('if it cannot open it retries by itself, finally an error + "press the play key"; OK retries manually', async ({ page }) => {
    await open(page, { playMode: 'fail' });
    await play(page, 'movie');
    await expect.poll(() => centerMsg(page), { timeout: 3000 }).toContain('Bağlantı yeniden deneniyor');
    await expect.poll(() => centerMsg(page), { timeout: 8000 }).toContain('Video oynatılamadı. Bağlantıyı kontrol edip tekrar dene.');
    await expect.poll(() => centerMsg(page)).toContain('Tekrar denemek için oynat tuşuna bas.');
    await expect(page.locator('.vod-ctl.big')).toHaveAttribute('aria-label', 'Tekrar dene');
    const before = (await o(page)).calls.loadVod.length;
    expect(before).toBe(3);
    await page.evaluate(() => window.__o.set({ playMode: 'ok' }));
    await press(page, 'Enter');
    await expect.poll(async () => (await o(page)).calls.loadVod.length).toBe(4);
    await expect.poll(() => centerMsg(page), { timeout: 4000 }).toBeNull();
  });

  test('the Back key: calls onBack when not seeking', async ({ page }) => {
    await playing(page);
    await press(page, 'Escape');
    expect((await o(page)).back).toBe(1);
  });

  test('Left/Right do nothing while the menu is open (no seeking)', async ({ page }) => {
    await playing(page, 'movie', { tracks: true });
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    for (let i = 0; i < 2; i++) await press(page, 'ArrowRight');
    await press(page, 'Enter'); // menü açık
    const seeks = (await o(page)).calls.seek.length;
    await press(page, 'ArrowRight');
    await press(page, 'ArrowLeft');
    expect((await o(page)).calls.seek.length).toBe(seeks);
  });
});
