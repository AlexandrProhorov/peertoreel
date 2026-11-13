/**
 * Raster-cutout checks (ADR-0017 D5).
 *
 * M3.6a ships the pure math only: callers decode a PNG with their own decoder
 * (M3.6b will use `sharp`) and pass RGBA bytes here. No image library, no I/O.
 */

export interface RgbaImage {
  /** RGBA, 4 bytes per pixel, row-major. */
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface AlphaBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface CutoutAlphaLimits {
  /** Below this opaque fraction the cutout is considered empty. */
  readonly minOccupancy?: number;
  /** Above this fraction the background was probably not removed. */
  readonly maxOccupancy?: number;
}

export interface CutoutAlphaReport {
  readonly occupancy: number;
  readonly bounds: AlphaBounds | null;
  readonly ok: boolean;
  readonly reason: 'empty' | 'background_not_removed' | null;
}

export class InvalidRgbaImageError extends Error {
  constructor(reason: string) {
    super(`Invalid RGBA image: ${reason}`);
    this.name = 'InvalidRgbaImageError';
  }
}

function assertImage(image: RgbaImage): void {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    throw new InvalidRgbaImageError('width and height must be positive integers');
  }

  if (image.data.length !== image.width * image.height * 4) {
    throw new InvalidRgbaImageError(
      `expected ${image.width * image.height * 4} bytes, received ${image.data.length}`,
    );
  }
}

/** Fraction of pixels whose alpha is strictly above `alphaThreshold`. */
export function alphaOccupancy(image: RgbaImage, alphaThreshold = 8): number {
  assertImage(image);

  let opaque = 0;

  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index]! > alphaThreshold) {
      opaque += 1;
    }
  }

  return opaque / (image.width * image.height);
}

/** Tight bounding box of non-transparent pixels, or null for a fully empty image. */
export function alphaBounds(image: RgbaImage, alphaThreshold = 8): AlphaBounds | null {
  assertImage(image);

  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3]!;

      if (alpha > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Reject an empty cutout or an unremoved background. Trim/center/sticker-outline
 * rendering needs a real decoder and ships in M3.6b.
 */
export function validateCutoutAlpha(
  image: RgbaImage,
  limits: CutoutAlphaLimits = {},
): CutoutAlphaReport {
  const minOccupancy = limits.minOccupancy ?? 0.08;
  const maxOccupancy = limits.maxOccupancy ?? 0.75;
  const occupancy = alphaOccupancy(image);
  const bounds = alphaBounds(image);

  if (bounds === null || occupancy < minOccupancy) {
    return { occupancy, bounds, ok: false, reason: 'empty' };
  }

  if (occupancy > maxOccupancy) {
    return { occupancy, bounds, ok: false, reason: 'background_not_removed' };
  }

  return { occupancy, bounds, ok: true, reason: null };
}
