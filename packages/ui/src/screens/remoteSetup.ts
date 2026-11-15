import type { PlaylistPort } from '../../../core/src/playlistService.ts';
import { RemoteSetupClient, type RemoteSetupConfig, type RemoteSetupSession } from '../../../core/src/remoteSetup.ts';
import type { FocusManager } from '../focusManager.ts';
import { buildSettingsShell, buttonRow, createSettingsFocus, noteLine, settingsButton, spacer } from './settingsShell.ts';
import type { SettingsPage } from './settingsShell.ts';

export interface RemoteSetupCallbacks {
  onNavigate: (page: SettingsPage) => void;
  onHome: () => void;
  /** Return to the Connections list once the list arrives and is saved, or via Cancel/Back. */
  onDone: () => void;
}

const POLL_MS = 3000;
const RETRY_MS = 5000;

/** Large labeled code box (MAC address / PIN). */
function codeBox(label: string, big: boolean): { box: HTMLElement; value: HTMLElement } {
  const box = document.createElement('div');
  box.style.cssText = 'flex:1;min-width:0;padding:28px 32px;border-radius:28px;background:var(--bg);border:1.5px solid var(--border)';
  const l = document.createElement('div');
  l.textContent = label;
  l.style.cssText = 'font-size:26px;font-weight:700;color:var(--text-dim);margin-bottom:12px';
  const v = document.createElement('div');
  v.style.cssText = `font-size:${big ? 96 : 56}px;font-weight:800;line-height:1.1;color:var(--peach);${big ? 'letter-spacing:0.12em;' : ''}`;
  v.textContent = '—';
  box.append(l, v);
  return { box, value: v };
}

/**
 * Remote Upload: shows the device's MAC address and a one-time PIN; once the user enters these and the list URL
 * on the portal site, the URL arrives at this screen, gets saved, and the list refreshes. Polls the portal
 * periodically while the screen is open; polling stops once it closes (destroy).
 */
class RemoteSetupScreen {
  readonly focusManager: FocusManager;
  private readonly playlist: PlaylistPort;
  private readonly config: RemoteSetupConfig;
  private readonly cb: RemoteSetupCallbacks;
  private readonly client: RemoteSetupClient;
  private readonly macValue: HTMLElement;
  private readonly pinValue: HTMLElement;
  private readonly status: HTMLElement;
  private session: RemoteSetupSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(container: HTMLElement, playlist: PlaylistPort, config: RemoteSetupConfig, cb: RemoteSetupCallbacks) {
    this.playlist = playlist;
    this.config = config;
    this.cb = cb;
    this.client = new RemoteSetupClient(config.portalUrl);
    const { screen, panel } = buildSettingsShell(container, 'remote', 'Uzaktan Yükle', 'Listeni bilgisayarından veya telefonundan gönder.', cb.onNavigate, cb.onHome);

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
    panel.append(body);

    const portalHost = config.portalUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const steps = noteLine(`1. Bilgisayarında veya telefonunda ${portalHost} adresini aç.   2. Aşağıdaki MAC ve PIN'i gir.   3. M3U adresini gönder.`);
    steps.style.lineHeight = '1.5';

    const macBox = codeBox('MAC adresi', false);
    const pinBox = codeBox('PIN', true);
    pinBox.box.style.marginLeft = '24px';
    pinBox.box.style.flex = 'none';
    pinBox.box.style.width = '520px';
    this.macValue = macBox.value;
    this.pinValue = pinBox.value;
    const codes = document.createElement('div');
    codes.style.cssText = 'display:flex;margin-top:24px';
    codes.append(macBox.box, pinBox.box);

    this.status = document.createElement('div');
    this.status.style.cssText = 'margin-top:28px;font-size:30px;font-weight:700;color:var(--text-dim);padding:4px 8px';
    this.status.textContent = 'Bağlanıyor...';

    body.append(steps, codes, this.status, spacer());
    body.append(
      buttonRow(
        settingsButton('new-pin-btn', 'Yeni PIN Al', 'secondary', () => void this.start()),
        settingsButton('cancel-btn', 'Vazgeç', 'secondary', cb.onDone),
      ),
    );

    this.focusManager = createSettingsFocus(screen, { onBack: cb.onDone });
    this.focusManager.focus('cancel-btn');
    this.focusManager.onDestroy(() => this.stop());
    void this.start();
  }

  private stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private later(fn: () => void, ms: number): void {
    if (!this.stopped) this.timer = setTimeout(fn, ms);
  }

  private say(text: string, color = 'var(--text-dim)'): void {
    this.status.textContent = text;
    this.status.style.color = color;
  }

  /** Registers with the portal and gets MAC/PIN; retries after 5s on failure. */
  private async start(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.session = null;
    this.say('Bağlanıyor...');
    try {
      const mac = await this.config.getDeviceMac();
      if (this.stopped) return;
      const session = await this.client.register(mac);
      if (this.stopped) return;
      this.session = session;
      this.macValue.textContent = session.mac;
      this.pinValue.textContent = session.pin;
      this.say('Liste bekleniyor...');
      this.later(() => void this.poll(), POLL_MS);
    } catch {
      this.say('Portala ulaşılamıyor, yeniden deneniyor...', 'var(--err)');
      this.later(() => void this.start(), RETRY_MS);
    }
  }

  /** Polls the portal: adds and activates the connection if delivered; gets a new PIN if expired; otherwise keeps waiting. */
  private async poll(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      const r = await this.client.poll(session.mac, session.secret);
      if (this.stopped) return;
      if (r.status === 'delivered') {
        // Defense in depth: the portal already validates, but the app never trusts it — only http(s) list addresses are accepted.
        if (!/^https?:\/\//i.test(r.payload.url) || r.payload.url.length > 2048) {
          this.say('Geçersiz liste adresi alındı, yeniden deneniyor...', 'var(--err)');
          void this.start();
          return;
        }
        // The list received from the portal is added as a new connection and activated (the sender wants to use it).
        const added = this.playlist.addConnection(r.payload.name || 'Uzaktan Liste', { kind: 'm3u', url: r.payload.url });
        void this.playlist.activate(added.id);
        this.stopped = true;
        this.cb.onDone();
        return;
      }
      if (r.status === 'expired') {
        void this.start(); // session dropped (server restarted / timed out): get a new PIN
        return;
      }
      this.say('Liste bekleniyor...');
    } catch {
      this.say('Portala ulaşılamıyor, yeniden deneniyor...', 'var(--err)');
      this.later(() => void this.poll(), RETRY_MS);
      return;
    }
    this.later(() => void this.poll(), POLL_MS);
  }
}

/** Sets up the Remote Upload screen. */
export function renderRemoteSetup(container: HTMLElement, playlist: PlaylistPort, config: RemoteSetupConfig, cb: RemoteSetupCallbacks): FocusManager {
  return new RemoteSetupScreen(container, playlist, config, cb).focusManager;
}
