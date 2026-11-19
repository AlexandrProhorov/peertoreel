import { describe, expect, it } from 'vitest';
import {
  InvalidRgbaImageError,
  alphaBounds,
  alphaOccupancy,
  validateCutoutAlpha,
  type RgbaImage,
} from './normalize-raster.js';

function image(width: number, height: number, opaque: readonly [number, number][]): RgbaImage {
  const data = new Uint8Array(width * height * 4);

  for (const [x, y] of opaque) {
    const offset = (y * width + x) * 4;

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }

  return { data, width, height };
}

describe('raster alpha checks', () => {
  it('measures opaque occupancy', () => {
    const sample = image(4, 4, [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);

    expect(alphaOccupancy(sample)).toBe(0.25);
  });

  it('returns a tight bounding box or null for an empty image', () => {
    const sample = image(4, 4, [
      [1, 1],
      [2, 2],
    ]);

    expect(alphaBounds(sample)).toEqual({
      minX: 1,
      minY: 1,
      maxX: 2,
      maxY: 2,
      width: 2,
      height: 2,
    });
    expect(alphaBounds(image(2, 2, []))).toBeNull();
  });

  it('rejects empty and unremoved-background cutouts', () => {
    const empty = validateCutoutAlpha(image(10, 10, []));

    expect(empty).toMatchObject({ ok: false, reason: 'empty' });

    const full = image(
      10,
      10,
      Array.from({ length: 100 }, (_, index) => [index % 10, Math.floor(index / 10)] as [number, number]),
    );
    const unremoved = validateCutoutAlpha(full);

    expect(unremoved).toMatchObject({ ok: false, reason: 'background_not_removed' });
  });

  it('accepts a cutout inside the occupancy window', () => {
    const sample = image(10, 10, [
      [4, 4],
      [5, 4],
      [4, 5],
      [5, 5],
      [3, 5],
      [6, 5],
      [4, 6],
      [5, 6],
      [3, 4],
      [6, 4],
    ]);

    expect(validateCutoutAlpha(sample)).toMatchObject({
      ok: true,
      reason: null,
    });
  });

  it('rejects malformed RGBA buffers', () => {
    expect(() =>
      alphaOccupancy({ data: new Uint8Array(3), width: 1, height: 1 }),
    ).toThrow(InvalidRgbaImageError);
    expect(() =>
      alphaOccupancy({ data: new Uint8Array(4), width: 0, height: 1 }),
    ).toThrow(InvalidRgbaImageError);
  });
});
