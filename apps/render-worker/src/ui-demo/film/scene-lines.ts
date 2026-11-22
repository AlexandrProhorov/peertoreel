import { TEXT_PRIMITIVES, type PrimitiveId } from '../catalog.js';
import type { SpecScene } from '../spec.js';
import type { SpokenWord } from './voice.js';

/**
 * The screen shows the thesis of each line, not the whole narration.
 *
 * A text element must be a contiguous fragment of a spoken line (words,
 * verbatim), and the fragments must follow the line order. A short service
 * label ("промпт 1", a number) may stand outside the script; a long invented
 * text is rejected.
 */

export interface SceneTextElement {
  readonly id: string;
  readonly text: string;
}

export interface SceneLineMatch {
  /** Element that carries the thesis. */
  readonly elementId: string;
  /** Line of the narration it belongs to. */
  readonly lineIndex: number;
  /** First word of the fragment inside the line. */
  readonly wordIndex: number;
}

export interface SceneLineMatchResult {
  readonly matches: readonly SceneLineMatch[];
  /** Text elements that are not part of the script (service labels). */
  readonly extras: readonly SceneTextElement[];
  /** Why the order or the coverage is wrong, or null. */
  readonly problem: string | null;
}

/** Reading order: the element whose first cue starts earlier reads first. */
function firstCueAt(scene: SpecScene, elementId: string): number {
  const step = scene.spec.sequence.find((item) => item.element === elementId);

  return step?.at ?? Number.POSITIVE_INFINITY;
}

export function sceneTextElements(scene: SpecScene): SceneTextElement[] {
  return scene.spec.elements
    .filter((element) => TEXT_PRIMITIVES.has(element.primitive as PrimitiveId))
    .map((element) => {
      const text = (element.params as Readonly<Record<string, unknown>>)['text'];

      return {
        id: element.id,
        text: typeof text === 'string' ? text.trim() : '',
        at: firstCueAt(scene, element.id),
      };
    })
    .filter((element) => element.text.length > 0)
    .sort((left, right) => left.at - right.at)
    .map(({ id, text }) => ({ id, text }));
}

/** Comparable form: case, quotes and punctuation do not change the words. */
export function normalizeSceneWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[«»""''`]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0);
}

/** First index where `fragment` appears as a contiguous word sequence. */
export function fragmentIndex(
  words: readonly string[],
  fragment: readonly string[],
): number | null {
  if (fragment.length === 0) {
    return null;
  }

  for (let start = 0; start <= words.length - fragment.length; start += 1) {
    const matches = fragment.every(
      (word, offset) => words[start + offset] === word,
    );

    if (matches) {
      return start;
    }
  }

  return null;
}

/** Longest service label we tolerate outside the script. */
const MAX_EXTRA_WORDS = 3;

/**
 * Map every text element to a line fragment, keeping the narration order.
 * A line may own more than one element; every line must own at least one.
 */
export function matchSceneLines(
  scene: SpecScene,
  lines: readonly string[],
  requireAll = true,
): SceneLineMatchResult {
  const texts = sceneTextElements(scene);
  const lineWords = lines.map(normalizeSceneWords);
  const matches: SceneLineMatch[] = [];
  const extras: SceneTextElement[] = [];
  const covered = new Set<number>();
  let lineCursor = 0;
  let wordCursor = 0;

  for (const element of texts) {
    const fragment = normalizeSceneWords(element.text);

    if (fragment.length === 0) {
      continue;
    }

    let found: { lineIndex: number; wordIndex: number } | null = null;

    for (let lineIndex = lineCursor; lineIndex < lineWords.length; lineIndex += 1) {
      const from = lineIndex === lineCursor ? wordCursor : 0;
      const index = fragmentIndex((lineWords[lineIndex] ?? []).slice(from), fragment);

      if (index !== null) {
        found = { lineIndex, wordIndex: from + index };

        break;
      }
    }

    if (found === null) {
      extras.push(element);

      continue;
    }

    matches.push({ elementId: element.id, ...found });
    covered.add(found.lineIndex);
    lineCursor = found.lineIndex;
    wordCursor = found.wordIndex + fragment.length;
  }

  if (matches.length === 0) {
    return { matches, extras, problem: 'реплика не нашла свои элементы' };
  }

  if (requireAll) {
    for (const [lineIndex] of lines.entries()) {
      if (!covered.has(lineIndex)) {
        return {
          matches,
          extras,
          problem: `строка ${String(lineIndex + 1)} не имеет тезиса на экране`,
        };
      }
    }
  }

  for (const extra of extras) {
    if (normalizeSceneWords(extra.text).length > MAX_EXTRA_WORDS) {
      return {
        matches,
        extras,
        problem: `лишний текст не из реплики: «${extra.text}»`,
      };
    }
  }

  return { matches, extras, problem: null };
}

export function sceneLineMismatch(
  scene: SpecScene,
  lines: readonly string[],
): string | null {
  return matchSceneLines(scene, lines).problem;
}

export interface SceneAlignment {
  readonly scene: SpecScene;
  readonly aligned: boolean;
  readonly reasons: readonly string[];
}

/**
 * Place each thesis on the word that speaks it: the element's first cue moves
 * to the fragment's start inside its line. A whole-line element lands on the
 * line start; a short thesis lands later, on its own words.
 */
export function alignSceneToLines(
  scene: SpecScene,
  lines: readonly { readonly text: string; readonly startSec: number }[],
  wordsByLine: readonly (readonly SpokenWord[])[],
  options: { readonly requireAll?: boolean } = {},
): SceneAlignment {
  const { matches, problem } = matchSceneLines(
    scene,
    lines.map((line) => line.text),
    options.requireAll ?? true,
  );

  if (problem !== null) {
    return { scene, aligned: false, reasons: [problem] };
  }

  const sequence = [...scene.spec.sequence];
  const reasons: string[] = [];

  for (const match of matches) {
    const line = lines[match.lineIndex];
    const word = wordsByLine[match.lineIndex]?.[match.wordIndex];

    if (line === undefined) {
      continue;
    }

    const at = Number((line.startSec + (word?.start ?? 0)).toFixed(3));
    const index = sequence.findIndex((step) => step.element === match.elementId);

    if (index < 0) {
      sequence.push({ element: match.elementId, transition: 'appear', at });
      reasons.push(`${match.elementId}: добавлен показ на ${String(at)}s`);

      continue;
    }

    const step = sequence[index];

    if (step !== undefined && step.at !== at) {
      sequence[index] = { ...step, at };
      reasons.push(`${match.elementId}: показ ${String(step.at ?? 0)}s → ${String(at)}s`);
    }

    /* The reveal alone is not enough: the model's own `type`/`draw` step often
       sits a second after the line starts, so the box was on screen but empty
       while the voice was already speaking. Shift the element's content steps
       by the same delta, keeping their rhythm. */
    const contentIndex = sequence.findIndex(
      (item) =>
        item.element === match.elementId &&
        (item.transition === 'type' || item.transition === 'draw'),
    );
    const content = sequence[contentIndex];

    if (content !== undefined) {
      const from = content.at ?? 0;

      if (from !== at) {
        const delta = at - from;

        for (let i = 0; i < sequence.length; i += 1) {
          const item = sequence[i];

          if (
            item === undefined ||
            item.element !== match.elementId ||
            item.transition === 'appear' ||
            (item.at ?? 0) < from
          ) {
            continue;
          }

          sequence[i] = {
            ...item,
            at: Number(((item.at ?? 0) + delta).toFixed(3)),
          };
        }

        reasons.push(
          `${match.elementId}: ${content.transition} ${String(from)}s → ${String(at)}s`,
        );
      }
    }
  }

  return {
    scene: {
      ...scene,
      thesisIds: matches.map((match) => match.elementId),
      spec: { ...scene.spec, sequence },
    },
    aligned: true,
    reasons,
  };
}

/** Element ids that carry a spoken thesis, for the frame gate. */
export function thesisIdsFor(
  scene: SpecScene,
  lines: readonly string[],
): string[] {
  return matchSceneLines(scene, lines).matches.map((match) => match.elementId);
}
