import { z } from 'zod';
import type { TtsAlignment } from './elevenlabs.js';

export interface DerivedWord {
  text: string;
  startSec: number;
  endSec: number;
}

export const derivedWordSchema = z.object({
  text: z.string().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
});

export const derivedWordsSchema = z.array(derivedWordSchema);

/**
 * Character alignment → word timings. A word starts when its first character
 * starts and ends when its last character ends; whitespace is dropped, so
 * punctuation stays attached to its word.
 */
export function deriveWordTimings(alignment: TtsAlignment): DerivedWord[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } =
    alignment;
  const usable = Math.min(characters.length, starts.length, ends.length);
  const words: DerivedWord[] = [];

  let current: { text: string; startSec: number; endSec: number } | null = null;

  for (let index = 0; index < usable; index += 1) {
    const character = characters[index] ?? '';
    const startSec = starts[index] ?? 0;
    const endSec = ends[index] ?? startSec;

    if (character.trim().length === 0) {
      if (current) {
        words.push(current);
        current = null;
      }
      continue;
    }

    if (!current) {
      current = { text: character, startSec, endSec };
    } else {
      current.text += character;
      current.endSec = endSec;
    }
  }

  if (current) {
    words.push(current);
  }

  if (words.length === 0) {
    throw new Error('Alignment produced no words');
  }

  return words;
}
