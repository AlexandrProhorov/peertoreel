import {
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  sceneDurationInFrames,
  sceneInputPropsSchema,
} from './props.js';

describe('scene input props', () => {
  it('accepts the fixture scene, style and timings', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
      wordTimings: wordTimingsFixture15Deg,
    });

    expect(result.success).toBe(true);
  });

  it('accepts props without word timings', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: storyboardFixture15Deg.scenes[0]!,
      style: storyboardFixture15Deg.style,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid scene', () => {
    const result = sceneInputPropsSchema.safeParse({
      scene: { ...storyboardFixture15Deg.scenes[0]!, durationSec: -1 },
      style: storyboardFixture15Deg.style,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a scene whose duration disagrees with its voiceover', () => {
    const scene = structuredClone(storyboardFixture15Deg.scenes[0]!);
    scene.durationSec += 1;

    const result = sceneInputPropsSchema.safeParse({
      scene,
      style: storyboardFixture15Deg.style,
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
});
