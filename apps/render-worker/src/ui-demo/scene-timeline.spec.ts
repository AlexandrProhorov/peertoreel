import { describe, expect, it } from 'vitest';
import { placeScenes, sceneExitOpacity, sceneExitStyle } from './scene-timeline.js';
import { sceneEnterFrames } from './scene-enter.js';
import { CANVAS } from './platform.js';

/**
 * A transition overlaps two scenes: the next one starts before the previous one
 * ends, and the film shortens by exactly the overlaps. These cases pin the
 * arithmetic, including the clamps for very short scenes.
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
    const timeline = placeScenes(film([{ enter: 'cut', seconds: 2 }, { enter: 'cut', seconds: 3 }]), 30);

    expect(timeline.placed.map((item) => item.from)).toEqual([0, 60]);
    expect(timeline.totalFrames).toBe(150);
  });

  it('starts a fade scene before the previous one ends', () => {
    const timeline = placeScenes(
      film([{ enter: 'cut', seconds: 2 }, { enter: 'fade', seconds: 2 }]),
      30,
    );
    const fade = sceneEnterFrames('fade');

    expect(timeline.placed[1]?.from).toBe(60 - fade);
    expect(timeline.placed[1]?.overlap).toBe(fade);
    expect(timeline.totalFrames).toBe(120 - fade);
  });

  it('shortens the film by every overlap, not by a fixed amount', () => {
    const timeline = placeScenes(
      film([
        { enter: 'cut', seconds: 2 },
        { enter: 'fade', seconds: 2 },
        { enter: 'slide-up', seconds: 2 },
        { enter: 'cut', seconds: 2 },
      ]),
      30,
    );

    expect(timeline.totalFrames).toBe(240 - sceneEnterFrames('fade') - sceneEnterFrames('slide-up'));
  });

  it('never lets an overlap swallow a one-frame scene', () => {
    const timeline = placeScenes(
      film([{ enter: 'cut', seconds: 0.034 }, { enter: 'fade', seconds: 1 }]),
      30,
    );

    expect(timeline.placed[1]?.overlap).toBe(0);
    expect(timeline.placed[1]?.from).toBe(1);
  });

  it('is deterministic', () => {
    const scenes = film([{ enter: 'cut', seconds: 2 }, { enter: 'zoom', seconds: 2 }]);

    expect(placeScenes(scenes, 30)).toEqual(placeScenes(scenes, 30));
  });
});

describe('outgoing scene fade', () => {
  it('stays opaque until the dissolve starts', () => {
    expect(sceneExitOpacity('fade', 0, 60, 12)).toBe(1);
    expect(sceneExitOpacity('fade', 48, 60, 12)).toBe(1);
  });

  it('dims in step with the incoming fade', () => {
    expect(sceneExitOpacity('fade', 54, 60, 12)).toBeCloseTo(0.5, 5);
    expect(sceneExitOpacity('fade', 60, 60, 12)).toBe(0);
  });

  it('dims under every transition, not only a fade', () => {
    expect(sceneExitOpacity('slide-left', 54, 60, 12)).toBeCloseTo(0.5, 5);
    expect(sceneExitOpacity('wipe-left', 60, 60, 12)).toBe(0);
  });

  it('does not dim across a cut', () => {
    expect(sceneExitOpacity(undefined, 59, 60, 0)).toBe(1);
    expect(sceneExitOpacity('cut', 59, 60, 12)).toBe(1);
  });
});

describe('outgoing scene movement', () => {
  it('pushes the old frame along the slide direction, never across black', () => {
    /* The next scene comes from the top (slide-down starts at -H): the old one
       leaves downward with the same speed. */
    const half = sceneExitStyle('slide-down', 54, 60, 12).transform;

    expect(half).toBe(`translate(0px, ${CANVAS.height / 2}px)`);
    expect(sceneExitStyle('slide-left', 60, 60, 12).transform).toBe(
      `translate(${-CANVAS.width}px, 0px)`,
    );
  });

  it('lets a wipe keep its place and dim, and a cut do nothing', () => {
    const wipe = sceneExitStyle('wipe-left', 55, 60, 12);

    expect(wipe.transform).toBeUndefined();
    expect(wipe.opacity).toBeCloseTo(0.4167, 4);
    expect(sceneExitStyle('cut', 59, 60, 0)).toEqual({});
    expect(sceneExitStyle(undefined, 59, 60, 12)).toEqual({});
  });

  it('drifts a zoomed frame back while the next one arrives', () => {
    expect(sceneExitStyle('zoom', 60, 60, 12).transform).toBe('scale(1.0400)');
  });

  it('does nothing before the overlap begins', () => {
    expect(sceneExitStyle('fade', 40, 60, 12)).toEqual({});
    expect(sceneExitStyle('slide-up', 47, 60, 12)).toEqual({});
  });
});
