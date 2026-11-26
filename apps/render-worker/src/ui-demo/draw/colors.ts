import { contrast } from '../quality.js';
import type { UiTheme } from '../themes.js';
import type { TypeToken } from '../typography.js';

/**
 * One colour layer for the drawing language.
 *
 * The model may name a theme role or pick its own hex; a hex is kept as it is.
 * Roles mean the same thing everywhere: `surface` is the surface colour, not
 * the ink that reads on it. Contrast is judged against the colour actually
 * painted under the text, not against the scene background.
 */

/** Roles a frame may name, and the theme field each one resolves to. */
const ROLE_TO_THEME: Readonly<Record<string, keyof UiTheme>> = {
  background: 'background',
  surface: 'surface',
  surfaceink: 'surfaceInk',
  'surface-ink': 'surfaceInk',
  ink: 'ink',
  muted: 'muted',
  accent: 'accent',
  accentink: 'accentInk',
  'accent-ink': 'accentInk',
  border: 'border',
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A role name or a hex, resolved for this theme. `transparent` is a valid fill.
 * Null means the value is neither: the caller substitutes a default and records
 * a fix, so a typo never turns into a random CSS colour.
 */
export function resolveDrawColor(theme: UiTheme, value: string): string | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'transparent' || lower === 'none') {
    return 'transparent';
  }

  const field = ROLE_TO_THEME[lower];

  if (field !== undefined) {
    return theme[field];
  }

  return HEX.test(trimmed) ? trimmed : null;
}

/** WCAG large text: display, headline and card sizes. */
const LARGE_TOKENS: ReadonlySet<TypeToken> = new Set(['display', 'headline', 'card']);

export function minimumContrast(token: TypeToken): number {
  return LARGE_TOKENS.has(token) ? 3 : 4.5;
}

/** Candidate inks for a text on an unknown or mixed backdrop. */
const CANDIDATES = ['#FFFFFF', '#0B0B0C'] as const;

/**
 * Keeps the author's colour when it reads, otherwise takes the theme tone with
 * the best contrast on this backdrop. White and near-black are the last resort,
 * so a custom colour survives wherever it is legible.
 */
export function pickReadable(
  theme: UiTheme,
  background: string,
  current: string,
  token: TypeToken,
): string {
  const minimum = minimumContrast(token);
  const currentRatio = contrast(current, background);

  if (currentRatio !== null && currentRatio >= minimum) {
    return current;
  }

  const candidates = [theme.ink, theme.surfaceInk, theme.background, ...CANDIDATES];
  let best = current;
  let bestRatio = currentRatio ?? 0;

  for (const candidate of candidates) {
    const ratio = contrast(candidate, background) ?? 0;

    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  return best;
}

/** A tone the renderer can use even when the tree was not normalized. */
export function drawColor(
  theme: UiTheme,
  value: string | undefined,
  fallback: string,
): string {
  if (value === undefined) {
    return fallback;
  }

  return resolveDrawColor(theme, value) ?? value;
}
