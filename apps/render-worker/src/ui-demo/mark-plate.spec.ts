import { describe, expect, it } from 'vitest';
import { TYPE_SCALE } from './typography.js';
import { MIN_FONT_SCALE, markPlateBox } from './typography-rules.js';

/**
 * The highlight plate is painted per wrapped line. When it is taller than the
 * line box it covers the descenders of the line above ("д" cut by the next
 * plate), so the geometry is checked for every token and scale.
 */
describe('the highlight plate fits inside its line', () => {
  it('keeps the plate shorter than the line for every token', () => {
    for (const [token, style] of Object.entries(TYPE_SCALE)) {
      for (const scale of [1, MIN_FONT_SCALE]) {
        const box = markPlateBox(style.fontSize * scale);

        expect(box.plateHeight, `${token} at ${String(scale)}`).toBeLessThan(
          box.lineBox,
        );
      }
    }
  });

  it('keeps the gap proportional, so a shrunk font cannot close it', () => {
    const box = markPlateBox(72 * MIN_FONT_SCALE);

    expect(box.lineBox - box.plateHeight).toBeCloseTo(
      72 * MIN_FONT_SCALE * 0.18,
      5,
    );
  });
});
