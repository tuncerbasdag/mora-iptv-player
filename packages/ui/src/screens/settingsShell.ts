import type { Connection } from '../../../core/src/types.ts';
import { backChevronSvg, hasMouseSupport } from '../mouseSupport.ts';
import { FocusManager, type FocusManagerOptions } from '../focusManager.ts';
import { autoUpdateIconSvg, calendarIconSvg, downloadIconSvg, globeIconSvg, linkIconSvg, lockIconSvg, paletteIconSvg, subtitleIconSvg } from '../icons.ts';

/**
 * 'add', 'edit', and 'remote' are sub-pages of the Connections menu item; 'parental-*' pages are sub-pages
 * of the Parental Lock menu item (the parent item stays highlighted in the menu).
 */
export type SettingsPage =
  | 'connections'
  | 'add'
  | 'edit'
  | 'remote'
  | 'auto'
  | 'epg'
  | 'theme'
  | 'subtitle'
  | 'language'
  | 'updates'
  | 'parental'
  | 'parental-pin-current'
  | 'parental-pin-new'
  | 'parental-pin-confirm'
  | 'parental-categories';

type NavId = 'connections' | 'auto' | 'epg' | 'theme' | 'subtitle' | 'language' | 'updates' | 'parental';

const NAV_ITEMS: { id: NavId; label: string; icon: (size: number) => string }[] = [
  { id: 'connections', label: 'Bağlantılar', icon: linkIconSvg },
  { id: 'auto', label: 'Açılışta Otomatik Güncelle', icon: autoUpdateIconSvg },
  { id: 'epg', label: 'Program Rehberi (EPG)', icon: calendarIconSvg },
  { id: 'theme', label: 'Tema', icon: paletteIconSvg },
  { id: 'subtitle', label: 'Altyazı', icon: subtitleIconSvg },
  { id: 'language', label: 'Dil', icon: globeIconSvg },
  { id: 'updates', label: 'Güncelleme', icon: downloadIconSvg },
  { id: 'parental', label: 'Ebeveyn Kilidi', icon: lockIconSvg },
];

/** The Update item only exists in the desktop app (the platform provides an updater); see SettingsController. */
let updatesNavEnabled = false;
export function enableUpdatesNav(): void {
  updatesNavEnabled = true;
}

export interface SettingsShell {
  screen: HTMLElement;
  /** Right panel: title and separator already added; page-specific content is appended here. */
  panel: HTMLElement;
}

function navIdOf(page: SettingsPage): NavId {
  if (page === 'add' || page === 'edit' || page === 'remote') return 'connections';
  if (page.startsWith('parental')) return 'parental';
  return page as NavId;
}

/**
 * Shared scaffold for settings pages: a bordered card, a 560px menu on the left (6 items, current
 * page highlighted), and on the right a panel that starts with title + subtitle + separator. Menu
 * items are focusable (`nav-<id>`); Enter calls `onNavigate`.
 */
export function buildSettingsShell(
  container: HTMLElement,
  page: SettingsPage,
  title: string,
  subtitle: string,
  onNavigate: (page: SettingsPage) => void,
  onHome: () => void,
): SettingsShell {
  container.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'screen';
  Object.assign(screen.style, { padding: '48px 64px' });

  const frame = document.createElement('div');
  frame.className = 'settings-frame';

  const nav = document.createElement('div');
  nav.className = 'settings-nav';

  const home = document.createElement('div');
  home.className = 'settings-nav-title';
  home.addEventListener('click', onHome);
  if (hasMouseSupport()) {
    // Mouse Back button to the left of the title, same as Live TV (not focusable: remote/keyboard use Back/Esc).
    const back = document.createElement('button');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = backChevronSvg(24);
    Object.assign(back.style, {
      width: '44px', height: '44px', flex: 'none', marginRight: '14px', borderRadius: '50%', cursor: 'pointer',
      border: '1.5px solid var(--border)', background: 'transparent', color: 'inherit', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    back.addEventListener('click', (e) => { e.stopPropagation(); onHome(); });
    home.append(back);
  }
  home.append('Ayarlar');
  const rule = document.createElement('div');
  rule.className = 'settings-rule';
  rule.style.margin = '4px 0 8px';
  nav.append(home, rule);

  const activeNav = navIdOf(page);
  for (const item of NAV_ITEMS) {
    if (item.id === 'updates' && !updatesNavEnabled) continue;
    const el = document.createElement('div');
    el.className = 'settings-nav-item' + (item.id === activeNav ? ' active' : '');
    el.dataset.focusId = `nav-${item.id}`;
    el.innerHTML = item.icon(40);
    el.append(document.createTextNode(item.label));
    el.addEventListener('click', () => onNavigate(item.id));
    nav.append(el);
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:4px';
  const h = document.createElement('div');
  h.className = 'settings-title';
  h.textContent = title;
  const sub = document.createElement('div');
  sub.className = 'settings-subtitle';
  sub.textContent = subtitle;
  head.append(h, sub);
  const divider = document.createElement('div');
  divider.className = 'settings-rule';
  divider.style.margin = '8px 0';
  panel.append(head, divider);

  frame.append(nav, panel);
  screen.append(frame);
  container.append(screen);
  return { screen, panel };
}

/**
 * Focus manager for settings pages. The transition between the left menu and the content is explicitly
 * defined (the spatial calculation was picking the nearest menu item instead of the selected page when
 * going Left from the content): Left from content = the currently selected menu item, Right from the menu
 * = the first content item, Up/Down in the menu only moves among menu items.
 * The page's own vertical/horizontal rules are supplied via `candidateFilter`, applied only among content items.
 */
export function createSettingsFocus(screen: HTMLElement, opts: FocusManagerOptions): FocusManager {
  const inner = opts.candidateFilter;
  const isNav = (id: string): boolean => id.startsWith('nav-');
  const ids = (): string[] => Array.from(screen.querySelectorAll<HTMLElement>('[data-focus-id]')).map((el) => el.dataset.focusId!);
  const candidateFilter: NonNullable<FocusManagerOptions['candidateFilter']> = (current, candidate, direction) => {
    const from = current.dataset.focusId ?? '';
    const to = candidate.dataset.focusId ?? '';
    if (isNav(from)) {
      if (direction === 'right') return !isNav(to) && to === ids().find((id) => !isNav(id));
      if (direction === 'left') return false;
      return isNav(to);
    }
    if (isNav(to)) return direction === 'left' && to === screen.querySelector<HTMLElement>('.settings-nav-item.active')?.dataset.focusId;
    return inner ? inner(current, candidate, direction) : true;
  };
  return new FocusManager(screen, { ...opts, candidateFilter });
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function settingsButton(
  focusId: string,
  label: string,
  variant: ButtonVariant,
  onClick: () => void,
  iconSvg?: string,
): HTMLElement {
  const b = document.createElement('div');
  b.className = `settings-btn ${variant}`;
  b.dataset.focusId = focusId;
  if (iconSvg) b.innerHTML = iconSvg;
  b.append(document.createTextNode(label));
  b.addEventListener('click', onClick);
  return b;
}

export function buttonRow(...children: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:20px';
  row.append(...children);
  return row;
}

export function spacer(): HTMLElement {
  const s = document.createElement('div');
  s.style.flex = '1';
  return s;
}

export interface TextField {
  wrap: HTMLElement;
  input: HTMLInputElement;
}

/** Labeled text field (88px). The wrapper is the focus target; Enter/click hands focus to the input. */
export function textField(focusId: string, label: string, value: string, placeholder: string, type = 'text', required = false): TextField {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;min-width:0';
  const l = document.createElement('div');
  l.textContent = label;
  l.style.cssText = 'font-size:28px;font-weight:800';
  if (required) {
    const tag = document.createElement('span');
    tag.textContent = 'Zorunlu';
    tag.style.cssText = 'margin-left:14px;font-size:22px;font-weight:700;color:var(--peach)';
    l.append(tag);
  }
  const box = document.createElement('div');
  box.className = 'field';
  box.dataset.focusId = focusId;
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  // Explicit lang (the Tizen on-screen keyboard reads the focused element's own lang, not just the inherited document one).
  input.lang = 'tr';
  box.append(input);
  box.addEventListener('click', () => input.focus());
  wrap.append(l, box);
  return { wrap, input };
}

/** On/off card: title + description on the left, "On/Off" label and a 132x72 switch on the right. */
export function switchCard(
  focusId: string,
  title: string,
  description: string,
  isOn: () => boolean,
  onToggle: () => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'switch-card';
  card.dataset.focusId = focusId;
  card.setAttribute('role', 'switch');

  const text = document.createElement('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:0';
  const t = document.createElement('div');
  t.style.cssText = 'font-size:34px;font-weight:800';
  t.textContent = title;
  const d = document.createElement('div');
  d.style.cssText = 'font-size:26px;font-weight:600;line-height:1.4;color:var(--text-dim)';
  d.textContent = description;
  text.append(t, d);

  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:20px;flex:none';
  const state = document.createElement('span');
  state.style.cssText = 'font-size:30px;font-weight:800';
  const track = document.createElement('span');
  track.className = 'switch-track';
  const knob = document.createElement('span');
  knob.className = 'switch-knob';
  track.append(knob);
  right.append(state, track);

  function paint(): void {
    const on = isOn();
    card.setAttribute('aria-checked', String(on));
    state.textContent = on ? 'Açık' : 'Kapalı';
    state.style.color = on ? 'var(--peach)' : 'var(--text-dim)';
    track.classList.toggle('on', on);
  }
  paint();
  card.addEventListener('click', () => {
    onToggle();
    paint();
  });

  card.append(text, right);
  return card;
}

export function noteLine(text: string): HTMLElement {
  const n = document.createElement('div');
  n.style.cssText = 'font-size:24px;font-weight:600;color:var(--text-dim);padding:4px 8px';
  n.textContent = text;
  return n;
}

/** Formats as "today 02:14" / "yesterday 21:05" / "3 Nov 02:14"; null if there's no timestamp. */
export function formatWhen(ts: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return `bugün ${hm}`;
  if (diffDays === 1) return `dün ${hm}`;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${hm}`;
}

/** e.g. "128 channels · 640 movies": content counts (zero values are skipped); empty if unknown. */
export function countsText(c: Connection['counts']): string {
  if (!c) return '';
  return [c.live && `${c.live} kanal`, c.movies && `${c.movies} film`, c.series && `${c.series} dizi`].filter(Boolean).join(' · ');
}

/** A connection's status line: color, text, and whether it's an error. */
export function connectionStatus(c: Connection, refreshing: boolean): { color: string; text: string; error: boolean } {
  if (refreshing) return { color: 'var(--warn)', text: 'Güncelleniyor...', error: false };
  if (c.status === 'error') return { color: 'var(--danger)', text: 'Bağlantı hatası', error: true };
  if (c.status === 'ok') {
    const counts = countsText(c.counts);
    return { color: 'var(--ok)', text: counts ? `Bağlı · ${counts}` : 'Bağlı', error: false };
  }
  return { color: 'var(--text-dim)', text: 'Henüz yüklenmedi', error: false };
}

/**
 * Explicitly defines the vertical navigation order: `rows` is a list of focus-id lists, each one being a
 * visual row, top to bottom. Down/Up only move to an adjacent row, Left/Right only within the same row (or
 * to the menu outside the rows). In forms with full-width fields and a short button row, the spatial
 * navigation calculation could skip the fields and jump straight to the buttons.
 */
export function verticalChain(getRows: () => string[][]): NonNullable<FocusManagerOptions['candidateFilter']> {
  return (current, candidate, direction) => {
    const rows = getRows();
    const from = current.dataset.focusId ?? '';
    const to = candidate.dataset.focusId ?? '';
    const rowOf = (id: string): number => rows.findIndex((r) => r.includes(id));
    const fromRow = rowOf(from);
    if (fromRow < 0) return true; // outside the rows (e.g. the left menu): default behavior
    const toRow = rowOf(to);
    // Down/Up: the FIRST item of the adjacent row (picking the closest item within the row caused
    // moving down from a wide field to land on the rightmost button in the row).
    if (direction === 'down' || direction === 'up') {
      const target = rows[fromRow + (direction === 'down' ? 1 : -1)];
      return !!target && to === target[0];
    }
    return toRow === fromRow || toRow < 0; // Left/Right: same row or the menu
  };
}
