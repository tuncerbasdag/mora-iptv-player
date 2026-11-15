import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtitleStyleCss } from '../src/subtitleStyle.ts';

test('default style (medium/white/none/bottom) matches the hardcoded old .vod-caption look', () => {
  const css = subtitleStyleCss({ size: 'medium', color: 'white', background: 'none', position: 'bottom' });
  assert.equal(css.fontSize, '44px');
  assert.equal(css.color, '#ffffff');
  assert.equal(css.background, 'transparent');
  assert.equal(css.bottom, '110px');
  assert.equal(css.top, 'auto');
});

test('size/color/background/position each map to a distinct value', () => {
  assert.equal(subtitleStyleCss({ size: 'xlarge', color: 'white', background: 'none', position: 'bottom' }).fontSize, '72px');
  assert.equal(subtitleStyleCss({ size: 'medium', color: 'cyan', background: 'none', position: 'bottom' }).color, '#8be9fd');
  const opaque = subtitleStyleCss({ size: 'medium', color: 'white', background: 'opaque', position: 'bottom' });
  assert.equal(opaque.background, 'rgba(0, 0, 0, 0.92)');
  assert.equal(opaque.padding, '6px 24px');
});

test('top position clears bottom (and vice versa) so the box does not stretch between both edges', () => {
  const top = subtitleStyleCss({ size: 'medium', color: 'white', background: 'none', position: 'top' });
  assert.equal(top.top, '80px');
  assert.equal(top.bottom, 'auto');
  const bottom = subtitleStyleCss({ size: 'medium', color: 'white', background: 'none', position: 'bottom' });
  assert.equal(bottom.bottom, '110px');
  assert.equal(bottom.top, 'auto');
});
