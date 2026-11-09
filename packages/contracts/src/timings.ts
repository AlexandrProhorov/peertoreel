import { z } from 'zod';

/**
 * One word produced from the TTS character alignment. `word_timings.json` is
 * the source of truth for the spoken timeline; storyboard scene windows and
 * subtitle phrases are derived from it, never the other way around.
 */
export const derivedWordSchema = z
  .object({
    text: z.string().min(1),
    startSec: z.number().finite().nonnegative(),
    endSec: z.number().finite().nonnegative(),
  })
  .refine((word) => word.endSec >= word.startSec, {
    message: 'Word end must not be before its start',
    path: ['endSec'],
  });
export type DerivedWord = z.infer<typeof derivedWordSchema>;

export const derivedWordsSchema = z.array(derivedWordSchema);
export type DerivedWords = z.infer<typeof derivedWordsSchema>;
