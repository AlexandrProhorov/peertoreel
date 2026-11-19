import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { InvalidRgbaImageError } from './normalize-raster.js';
import { decodePng, encodePng, trimToAlpha } from './raster-pipeline.js';

type Pixel = [number, number, number, number];

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Pixel,
): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const target = (y * width + x) * 4;

      data[target] = r;
      data[target + 1] = g;
      data[target + 2] = b;
      data[target + 3] = a;
    }
  }

  return { width, height, data };
}

describe('raster png pipeline', () => {
  it('round-trips RGBA bytes through encode and decode', () => {
    const source = image(3, 2, (x) => [x * 40, 10, 200, x === 0 ? 0 : 255]);
    const decoded = decodePng(encodePng(source));

    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect([...decoded.data]).toEqual([...source.data]);
  });

  it('trims transparent margins to the alpha bounds', () => {
    const source = image(4, 4, (x, y) =>
      x >= 1 && x <= 2 && y >= 1 && y <= 2 ? [255, 0, 0, 255] : [0, 0, 0, 0],
    );
    const trimmed = trimToAlpha(source);

    expect(trimmed.bounds).toEqual({
      minX: 1,
      minY: 1,
      maxX: 2,
      maxY: 2,
      width: 2,
      height: 2,
    });
    expect(trimmed.image.width).toBe(2);
    expect(trimmed.image.height).toBe(2);
    expect(trimmed.trimmedFrom).toEqual({ width: 4, height: 4 });
    expect(trimmed.image.data[3]).toBe(255);
  });

  it('rejects a fully transparent image as empty', () => {
    const source = image(2, 2, () => [0, 0, 0, 0]);

    expect(() => trimToAlpha(source)).toThrow(InvalidRgbaImageError);
    expect(() => trimToAlpha(source)).toThrow(/fully transparent/i);
  });

  it('rejects bytes that are not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow(
      /PNG decode failed/i,
    );
  });

  it('expands an RGB PNG to opaque RGBA', () => {
    const decoded = decodePng(
      encode({
        width: 1,
        height: 1,
        data: new Uint8Array([10, 20, 30]),
        depth: 8,
        channels: 3,
      }),
    );

    expect([...decoded.data]).toEqual([10, 20, 30, 255]);
  });

  it('rejects 16-bit PNGs instead of guessing the depth', () => {
    const png = encode({
      width: 1,
      height: 1,
      data: new Uint16Array([0, 0, 0, 65535]),
      depth: 16,
      channels: 4,
    });

    expect(() => decodePng(png)).toThrow(/16-bit/i);
  });
});
