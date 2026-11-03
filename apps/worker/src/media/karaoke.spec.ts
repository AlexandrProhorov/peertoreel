import { describe, expect, it } from 'vitest';
import {
  buildKaraokeAss,
  escapeAssText,
  formatAssTime,
  groupPhrases,
  type WordTiming,
} from './karaoke.js';

const words: WordTiming[] = [
  { text: 'Привет,', startSec: 0, endSec: 0.4 },
  { text: 'это', startSec: 0.4, endSec: 0.8 },
  { text: 'караоке', startSec: 0.8, endSec: 1.2 },
];

describe('karaoke', () => {
  it('formats centisecond timestamps', () => {
    expect(formatAssTime(0)).toBe('0:00:00.00');
    expect(formatAssTime(1.25)).toBe('0:00:01.25');
    expect(formatAssTime(61.05)).toBe('0:01:01.05');
    expect(formatAssTime(-1)).toBe('0:00:00.00');
  });

  it('escapes ASS control characters', () => {
    expect(escapeAssText('{\\b1}текст\\n')).toBe('\\{\\\\b1\\}текст\\\\n');
  });

  it('groups words into phrases', () => {
    expect(groupPhrases(words, 2).map((phrase) => phrase.length)).toEqual([2, 1]);
    expect(groupPhrases([], 2)).toEqual([]);
  });

  it('emits one dialogue per word and highlights the spoken one', () => {
    const ass = buildKaraokeAss(words);
    const dialogues = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));

    expect(dialogues).toHaveLength(3);
    expect(dialogues[0]).toContain('0:00:00.00,0:00:00.40');
    expect(dialogues[0]).toContain('{\\c&H00FFFF&\\b1}Привет,{\\c&HFFFFFF&\\b0} это караоке');
    expect(dialogues[1]).toContain('Привет, {\\c&H00FFFF&\\b1}это');
  });

  it('keeps vertical canvas and bottom margin for platform UI', () => {
    const ass = buildKaraokeAss(words, { marginV: 320 });

    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain(',60,60,320,1');
  });
});
