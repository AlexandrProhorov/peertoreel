import { storyboardFixture15Deg } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { resolveSceneComponent } from './mapping.js';

describe('scene component mapping', () => {
  it('uses an implemented programmatic component directly', () => {
    expect(resolveSceneComponent(storyboardFixture15Deg.scenes[0]!)).toEqual({
      componentId: 'parallax-city',
      source: 'implementation',
    });
  });

  it('uses the fallback for an image_animation scene', () => {
    expect(resolveSceneComponent(storyboardFixture15Deg.scenes[1]!)).toEqual({
      componentId: 'parallax-city',
      source: 'fallback',
    });
  });

  it('does not treat image_animation as a programmatic implementation', () => {
    const scene = structuredClone(storyboardFixture15Deg.scenes[0]!);
    scene.implementation = {
      type: 'image_animation',
      componentId: 'parallax-city',
      params: {},
      imagePrompt: 'stylized car',
      refIds: [],
    };

    expect(resolveSceneComponent(scene)).toEqual({
      componentId: 'parallax-city',
      source: 'fallback',
    });
  });

  it('uses the fallback for a hybrid scene', () => {
    const scene = structuredClone(storyboardFixture15Deg.scenes[0]!);
    scene.implementation = {
      type: 'hybrid',
      layers: [
        {
          role: 'background',
          source: 'programmatic',
          spec: { componentId: 'parallax-city' },
        },
      ],
    };

    expect(resolveSceneComponent(scene)).toEqual({
      componentId: 'parallax-city',
      source: 'fallback',
    });
  });

  it('uses the fallback for an unimplemented gauge scene', () => {
    expect(resolveSceneComponent(storyboardFixture15Deg.scenes[2]!)).toEqual({
      componentId: 'kinetic-typography',
      source: 'fallback',
    });
  });

  it('uses the implemented kinetic typography component directly', () => {
    expect(resolveSceneComponent(storyboardFixture15Deg.scenes[3]!)).toEqual({
      componentId: 'kinetic-typography',
      source: 'implementation',
    });
  });

  it('uses the fallback for an ai_video scene', () => {
    expect(resolveSceneComponent(storyboardFixture15Deg.scenes[4]!)).toEqual({
      componentId: 'parallax-city',
      source: 'fallback',
    });
  });

  it('falls back to generic typography when the fallback is not implemented', () => {
    expect(resolveSceneComponent(storyboardFixture15Deg.scenes[5]!)).toEqual({
      componentId: 'kinetic-typography',
      source: 'generic',
    });
  });
});
