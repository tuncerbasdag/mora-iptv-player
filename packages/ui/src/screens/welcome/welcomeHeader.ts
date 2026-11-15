import type { Connection } from '../../../../core/src/types.ts';
import { lockIconSvg, lockOpenIconSvg, settingsIconSvg } from '../../icons.ts';

export interface WelcomeHeaderOptions {
  /** The active connection; if absent, the badge reads "Select connection". */
  active: Connection | null;
  /** Parental lock button: hidden if 'off' (or if `onToggleParental` is absent). */
  parentalState: 'off' | 'locked' | 'open';
  onOpenSettings: () => void;
  onToggleParental?: () => void;
}

/** Brand (logo + "Mora IPTV Player") and the buttons on the right: parental lock, active connection badge, Settings. */
export function buildWelcomeHeader(opts: WelcomeHeaderOptions): HTMLElement {
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between' });
  header.append(buildBrand(), buildActions(opts));
  return header;
}

/** Brand logo: a play triangle + live-broadcast waves. Colors come from the theme (--logo-ink); the box background is --logo-bg. */
const LOGO_GLYPH_SVG =
  '<svg aria-hidden="true" width="64" height="64" viewBox="0 0 1024 1024"><g transform="translate(512 512) scale(0.9) translate(-590 -450)" style="fill:var(--logo-ink);stroke:var(--logo-ink)">' +
  '<path d="M286 372v400l340-200z" stroke="none"/>' +
  '<path d="M560 252a210 210 0 0 1 210 210" fill="none" stroke-width="72" stroke-linecap="round"/>' +
  '<path d="M560 128a334 334 0 0 1 334 334" fill="none" stroke-width="72" stroke-linecap="round"/></g></svg>';

/** Brand: logo mark in a rounded square + "Mora IPTV Player". Uses margin instead of flex `gap` (Tizen's chrome56 has no flex gap support). */
function buildBrand(): HTMLElement {
  const logo = document.createElement('div');
  Object.assign(logo.style, { display: 'flex', alignItems: 'center' });
  const mark = document.createElement('span');
  Object.assign(mark.style, {
    width: '64px',
    height: '64px',
    flex: 'none',
    borderRadius: '18px',
    background: 'var(--logo-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '18px',
  });
  mark.innerHTML = LOGO_GLYPH_SVG;
  const brand = document.createElement('span');
  Object.assign(brand.style, { fontSize: '44px', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: '1' });
  brand.append('Mora ');
  const brandSub = document.createElement('span');
  brandSub.textContent = 'IPTV Player';
  Object.assign(brandSub.style, { fontWeight: '600', color: 'var(--peach)' });
  brand.append(brandSub);
  logo.append(mark, brand);
  return logo;
}

function buildActions(opts: WelcomeHeaderOptions): HTMLElement {
  const right = document.createElement('div');
  Object.assign(right.style, { display: 'flex', alignItems: 'center' });
  // Parental lock button (only when the lock is enabled): asks for the PIN while locked, re-locks when open.
  if (opts.parentalState !== 'off' && opts.onToggleParental) right.append(buildLockButton(opts.parentalState, opts.onToggleParental));
  right.append(buildConnectionPill(opts.active, opts.onOpenSettings), buildSettingsButton(opts.onOpenSettings));
  return right;
}

function buildLockButton(state: 'locked' | 'open', onToggle: () => void): HTMLElement {
  const locked = state === 'locked';
  const lockBtn = document.createElement('button');
  lockBtn.dataset.focusId = 'lock-btn';
  lockBtn.innerHTML = locked ? lockIconSvg(44) : lockOpenIconSvg(44);
  lockBtn.title = locked ? 'Kilitli içerikleri aç' : 'Yeniden kilitle';
  lockBtn.setAttribute('aria-label', lockBtn.title);
  Object.assign(lockBtn.style, {
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    background: locked ? 'transparent' : 'var(--accent-soft)',
    border: `2px solid ${locked ? 'var(--border)' : 'var(--accent)'}`,
    color: locked ? 'var(--text)' : 'var(--peach)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '0',
    marginRight: '24px',
  });
  lockBtn.addEventListener('click', onToggle);
  return lockBtn;
}

/** Active connection badge (design: Home screen): status dot + "Active connection" + name. Enter -> Connections. */
function buildConnectionPill(active: Connection | null, onOpenSettings: () => void): HTMLElement {
  const pill = document.createElement('button');
  pill.dataset.focusId = 'conn-pill';
  pill.setAttribute('aria-label', active ? `Aktif bağlantı: ${active.name}` : 'Aktif bağlantı yok');
  Object.assign(pill.style, {
    display: 'flex',
    alignItems: 'center',
    height: '88px',
    boxSizing: 'border-box',
    padding: '0 36px 0 28px',
    border: '2px solid var(--border)',
    borderRadius: '44px',
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    marginRight: '24px',
    fontFamily: 'inherit',
    textAlign: 'left',
  });
  const dot = document.createElement('span');
  const dotColor = !active ? 'var(--text-dim)' : active.status === 'error' ? 'var(--danger)' : active.status === 'ok' ? 'var(--ok)' : 'var(--warn)';
  Object.assign(dot.style, { width: '16px', height: '16px', flex: 'none', borderRadius: '8px', background: dotColor, marginRight: '16px' });
  const pillText = document.createElement('span');
  Object.assign(pillText.style, { display: 'flex', flexDirection: 'column' });
  const pillLabel = document.createElement('span');
  Object.assign(pillLabel.style, { fontSize: '22px', fontWeight: '600', color: 'var(--text-dim)', lineHeight: '1.2' });
  pillLabel.textContent = active ? 'Aktif bağlantı' : 'Aktif bağlantı yok';
  const pillName = document.createElement('span');
  Object.assign(pillName.style, { fontSize: '30px', fontWeight: '800', lineHeight: '1.2', maxWidth: '460px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
  pillName.textContent = active ? active.name : 'Bağlantı seç';
  pillText.append(pillLabel, pillName);
  pill.append(dot, pillText);
  pill.addEventListener('click', onOpenSettings);
  return pill;
}

function buildSettingsButton(onOpenSettings: () => void): HTMLElement {
  const settingsBtn = document.createElement('button');
  settingsBtn.dataset.focusId = 'settings-btn';
  settingsBtn.innerHTML = settingsIconSvg(44);
  settingsBtn.title = 'Ayarlar';
  Object.assign(settingsBtn.style, {
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    background: 'var(--settings-btn-bg)',
    border: '2px solid var(--settings-btn-border)',
    color: 'var(--settings-btn-fg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '0',
  });
  settingsBtn.addEventListener('click', onOpenSettings);
  return settingsBtn;
}
