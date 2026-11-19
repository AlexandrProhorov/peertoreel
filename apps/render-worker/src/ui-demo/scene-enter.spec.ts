import { describe, expect, it } from 'vitest';
import { ENTER_IDS, sceneEnterFrames, sceneEnterStyle } from './scene-enter.js';
import { CANVAS } from './platform.js';

/**
 * A transition is a pure function of (name, frame): the same frame always draws
 * the same picture, and no transition invents motion it was not asked for.
 */
describe('scene transitions', () => {
  it('leaves a cut untouched on every frame', () => {
    for (const frame of [0, 3, 30]) {
      expect(sceneEnterStyle('cut', frame)).toEqual({});
    }
  });

  it('starts the slide outside the frame and lands it exactly on the end', () => {
    expect(sceneEnterStyle('slide-left', 0).transform).toBe(`translate(${CANVAS.width}px, 0px)`);
    expect(sceneEnterStyle('slide-right', 0).transform).toBe(`translate(${-CANVAS.width}px, 0px)`);
    expect(sceneEnterStyle('slide-up', 0).transform).toBe(`translate(0px, ${CANVAS.height}px)`);

    const last = sceneEnterFrames('slide-left') - 1;

    expect(sceneEnterStyle('slide-left', last).transform).not.toContain(`${CANVAS.width}px`);
    expect(sceneEnterStyle('slide-left', sceneEnterFrames('slide-left'))).toEqual({});
  });

  it('fades in from nothing and is opaque once the transition ends', () => {
    expect(sceneEnterStyle('fade', 0).opacity).toBe(0);
    expect(sceneEnterStyle('fade', 6).opacity).toBe(0.5);
    expect(sceneEnterStyle('fade', 12)).toEqual({});
  });

  it('zooms down to the frame instead of overshooting it', () => {
    expect(sceneEnterStyle('zoom', 0).transform).toBe('scale(1.0600)');
    expect(sceneEnterStyle('zoom', 12)).toEqual({});

    const mid = sceneEnterStyle('zoom', 6).transform ?? '';

    expect(mid).toBe('scale(1.0300)');
  });

  it('wipes from the named edge and closes the inset at the end', () => {
    expect(sceneEnterStyle('wipe-left', 0).clipPath).toBe('inset(0 100.00% 0 0)');
    expect(sceneEnterStyle('wipe-right', 0).clipPath).toBe('inset(0 0 0 100.00%)');
    expect(sceneEnterStyle('wipe-left', 12)).toEqual({});
  });

  it('clamps a frame past the transition and ignores an unknown name', () => {
    expect(sceneEnterStyle('fade', 999)).toEqual({});
    expect(sceneEnterStyle('hologram', 3)).toEqual({});
    expect(sceneEnterFrames('hologram')).toBe(0);
  });

  it('declares a duration for every transition id', () => {
    for (const id of ENTER_IDS) {
      expect(sceneEnterFrames(id)).toBeGreaterThanOrEqual(0);
    }
  });
});
