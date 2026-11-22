import { describe, expect, it } from 'vitest';
import { ENTER_IDS, easeInOut, sceneEnterFrames, sceneEnterStyle } from './scene-enter.js';
import { CANVAS } from './platform.js';

/**
 * The transition is a pure function of (name, frame): the same frame always
 * draws the same picture. A dissolve is the default; a slide adds a drift of
 * about one percent of the frame, never a full-screen push.
 */

const DRIFT_X = CANVAS.width * 0.012;
const DRIFT_Y = CANVAS.height * 0.012;

describe('scene entrances', () => {
  it('leaves a cut untouched on every frame', () => {
    for (const frame of [0, 3, 30]) {
      expect(sceneEnterStyle('cut', frame)).toEqual({});
    }
  });

  it('dissolves with an ease-in-out curve, not a straight ramp', () => {
    expect(sceneEnterStyle('fade', 0).opacity).toBe(0);
    expect(sceneEnterStyle('fade', 4.5).opacity).toBeCloseTo(0.5, 5);
    expect(sceneEnterStyle('fade', 9)).toEqual({});

    /* Half-time is half-opacity, quarter-time is below a quarter: the curve
       starts and ends softly. */
    expect(sceneEnterStyle('fade', 2.25).opacity).toBeLessThan(0.25);
    expect(sceneEnterStyle('fade', 6.75).opacity).toBeGreaterThan(0.75);
  });

  it('drifts a slide by one percent of the frame, not across the screen', () => {
    const start = sceneEnterStyle('slide-left', 0);

    expect(start.transform).toBe(`translate(${DRIFT_X.toFixed(2)}px, 0.00px)`);
    expect(start.opacity).toBe(0);
    expect(sceneEnterStyle('slide-down', 0).transform).toBe(
      `translate(0.00px, ${(-DRIFT_Y).toFixed(2)}px)`,
    );
    expect(DRIFT_X).toBeLessThan(CANVAS.width * 0.02);
  });

  it('settles exactly on the boundary frame', () => {
    for (const enter of ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down']) {
      expect(sceneEnterStyle(enter, sceneEnterFrames(enter))).toEqual({});
    }
  });

  it('ignores unknown names and never invents motion', () => {
    expect(sceneEnterStyle('wipe-left', 3)).toEqual({});
    expect(sceneEnterStyle('zoom', 3)).toEqual({});
    expect(sceneEnterFrames('hologram')).toBe(0);
  });

  it('declares a duration for every transition id', () => {
    for (const id of ENTER_IDS) {
      expect(sceneEnterFrames(id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the easing smooth at both ends', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.01)).toBeLessThan(0.01);
    expect(easeInOut(0.99)).toBeGreaterThan(0.99);
  });
});
