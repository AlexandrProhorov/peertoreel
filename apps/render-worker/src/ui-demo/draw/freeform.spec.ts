import { describe, expect, it } from 'vitest';
import { clampToRegion, paintRegion } from './freeform.js';
import type { FreeformRegion } from './layout.js';

const region: FreeformRegion = {
  intent: 'две карточки под углом, верхняя перекрывает нижнюю',
  bounds: { left: 72, top: 300, right: 1008, bottom: 900 },
};

const width = region.bounds.right - region.bounds.left;
const height = region.bounds.bottom - region.bounds.top;

describe('freeform: clamping into the reserved band', () => {
  it('keeps a box inside the band and cuts its size to fit', () => {
    const [box] = clampToRegion(
      [{ kind: 'box', x: -40, y: -10, w: 2000, h: 200, fill: 'surface' }],
      width,
      height,
    );

    expect(box).toMatchObject({ kind: 'box', x: 12, y: 12, w: width, h: 200 });
  });

  it('keeps a text on the band and never wider than it', () => {
    const [text] = clampToRegion(
      [{ kind: 'text', x: 20, y: 1200, w: 1200, text: '−70%', token: 'headline' }],
      width,
      height,
    );

    expect(text).toMatchObject({ kind: 'text', x: 12, y: height - 12, w: width });
  });

  it('clamps line endpoints instead of moving the band', () => {
    const [line] = clampToRegion(
      [{ kind: 'line', x1: -50, y1: -5, x2: 2000, y2: 2000 }],
      width,
      height,
    );

    expect(line).toMatchObject({ kind: 'line', x1: 12, y1: 12, x2: width - 12, y2: height - 12 });
  });

  it('shrinks an icon that is larger than the band', () => {
    const [icon] = clampToRegion(
      [{ kind: 'icon', x: 0, y: 0, size: 4000, emoji: '🔥' }],
      width,
      height,
    );

    expect(icon).toMatchObject({ kind: 'icon', size: Math.min(width, height) });
  });
});

describe('freeform: paint region', () => {
  it('paints inside the band, then moves it into the frame', async () => {
    const nodes = await paintRegion(region, async () =>
      JSON.stringify({
        nodes: [
          { kind: 'box', x: 0, y: 0, w: 400, h: 200, r: 24, fill: 'surface', rot: -6 },
          { kind: 'text', x: 40, y: 60, w: 320, text: '−70%', token: 'headline' },
        ],
      }),
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ kind: 'box', x: 72 + 12, y: 300 + 12 });
    expect(nodes[1]).toMatchObject({ kind: 'text', x: 72 + 40, y: 300 + 60 });
  });

  it('rejects an answer that is not a node tree', async () => {
    await expect(paintRegion(region, async () => '{"nodes":[{"kind":"blob"}]}')).rejects.toThrow();
  });
});
