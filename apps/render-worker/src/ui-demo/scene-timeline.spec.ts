import { describe, expect, it } from 'vitest';
import { placeScenes, sceneExitOpacity, sceneExitStyle } from './scene-timeline.js';
import { sceneEnterFrames } from './scene-enter.js';
import { CANVAS } from './platform.js';

/**
 * The transition eats into the outgoing scene's tail. The timeline does not
 * move: every scene still starts where the arc put it and the film keeps its
 * planned length.
 */

interface Scene {
  readonly id: string;
  readonly enter?: string;
  readonly durationSec: number;
}

function film(entries: ReadonlyArray<{ enter: string; seconds: number }>): Scene[] {
  return entries.map((entry, index) => ({
    id: `s${index + 1}`,
    enter: entry.enter,
    durationSec: entry.seconds,
  }));
}

describe('scene placement', () => {
  it('keeps cuts sequential', () => {
    const timeline = placeScenes(
      film([{ enter: 'cut', seconds: 2 }, { enter: 'cut', seconds: 3 }]),
      30,
    );

    expect(timeline.placed.map((item) => item.from)).toEqual([0, 60]);
    expect(timeline.placed.map((item) => item.durationInFrames)).toEqual([60, 90]);
    expect(timeline.totalFrames).toBe(150);
  });

  it('starts a scene before its boundary and keeps the film length', () => {
    const timeline = placeScenes(
      film([{ enter: 'cut', seconds: 2 }, { enter: 'fade', seconds: 2 }]),
      30,
    );
    const fade = sceneEnterFrames('fade');

    expect(timeline.placed[1]?.from).toBe(60 - fade);
    expect(timeline.placed[1]?.overlap).toBe(fade);
    expect(timeline.placed[1]?.durationInFrames).toBe(60 + fade);
    /* The film still ends where the arc said it would. */
    expect(timeline.totalFrames).toBe(120);
  });

  it('keeps every boundary in place across several scenes', () => {
    const timeline = placeScenes(
      film([
        { enter: 'cut', seconds: 2 },
        { enter: 'fade', seconds: 2 },
        { enter: 'slide-up', seconds: 2 },
        { enter: 'cut', seconds: 2 },
      ]),
      30,
    );
    const boundaries = timeline.placed.map((item) => item.from + item.overlap);

    expect(boundaries).toEqual([0, 60, 120, 180]);
    expect(timeline.totalFrames).toBe(240);
  });

  it('never lets a transition swallow a one-frame scene', () => {
    const timeline = placeScenes(
      film([{ enter: 'cut', seconds: 0.034 }, { enter: 'fade', seconds: 1 }]),
      30,
    );

    expect(timeline.placed[1]?.overlap).toBe(0);
    expect(timeline.placed[1]?.from).toBe(1);
  });

  it('is deterministic', () => {
    const scenes = film([{ enter: 'cut', seconds: 2 }, { enter: 'slide-up', seconds: 2 }]);

    expect(placeScenes(scenes, 30)).toEqual(placeScenes(scenes, 30));
  });
});

describe('outgoing scene', () => {
  it('stays opaque until the overlap begins', () => {
    expect(sceneExitOpacity('fade', 0, 69, 9)).toBe(1);
    expect(sceneExitOpacity('fade', 60, 69, 9)).toBe(1);
  });

  it('dims with the same eased curve as the incoming scene', () => {
    expect(sceneExitOpacity('fade', 64.5, 69, 9)).toBeCloseTo(0.5, 5);
    expect(sceneExitOpacity('fade', 69, 69, 9)).toBe(0);
  });

  it('does not dim across a cut', () => {
    expect(sceneExitOpacity(undefined, 59, 60, 0)).toBe(1);
    expect(sceneExitOpacity('cut', 59, 60, 9)).toBe(1);
  });

  it('drifts a slide by the same few pixels, in the opposite direction', () => {
    const drift = CANVAS.width * 0.012;
    const style = sceneExitStyle('slide-left', 69, 69, 9);

    expect(style.opacity).toBe(0);
    expect(style.transform).toBe(`translate(${(-drift).toFixed(2)}px, 0.00px)`);
  });

  it('leaves the frame in place when there is nothing to do', () => {
    expect(sceneExitStyle(undefined, 59, 60, 9)).toEqual({});
    expect(sceneExitStyle('fade', 50, 69, 9)).toEqual({});
  });
});
