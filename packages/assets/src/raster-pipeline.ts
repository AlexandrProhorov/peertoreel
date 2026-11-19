/**
 * PNG → RGBA pipeline for raster assets (M3.6b.6).
 *
 * The decoder is pure JS (`fast-png`): the app handles a few assets per day, so
 * a native binary (sharp) is not worth the install/CI cost. This module only
 * touches bytes; alpha rules stay in `normalize-raster.ts`.
 */

import { decode, encode } from 'fast-png';
import {
  InvalidRgbaImageError,
  alphaBounds,
  type AlphaBounds,
  type RgbaImage,
} from './normalize-raster.js';

export interface TrimmedRaster {
  readonly image: RgbaImage;
  /** Bounds inside the source image. */
  readonly bounds: AlphaBounds;
  /** Source size, so the trim is auditable in metadata. */
  readonly trimmedFrom: { readonly width: number; readonly height: number };
}

function toRgba(
  data: Uint8Array | Uint8ClampedArray | Uint16Array,
  channels: number,
  pixels: number,
): Uint8Array {
  if (data instanceof Uint16Array) {
    throw new InvalidRgbaImageError('16-bit PNG is not supported');
  }

  if (channels < 1 || channels > 4) {
    throw new InvalidRgbaImageError(`unsupported channel count ${channels}`);
  }

  if (channels === 4) {
    const rgba = new Uint8Array(pixels * 4);

    rgba.set(data.subarray(0, pixels * 4));

    return rgba;
  }

  const rgba = new Uint8Array(pixels * 4);

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    const first = data[source] ?? 0;

    if (channels === 3) {
      rgba[target] = first;
      rgba[target + 1] = data[source + 1] ?? 0;
      rgba[target + 2] = data[source + 2] ?? 0;
      rgba[target + 3] = 255;
    } else if (channels === 2) {
      rgba[target] = first;
      rgba[target + 1] = first;
      rgba[target + 2] = first;
      rgba[target + 3] = data[source + 1] ?? 255;
    } else {
      rgba[target] = first;
      rgba[target + 1] = first;
      rgba[target + 2] = first;
      rgba[target + 3] = 255;
    }
  }

  return rgba;
}

/** Decode PNG bytes into row-major RGBA. Indexed/16-bit images are rejected. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  let decoded: ReturnType<typeof decode>;

  try {
    decoded = decode(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new InvalidRgbaImageError(`PNG decode failed: ${reason.slice(0, 200)}`);
  }

  if (decoded.palette !== undefined) {
    throw new InvalidRgbaImageError('indexed PNG is not supported');
  }

  return {
    width: decoded.width,
    height: decoded.height,
    data: toRgba(
      decoded.data,
      decoded.channels,
      decoded.width * decoded.height,
    ),
  };
}

function crop(image: RgbaImage, bounds: AlphaBounds): RgbaImage {
  const data = new Uint8Array(bounds.width * bounds.height * 4);

  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = ((bounds.minY + y) * image.width + bounds.minX) * 4;
    const targetStart = y * bounds.width * 4;

    data.set(
      image.data.subarray(sourceStart, sourceStart + bounds.width * 4),
      targetStart,
    );
  }

  return { width: bounds.width, height: bounds.height, data };
}

/**
 * Crop to non-transparent pixels. A fully transparent image is an error: an
 * empty cutout must fall back, not become a zero-size variant.
 */
export function trimToAlpha(image: RgbaImage, alphaThreshold = 8): TrimmedRaster {
  const bounds = alphaBounds(image, alphaThreshold);

  if (bounds === null) {
    throw new InvalidRgbaImageError('image is fully transparent');
  }

  return {
    image: crop(image, bounds),
    bounds,
    trimmedFrom: { width: image.width, height: image.height },
  };
}

/** Encode RGBA back to a PNG (8-bit, truecolour + alpha). */
export function encodePng(image: RgbaImage): Uint8Array {
  return encode({
    width: image.width,
    height: image.height,
    data: image.data,
    depth: 8,
    channels: 4,
  });
}
