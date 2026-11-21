import { describe, expect, it } from 'vitest';
import { normalizeRawEpisode } from './normalize.js';
import type { Repair } from './salvage.js';

/**
 * Surface separation moves a box that overlaps its neighbour by a few pixels.
 * It must never push that box out of the frame: a card at y 1336 with height 900
 * came from the separator, not from the model.
 */

function episode(second: { x: number; y: number; width: number; height: number }): unknown {
  return {
    schemaVersion: 1,
    themeId: 'studio-dark',
    captions: false,
    speech: [],
    scenes: [
      {
        id: 'separation',
        device: 'spec',
        durationSec: 3,
        revealSec: 1,
        themeId: 'studio-dark',
        spec: {
          kind: 'composition',
          elements: [
            {
              id: 'first',
              primitive: 'card',
              layout: { x: 100, y: 900, width: 500, height: 300 },
              params: { background: '#161618' },
            },
            {
              id: 'second',
              primitive: 'card',
              layout: second,
              params: { background: '#F3F3F5' },
            },
          ],
          sequence: [],
        },
      },
    ],
  };
}

function layoutOf(raw: unknown, id: string): { x: number; y: number } {
  const normalized = normalizeRawEpisode(raw) as {
    scenes: ReadonlyArray<{
      spec: { elements: ReadonlyArray<{ id: string; layout: { x: number; y: number } }> };
    }>;
  };
  const found = normalized.scenes[0]?.spec.elements.find((element) => element.id === id);

  if (found === undefined) {
    throw new Error(`${id} is missing`);
  }

  return found.layout;
}

describe('surface separation', () => {
  it('moves a slightly overlapping box below when there is room', () => {
    const moved = layoutOf(episode({ x: 560, y: 920, width: 300, height: 300 }), 'second');

    expect(moved).toMatchObject({ x: 560, y: 1216 });
  });

  it('keeps the overlap when neither side has room inside the frame', () => {
    const raw = episode({ x: 560, y: 1320, width: 300, height: 300 });
    const kept = layoutOf(raw, 'second');

    /* Below would end at 1916px on a 1920px frame, past the safe bottom; the
       overlap is smaller than a lost surface. */
    expect(kept).toMatchObject({ x: 560, y: 1320 });
  });

  it('separates two text chips even above the collage share', () => {
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-dark',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 'chips',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            elements: [
              {
                id: 'first',
                primitive: 'pill',
                layout: { x: 400, y: 300, width: 300, height: 90 },
                params: { text: 'одна', token: 'caption' },
              },
              {
                id: 'second',
                primitive: 'pill',
                layout: { x: 590, y: 300, width: 300, height: 90 },
                params: { text: 'другая', token: 'caption' },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const moved = layoutOf(raw, 'second');

    /* 37 % of the smaller chip: a collage of plain shapes is fine, text under
       text is not — the chip moves below. */
    expect(moved).toMatchObject({ x: 590, y: 406 });
  });

  it('moves a label off the card edge and narrows it to the inner width', () => {
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-dark',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 'inset',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            elements: [
              {
                id: 'card',
                primitive: 'card',
                layout: { x: 72, y: 420, width: 818, height: 520 },
                params: { background: '#161618' },
              },
              {
                id: 'label',
                primitive: 'label',
                layout: { x: 72, y: 470, width: 818, height: 200 },
                params: { text: 'Цена товара', token: 'headline', tone: 'ink' },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const moved = layoutOf(raw, 'label');

    /* The card's `padding` never moved the label: the copy sat on the rounded
       edge. Code puts it inside and narrows the box so the padding is real. */
    expect(moved).toMatchObject({ x: 96, y: 470, width: 770 });
  });

  it('leaves an impossible side-by-side overlap for the validator', () => {
    const element = (id: string, x: number, width: number, text: string): Record<string, unknown> => ({
      id,
      primitive: 'card',
      layout: { x, y: 300, width, height: 900 },
      params: { background: '#F3F3F5', text },
    });
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-light',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 'cards',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-light',
          spec: {
            kind: 'composition',
            elements: [
              element('left', 72, 420, 'Мои подписки'),
              element('right', 470, 420, 'Не пользуюсь'),
              {
                id: 'leftTag',
                primitive: 'label',
                layout: { x: 104, y: 360, width: 356, height: 140 },
                params: { text: 'Мои подписки', token: 'card', tone: 'ink' },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const normalized = normalizeRawEpisode(raw) as {
      scenes: ReadonlyArray<{
        spec: { elements: ReadonlyArray<{ id: string; layout: Record<string, number> }> };
      }>;
    };
    const right = normalized.scenes[0]?.spec.elements.find((item) => item.id === 'right');

    /* 72 + 420 + 16 + 420 = 928 > 890: the gap is impossible. Shrinking would
       squeeze the copy, so the overlap stays and the contract rejects it. */
    expect(right?.layout).toMatchObject({ x: 470, width: 420 });
  });

  it('moves the accent to a captioned surface before removing an empty one', () => {
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-dark',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 'accent',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            elements: [
              {
                id: 'accent-block',
                primitive: 'card',
                layout: { x: 72, y: 1200, width: 300, height: 200 },
                params: { background: '#CCFF00' },
              },
              {
                id: 'kept',
                primitive: 'card',
                layout: { x: 72, y: 300, width: 400, height: 300 },
                params: { background: '#161618', text: 'осталось' },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const repairs: Repair[] = [];
    const normalized = normalizeRawEpisode(raw, repairs) as {
      scenes: ReadonlyArray<{
        spec: {
          elements: ReadonlyArray<{ id: string; params: Record<string, unknown> }>;
        };
      }>;
    };
    const kept = normalized.scenes[0]?.spec.elements.find((item) => item.id === 'kept');

    expect(normalized.scenes[0]?.spec.elements.map((item) => item.id)).toEqual(['kept']);
    expect(kept?.params['background']).toBe('#CCFF00');
    expect(repairs.map((repair) => repair.path)).toEqual([
      'accent-transferred',
      'surface-removed',
      /* The removed accent block was also the main token: the kept card takes
         the hierarchy back instead of failing the gate. */
      'hierarchy-promoted',
    ]);
  });

  it('retargets a focus whose element was removed as empty', () => {
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-dark',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 'retarget',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            focus: 'blank',
            elements: [
              {
                id: 'blank',
                primitive: 'card',
                layout: { x: 72, y: 1200, width: 300, height: 200 },
                params: { background: '#161618' },
              },
              {
                id: 'kept',
                primitive: 'card',
                layout: { x: 72, y: 300, width: 400, height: 300 },
                params: { background: '#161618', text: 'осталось' },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const repairs: Repair[] = [];
    const normalized = normalizeRawEpisode(raw, repairs) as {
      scenes: ReadonlyArray<{
        spec: { focus?: string; elements: ReadonlyArray<{ id: string }> };
      }>;
    };
    const scene = normalized.scenes[0];

    expect(scene?.spec.focus).toBe('kept');
    expect(scene?.spec.elements.map((item) => item.id)).toEqual(['kept']);
    expect(repairs.map((repair) => repair.path)).toContain('focus-retargeted');
  });

  it('applies the card padding to a track and shortens its rail', () => {
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-dark',
      captions: false,
      speech: [],
      scenes: [
        {
          id: 'track',
          device: 'spec',
          durationSec: 3,
          revealSec: 1,
          themeId: 'studio-dark',
          spec: {
            kind: 'composition',
            elements: [
              {
                id: 'card',
                primitive: 'card',
                layout: { x: 72, y: 300, width: 818, height: 620 },
                params: { background: '#FFFFFF', padding: 32 },
              },
              {
                id: 'bar',
                primitive: 'track',
                layout: { x: 72, y: 560, width: 818, height: 24 },
                params: { length: 840, thickness: 14, fill: 1 },
              },
            ],
            sequence: [],
          },
        },
      ],
    };
    const normalized = normalizeRawEpisode(raw) as {
      scenes: ReadonlyArray<{
        spec: {
          elements: ReadonlyArray<{
            id: string;
            layout: Record<string, number>;
            params: Record<string, unknown>;
          }>;
        };
      }>;
    };
    const bar = normalized.scenes[0]?.spec.elements.find((element) => element.id === 'bar');

    /* The rail is a parameter: narrowing the box alone leaves it overrunning. */
    expect(bar?.layout).toMatchObject({ x: 104, width: 754 });
    expect(bar?.params['length']).toBe(754);
  });
});

/**
 * A scene finishes before the cut. The plan is intent, not a cap, and a scene
 * that already carries cue times must not be compacted a second time.
 */
function timedEpisode(durationSec: number): unknown {
  return {
    schemaVersion: 1,
    themeId: 'studio-dark',
    captions: false,
    speech: [],
    scenes: [
      {
        id: 'timed',
        device: 'spec',
        durationSec,
        themeId: 'studio-dark',
        spec: {
          kind: 'composition',
          elements: [
            {
              id: 'card',
              primitive: 'card',
              layout: { x: 200, y: 800, width: 600, height: 400 },
              params: { background: '#161618', text: 'готово' },
            },
          ],
          sequence: [
            { element: 'card', transition: 'appear', at: 0 },
            { element: 'card', transition: 'scale', at: 2.6 },
          ],
        },
      },
    ],
  };
}

function durationOf(raw: unknown): number {
  const normalized = normalizeRawEpisode(raw) as {
    scenes: ReadonlyArray<{ durationSec: number }>;
  };

  return normalized.scenes[0]?.durationSec ?? 0;
}

describe('scene end', () => {
  it('extends a scene that ends on its last animation', () => {
    /* The action stops at 3.0 s and the plan says 2 s: the scene holds 0.8 s. */
    expect(durationOf(timedEpisode(2))).toBe(3.8);
  });

  it('keeps a scene that already has room after the action', () => {
    expect(durationOf(timedEpisode(8))).toBe(8);
  });

  it('does not shrink a scene when it is normalised twice', () => {
    const once = normalizeRawEpisode(timedEpisode(8));

    expect(durationOf(once)).toBe(8);
    expect(durationOf(once)).toBe(durationOf(normalizeRawEpisode(once)));
  });
});

/**
 * A rail is filled along its short side. A model that draws the bar taller than
 * wide ("the total grew") used to get a vertical sliver with the fill running
 * across 24 px. The contract owns the geometry; the box is rebuilt around it.
 */
function trackEpisode(layout: Record<string, number>): unknown {
  return {
    schemaVersion: 1,
    themeId: 'studio-lime',
    captions: false,
    speech: [],
    scenes: [
      {
        id: 'rail',
        device: 'spec',
        durationSec: 4,
        themeId: 'studio-lime',
        spec: {
          kind: 'composition',
          elements: [
            {
              id: 'bar',
              primitive: 'track',
              layout,
              params: { length: 520, thickness: 24, fill: 0.4 },
            },
          ],
          sequence: [
            { element: 'bar', transition: 'appear' },
            { element: 'bar', transition: 'fill' },
          ],
        },
      },
    ],
  };
}

describe('track orientation', () => {
  it('turns a tall box into a horizontal rail and centres it', () => {
    const repairs: Repair[] = [];
    const normalized = normalizeRawEpisode(trackEpisode({ x: 560, y: 400, width: 80, height: 520 }), repairs) as {
      scenes: ReadonlyArray<{
        spec: { elements: ReadonlyArray<{ layout: Record<string, number>; params: Record<string, unknown> }> };
      }>;
    };
    const bar = normalized.scenes[0]?.spec.elements[0];

    expect(bar?.layout).toEqual({ x: 340, y: 648, width: 520, height: 24 });
    expect(bar?.params['length']).toBe(520);
    expect(repairs.map((repair) => repair.path)).toContain('track-axis');
  });

  it('keeps a rail inside the safe area when the model asks for more', () => {
    const normalized = normalizeRawEpisode(trackEpisode({ x: 72, y: 700, width: 818, height: 80 })) as {
      scenes: ReadonlyArray<{
        spec: { elements: ReadonlyArray<{ layout: Record<string, number> }> };
      }>;
    };
    const layout = normalized.scenes[0]?.spec.elements[0]?.layout ?? {};

    expect(layout['width']).toBe(818);
    expect(layout['x']).toBe(72);
  });

  it('does not touch a rail that already fits its box', () => {
    const repairs: Repair[] = [];
    normalizeRawEpisode(trackEpisode({ x: 72, y: 700, width: 520, height: 24 }), repairs);

    expect(repairs.map((repair) => repair.path)).not.toContain('track-axis');
  });
});

describe('track stacking', () => {
  it('stacks two rails that would overlap after the orientation fix', () => {
    const raw = trackEpisode({ x: 560, y: 400, width: 80, height: 520 }) as {
      scenes: Array<{ spec: { elements: Array<Record<string, unknown>> } }>;
    };
    raw.scenes[0]?.spec.elements.push({
      id: 'bar2',
      primitive: 'track',
      layout: { x: 680, y: 400, width: 80, height: 520 },
      params: { length: 520, thickness: 24, fill: 0.6 },
    });
    const normalized = normalizeRawEpisode(raw) as {
      scenes: ReadonlyArray<{
        spec: { elements: ReadonlyArray<{ layout: Record<string, number> }> };
      }>;
    };
    const first = normalized.scenes[0]?.spec.elements[0]?.layout ?? {};
    const second = normalized.scenes[0]?.spec.elements[1]?.layout ?? {};

    expect(second['y']).toBe((first['y'] ?? 0) + (first['height'] ?? 0) + 24);
    expect(second['x']).toBe(first['x']);
  });
});
