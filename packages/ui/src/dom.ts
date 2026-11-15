/** Creates a `<div>` that can be given a style and class (a small helper repeated across screens). */
export function div(style = '', className = ''): HTMLElement {
  const d = document.createElement('div');
  if (style) d.style.cssText = style;
  if (className) d.className = className;
  return d;
}
