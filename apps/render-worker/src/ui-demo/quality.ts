import type { CompositionSpec } from './composition.js';
import { themeById, type UiTheme, type UiThemeId } from './themes.js';
import type { TypeToken } from './typography.js';

/**
 * Quality gate: bounds validation says the composition fits, this says it can be
 * watched. It is intentionally about declarations the spec can prove — type
 * hierarchy, a visible surface, an accent, contrast — not about taste.
 */
export type QualityIssueCode =
  | 'style-required'
  | 'hierarchy-required'
  | 'accent-required'
  | 'density'
  | 'surface-visible'
  | 'text-contrast'
  | 'empty-surface';

export interface QualityIssue {
  readonly code: QualityIssueCode;
  readonly element: string | null;
  readonly message: string;
}

const LARGE_TOKENS: readonly TypeToken[] = [
  'display',
  'headline',
  'card',
  'selection',
];

const LARGE_CONTRAST = 3;
const BODY_CONTRAST = 4.5;
const MIN_SURFACE_DELTA = 1.05;

function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);

  if (match === null || match[1] === undefined) {
    return null;
  }

  const int = Number.parseInt(match[1], 16);

  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function luminance(channel: number): number {
  const value = channel / 255;

  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a: string, b: string): number | null {
  const first = parseHex(a);
  const second = parseHex(b);

  if (first === null || second === null) {
    return null;
  }

  const la = 0.2126 * luminance(first[0]) + 0.7152 * luminance(first[1]) + 0.0722 * luminance(first[2]);
  const lb = 0.2126 * luminance(second[0]) + 0.7152 * luminance(second[1]) + 0.0722 * luminance(second[2]);

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toneColor(theme: UiTheme, tone: string | undefined): string | null {
  switch (tone) {
    case 'ink':
      return theme.ink;
    case 'muted':
      return theme.muted;
    case 'accent':
      return theme.accent;
    case 'surface':
      return theme.surfaceInk;
    case 'accent-ink':
      return theme.accentInk;
    default:
      return null;
  }
}

function contains(
  outer: { x: number; y: number; width?: number; height?: number },
  inner: { x: number; y: number; width?: number; height?: number },
): boolean {
  const ow = outer.width ?? 0;
  const oh = outer.height ?? 0;
  const iw = inner.width ?? 0;
  const ih = inner.height ?? 0;

  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + iw <= outer.x + ow + 0.5 &&
    inner.y + ih <= outer.y + oh + 0.5
  );
}

function intersects(
  a: { x: number; y: number; width?: number; height?: number },
  b: { x: number; y: number; width?: number; height?: number },
): boolean {
  const overlapX = Math.min(a.x + (a.width ?? 0), b.x + (b.width ?? 0)) - Math.max(a.x, b.x);
  const overlapY =
    Math.min(a.y + (a.height ?? 0), b.y + (b.height ?? 0)) - Math.max(a.y, b.y);

  return overlapX > 0 && overlapY > 0;
}

/** Smallest distance from the label to a card edge; negative means it hangs out. */


interface Surface {
  readonly id: string;
  readonly primitive: string;
  readonly background: string;
  readonly layout: { x: number; y: number; width?: number; height?: number };
}

export function lintQuality(
  spec: CompositionSpec,
  themeId: UiThemeId = 'studio-dark',
): QualityIssue[] {
  const theme = themeById(themeId);
  const issues: QualityIssue[] = [];
  const add = (code: QualityIssueCode, element: string | null, message: string): void => {
    issues.push({ code, element, message });
  };

  if (spec.elements.length < 2) {
    add('density', null, 'a scene needs at least a surface and a message');
  }

  const surfaces: Surface[] = [];

  for (const element of spec.elements) {
    const params = element.params as Readonly<Record<string, string | number | boolean>>;
    const background = typeof params.background === 'string' ? params.background : null;

    if (['card', 'pill', 'bubble', 'stage'].includes(element.primitive) && background !== null) {
      surfaces.push({
        id: element.id,
        primitive: element.primitive,
        background,
        layout: element.layout,
      });
    }
  }

  if (surfaces.length === 0) {
    add('accent-required', null, 'no declared surface: the scene will read as empty');
  }

  /* The stage may declare its own colour; comparing a surface to the theme
     background misses "white on white" when the model painted the stage white
     in a lime theme. The declared stage wins, the theme is the fallback. */
  const declaredStage = spec.elements.find(
    (element) =>
      element.primitive === 'stage' &&
      typeof (element.params as Readonly<Record<string, unknown>>)['background'] === 'string',
  );
  const frameBackground =
    declaredStage === undefined
      ? theme.background
      : String((declaredStage.params as Readonly<Record<string, unknown>>)['background']);

  /* A grid paints its cells in the accent colour: a surface standing on a grid
     is compared to the cells, not to the stage. A lime card on lime cells has
     no edge and reads as a hole in the pattern. */
  const grids = spec.elements.filter((element) => element.primitive === 'grid');

  for (const surface of surfaces) {
    /* The stage IS the background: comparing it to the theme background is
       always a 1.00 ratio. Checked by primitive, not by the element's id —
       an id is a name the model chooses, not a contract. */
    if (surface.primitive === 'stage') {
      continue;
    }

    const onGrid = grids.some((grid) => intersects(grid.layout, surface.layout));
    const behind = onGrid ? theme.accent : frameBackground;
    const delta = contrast(surface.background, behind);

    if (delta !== null && delta < MIN_SURFACE_DELTA) {
      add(
        'surface-visible',
        surface.id,
        `surface ${surface.background} is almost the background ${behind} (${delta.toFixed(2)} < ${MIN_SURFACE_DELTA})`,
      );
    }
  }

  /* A surface with no copy and nothing inside is a hole in the frame — unless
     it is half of a comparison: two blank shapes of different size read as
     "thin / thick" without a word. Two identical blanks are decoration and
     stay rejected, a lone blank stays rejected. Nested surfaces are exempt:
     a list item inside a phone is a shape the container explains. */
  const parsedSurfaces = spec.elements.filter((element) =>
    ['card', 'pill', 'bubble'].includes(element.primitive),
  );
  const blanks: Array<{
    element: (typeof parsedSurfaces)[number];
    width: number;
    height: number;
  }> = [];

  for (const element of parsedSurfaces) {
    const params = element.params as Readonly<Record<string, unknown>>;
    const text = params['text'];

    if (typeof text === 'string' && text.trim() !== '') {
      continue;
    }

    const filled = spec.elements.some((other) => {
      if (other === element || other.primitive === 'stage') {
        return false;
      }

      const area = (other.layout.width ?? 0) * (other.layout.height ?? 0);

      return area > 0 && contains(element.layout, other.layout);
    });
    const nested = parsedSurfaces.some(
      (other) => other !== element && contains(other.layout, element.layout),
    );

    if (filled || nested) {
      continue;
    }

    blanks.push({
      element,
      width: element.layout.width ?? 0,
      height: element.layout.height ?? 0,
    });
  }

  /* A comparison is a pair with one side equal and the other clearly different:
     same width, different height ("thin / thick"). Two identical blanks or an
     arbitrary pair stay rejected. */
  const near = (a: number, b: number): boolean =>
    Math.abs(a - b) <= Math.max(a, b) * 0.1;

  for (const blank of blanks) {
    const compared = blanks.some(
      (other) =>
        other.element !== blank.element &&
        ((near(other.width, blank.width) &&
          Math.abs(other.height - blank.height) > blank.height * 0.2) ||
          (near(other.height, blank.height) &&
            Math.abs(other.width - blank.width) > blank.width * 0.2)),
    );

    if (!compared) {
      add(
        'empty-surface',
        blank.element.id,
        `"${blank.element.id}" is a surface with no text and nothing inside: give it a label or make it half of a size comparison`,
      );
    }
  }

  const textElements = spec.elements.filter((element) =>
    ['label', 'pill', 'bubble'].includes(element.primitive),
  );

  let hasHierarchy = false;
  let hasAccent = false;

  for (const element of textElements) {
    const params = element.params as Readonly<Record<string, string | number | boolean>>;
    const token = typeof params.token === 'string' ? params.token : null;
    const tone = typeof params.tone === 'string' ? params.tone : null;
    /* A pill carries an explicit `textColor` instead of a tone. */
    const explicitColor =
      typeof params.textColor === 'string' ? params.textColor : null;

    if (token === null || (tone === null && explicitColor === null)) {
      add('style-required', element.id, 'text needs explicit token and tone');
      continue;
    }

    if (LARGE_TOKENS.includes(token as TypeToken)) {
      hasHierarchy = true;
    }

    if (tone === 'accent') {
      hasAccent = true;
    }

    const color = explicitColor ?? toneColor(theme, tone ?? undefined);
    const container = surfaces
      .filter((surface) => contains(surface.layout, element.layout))
      .pop();
    const background = container?.background ?? frameBackground;
    const ratio = color === null ? null : contrast(color, background);

    if (ratio !== null) {
      const threshold = LARGE_TOKENS.includes(token as TypeToken)
        ? LARGE_CONTRAST
        : BODY_CONTRAST;

      if (ratio < threshold) {
        add(
          'text-contrast',
          element.id,
          `${token}/${tone} on ${background} is ${ratio.toFixed(2)}:1 (min ${threshold})`,
        );
      }
    }
  }

  for (const element of spec.elements) {
    const params = element.params as Readonly<Record<string, string | number | boolean>>;
    const values = [params.color, params.background, params.textColor];

    if (values.some((value) => typeof value === 'string' && value.toLowerCase() === theme.accent.toLowerCase())) {
      hasAccent = true;
    }
  }

  /* A declared focus is the accent and the hierarchy: the normaliser marks the
     element, so the scene does not need a separate accent block. */
  const focusElement =
    spec.focus === undefined
      ? undefined
      : spec.elements.find((element) => element.id === spec.focus);

  if (focusElement !== undefined) {
    hasHierarchy = true;
    hasAccent = true;
  }

  if (!hasHierarchy) {
    add('hierarchy-required', null, 'no display/headline/card token: nothing reads as the main message');
  }

  if (!hasAccent) {
    add('accent-required', null, 'no accent element: the scene has no focus');
  }

  return issues;
}
