import { optimize } from 'svgo';
import { nearestPaletteColor } from './oklab.js';

/**
 * Deterministic SVG normalization for imported/vector assets (ADR-0017 D5).
 *
 * The function is pure: no DOM, no canvas, no filesystem. It is bounded on
 * purpose — flat 2D icons and illustrations, not an arbitrary SVG engine.
 */

export interface SvgViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface SvgColorReplacement {
  /** Original color as written in the source (`#AABBCC`). */
  readonly from: string;
  /** Palette color it was snapped to. */
  readonly to: string;
  /** OKLab distance, 0 for an exact palette hit. */
  readonly distance: number;
}

export interface SvgNormalizationOptions {
  /** Allowed colors from `style.assetPalette`; empty disables quantization. */
  readonly palette: readonly string[];
  /** Fraction of the larger viewBox side added per side. Default 0.08. */
  readonly paddingRatio?: number;
}

export interface SvgNormalizationResult {
  readonly svg: string;
  readonly viewBox: SvgViewBox;
  readonly removedBackgroundRects: number;
  readonly replacements: readonly SvgColorReplacement[];
  readonly maxColorDistance: number;
}

export class InvalidSvgError extends Error {
  constructor(reason: string) {
    super(`Invalid SVG: ${reason}`);
    this.name = 'InvalidSvgError';
  }
}

const DEFAULT_VIEWBOX: SvgViewBox = {
  minX: 0,
  minY: 0,
  width: 1024,
  height: 1024,
};

const VIEWBOX_ATTRIBUTE = /\bviewBox\s*=\s*["']([^"']+)["']/;
const SVG_OPEN_TAG = /<svg\b[^>]*>/;
const RECT_TAG = /<rect\b([^>]*?)(?:\/>|>\s*<\/rect>)/g;
const ATTRIBUTE = /\b([a-zA-Z:_-]+)\s*=\s*["']([^"']*)["']/g;
const COLOR_ATTRIBUTE =
  /(\b(?:fill|stroke|stop-color|flood-color)\s*=\s*["'])(#[0-9a-fA-F]{3,8})(["'])/g;
const COLOR_STYLE =
  /((?:fill|stroke|stop-color|flood-color)\s*:\s*)(#[0-9a-fA-F]{3,8})/g;
/**
 * Containers whose contents are not part of the visible canvas. A background
 * rect inside `<defs>`/`<clipPath>` is functional geometry, not a painted
 * background, so it must survive removal.
 */
const PROTECTED_CONTAINER =
  /<(defs|clipPath|mask|pattern|symbol|marker)\b[\s\S]*?<\/\1>/gi;

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function parseViewBox(value: string): SvgViewBox | null {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [minX, minY, width, height] = parts as [number, number, number, number];

  return width > 0 && height > 0 ? { minX, minY, width, height } : null;
}

function numericAttribute(attrs: ReadonlyMap<string, string>, name: string): number | null {
  const raw = attrs.get(name);

  if (raw === undefined) {
    return null;
  }

  const value = Number(raw.replace(/px$/i, '').trim());

  return Number.isFinite(value) ? value : null;
}

function resolveViewBox(svg: string): { svg: string; viewBox: SvgViewBox } {
  const match = VIEWBOX_ATTRIBUTE.exec(svg);

  if (match !== null) {
    const viewBox = parseViewBox(match[1] ?? '');

    if (viewBox !== null) {
      return { svg, viewBox };
    }
  }
  const openTag = SVG_OPEN_TAG.exec(svg);

  if (openTag === null) {
    throw new InvalidSvgError('missing <svg> root element');
  }

  const attrs = readAttributes(openTag[0]);
  const width = numericAttribute(attrs, 'width') ?? DEFAULT_VIEWBOX.width;
  const height = numericAttribute(attrs, 'height') ?? DEFAULT_VIEWBOX.height;
  const viewBox = { minX: 0, minY: 0, width, height };
  const viewBoxValue = `0 0 ${formatNumber(width)} ${formatNumber(height)}`;
  const withViewBox = openTag[0].includes('viewBox')
    ? openTag[0].replace(VIEWBOX_ATTRIBUTE, `viewBox="${viewBoxValue}"`)
    : openTag[0].replace(/>$/, ` viewBox="${viewBoxValue}">`);

  return { svg: svg.replace(openTag[0], withViewBox), viewBox };
}

/** Read `viewBox`/`width`/`height` without rewriting the document. */
export function readSvgViewBox(svg: string): SvgViewBox | null {
  const match = VIEWBOX_ATTRIBUTE.exec(svg);

  if (match !== null) {
    const viewBox = parseViewBox(match[1] ?? '');

    if (viewBox !== null) {
      return viewBox;
    }
  }

  const openTag = SVG_OPEN_TAG.exec(svg);

  if (openTag === null) {
    return null;
  }

  const attrs = readAttributes(openTag[0]);
  const width = numericAttribute(attrs, 'width');
  const height = numericAttribute(attrs, 'height');

  return width !== null && height !== null
    ? { minX: 0, minY: 0, width, height }
    : null;
}

function isolateProtectedContainers(svg: string): {
  svg: string;
  restore: (value: string) => string;
} {
  const blocks: string[] = [];
  const isolated = svg.replace(PROTECTED_CONTAINER, (block) => {
    const token = `__PEERTOREEL_PROTECTED_${blocks.length}__`;

    blocks.push(block);

    return token;
  });

  return {
    svg: isolated,
    restore: (value: string): string =>
      blocks.reduce(
        (current, block, index) =>
          current
            .split(`__PEERTOREEL_PROTECTED_${index}__`)
            .join(block),
        value,
      ),
  };
}

function readAttributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>();

  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1];
    const value = match[2];

    if (name !== undefined && value !== undefined) {
      attrs.set(name, value);
    }
  }

  return attrs;
}

function lengthToViewBoxUnits(
  raw: string | undefined,
  reference: number,
): number | null {
  if (raw === undefined) {
    return null;
  }

  const value = raw.trim();

  if (value.endsWith('%')) {
    const percent = Number(value.slice(0, -1));

    return Number.isFinite(percent) ? (percent / 100) * reference : null;
  }

  const numeric = Number(value.replace(/px$/i, ''));

  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * A generator-painted canvas: the rect starts at the viewBox origin, covers the
 * whole frame and is not transformed. Subject geometry is untouched.
 */
function isFullBleedRect(
  attrs: ReadonlyMap<string, string>,
  viewBox: SvgViewBox,
): boolean {
  if (attrs.has('transform') || (attrs.get('style') ?? '').includes('transform')) {
    return false;
  }

  const x = lengthToViewBoxUnits(attrs.get('x') ?? '0', viewBox.width);
  const y = lengthToViewBoxUnits(attrs.get('y') ?? '0', viewBox.height);
  const width = lengthToViewBoxUnits(attrs.get('width'), viewBox.width);
  const height = lengthToViewBoxUnits(attrs.get('height'), viewBox.height);

  if (x === null || y === null || width === null || height === null) {
    return false;
  }

  const epsilon = 0.5;

  return (
    Math.abs(x) <= epsilon &&
    Math.abs(y) <= epsilon &&
    width >= viewBox.width - epsilon &&
    height >= viewBox.height - epsilon
  );
}

function removeBackgroundRects(
  svg: string,
  viewBox: SvgViewBox,
): { svg: string; removed: number } {
  let removed = 0;

  const isolated = isolateProtectedContainers(svg);
  const next = isolated.svg.replace(RECT_TAG, (tag, attrSource: string) => {
    const attrs = readAttributes(attrSource);

    if (!isFullBleedRect(attrs, viewBox)) {
      return tag;
    }

    removed += 1;

    return '';
  });

  return { svg: isolated.restore(next), removed };
}

function applyPadding(
  svg: string,
  viewBox: SvgViewBox,
  paddingRatio: number,
): { svg: string; viewBox: SvgViewBox } {
  if (paddingRatio <= 0) {
    return { svg, viewBox };
  }

  const pad = paddingRatio * Math.max(viewBox.width, viewBox.height);
  const padded: SvgViewBox = {
    minX: viewBox.minX - pad,
    minY: viewBox.minY - pad,
    width: viewBox.width + pad * 2,
    height: viewBox.height + pad * 2,
  };
  const value = `${formatNumber(padded.minX)} ${formatNumber(padded.minY)} ${formatNumber(padded.width)} ${formatNumber(padded.height)}`;

  return {
    svg: svg.replace(VIEWBOX_ATTRIBUTE, `viewBox="${value}"`),
    viewBox: padded,
  };
}

/**
 * `#RRGGBBAA` / `#RGBA` with zero alpha is invisible; snapping it to an opaque
 * palette slot would make hidden geometry appear.
 */
function isFullyTransparent(hex: string): boolean {
  const value = hex.slice(1);

  if (value.length === 4) {
    return Number.parseInt(value.slice(3), 16) === 0;
  }

  if (value.length === 8) {
    return Number.parseInt(value.slice(6), 16) === 0;
  }

  return false;
}

/**
 * Snap every hex fill/stroke/stop-color to the nearest `assetPalette` slot.
 * Values such as `none`, `currentColor`, `url(#gradient)` and fully transparent
 * colors are left alone.
 */
function quantizeColors(
  svg: string,
  palette: readonly string[],
): { svg: string; replacements: readonly SvgColorReplacement[]; maxDistance: number } {
  const bySource = new Map<string, SvgColorReplacement>();

  const replaceColor = (color: string): string => {
    if (isFullyTransparent(color)) {
      return color;
    }

    const match = nearestPaletteColor(color, palette);

    if (match === null) {
      return color;
    }

    const from = color.toUpperCase();

    if (!bySource.has(from)) {
      bySource.set(from, { from, to: match.color, distance: match.distance });
    }

    return match.color;
  };

  const quantized = svg
    .replace(
      COLOR_ATTRIBUTE,
      (_all, prefix: string, color: string, suffix: string) =>
        `${prefix}${replaceColor(color)}${suffix}`,
    )
    .replace(
      COLOR_STYLE,
      (_all, prefix: string, color: string) => `${prefix}${replaceColor(color)}`,
    );

  const replacements = [...bySource.values()].sort((left, right) =>
    left.from < right.from ? -1 : left.from > right.from ? 1 : 0,
  );
  const maxDistance = replacements.reduce(
    (max, entry) => Math.max(max, entry.distance),
    0,
  );

  return { svg: quantized, replacements, maxDistance };
}

export function normalizeSvg(
  source: string,
  options: SvgNormalizationOptions,
): SvgNormalizationResult {
  if (!/<svg[\s>]/.test(source)) {
    throw new InvalidSvgError('missing <svg> root element');
  }

  // Background removal runs on the source: svgo's preset converts simple
  // `<rect>` shapes to `<path>`, after which a full-bleed canvas is no longer
  // distinguishable from subject geometry.
  const initial = resolveViewBox(source);
  const stripped = removeBackgroundRects(initial.svg, initial.viewBox);

  // svgo v4 keeps `removeViewBox` out of `preset-default`, so the default
  // preset already preserves the coordinate system we normalize below.
  const optimized = optimize(stripped.svg, { multipass: false }).data;
  const resolved = resolveViewBox(optimized);
  const padded = applyPadding(
    resolved.svg,
    resolved.viewBox,
    options.paddingRatio ?? 0.08,
  );
  const quantized = quantizeColors(padded.svg, options.palette);

  return {
    svg: quantized.svg,
    viewBox: padded.viewBox,
    removedBackgroundRects: stripped.removed,
    replacements: quantized.replacements,
    maxColorDistance: Number(quantized.maxDistance.toFixed(6)),
  };
}
