import {
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENE_INPUT_PROPS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  sceneDurationInFrames,
  sceneInputPropsSchema,
} from './props.js';

const resolved = {
  componentId: 'parallax-city' as const,
  params: {},
  recipe: null,
};

describe('scene input props', () => {
  it('accepts the fixture scene, style, resolution and timings', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
      resolved,
      wordTimings: wordTimingsFixture15Deg,
    });

    expect(result.success).toBe(true);
  });

  it('accepts props without word timings', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
      resolved,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a resolved asset map and rejects a malformed one', () => {
    const withAssets = sceneInputPropsSchema.safeParse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
      resolved,
      assets: {
        'assets/starter/brick.svg': { url: 'data:image/svg+xml;base64,PHN2Zy8+' },
      },
    });

    expect(withAssets.success).toBe(true);
    expect(
      sceneInputPropsSchema.safeParse({
        scene: storyboardFixture15Deg.scenes[0]!,
        style: storyboardFixture15Deg.style,
        resolved,
        assets: { broken: {} },
      }).success,
    ).toBe(false);
  });

  it('rejects props without a resolved scene', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
    });

    expect(result.success).toBe(false);
  });

  it('fills component params defaults in the resolved boundary', () => {
    const parsed = sceneInputPropsSchema.parse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
      resolved,
    });

    expect(parsed.resolved).toMatchObject({
      componentId: 'parallax-city',
      params: {
        buildingsSeed: 42,
        lamp: 'right',
        snowDensity: 1,
        focus: 'street',
        roadGlow: true,
      },
    });
  });

  it('rejects an invalid scene', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: { ...storyboardFixture15Deg.scenes[0]!, durationSec: -1 },
      style: storyboardFixture15Deg.style,
      resolved,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a scene whose duration disagrees with its voiceover', () => {
    const scene = structuredClone(storyboardFixture15Deg.scenes[0]!);
    scene.durationSec += 1;

    const result = sceneInputPropsSchema.safeParse({
      scene,
      style: storyboardFixture15Deg.style,
      resolved,
    });

    expect(result.success).toBe(false);
  });

  it('converts scene seconds to frames at 30 fps', () => {
    expect(sceneDurationInFrames(storyboardFixture15Deg.scenes[0]!)).toBe(156);
    expect(sceneDurationInFrames(storyboardFixture15Deg.scenes[5]!)).toBe(300);
  });

  it('never produces a zero-frame composition', () => {
    const scene = {
      ...storyboardFixture15Deg.scenes[0]!,
      durationSec: 0.001,
    };

    expect(sceneDurationInFrames(scene)).toBe(1);
  });

  it('has a valid neutral preview default', () => {
    expect(sceneInputPropsSchema.safeParse(DEFAULT_SCENE_INPUT_PROPS).success).toBe(
      true,
    );
  });

  it('takes scene dimensions from the shared video target', () => {
    expect(SCENE_WIDTH).toBe(1080);
    expect(SCENE_HEIGHT).toBe(1920);
  });
});
