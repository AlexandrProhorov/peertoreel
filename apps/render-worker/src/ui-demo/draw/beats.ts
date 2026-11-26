import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import type { DrawNode } from './schema.js';

/**
 * Story beats.
 *
 * A film of carriers reads as a slideshow. Between two `moment` scenes the arc
 * puts a pause: a question to the viewer or one number as the hero. These frames
 * are typographic and deterministic — the model decides the beat and the words,
 * the code owns the composition, so a pause never turns into another card.
 */

export type Beat = 'moment' | 'question' | 'number';
export type InterludeBeat = Exclude<Beat, 'moment'>;

const NUMBER = /[−-]?\d[\d\s\u00A0]*(?:[.,]\d+)?\s?[₽$€%]?/u;

export function planBeats(
  declared: readonly (Beat | undefined)[],
): { beats: Beat[]; adjusted: number[] } {
  const beats: Beat[] = declared.map((beat) => beat ?? 'moment');
  const adjusted: number[] = [];

  const set = (index: number, beat: Beat): void => {
    if (beats[index] !== beat) {
      beats[index] = beat;
      adjusted.push(index + 1);
    }
  };

  if (beats.length > 0) {
    set(0, 'question');
  }

  const last = beats.length - 1;

  if (last > 0 && beats[last] === 'moment') {
    set(last, 'question');
  }

  /* Three carriers in a row is the slideshow; the third becomes a pause. */
  for (let index = 2; index < beats.length; index += 1) {
    if (beats[index] === 'moment' && beats[index - 1] === 'moment' && beats[index - 2] === 'moment') {
      set(index, 'question');
    }
  }

  /* At least one pause per three frames, even if the model declared carriers. */
  const needed = Math.ceil(beats.length / 3);
  let pauses = beats.filter((beat) => beat !== 'moment').length;

  for (let index = 1; index < last && pauses < needed; index += 2) {
    if (beats[index] === 'moment') {
      set(index, 'number');
      pauses += 1;
    }
  }

  return { beats, adjusted };
}

/** The hero of a pause: one number from the line, or a question mark. */
export function interludeAccent(kind: InterludeBeat, line: string): string {
  if (kind === 'number') {
    const match = NUMBER.exec(line);

    if (match !== null) {
      return match[0].trim();
    }
  }

  return '?';
}

/**
 * A pause is a big accent in a surface block and the spoken line in its band.
 * No carrier, no decoration: the frame is the thought.
 */
export function composeInterlude(input: {
  readonly kind: InterludeBeat;
  readonly line: string;
}): DrawNode[] {
  const accent = interludeAccent(input.kind, input.line);
  const lineToken = input.line.length <= 42 ? 'headline' : 'card';

  return [
    {
      kind: 'box',
      x: CRITICAL_SAFE_BOUNDS.left,
      y: 260,
      w: CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left,
      h: 520,
      r: 40,
      fill: 'surface',
    },
    {
      kind: 'text',
      x: CRITICAL_SAFE_BOUNDS.left + 40,
      y: 400,
      w: CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left - 80,
      text: accent,
      token: 'display',
      weight: 800,
      align: 'center',
      color: 'ink',
      at: 0.1,
      transition: 'appear',
    },
    {
      kind: 'text',
      x: CRITICAL_SAFE_BOUNDS.left,
      y: 1300,
      w: CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left,
      text: input.line,
      token: lineToken,
      align: 'center',
      color: 'ink',
      at: 0,
      transition: 'type',
    },
  ];
}
