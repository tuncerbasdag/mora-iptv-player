import { backChevronSvg } from '../../mouseSupport.ts';

export interface LiveLayout {
  /** Root of the screen (`.screen`); FocusManager attaches to this. */
  screen: HTMLElement;
  categoryList: HTMLElement;
  channelList: HTMLElement;
  /** The "N results" row: only visible while a search is being typed. */
  searchInfo: HTMLElement;
  /** Right column: preview card added at the top, EPG panel added below it. */
  rightCol: HTMLElement;
}

/**
 * Live TV layout: 3 columns inside a single large rounded panel — categories (328px), channels (540px), remaining width
 * is the right panel; a thin vertical divider line between columns. Content (rows, card, EPG) is added afterward; the
 * search box is supplied.
 */
export function buildLiveLayout(container: HTMLElement, searchBoxEl: HTMLElement, onBack?: () => void): LiveLayout {
  const screen = document.createElement('div');
  screen.className = 'screen';
  Object.assign(screen.style, { padding: '48px 64px' });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    flex: '1',
    minHeight: '0',
    display: 'flex',
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px',
  });

  // ---- categories
  const categoryBox = document.createElement('div');
  Object.assign(categoryBox.style, {
    width: '328px',
    flex: 'none',
    paddingRight: '28px',
    borderRight: '1.5px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minHeight: '0',
  });
  const titleEl = document.createElement('div');
  if (onBack) {
    // Desktop (Electron) only: mouse Back button to the left of the title (not focusable: remote/keyboard use Back/Esc).
    const back = document.createElement('button');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = backChevronSvg(24);
    Object.assign(back.style, {
      width: '44px', height: '44px', flex: 'none', marginRight: '14px', borderRadius: '50%', cursor: 'pointer',
      border: '1.5px solid var(--border)', background: 'transparent', color: 'inherit', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    back.addEventListener('click', onBack);
    titleEl.append(back);
  }
  titleEl.append('Canlı TV');
  Object.assign(titleEl.style, {
    height: '80px',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    fontSize: '38px',
    fontWeight: '800',
    letterSpacing: '-0.01em',
  });
  const titleDivider = document.createElement('div');
  Object.assign(titleDivider.style, { height: '1.5px', flex: 'none', background: 'var(--border)', margin: '4px 0 8px' });
  const categoryList = scrollColumn('4px');
  categoryBox.append(titleEl, titleDivider, categoryList);

  // ---- channels (search + list)
  const channelBox = document.createElement('div');
  Object.assign(channelBox.style, {
    width: '540px',
    flex: 'none',
    padding: '0 28px',
    borderRight: '1.5px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '0',
    overflow: 'hidden',
  });
  const channelList = scrollColumn('8px');
  const searchInfo = document.createElement('div');
  searchInfo.style.cssText = 'display:none;flex:none;font-size:24px;font-weight:600;color:var(--text-dim);padding:6px 8px 8px';
  channelBox.append(searchBoxEl, searchInfo, channelList);

  // ---- right column: preview card at the top (16:9 video + channel info), "Broadcast Schedule" below. The video box
  // sizes itself by its own aspect ratio (not by the grid row) so the 16:9 video doesn't end up with pillarbox gaps.
  const rightCol = document.createElement('div');
  Object.assign(rightCol.style, {
    flex: '1',
    minWidth: '0',
    paddingLeft: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minHeight: '0',
  });

  panel.append(categoryBox, channelBox, rightCol);
  screen.append(panel);
  container.append(screen);
  return { screen, categoryList, channelList, searchInfo, rightCol };
}

/** A vertically scrolling column with a hidden scrollbar. */
function scrollColumn(gap: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hide-scrollbar';
  Object.assign(el.style, { flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column', gap, overflowY: 'auto' });
  return el;
}
