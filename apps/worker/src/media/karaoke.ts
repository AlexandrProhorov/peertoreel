export interface WordTiming {
  text: string;
  startSec: number;
  endSec: number;
}

export interface KaraokeOptions {
  fontName?: string;
  fontSize?: number;
  /** Bottom margin in pixels: leaves room for TikTok's caption/UI area. */
  marginV?: number;
  wordsPerPhrase?: number;
}

const DEFAULTS: Required<KaraokeOptions> = {
  fontName: 'Arial',
  fontSize: 56,
  marginV: 320,
  wordsPerPhrase: 4,
};

export function escapeAssText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('\n', ' ');
}

/** ASS timestamps are H:MM:SS.CS — centiseconds, no milliseconds. */
export function formatAssTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

export function groupPhrases(
  words: readonly WordTiming[],
  wordsPerPhrase: number,
): WordTiming[][] {
  const phrases: WordTiming[][] = [];

  for (let index = 0; index < words.length; index += wordsPerPhrase) {
    phrases.push(words.slice(index, index + wordsPerPhrase));
  }

  return phrases.filter((phrase) => phrase.length > 0);
}

function phraseDialogues(
  phrase: readonly WordTiming[],
  nextPhraseStart: number | null,
): string[] {
  const phraseEnd =
    phrase.at(-1)?.endSec ?? nextPhraseStart ?? phrase[0]?.endSec ?? 0;

  return phrase.map((word, index) => {
    const end =
      index < phrase.length - 1 ? (phrase[index + 1]?.startSec ?? word.endSec) : phraseEnd;

    const text = phrase
      .map((candidate, candidateIndex) => {
        const escaped = escapeAssText(candidate.text);

        return candidateIndex === index
          ? `{\\c&H00FFFF&\\b1}${escaped}{\\c&HFFFFFF&\\b0}`
          : escaped;
      })
      .join(' ');

    return `Dialogue: 0,${formatAssTime(word.startSec)},${formatAssTime(end)},Default,,0,0,0,,${text}`;
  });
}

/**
 * Phrase-level karaoke: the whole phrase stays on screen and the spoken word
 * turns yellow. One Dialogue event per word, so timing comes from the TTS
 * alignment and never from guessed durations.
 */
export function buildKaraokeAss(
  words: readonly WordTiming[],
  options: KaraokeOptions = {},
): string {
  const config = { ...DEFAULTS, ...options };
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${config.fontName},${config.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,4,0,2,60,60,${config.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const phrases = groupPhrases(words, config.wordsPerPhrase);
  const dialogues = phrases.flatMap((phrase, index) =>
    phraseDialogues(phrase, phrases[index + 1]?.[0]?.startSec ?? null),
  );

  return [...header, ...dialogues, ''].join('\n');
}
