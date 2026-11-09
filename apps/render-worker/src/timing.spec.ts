import {
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  objectAccentSec,
  objectWindowSec,
  findWordStartSec,
} from './timing.js';

describe('scene timing', () => {
  it('finds a synced word regardless of punctuation and case', () => {
    expect(findWordStartSec(wordTimingsFixture15Deg, 'морозе')).toBe(2.35);
    expect(findWordStartSec(wordTimingsFixture15Deg, 'Подписывайся')).toBe(
      50.4,
    );
  });

  it('scopes a repeated word to its own scene', () => {
    const batteryScene = storyboardFixture15Deg.scenes[2]!;

    expect(
      findWordStartSec(wordTimingsFixture15Deg, 'морозе', batteryScene),
    ).toBe(13.5);
  });

  it('matches a multi-word sync phrase', () => {
    const engineScene = storyboardFixture15Deg.scenes[1]!;

    expect(
      findWordStartSec(wordTimingsFixture15Deg, 'масло густеет', engineScene),
    ).toBe(7);
  });

  it('returns null for an unknown or absent sync word', () => {
    expect(findWordStartSec(wordTimingsFixture15Deg, 'нет-такого')).toBeNull();
    expect(findWordStartSec(wordTimingsFixture15Deg, null)).toBeNull();
  });

  it('converts an absolute object window to clip-local seconds', () => {
    const scene = storyboardFixture15Deg.scenes[0]!;
    const object = scene.objects[0]!;

    expect(objectWindowSec(scene, object, wordTimingsFixture15Deg)).toEqual({
      startSec: 1.2,
      endSec: 5.2,
    });
  });

  it('converts a later scene window relative to its own start', () => {
    const scene = storyboardFixture15Deg.scenes[1]!;
    const car = scene.objects[0]!;

    expect(objectWindowSec(scene, car, wordTimingsFixture15Deg)).toEqual({
      startSec: 0.2,
      endSec: 7.4,
    });
  });

  it('uses the synced word as the start when startSec is absent', () => {
    const scene = storyboardFixture15Deg.scenes[0]!;
    const object = {
      ...scene.objects[0]!,
      startSec: null,
      endSec: null,
    };

    expect(objectWindowSec(scene, object, wordTimingsFixture15Deg)).toEqual({
      startSec: 2.35,
      endSec: 5.2,
    });
  });

  it('clamps an object window that ends before the scene starts', () => {
    const scene = storyboardFixture15Deg.scenes[1]!;
    const object = {
      ...scene.objects[0]!,
      startSec: 4,
      endSec: 4.5,
    };

    expect(objectWindowSec(scene, object, wordTimingsFixture15Deg)).toEqual({
      startSec: 0,
      endSec: 0,
    });
  });

  it('reports the accent time relative to the clip', () => {
    const scene = storyboardFixture15Deg.scenes[0]!;
    const object = scene.objects[0]!;

    expect(objectAccentSec(scene, object, wordTimingsFixture15Deg)).toBe(2.35);
    expect(
      objectAccentSec(scene, scene.objects[1]!, wordTimingsFixture15Deg),
    ).toBeNull();
  });
});
