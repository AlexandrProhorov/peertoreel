import {
  normalizeStoryboardToken,
  type DerivedWord,
  type SceneObject,
  type StoryboardScene,
} from '@peertoreel/contracts';

export interface ObjectWindow {
  /** Seconds relative to the start of the scene clip. */
  startSec: number;
  /** Seconds relative to the start of the scene clip. */
  endSec: number;
}

/** Keep derived times at millisecond precision, like the ASS timeline. */
function roundSec(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function tokenizeWord(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeStoryboardToken)
    .filter((token) => token.length > 0);
}

/**
 * First word (or contiguous word sequence) matching `syncToWord`, limited to
 * the scene's voiceover window. Scene scoping matters when the same word
 * appears in several scenes; multi-token sync phrases are supported.
 */
export function findWordStartSec(
  words: readonly DerivedWord[] | undefined,
  syncToWord: string | null,
  scene?: Pick<StoryboardScene, 'voiceover'>,
): number | null {
  if (!syncToWord || !words) {
    return null;
  }

  const target = tokenizeWord(syncToWord);

  if (target.length === 0) {
    return null;
  }

  const from = scene ? scene.voiceover.startSec - 0.15 : Number.NEGATIVE_INFINITY;
  const to = scene ? scene.voiceover.endSec + 0.15 : Number.POSITIVE_INFINITY;
  const candidates = words.filter(
    (word) => word.startSec >= from && word.startSec <= to,
  );

  for (let index = 0; index <= candidates.length - target.length; index += 1) {
    const matches = target.every((token, offset) => {
      const candidate = candidates[index + offset];

      return (
        candidate !== undefined &&
        normalizeStoryboardToken(candidate.text) === token
      );
    });

    if (matches) {
      return candidates[index]?.startSec ?? null;
    }
  }

  return null;
}

/**
 * Convert the storyboard's absolute object window into clip-local seconds.
 * `syncToWord` is used as the accent anchor when `startSec` is absent; the
 * object still ends at its own `endSec` (or the scene end).
 */
export function objectWindowSec(
  scene: StoryboardScene,
  object: SceneObject,
  words?: readonly DerivedWord[],
): ObjectWindow {
  const sceneStart = scene.voiceover.startSec;
  const sceneEnd = scene.voiceover.endSec;
  const wordStart = findWordStartSec(words, object.syncToWord, scene);
  const absoluteStart = object.startSec ?? wordStart ?? sceneStart;
  const absoluteEnd = object.endSec ?? sceneEnd;

  return {
    startSec: Math.max(0, roundSec(absoluteStart - sceneStart)),
    endSec: Math.max(0, roundSec(absoluteEnd - sceneStart)),
  };
}

/** Word accent time relative to the clip start, if the object is synced. */
export function objectAccentSec(
  scene: StoryboardScene,
  object: SceneObject,
  words?: readonly DerivedWord[],
): number | null {
  const wordStart = findWordStartSec(words, object.syncToWord, scene);

  return wordStart === null
    ? null
    : Math.max(0, roundSec(wordStart - scene.voiceover.startSec));
}
