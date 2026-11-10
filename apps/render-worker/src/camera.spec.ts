import type { SceneCamera } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARALLAX,
  cameraProgress,
  cameraTransform,
  movementMotion,
  parallaxCoefficient,
  shotScale,
  toCssTransform,
} from './camera.js';

function camera(overrides: Partial<SceneCamera> = {}): SceneCamera {
  return {
    shot: 'wide',
    movement: 'static',
    speed: 0,
    ...overrides,
  };
}

describe('camera module', () => {
  it('maps every shot to a distinct base scale, wide to extreme_close growing', () => {
    const shots: SceneCamera['shot'][] = [
      'extreme_wide',
      'wide',
      'medium',
      'close_up',
      'extreme_close',
    ];
    const scales = shots.map(shotScale);

    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(new Set(scales).size).toBe(shots.length);
    expect(shotScale('wide')).toBe(1);
  });

  it('uses a documented default parallax when camera.parallax is absent', () => {
    expect(parallaxCoefficient(undefined, 0)).toBe(DEFAULT_PARALLAX[0]);
    expect(parallaxCoefficient(undefined, 1)).toBe(
      DEFAULT_PARALLAX[DEFAULT_PARALLAX.length - 1],
    );
    expect(parallaxCoefficient([], 0.5)).toBeGreaterThan(0);
  });

  it('samples a custom parallax array by depth and clamps out-of-range depths', () => {
    const parallax = [0.2, 0.6, 1];

    expect(parallaxCoefficient(parallax, 0)).toBe(0.2);
    expect(parallaxCoefficient(parallax, 1)).toBe(1);
    expect(parallaxCoefficient(parallax, 0.5)).toBeCloseTo(0.6, 5);
    expect(parallaxCoefficient(parallax, -1)).toBe(0.2);
    expect(parallaxCoefficient(parallax, 2)).toBe(1);
  });

  it('changes the frame when shot changes', () => {
    const wide = cameraTransform(camera({ movement: 'zoom_in', speed: 0.3 }), 0.5);
    const close = cameraTransform(
      camera({ shot: 'close_up', movement: 'zoom_in', speed: 0.3 }),
      0.5,
    );

    expect(close.scale).toBeGreaterThan(wide.scale);
    expect(toCssTransform(close)).not.toBe(toCssTransform(wide));
  });

  it('changes the frame when parallax depth changes', () => {
    const near = cameraTransform(
      camera({ movement: 'pan', speed: 0.2, parallax: [0.2, 1] }),
      0.25,
      1,
    );
    const far = cameraTransform(
      camera({ movement: 'pan', speed: 0.2, parallax: [0.2, 1] }),
      0.25,
      0,
    );

    expect(Math.abs(near.translateXPercent)).toBeGreaterThan(
      Math.abs(far.translateXPercent),
    );
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it('scales pan movement with speed and keeps static at rest', () => {
    const slow = movementMotion('pan', 0, 0.25);
    const fast = movementMotion('pan', 1, 0.25);

    expect(Math.abs(fast.translateXPercent)).toBeGreaterThan(
      Math.abs(slow.translateXPercent),
    );
    expect(movementMotion('static', 1, 0.5)).toEqual({
      translateXPercent: 0,
      translateYPercent: 0,
      scale: 1,
    });
  });

  it('produces deterministic endpoints and clamps progress', () => {
    expect(cameraProgress(-5, 10)).toBe(0);
    expect(cameraProgress(99, 10)).toBe(1);
    expect(cameraProgress(0, 1)).toBe(0);

    const start = cameraTransform(camera({ movement: 'pan', speed: 0 }), 0);
    const end = cameraTransform(camera({ movement: 'pan', speed: 0 }), 1);

    expect(start.translateXPercent).toBeCloseTo(-1.6 * 0.6, 5);
    expect(end.translateXPercent).toBeCloseTo(1.6 * 0.6, 5);
    expect(toCssTransform(start)).toContain('scale(');
  });
});
