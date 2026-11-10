import {
  storyboardFixture15Deg,
  storyboardSchema,
} from '@peertoreel/contracts';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveSceneComponent } from './mapping.js';

const EXAMPLE_PATH = new URL(
  '../examples/custom-storyboard.json',
  import.meta.url,
);
const raw: unknown = JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8'));
const storyboard = storyboardSchema.parse(raw);

describe('examples/custom-storyboard.json', () => {
  it('is a valid storyboard.v1 document', () => {
    expect(storyboard.schemaVersion).toBe('peertoreel.storyboard.v1');
    expect(storyboard.scenes.length).toBeGreaterThanOrEqual(3);
  });

  it('is not the built-in fixture', () => {
    expect(storyboard.runId).not.toBe(storyboardFixture15Deg.runId);
    expect(JSON.stringify(storyboard)).not.toBe(
      JSON.stringify(storyboardFixture15Deg),
    );
    expect(storyboard.style.styleId).toBe('flat_2d_motion');
  });

  it('uses only implemented components', () => {
    for (const scene of storyboard.scenes) {
      expect(() => resolveSceneComponent(scene)).not.toThrow();
    }
  });

  it('uses params that differ from the fixture', () => {
    const hook = storyboard.scenes[0]!.implementation;

    if (hook.type !== 'programmatic') {
      throw new Error('custom hook must be programmatic');
    }

    expect(hook.componentId).toBe('parallax-city');
    expect(hook.params).toMatchObject({
      buildingsSeed: 2026,
      lamp: 'left',
      snowDensity: 0,
      focus: 'skyline',
      roadGlow: true,
    });

    const typography = storyboard.scenes[1]!.implementation;

    if (typography.type !== 'programmatic') {
      throw new Error('custom second scene must be programmatic');
    }

    expect(typography.componentId).toBe('kinetic-typography');
    expect(typography.params).toMatchObject({
      preset: 'statement',
      underline: true,
    });
  });

  it('keeps scene durations equal to the audio length', () => {
    const total = storyboard.scenes.reduce(
      (sum, scene) => sum + scene.durationSec,
      0,
    );

    expect(total).toBeCloseTo(storyboard.audio.durationSec, 5);
  });
});
