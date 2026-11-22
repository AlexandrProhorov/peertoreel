/**
 * Voice and subtitles derive from one source: the scene's `narration` and the
 * TTS character alignment. Words are cut in code, not guessed: a subtitle that
 * drifts from the voice is worse than no subtitle.
 */

export interface AlignedChars {
  readonly characters: readonly string[];
  readonly character_start_times_seconds: readonly number[];
  readonly character_end_times_seconds: readonly number[];
}

export interface SpokenWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

/** Group the character alignment into words on whitespace. */
export function wordsFromAlignment(text: string, alignment: AlignedChars): SpokenWord[] {
  const words: SpokenWord[] = [];
  let current: SpokenWord | null = null;

  for (let index = 0; index < alignment.characters.length; index += 1) {
    const char = alignment.characters[index] ?? text[index] ?? '';
    const start = alignment.character_start_times_seconds[index];
    const end = alignment.character_end_times_seconds[index];

    if (start === undefined || end === undefined) {
      continue;
    }

    if (/\s/.test(char)) {
      if (current !== null) {
        words.push(current);
        current = null;
      }

      continue;
    }

    current =
      current === null
        ? { word: char, start, end }
        : { word: `${current.word}${char}`, start: current.start, end };
  }

  if (current !== null) {
    words.push(current);
  }

  return words;
}

/** A subtitle cue: one line, timed. */
export interface Cue {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** A spoken line: short enough for one on-screen text element. */
export interface NarrationLine {
  readonly text: string;
  /** Silence after this line when the scene audio is assembled. */
  readonly pauseAfterSec: number;
}

/** Text primitives cap at 80 characters; stay inside the contract. */
export const MAX_LINE_CHARS = 80;
/** A full stop is a beat, a comma a breath. */
export const SENTENCE_PAUSE_SEC = 0.3;
export const CLAUSE_PAUSE_SEC = 0.18;

const TRAILING_CLOSERS = /[»"”'’)\]]+$/u;

function pauseAfterLine(text: string): number {
  const stripped = text.replace(TRAILING_CLOSERS, '');

  return /[.!?…]$/u.test(stripped) ? SENTENCE_PAUSE_SEC : CLAUSE_PAUSE_SEC;
}

/**
 * Cut narration into the lines that will stand on screen and in the audio.
 *
 * The split is deterministic: sentence boundaries first, then the comma or
 * dash closest to the middle of an over-long sentence, then a word boundary.
 * Every line is synthesized on its own, so its start time is known by
 * construction rather than estimated from the scene length.
 */
export function splitNarrationLines(
  narration: string,
  maxChars = MAX_LINE_CHARS,
): NarrationLine[] {
  const text = narration.replace(/\s+/gu, ' ').trim();
  const lines: NarrationLine[] = [];

  if (text.length === 0) {
    return lines;
  }

  for (const sentence of text.split(/(?<=[.!?…])\s+/u)) {
    splitLine(sentence.trim(), maxChars, lines);
  }

  return lines;
}

const CLAUSE_SEPARATORS = [', ', ' — ', '; ', ': '];

function splitLine(text: string, maxChars: number, lines: NarrationLine[]): void {
  if (text.length === 0) {
    return;
  }

  if (text.length <= maxChars) {
    lines.push({ text, pauseAfterSec: pauseAfterLine(text) });

    return;
  }

  const middle = text.length / 2;
  let best: readonly [string, string] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const separator of CLAUSE_SEPARATORS) {
    let index = text.indexOf(separator);

    while (index > 0) {
      const left = text.slice(0, index + separator.length).trim();
      const right = text.slice(index + separator.length).trim();

      if (left.length > 0 && right.length > 0) {
        const distance = Math.abs(left.length - middle);

        if (distance < bestDistance) {
          bestDistance = distance;
          best = [left, right];
        }
      }

      index = text.indexOf(separator, index + 1);
    }
  }

  if (best !== null) {
    splitLine(best[0], maxChars, lines);
    splitLine(best[1], maxChars, lines);

    return;
  }

  /* No clause separator left: cut at the last word boundary inside the limit. */
  const boundary = Math.max(
    text.lastIndexOf(' ', maxChars),
    text.indexOf(' ', maxChars),
  );

  if (boundary <= 0 || boundary >= text.length) {
    lines.push({ text, pauseAfterSec: pauseAfterLine(text) });

    return;
  }

  splitLine(text.slice(0, boundary).trim(), maxChars, lines);
  splitLine(text.slice(boundary + 1).trim(), maxChars, lines);
}

/** A line placed on the scene's own audio track. Times are scene-local. */
export interface LineCue {
  readonly text: string;
  readonly startSec: number;
  readonly endSec: number;
}

/**
 * Place the synthesized lines one after another, with the declared pause
 * between them and none after the last: the scene's tail is added by the voice
 * step, not by the text. The result is the single source for the audio mix and
 * the on-screen line starts.
 */
export function placeLines(
  lines: readonly NarrationLine[],
  durationsSec: readonly number[],
): { readonly cues: readonly LineCue[]; readonly totalSec: number } {
  if (lines.length !== durationsSec.length) {
    throw new Error(
      `placeLines: ${String(lines.length)} line(s) but ${String(durationsSec.length)} duration(s)`,
    );
  }

  const cues: LineCue[] = [];
  let cursor = 0;

  for (const [index, line] of lines.entries()) {
    const duration = durationsSec[index] ?? 0;
    const startSec = cursor;
    const endSec = startSec + duration;

    cues.push({
      text: line.text,
      startSec: roundSec(startSec),
      endSec: roundSec(endSec),
    });

    cursor = endSec + (index < lines.length - 1 ? line.pauseAfterSec : 0);
  }

  return { cues, totalSec: roundSec(cursor) };
}

function roundSec(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const MAX_CUE_WORDS = 6;
const MAX_CUE_CHARS = 42;
const CUE_GAP = 0.08;

/** Split words into short cues, shifted by the scene's start time. */
export function cuesFromWords(words: readonly SpokenWord[], offset: number): Cue[] {
  const cues: Cue[] = [];
  let group: SpokenWord[] = [];

  const flush = (): void => {
    if (group.length === 0) {
      return;
    }

    const first = group[0];
    const last = group[group.length - 1];

    if (first !== undefined && last !== undefined) {
      cues.push({
        text: group.map((item) => item.word).join(' '),
        start: Number((offset + first.start).toFixed(2)),
        end: Number((offset + last.end).toFixed(2)),
      });
    }

    group = [];
  };

  for (const word of words) {
    const length = group.reduce((sum, item) => sum + item.word.length + 1, 0);

    if (group.length >= MAX_CUE_WORDS || length + word.word.length > MAX_CUE_CHARS) {
      flush();
    }

    group.push(word);
  }

  flush();

  return cues;
}

/** Even a one-letter word needs a visible span on screen. */
const MIN_WORD_SEC = 0.12;

/**
 * Word weight = letters plus the pause the punctuation asks for. A comma is a
 * breath, a full stop a beat; distributing by letters alone made the last word
 * of a sentence arrive late.
 */
function wordWeight(word: string): number {
  const letters = word.replace(/[^0-9A-Za-zА-Яа-яЁё]/gu, '').length;
  const base = Math.max(2, letters);
  const stripped = word.replace(TRAILING_CLOSERS, '');

  if (/[.!?…]$/u.test(stripped)) {
    return base + 1.2;
  }

  if (/[,;:—]$/u.test(stripped)) {
    return base + 0.6;
  }

  return base;
}

/**
 * Approximate word times for a provider without alignment (Google TTS).
 *
 * Times fill the measured speech exactly: no invented gap after each word.
 * They are only a fallback for word-level highlights — line starts come from
 * `placeLines`, where the audio is assembled by construction.
 */
export function estimateWords(text: string, durationSec: number): SpokenWord[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const spoken = Math.max(0.4, durationSec);
  const weights = words.map(wordWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const floorTotal = Math.min(spoken, MIN_WORD_SEC * words.length);
  const spanFloor = floorTotal / words.length;
  const extra = Math.max(0, spoken - floorTotal);
  let cursor = 0;

  return words.map((word, index) => {
    const span = spanFloor + (extra * (weights[index] ?? 1)) / totalWeight;
    const start = cursor;
    const end = Math.min(spoken, start + span);

    cursor = end;

    return { word, start: roundSec(start), end: roundSec(end) };
  });
}

function stamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function toSrt(cues: readonly Cue[]): string {  return cues
    .map((cue, index) => {
      const end = Math.max(cue.end, cue.start + CUE_GAP);

      return `${index + 1}\n${stamp(cue.start)} --> ${stamp(end)}\n${cue.text}\n`;
    })
    .join('\n');
}
