import { describe, expect, it } from 'vitest';
import { growToFit, type Rect } from './grow.js';

/**
 * Growth is the first repair for overflowing copy: the frame has room more often
 * than the font has room to shrink. These cases pin the limits.
 */

const FRAME = { left: 0, top: 0, right: 1080, bottom: 1920 };

const box = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe('grow to fit', () => {
  it('grows the box towards the space it needs', () => {
    const result = growToFit(box(72, 700, 400, 120), { width: 420, height: 200 }, [], FRAME);

    expect(result.grew).toBe(true);
    expect(result.layout.width).toBe(420);
    expect(result.layout.height).toBe(200);
  });

  it('prefers the right and bottom edges, so most boxes stay in place', () => {
    const result = growToFit(box(72, 700, 400, 120), { width: 500, height: 200 }, [], FRAME);

    expect(result.layout.x).toBe(72);
    expect(result.layout.y).toBe(700);
    expect(result.layout.width).toBe(500);
    expect(result.layout.height).toBe(200);
  });

  it('grows left when the right side is blocked by a neighbour', () => {
    const neighbour = box(500, 700, 200, 120);
    const result = growToFit(box(72, 700, 400, 120), { width: 500, height: 120 }, [neighbour], FRAME);

    /* The right edge stops 16 px before the neighbour, the rest comes from the
       left until the frame bound is reached. */
    expect(result.layout.width).toBe(484);
    expect(result.layout.x).toBe(0);
  });

  it('grows up when the element below is too close', () => {
    const below = box(72, 860, 400, 120);
    const result = growToFit(box(72, 700, 400, 120), { width: 400, height: 300 }, [below], FRAME);

    expect(result.layout.height).toBe(300);
    expect(result.layout.y).toBe(544);
  });

  it('stops at the next element with a gap instead of covering it', () => {
    const neighbour = box(72, 900, 400, 120);
    const result = growToFit(box(72, 700, 400, 120), { width: 400, height: 400 }, [neighbour], FRAME);

    /* The bottom stops 16 px before the neighbour; the deficit is taken from
       the top, so the box reaches the size the copy asked for. */
    expect(result.layout.height).toBe(400);
    expect(result.layout.y).toBe(484);
    expect(result.grew).toBe(true);
  });

  it('counts what is already inside the box as content, not as an obstacle', () => {
    const inside = box(90, 720, 200, 40);
    const result = growToFit(box(72, 700, 400, 120), { width: 400, height: 260 }, [inside], FRAME);

    expect(result.layout.height).toBe(260);
  });

  it('leaves a box that already fits untouched', () => {
    const result = growToFit(box(72, 700, 400, 200), { width: 380, height: 180 }, [], FRAME);

    expect(result.grew).toBe(false);
    expect(result.layout).toEqual(box(72, 700, 400, 200));
  });

  it('is bounded by the safe area and uses both sides of it', () => {
    const result = growToFit(box(900, 700, 100, 100), { width: 900, height: 500 }, [], {
      left: 72,
      top: 220,
      right: 1008,
      bottom: 1600,
    });

    expect(result.layout.width).toBe(900);
    expect(result.layout.x).toBe(108);
    expect(result.layout.height).toBe(500);
  });
});
