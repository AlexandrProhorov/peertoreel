import { describe, expect, it } from 'vitest';
import { normalizeRawEpisode } from './normalize.js';

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
});
