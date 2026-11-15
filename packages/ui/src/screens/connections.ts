import { activeConnection, sourceLabel } from '../../../core/src/connections.ts';
import type { PlaylistPort } from '../../../core/src/playlistService.ts';
import type { SettingsStore } from '../../../core/src/storage.ts';
import type { Connection, PlaylistSource } from '../../../core/src/types.ts';
import { showConfirmDialog } from '../confirmDialog.ts';
import type { FocusManager } from '../focusManager.ts';
import { trashIconSvg } from '../icons.ts';
import { ActiveSwitch } from './connection/activeSwitch.ts';
import { setFieldError } from './connection/fieldError.ts';
import { KindSelector } from './connection/kindSelector.ts';
import { M3uSourceFields, XtreamSourceFields, type SourceFields } from './connection/sourceFields.ts';
import { buildSettingsShell, buttonRow, connectionStatus, createSettingsFocus, formatWhen, noteLine, settingsButton, spacer, textField, verticalChain } from './settingsShell.ts';
import type { SettingsPage } from './settingsShell.ts';

export interface ConnectionFormCallbacks {
  onNavigate: (page: SettingsPage, connectionId?: string) => void;
  onHome: () => void;
  /** Return to the Connections list after Save/Cancel/Delete. */
  onDone: () => void;
  /** If provided (remote loading is configured), an "Load Remotely" button appears when adding. */
  onRemote?: () => void;
}

type Kind = PlaylistSource['kind'];

/** Vertical focus order: type card → name → address/account fields → active switch → buttons. */
const ROW_ORDER: string[][] = [
  ['kind-m3u', 'kind-xtream'],
  ['f-name'],
  ['f-url'],
  ['f-server'],
  ['f-user', 'f-pass', 'f-pass-eye'],
  ['f-mac'],
  ['f-active'],
  ['save-btn', 'cancel-btn', 'remote-btn', 'delete-btn'],
];

/**
 * Add Connection (mode 'add') and Edit Connection (mode 'edit') form. When adding, type cards: M3U selected by default;
 * if Xtream is selected, the server/user/password fields open (the field set changes via the `SourceFields` strategy); the
 * name is required. When editing, there are the name, the address (account info if it's an Xtream connection), and the
 * "Connection active" switch.
 */
class ConnectionForm {
  private readonly playlist: PlaylistPort;
  private readonly cb: ConnectionFormCallbacks;
  private readonly connection: Connection | undefined;
  private readonly editing: boolean;
  private readonly screen: HTMLElement;
  private readonly name: ReturnType<typeof textField>;
  private readonly fieldsHost = document.createElement('div');
  private readonly activeSwitch: ActiveSwitch | null;
  private fields: SourceFields;
  private fm!: FocusManager;

  constructor(container: HTMLElement, storage: SettingsStore, playlist: PlaylistPort, mode: 'add' | 'edit', connectionId: string | undefined, cb: ConnectionFormCallbacks) {
    this.playlist = playlist;
    this.cb = cb;
    const settings = storage.getSettings();
    this.connection = mode === 'edit' ? settings.connections.find((c) => c.id === connectionId) : undefined;
    const connection = this.connection;
    this.editing = !!connection;
    const isActive = !!connection && connection.id === settings.activeConnectionId;

    let subtitle = 'Önce bağlantı türünü seç.';
    if (connection) {
      const st = connectionStatus(connection, false);
      subtitle = `${sourceLabel(connection.source)} · ${isActive ? 'Aktif' : 'Pasif'} · ${st.text}`;
    }
    const { screen, panel } = buildSettingsShell(container, this.editing ? 'edit' : 'add', this.editing ? connection!.name : 'Bağlantı Ekle', subtitle, cb.onNavigate, cb.onHome);
    this.screen = screen;

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
    panel.append(body);

    const source = connection?.source;
    const initialKind: Kind = source?.kind === 'xtream' ? 'xtream' : 'm3u';
    this.fields = this.fieldsFor(initialKind, source);

    // type cards (add mode only): choosing M3U / Xtream swaps the fields
    if (!this.editing) body.append(new KindSelector(initialKind, (kind) => this.switchKind(kind, source)).el);

    this.name = textField('f-name', 'İsim', connection?.name ?? '', 'Bağlantı için bir isim gir', 'text', true);
    this.name.input.addEventListener('input', () => setFieldError(this.name, null)); // error clears once typing starts
    this.fieldsHost.style.cssText = 'display:flex;flex-direction:column;margin-top:12px';
    body.append(this.fieldsHost);
    this.renderFields();

    // active switch (edit mode only)
    this.activeSwitch = this.editing ? new ActiveSwitch(isActive, activeConnection(settings)) : null;
    if (this.activeSwitch) {
      body.append(this.activeSwitch.el);
      body.append(noteLine(`Son kontrol: ${formatWhen(connection!.lastUpdated) ?? 'henüz yok'}`));
    }
    body.append(spacer());
    body.append(buttonRow(...this.buildButtons()));

    const exists = (id: string): boolean => !!screen.querySelector(`[data-focus-id="${id}"]`);
    this.fm = createSettingsFocus(screen, {
      onBack: cb.onDone,
      candidateFilter: verticalChain(() => ROW_ORDER.map((r) => r.filter(exists)).filter((r) => r.length > 0)),
    });
    this.fm.focus('f-name');
  }

  get focusManager(): FocusManager {
    return this.fm;
  }

  private fieldsFor(kind: Kind, source: PlaylistSource | undefined): SourceFields {
    return kind === 'm3u' ? new M3uSourceFields(source, !this.editing) : new XtreamSourceFields(source);
  }

  /** Fields are rebuilt based on type; the name field and its value are preserved. */
  private renderFields(): void {
    this.fieldsHost.innerHTML = '';
    [this.name.wrap, ...this.fields.build()].forEach((f, i) => {
      if (i) f.style.marginTop = '20px';
      this.fieldsHost.append(f);
    });
  }

  private switchKind(kind: Kind, source: PlaylistSource | undefined): void {
    this.fields = this.fieldsFor(kind, source);
    this.renderFields();
    this.fm.refresh();
  }

  private validate(): { name: string; source: PlaylistSource } | null {
    const nameValue = this.name.input.value.trim();
    setFieldError(this.name, nameValue ? null : 'İsim girmek zorunlu.');
    if (!nameValue) {
      // While the name is empty, only the name error is shown (by design); other field errors appear once the name is filled in.
      this.fm.focus('f-name');
      return null;
    }
    const firstMissing = this.fields.validate();
    if (firstMissing) this.fm.focus(firstMissing);
    const src = this.fields.collect();
    return src ? { name: nameValue, source: src } : null;
  }

  private save(): void {
    const v = this.validate();
    if (!v) return;
    const { connection, playlist, cb } = this;
    void (async () => {
      if (connection) {
        await playlist.updateConnection(connection.id, { name: v.name, source: v.source });
        if (this.activeSwitch?.shouldActivate) await playlist.activate(connection.id);
      } else {
        playlist.addConnection(v.name, v.source);
      }
      cb.onDone();
    })();
  }

  private buildButtons(): HTMLElement[] {
    const { cb, connection, playlist } = this;
    const buttons = [settingsButton('save-btn', 'Kaydet', 'primary', () => this.save()), settingsButton('cancel-btn', 'Vazgeç', 'secondary', cb.onDone)];
    if (!this.editing && cb.onRemote) buttons.push(settingsButton('remote-btn', 'Uzaktan Yükle', 'secondary', cb.onRemote));
    if (connection) {
      buttons.push(
        settingsButton(
          'delete-btn',
          'Sil',
          'danger',
          () =>
            showConfirmDialog(
              this.fm,
              this.screen,
              `“${connection.name}” bağlantısını silmek istediğine emin misin?`,
              () => {
                void playlist.removeConnection(connection.id).then(cb.onDone);
              },
              'delete-btn',
            ),
          trashIconSvg(32),
        ),
      );
    }
    return buttons;
  }
}

/** Builds the Add Connection (mode 'add') and Edit Connection (mode 'edit') screen. */
export function renderConnectionForm(
  container: HTMLElement,
  storage: SettingsStore,
  playlist: PlaylistPort,
  mode: 'add' | 'edit',
  connectionId: string | undefined,
  cb: ConnectionFormCallbacks,
): FocusManager {
  return new ConnectionForm(container, storage, playlist, mode, connectionId, cb).focusManager;
}
