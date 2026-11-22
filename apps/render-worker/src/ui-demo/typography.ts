import type { CSSProperties } from 'react';

/**
 * One typeface for the whole channel. Onest is bundled locally through
 * `@fontsource/onest` (Cyrillic + Cyrillic Extended, woff2), so rendering does
 * not depend on Google Fonts availability or on system fonts.
 */
export const FONT_FAMILY = 'Onest, sans-serif';

export const FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semiBold: 600,
  bold: 700,
  extraBold: 800,
} as const;

export interface TypeStyle {
  readonly fontSize: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly letterSpacing: string;
}

/** Starting scale from the brief; a device may pick another token, not a custom font. */
export const TYPE_SCALE = {
  display: { fontSize: 92, weight: 800, lineHeight: 1.02, letterSpacing: '-0.03em' },
  headline: { fontSize: 72, weight: 800, lineHeight: 1.05, letterSpacing: '-0.03em' },
  card: { fontSize: 56, weight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' },
  body: { fontSize: 44, weight: 400, lineHeight: 1.3, letterSpacing: '-0.01em' },
  bubble: { fontSize: 42, weight: 600, lineHeight: 1.28, letterSpacing: '-0.01em' },
  selection: { fontSize: 50, weight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
  input: { fontSize: 40, weight: 500, lineHeight: 1.2, letterSpacing: '-0.01em' },
  caption: { fontSize: 38, weight: 500, lineHeight: 1.2, letterSpacing: '0em' },
  label: { fontSize: 34, weight: 500, lineHeight: 1.2, letterSpacing: '0.01em' },
  name: { fontSize: 34, weight: 600, lineHeight: 1.1, letterSpacing: '0.01em' },
} satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof TYPE_SCALE;

export function textStyle(token: TypeToken, color?: string): CSSProperties {
  const style = TYPE_SCALE[token];

  return {
    fontFamily: FONT_FAMILY,
    fontSize: style.fontSize,
    fontWeight: style.weight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    ...(color === undefined ? {} : { color }),
  };
}

/** Weights the renderer must wait for before any measurement or frame. */
export const FONT_LOAD_SPECS = [
  `${FONT_WEIGHTS.regular} 44px Onest`,
  `${FONT_WEIGHTS.medium} 40px Onest`,
  `${FONT_WEIGHTS.semiBold} 56px Onest`,
  `${FONT_WEIGHTS.bold} 50px Onest`,
  `${FONT_WEIGHTS.extraBold} 92px Onest`,
] as const;
