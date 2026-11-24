import { TYPE_SCALE, type TypeToken } from '../typography.js';

/**
 * Text measurement shared by the salvage passes and the layout engine.
 *
 * The pinned font is not available to the test runner, so widths are estimated
 * from a per-glyph table. It is deliberately a little wide: a wrong guess
 * overlaps a row, a slightly wide box only leaves air.
 */

/** Width margins: layout uses 1, line prediction adds 5 % for safety. */
export const MEASURE_MARGIN = 1.05;

const DIGITS_AND_PUNCTUATION = /[0-9\s.,:;/%$₽—–-]/u;

/**
 * Width of one glyph in em units. Digits and punctuation are narrow, capitals
 * are wide: a flat 0.54 per glyph underestimates «Итого» and overestimates
 * «240», and a row is exactly where that matters.
 */
function charWidth(char: string): number {
  if (DIGITS_AND_PUNCTUATION.test(char)) {
    return 0.58;
  }

  return char === char.toUpperCase() && char !== char.toLowerCase() ? 0.62 : 0.56;
}

export function measureText(text: string, fontSize: number, margin = MEASURE_MARGIN): number {
  let width = 0;

  for (const char of text) {
    width += charWidth(char);
  }

  return width * fontSize * margin;
}

export function estimateLines(text: string, width: number, fontSize: number): number {
  return Math.max(1, Math.ceil(measureText(text, fontSize) / Math.max(1, width)));
}

/** One step down the type scale until the line fits; caption is the floor. */
const DOWNGRADE: Readonly<Record<string, TypeToken>> = {
  display: 'headline',
  headline: 'card',
  card: 'body',
  body: 'caption',
};

/** The largest token whose rendered line fits `width`, never below caption. */
export function fitToken(text: string, width: number, token: TypeToken): TypeToken {
  let current: TypeToken = token;

  while (DOWNGRADE[current] !== undefined) {
    if (measureText(text, TYPE_SCALE[current].fontSize, 1) <= width) {
      return current;
    }

    current = DOWNGRADE[current] as TypeToken;
  }

  return current;
}
