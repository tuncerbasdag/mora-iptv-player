export interface SearchBox {
  el: HTMLElement;
  input: HTMLInputElement;
}

/**
 * Channel search box: clicking/Enter focuses the native input (FocusManager already handles
 * exiting with Enter/Escape and Up/Down navigation while inside the input). Calls `onChange(raw text)` on every keystroke.
 */
export function createSearchBox(onChange: (value: string) => void): SearchBox {
  const searchBox = document.createElement('div');
  searchBox.dataset.focusId = 'search';
  // Border/focus ring lives in CSS (.live-search): an inline box-shadow was overriding the `.focused` ring and hiding the highlight.
  searchBox.className = 'live-search';
  Object.assign(searchBox.style, {
    flex: 'none',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 22px',
    borderRadius: '20px',
    background: 'var(--bg)',
    cursor: 'text',
    marginBottom: '8px',
  });
  const searchIcon = document.createElement('span');
  searchIcon.style.cssText = 'display:flex;flex:none;color:var(--text-dim)';
  searchIcon.innerHTML =
    '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.lang = 'tr';
  searchInput.placeholder = 'Kanal adı veya numara';
  searchInput.setAttribute('aria-label', 'Kanal ara');
  Object.assign(searchInput.style, {
    all: 'unset',
    boxSizing: 'border-box',
    flex: '1',
    minWidth: '0',
    height: '100%',
    fontFamily: 'inherit',
    fontSize: '30px',
    fontWeight: '700',
    color: 'var(--text)',
    caretColor: 'var(--accent)',
  });
  // Clear (x): only visible while there's text; design: 56px circle, 10% opacity background, 28px cross.
  const searchClear = document.createElement('button');
  searchClear.type = 'button';
  searchClear.className = 'search-clear';
  searchClear.setAttribute('aria-label', 'Aramayı temizle');
  searchClear.style.display = 'none';
  searchClear.innerHTML =
    '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  searchClear.addEventListener('click', (e) => {
    e.stopPropagation();
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  });
  searchBox.append(searchIcon, searchInput, searchClear);
  searchBox.addEventListener('click', () => searchInput.focus());

  searchInput.addEventListener('input', () => {
    const value = searchInput.value;
    const hasText = value.length > 0;
    searchClear.style.display = hasText ? 'flex' : 'none';
    searchBox.style.paddingRight = hasText ? '12px' : '22px';
    onChange(value);
  });

  return { el: searchBox, input: searchInput };
}
