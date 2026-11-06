import type { Script } from '@kadence/contracts';
import { describe, expect, it } from 'vitest';
import type { MediaProbe } from '../media/ffprobe.js';
import type { LoudnormMeasurement } from '../media/loudnorm.js';
import type { DerivedWord } from '../tts/word-timings.js';
import { runQcChecks } from './checks.js';

const script: Script = {
  title: 'Тестовый ролик',
  hook: 'Короткий хук.',
  beats: [
    { text: 'Первый короткий бит.', visualDirection: 'dog', durationSec: 5 },
    { text: 'Второй короткий бит.', visualDirection: 'dog', durationSec: 5 },
  ],
  cta: 'Подпишись.',
};

const probe: MediaProbe = {
  durationSec: 47.9,
  audioDurationSec: 47.9,
  videoDurationSec: 47.9,
  audioGaps: [],
};

const loudness: LoudnormMeasurement = {
  input_i: '-14.2',
  input_tp: '-1.3',
  input_lra: '7.2',
  input_thresh: '-24.2',
  output_i: '-14.0',
  output_tp: '-1.5',
  output_lra: '7.0',
  output_thresh: '-24.0',
  normalization_type: 'linear',
  target_offset: '0.1',
};

function words(count: number, lastEndSec = 47.5): DerivedWord[] {
  return Array.from({ length: count }, (_, index) => ({
    text: 'слово',
    startSec: index * 0.3,
    endSec: index === count - 1 ? lastEndSec : index * 0.3 + 0.2,
  }));
}

function input(overrides: {
  script?: Script;
  probe?: MediaProbe;
  loudness?: LoudnormMeasurement;
  words?: DerivedWord[];
} = {}) {
  return {
    script: overrides.script ?? script,
    words: overrides.words ?? words(150),
    probe: overrides.probe ?? probe,
    loudness: overrides.loudness ?? loudness,
  };
}

describe('runQcChecks', () => {
  it('passes a healthy draft', () => {
    const result = runQcChecks(input());

    expect(result.verdict).toBe('pass');
    expect(result.checks.map((check) => check.id)).toEqual([
      'duration',
      'loudness',
      'sync',
      'stop_words',
      'aigc',
      'readability',
    ]);
    expect(result.metrics.isAigc).toBe(true);
  });

  it('fails on a real audio gap', () => {
    const result = runQcChecks(
      input({ probe: { ...probe, audioGaps: [3.05] } }),
    );

    expect(result.verdict).toBe('fail');
    expect(result.checks.find((check) => check.id === 'sync')?.status).toBe(
      'fail',
    );
  });

  it('warns on loudness outside the target', () => {
    const result = runQcChecks(
      input({ loudness: { ...loudness, input_i: '-16.1' } }),
    );

    expect(result.verdict).toBe('warn');
    expect(result.checks.find((check) => check.id === 'loudness')?.status).toBe(
      'warn',
    );
  });

  it('warns on stop words', () => {
    const result = runQcChecks(
      input({
        script: {
          ...script,
          beats: [
            {
              text: 'Это секрет, который скрывают.',
              visualDirection: 'dog',
              durationSec: 5,
            },
            { text: 'Второй бит.', visualDirection: 'dog', durationSec: 5 },
          ],
        } as Script,
      }),
    );

    expect(result.verdict).toBe('warn');
    expect(result.metrics.stopWords).toContain('секрет');
  });

  it('fails on speech that does not fit the draft', () => {
    const result = runQcChecks(input({ words: words(150, 60) }));

    expect(result.verdict).toBe('fail');
    expect(result.checks.find((check) => check.id === 'duration')?.status).toBe(
      'fail',
    );
  });
});
