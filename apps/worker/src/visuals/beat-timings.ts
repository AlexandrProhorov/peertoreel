import type { Script } from '@kadence/contracts';
import type { DerivedWord } from '../tts/word-timings.js';

export type BeatPart = 'hook' | 'beat' | 'cta';

export interface BeatTiming {
  part: BeatPart;
  /** Zero-based beat index for a beat scene; null for hook and CTA. */
  beatIndex: number | null;
  text: string;
  visualDirection: string;
  startSec: number;
  endSec: number;
}

interface ScriptPart {
  part: BeatPart;
  beatIndex: number | null;
  text: string;
  visualDirection: string;
  plannedDurationSec: number;
}

/**
 * `scriptPlannedDurationSec` adds six seconds to the beats: three for the hook
 * and three for the CTA. The proportional fallback uses the same split.
 */
const HOOK_PLANNED_SEC = 3;
const CTA_PLANNED_SEC = 3;
const MIN_SCENE_SEC = 0.05;

/** Lowercase and drop punctuation, keeping hyphenated words as one token. */
export function normalizeTimingToken(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeTimingToken)
    .filter((token) => token.length > 0);
}

function scriptParts(script: Script): ScriptPart[] {
  const first = script.beats[0];
  const last = script.beats[script.beats.length - 1];

  if (!first || !last) {
    throw new Error('Сценарий не содержит beat’ов — стадия visuals не может построить таймлайн');
  }

  return [
    {
      part: 'hook',
      beatIndex: null,
      text: script.hook,
      visualDirection: first.visualDirection,
      plannedDurationSec: HOOK_PLANNED_SEC,
    },
    ...script.beats.map((beat, index) => ({
      part: 'beat' as const,
      beatIndex: index,
      text: beat.text,
      visualDirection: beat.visualDirection,
      plannedDurationSec: beat.durationSec,
    })),
    {
      part: 'cta',
      beatIndex: null,
      text: script.cta,
      visualDirection: last.visualDirection,
      plannedDurationSec: CTA_PLANNED_SEC,
    },
  ];
}

interface NormalizedWord {
  word: DerivedWord;
  token: string;
}

function alignParts(
  parts: readonly ScriptPart[],
  words: readonly NormalizedWord[],
): BeatTiming[] | null {
  const result: BeatTiming[] = [];
  let cursor = 0;

  for (const part of parts) {
    const tokens = tokenize(part.text);

    if (tokens.length === 0) {
      return null;
    }

    const slice = words.slice(cursor, cursor + tokens.length);

    if (slice.length !== tokens.length) {
      return null;
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (slice[index]?.token !== tokens[index]) {
        return null;
      }
    }

    const first = slice[0]?.word;
    const last = slice[slice.length - 1]?.word;

    if (!first || !last) {
      return null;
    }

    result.push({
      part: part.part,
      beatIndex: part.beatIndex,
      text: part.text,
      visualDirection: part.visualDirection,
      startSec: first.startSec,
      endSec: last.endSec,
    });
    cursor += tokens.length;
  }

  // Extra words mean the alignment no longer matches the script; do not silently
  // cut them off, because the visuals would stop before the end of the audio.
  return cursor === words.length ? result : null;
}

function plannedTimings(
  parts: readonly ScriptPart[],
  audioEndSec: number,
): BeatTiming[] {
  const plannedTotal = parts.reduce(
    (sum, part) => sum + part.plannedDurationSec,
    0,
  );
  const scale = plannedTotal > 0 ? audioEndSec / plannedTotal : 0;
  let cursor = 0;

  return parts.map((part) => {
    const startSec = cursor;
    const endSec = startSec + part.plannedDurationSec * scale;
    cursor = endSec;

    return {
      part: part.part,
      beatIndex: part.beatIndex,
      text: part.text,
      visualDirection: part.visualDirection,
      startSec,
      endSec,
    };
  });
}

/**
 * Visuals must tile continuously: a scene stays on screen until the next one
 * starts. That also covers pauses between phrases and leading silence.
 */
function makeContiguous(
  timings: readonly BeatTiming[],
  audioEndSec: number,
): BeatTiming[] {
  const result = timings.map((timing) => ({ ...timing }));

  if (result.length === 0) {
    return result;
  }

  const first = result[0];

  if (first) {
    first.startSec = 0;
  }

  for (let index = 1; index < result.length; index += 1) {
    const previous = result[index - 1];
    const current = result[index];

    if (previous && current) {
      current.startSec = Math.max(
        current.startSec,
        previous.startSec + MIN_SCENE_SEC,
      );
    }
  }

  for (let index = 0; index < result.length; index += 1) {
    const current = result[index];
    const next = result[index + 1];

    if (!current) {
      continue;
    }

    current.endSec = next
      ? next.startSec
      : Math.max(current.startSec + MIN_SCENE_SEC, audioEndSec);
  }

  return result;
}

/**
 * Splits the spoken timeline into hook → beats → CTA. Alignment is preferred;
 * if any part does not match, the whole plan falls back to planned durations
 * scaled to the real audio length, so a partial match cannot produce mixed
 * sources of truth.
 */
export function deriveBeatTimings(
  script: Script,
  words: readonly DerivedWord[],
): BeatTiming[] {
  if (words.length === 0) {
    throw new Error(
      'word_timings пуст — стадия visuals не может построить таймлайн',
    );
  }

  const audioEndSec = words[words.length - 1]?.endSec ?? 0;

  if (!(audioEndSec > 0)) {
    throw new Error(
      'word_timings содержит некорректные тайминги — стадия visuals не может построить таймлайн',
    );
  }

  const normalizedWords: NormalizedWord[] = words
    .map((word) => ({ word, token: normalizeTimingToken(word.text) }))
    .filter((entry) => entry.token.length > 0);

  if (normalizedWords.length === 0) {
    throw new Error(
      'word_timings не содержит слов — стадия visuals не может построить таймлайн',
    );
  }

  const parts = scriptParts(script);
  const aligned = alignParts(parts, normalizedWords);
  const timings = aligned ?? plannedTimings(parts, audioEndSec);

  return makeContiguous(timings, audioEndSec);
}
