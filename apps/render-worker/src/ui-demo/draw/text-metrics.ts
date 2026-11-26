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
  const room = Math.max(1, width);
  const words = text.trim().split(/\s+/u).filter((word) => word !== '');

  if (words.length === 0) {
    return 1;
  }

  /* Greedy word wrapping: the flat total-width guess says "one line" for a
     headline that actually breaks after the first word. Line count drives text
     height, and text height drives every separation pass. */
  const space = measureText(' ', fontSize, 1);
  let lines = 1;
  let current = 0;

  for (const word of words) {
    const wordWidth = measureText(word, fontSize);

    if (wordWidth > room) {
      if (current > 0) {
        lines += 1;
        current = 0;
      }

      lines += Math.ceil(wordWidth / room) - 1;
      current = wordWidth % room;
      continue;
    }

    if (current === 0) {
      current = wordWidth;
      continue;
    }

    if (current + space + wordWidth <= room) {
      current += space + wordWidth;
    } else {
      lines += 1;
      current = wordWidth;
    }
  }

  return lines;
}

/** One step down the type scale until the line fits; caption is the floor. */
const DOWNGRADE: Readonly<Record<string, TypeToken>> = {
  display: 'headline',
  headline: 'card',
  card: 'body',
  body: 'caption',
};

/** One step down the type scale; `caption` is the floor. */
export function downgradeToken(token: TypeToken): TypeToken {
  return DOWNGRADE[token] ?? token;
}

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
