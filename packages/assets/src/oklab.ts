/**
 * OKLab color math for palette quantization (ADR-0017 D5).
 *
 * Pure functions only: no DOM, no canvas, no dependencies. OKLab is used
 * instead of naive RGB distance because it is roughly perceptually uniform, so
 * "nearest palette slot" matches what an illustrator would pick.
 */

export interface OklabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Parse `#rgb`, `#rrggbb` or `#rrggbbaa`; alpha is ignored for quantization. */
export function parseHexColor(value: string): RgbColor | null {
  const match = HEX_PATTERN.exec(value.trim());

  if (match === null) {
    return null;
  }

  const hex = match[1]!;

  if (hex.length === 3) {
    const [r, g, b] = hex.split('');

    return {
      r: Number.parseInt(`${r}${r}`, 16),
      g: Number.parseInt(`${g}${g}`, 16),
      b: Number.parseInt(`${b}${b}`, 16),
    };
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;

  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** 0.4166666666666667 - 0.055;

  return Math.min(1, Math.max(0, c)) * 255;
}

export function rgbToOklab({ r, g, b }: RgbColor): OklabColor {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l3 = Math.cbrt(l);
  const m3 = Math.cbrt(m);
  const s3 = Math.cbrt(s);

  return {
    L: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
    a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
    b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
  };
}

export function oklabToRgb({ L, a, b }: OklabColor): RgbColor {
  const l3 = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return {
    r: linearToSrgb(lr),
    g: linearToSrgb(lg),
    b: linearToSrgb(lb),
  };
}

export function hexToOklab(hex: string): OklabColor | null {
  const rgb = parseHexColor(hex);

  return rgb === null ? null : rgbToOklab(rgb);
}

export function oklabDistance(left: OklabColor, right: OklabColor): number {
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

export interface PaletteMatch {
  /** Palette color normalized to `#RRGGBB`. */
  readonly color: string;
  /** OKLab distance from the input color to the chosen slot. */
  readonly distance: number;
}

/**
 * Nearest palette color in OKLab. Ties break towards the earlier palette entry,
 * which keeps normalization deterministic across runs and platforms.
 */
export function nearestPaletteColor(
  hex: string,
  palette: readonly string[],
): PaletteMatch | null {
  const source = hexToOklab(hex);

  if (source === null) {
    return null;
  }

  let best: PaletteMatch | null = null;

  for (const entry of palette) {
    const candidate = parseHexColor(entry);

    if (candidate === null) {
      continue;
    }

    const distance = oklabDistance(source, rgbToOklab(candidate));

    if (best === null || distance < best.distance) {
      best = { color: rgbToHex(candidate), distance };
    }
  }

  return best;
}
