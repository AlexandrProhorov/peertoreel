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

  it('never moves the element', () => {
    const result = growToFit(box(72, 700, 400, 120), { width: 900, height: 900 }, [], FRAME);

    expect(result.layout.x).toBe(72);
    expect(result.layout.y).toBe(700);
  });

  it('stops at the next element with a gap instead of covering it', () => {
    const neighbour = box(72, 900, 400, 120);
    const result = growToFit(box(72, 700, 400, 120), { width: 400, height: 400 }, [neighbour], FRAME);

    expect(result.layout.height).toBe(900 - 16 - 700);
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

  it('is bounded by the safe area', () => {
    const result = growToFit(box(900, 700, 100, 100), { width: 900, height: 500 }, [], {
      left: 72,
      top: 220,
      right: 1008,
      bottom: 1600,
    });

    expect(result.layout.width).toBe(1008 - 900);
    expect(result.layout.height).toBe(500);
  });
});
