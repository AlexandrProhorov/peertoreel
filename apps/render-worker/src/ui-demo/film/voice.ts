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

function stamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function toSrt(cues: readonly Cue[]): string {
  return cues
    .map((cue, index) => {
      const end = Math.max(cue.end, cue.start + CUE_GAP);

      return `${index + 1}\n${stamp(cue.start)} --> ${stamp(end)}\n${cue.text}\n`;
    })
    .join('\n');
}
