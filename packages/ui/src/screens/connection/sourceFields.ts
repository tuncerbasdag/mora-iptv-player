import type { PlaylistSource } from '../../../../core/src/types.ts';
import { eyeIconSvg } from '../../icons.ts';
import { noteLine, textField, type TextField } from '../settingsShell.ts';
import { setFieldError } from './fieldError.ts';

/**
 * Form fields for one connection type (M3U / Xtream) (Strategy): sets up its own fields, collects their
 * values into a `PlaylistSource`, and validates missing ones. A new source type = a new implementation;
 * the form itself doesn't change.
 */
export interface SourceFields {
  readonly kind: PlaylistSource['kind'];
  /** Field containers to show in the form (after the name field). */
  build(): HTMLElement[];
  /** The source built from the fields; null if something's missing. */
  collect(): PlaylistSource | null;
  /** Shows errors for missing fields; returns the focus id of the first missing field (null if none missing). */
  validate(): string | null;
}

/** M3U: a single URL field + (add mode only) a format hint. */
export class M3uSourceFields implements SourceFields {
  readonly kind = 'm3u' as const;
  private readonly initialUrl: string;
  private readonly showHint: boolean;
  private urlField: TextField | null = null;
  private hint: HTMLElement | null = null;

  constructor(initial: PlaylistSource | undefined, showHint: boolean) {
    this.initialUrl = initial?.kind === 'm3u' ? initial.url : '';
    this.showHint = showHint;
  }

  build(): HTMLElement[] {
    const field = textField('f-url', 'M3U Adresi', this.initialUrl, 'M3U adresini gir');
    this.urlField = field;
    const wrap = document.createElement('div');
    wrap.append(field.wrap);
    // Hint shown in add mode only (by design: absent in Edit Connection).
    if (this.showHint) {
      const hint = noteLine('Adres, .m3u veya .m3u8 uzantılı bir kanal listesine çıkmalı.');
      hint.style.padding = '10px 0 0';
      wrap.append(hint);
      this.hint = hint;
    }
    field.input.addEventListener('input', () => {
      setFieldError(field, null);
      this.hint?.style.setProperty('display', 'block');
    });
    return [wrap];
  }

  collect(): PlaylistSource | null {
    const u = this.urlField?.input.value.trim() ?? '';
    return u ? { kind: 'm3u', url: u } : null;
  }

  validate(): string | null {
    const field = this.urlField;
    if (!field) return null;
    const src = this.collect();
    setFieldError(field, src ? null : 'Adres girmek zorunlu.');
    this.hint?.style.setProperty('display', src ? 'block' : 'none');
    return src ? null : 'f-url';
  }
}

/** Xtream: server, username, and password (show/hide via eye icon). */
export class XtreamSourceFields implements SourceFields {
  readonly kind = 'xtream' as const;
  private readonly initial: Extract<PlaylistSource, { kind: 'xtream' }> | undefined;
  private server: TextField | null = null;
  private user: TextField | null = null;
  private pass: TextField | null = null;

  constructor(initial: PlaylistSource | undefined) {
    this.initial = initial?.kind === 'xtream' ? initial : undefined;
  }

  build(): HTMLElement[] {
    const x = this.initial;
    const server = textField('f-server', 'Sunucu Adresi', x?.server ?? '', 'Sunucu adresini gir');
    const user = textField('f-user', 'Kullanıcı Adı', x?.username ?? '', 'Kullanıcı adını gir');
    const pass = textField('f-pass', 'Şifre', x?.password ?? '', 'Şifreni gir', 'password');
    pass.wrap.querySelector('.field')!.append(this.passwordEye(pass));
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-gap:24px';
    row.append(user.wrap, pass.wrap);
    for (const f of [server, user, pass]) f.input.addEventListener('input', () => setFieldError(f, null));
    this.server = server;
    this.user = user;
    this.pass = pass;
    return [server.wrap, row];
  }

  collect(): PlaylistSource | null {
    const { server, user, pass } = this;
    if (!server || !user || !pass) return null;
    const creds = { server: server.input.value.trim(), username: user.input.value.trim(), password: pass.input.value.trim() };
    // A leftover MAC value from an older version is preserved on edit (there's no field for it in the form).
    return creds.server && creds.username && creds.password ? { kind: 'xtream', ...creds, mac: this.initial?.mac } : null;
  }

  validate(): string | null {
    const checks: Array<[TextField | null, string, string]> = [
      [this.server, 'Sunucu adresi girmek zorunlu.', 'f-server'],
      [this.user, 'Kullanıcı adı girmek zorunlu.', 'f-user'],
      [this.pass, 'Şifre girmek zorunlu.', 'f-pass'],
    ];
    let firstMissing: string | null = null;
    for (const [field, message, id] of checks) {
      if (!field) continue;
      const empty = !field.input.value.trim();
      setFieldError(field, empty ? message : null);
      if (empty && !firstMissing) firstMissing = id;
    }
    return firstMissing;
  }

  private passwordEye(pass: TextField): HTMLElement {
    const eye = document.createElement('div');
    eye.dataset.focusId = 'f-pass-eye';
    eye.setAttribute('aria-label', 'Şifreyi göster');
    eye.style.cssText = 'display:flex;align-items:center;justify-content:center;width:64px;height:64px;margin-right:12px;border-radius:16px;color:var(--text-dim);flex:none';
    eye.innerHTML = eyeIconSvg(36);
    eye.addEventListener('click', () => {
      const show = pass.input.type === 'password';
      pass.input.type = show ? 'text' : 'password';
      eye.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
      eye.style.color = show ? 'var(--peach)' : 'var(--text-dim)';
    });
    return eye;
  }
}
