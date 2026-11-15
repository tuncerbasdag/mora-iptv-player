import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNextFocus, type FocusRect } from '../src/focus.ts';

const grid: FocusRect[] = [
  { id: 'a1', x: 0, y: 0, w: 100, h: 50 },
  { id: 'a2', x: 120, y: 0, w: 100, h: 50 },
  { id: 'b1', x: 0, y: 70, w: 100, h: 50 },
  { id: 'b2', x: 120, y: 70, w: 100, h: 50 },
];

function others(id: string): FocusRect[] {
  return grid.filter((r) => r.id !== id);
}

test('right: finds the item to the right in the same row', () => {
  const r = findNextFocus(grid[0], others('a1'), 'right');
  assert.equal(r, 'a2');
});

test('down: finds the item below in the same column', () => {
  const r = findNextFocus(grid[0], others('a1'), 'down');
  assert.equal(r, 'b1');
});

test('left: cannot go left from the leftmost item, returns null', () => {
  const r = findNextFocus(grid[0], others('a1'), 'left');
  assert.equal(r, null);
});

test('down: among misaligned items the nearest (vertical distance + horizontal deviation) is chosen', () => {
  const skewed: FocusRect[] = [
    { id: 'top', x: 100, y: 0, w: 50, h: 50 },
    { id: 'near', x: 90, y: 100, w: 50, h: 50 },
    { id: 'far', x: 500, y: 100, w: 50, h: 50 },
  ];
  const r = findNextFocus(skewed[0], [skewed[1], skewed[2]], 'down');
  assert.equal(r, 'near');
});

test('returns null if no item lies in the direction', () => {
  const r = findNextFocus(grid[3], others('b2'), 'right');
  assert.equal(r, null);
});

test('left: in the vertical list in the right panel it must go to the category in the left panel, not the neighboring row, because of a sub-pixel difference', () => {
  // categoryBrowser.ts scenario: the category list on the left (x~0-200), the item list on the right (x~250+).
  // item-1's x is 1px less than item-2's (simulating the subpixel rendering difference seen in the real DOM) —
  // the old algorithm mistook this for "very close on the left" and jumped up within its own list.
  const current: FocusRect = { id: 'item-2', x: 250, y: 140, w: 800, h: 50 };
  const candidates: FocusRect[] = [
    { id: 'cat-0', x: 0, y: 0, w: 200, h: 50 },
    { id: 'cat-1', x: 0, y: 70, w: 200, h: 50 },
    { id: 'item-0', x: 250, y: 0, w: 800, h: 50 },
    { id: 'item-1', x: 249, y: 70, w: 800, h: 50 },
  ];
  const r = findNextFocus(current, candidates, 'left');
  assert.equal(r, 'cat-1');
});

test('left: if there is no candidate inside the cone it falls back to the nearest candidate outside the cone', () => {
  // The target is directly above (not near dx=0, but |dy|>|dx|) — the strict cone test accepts no candidate,
  // yet we still pick the nearest candidate so it doesn't feel like "nowhere to go".
  const current: FocusRect = { id: 'x', x: 500, y: 500, w: 50, h: 50 };
  const candidates: FocusRect[] = [{ id: 'y', x: 480, y: 0, w: 50, h: 50 }];
  const r = findNextFocus(current, candidates, 'left');
  assert.equal(r, 'y');
});
