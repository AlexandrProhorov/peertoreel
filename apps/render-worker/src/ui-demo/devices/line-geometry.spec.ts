import { describe, expect, it } from 'vitest';
import { lineEndpoints } from './line-geometry.js';

/**
 * A line is written in frame coordinates, like SVG. The element's layout box is
 * not an offset: adding it moved a foreign author's line twice and pushed it off
 * the frame.
 */
describe('line geometry', () => {
  it('uses the declared points as frame coordinates', () => {
    expect(lineEndpoints({ fromX: 110, fromY: 240, toX: 540, toY: 800 })).toEqual({
      fromX: 110,
      fromY: 240,
      toX: 540,
      toY: 800,
    });
  });

  it('keeps the direction while drawing: the end point travels from the start', () => {
    const half = lineEndpoints({ fromX: 100, fromY: 200, toX: 500, toY: 600 }, 0.5);

    expect(half).toEqual({ fromX: 100, fromY: 200, toX: 300, toY: 400 });
    expect(lineEndpoints({ fromX: 100, fromY: 200, toX: 500, toY: 600 }, 0)).toEqual({
      fromX: 100,
      fromY: 200,
      toX: 100,
      toY: 200,
    });
  });

  it('falls back to a horizontal line when points are absent', () => {
    expect(lineEndpoints({})).toEqual({ fromX: 0, fromY: 0, toX: 600, toY: 0 });
  });
});
