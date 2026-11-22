import { TYPE_SCALE, type TypeToken } from './typography.js';

/**
 * Text conventions: a token is chosen for the box it lives in, not the other way
 * round.
 *
 * A block that is 220 px tall with `body` inside reads as a mistake — the text
 * is tiny relative to its own surface. A block 40 px tall with `headline` is a
 * mistake too. Both are geometry, so both are checked before rendering instead
 * of being compensated by shrinking the font.
 */

/** Auto-fit may shrink this far; below it the scene is rejected, not hidden. */
export const MIN_FONT_SCALE = 0.85;

/**
 * A highlight plate is painted per wrapped line, so its padding has to fit
 * inside the line box. With the token line height (1.02–1.3) and 4 px of
 * padding the plate was taller than the line and covered the descenders of the
 * line above ("д" cut in half). Both values are em-based, so the gap holds at
 * any font scale.
 */
export const MARK_PLATE_PADDING_Y_EM = 0.06;
export const MARK_PLATE_LINE_HEIGHT = 1.3;

/** The plate and the line it lives in, in px, for one font size. */
export function markPlateBox(fontSize: number): {
  readonly paddingY: number;
  readonly plateHeight: number;
  readonly lineBox: number;
} {
  const paddingY = fontSize * MARK_PLATE_PADDING_Y_EM;

  return {
    paddingY,
    plateHeight: fontSize + 2 * paddingY,
    lineBox: fontSize * MARK_PLATE_LINE_HEIGHT,
  };
}

export interface TypeBoxRule {
  /** One line with a little air; anything smaller is a squeezed token. */
  readonly minHeight: number;
  /** Three and a half lines; beyond that the box wants a bigger token. */
  readonly maxHeight: number;
}

function lineHeightOf(token: TypeToken): number {
  const style = TYPE_SCALE[token];

  return style.fontSize * style.lineHeight;
}

export const TYPE_BOX_RULES: Record<TypeToken, TypeBoxRule> = Object.fromEntries(
  (Object.keys(TYPE_SCALE) as TypeToken[]).map((token) => {
    const line = lineHeightOf(token);

    return [
      token,
      {
        minHeight: Math.ceil(line * 1.05),
        maxHeight: Math.ceil(line * 3.5),
      },
    ];
  }),
) as Record<TypeToken, TypeBoxRule>;

export function isTypeToken(value: string): value is TypeToken {
  return value in TYPE_SCALE;
}

/**
 * Returns a human-readable problem, or null when the box suits the token.
 * `height` is the declared layout height; content-sized elements skip the check.
 */
export function checkTextBox(
  token: string,
  height: number | undefined,
): string | null {
  if (height === undefined || !isTypeToken(token)) {
    return null;
  }

  const rule = TYPE_BOX_RULES[token];

  if (height < rule.minHeight) {
    return `${token} needs a box at least ${rule.minHeight}px tall, got ${Math.round(height)}`;
  }

  if (height > rule.maxHeight) {
    return `${token} is too small for a ${Math.round(height)}px box (max ${rule.maxHeight}); use a larger token`;
  }

  return null;
}

/**
 * The box decides the token: when the declared token does not fit its height, pick
 * the largest token that does. Same text, same layout — only the type size the
 * box already implies. Returns the input when no token fits (the linter then
 * rejects the scene, which is honest).
 */
export function tokenForHeight(
  token: string,
  height: number | undefined,
): string {
  if (height === undefined || !isTypeToken(token)) {
    return token;
  }

  const rule = TYPE_BOX_RULES[token];

  if (height >= rule.minHeight && height <= rule.maxHeight) {
    return token;
  }

  const fitting = (Object.keys(TYPE_SCALE) as TypeToken[])
    .filter(
      (candidate) =>
        TYPE_BOX_RULES[candidate].minHeight <= height &&
        height <= TYPE_BOX_RULES[candidate].maxHeight,
    )
    .sort((left, right) => TYPE_SCALE[right].fontSize - TYPE_SCALE[left].fontSize);

  return fitting[0] ?? token;
}
