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
