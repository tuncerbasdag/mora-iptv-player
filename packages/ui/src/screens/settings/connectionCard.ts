import { sourceLabel } from '../../../../core/src/connections.ts';
import type { Connection } from '../../../../core/src/types.ts';
import { checkIconSvg } from '../../icons.ts';
import { connectionStatus, formatWhen } from '../settingsShell.ts';

/** Single connection card: name, type · last check, Active/Inactive badge, and status dot. Enter/click -> Edit Connection. */
export function buildConnectionCard(c: Connection, index: number, isActive: boolean, refreshing: boolean, onOpen: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'conn-card';
  card.style.marginBottom = '16px';
  card.dataset.focusId = `conn-${index}`;
  card.dataset.connectionId = c.id;
  card.addEventListener('click', onOpen);

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;flex-direction:column;min-width:0';
  const name = document.createElement('div');
  name.style.cssText = `font-size:32px;font-weight:800;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isActive ? '' : 'color:var(--text-dim)'}`;
  name.textContent = c.name;
  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:24px;font-weight:600;color:var(--text-dim)';
  const checked = formatWhen(c.lastUpdated);
  meta.textContent = `${sourceLabel(c.source)} · ${checked ? `Son kontrol ${checked}` : 'Henüz kontrol edilmedi'}`;
  left.append(name, meta);

  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;flex:none;margin-left:24px';
  const badge = document.createElement('span');
  badge.className = 'conn-badge' + (isActive ? ' active' : '');
  if (isActive) badge.innerHTML = checkIconSvg(22);
  badge.append(document.createTextNode(isActive ? 'Aktif' : 'Pasif'));
  const st = connectionStatus(c, refreshing);
  const status = document.createElement('div');
  status.style.cssText = `display:flex;align-items:center;flex:none;margin-left:24px;font-size:26px;font-weight:700;color:${st.error ? 'var(--danger)' : 'var(--text)'}`;
  const dot = document.createElement('span');
  dot.style.cssText = `width:14px;height:14px;border-radius:7px;margin-right:12px;background:${st.color}`;
  status.append(dot, document.createTextNode(st.text));
  right.append(badge, status);

  card.append(left, right);
  return card;
}
