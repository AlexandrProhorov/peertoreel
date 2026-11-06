import { describe, expect, it } from 'vitest';
import { qcReportSchema } from './qc.js';

const report = {
  verdict: 'warn' as const,
  checks: [
    { id: 'duration' as const, status: 'pass' as const, message: '47.9 с' },
    { id: 'loudness' as const, status: 'warn' as const, message: '-16.1 LUFS' },
    { id: 'sync' as const, status: 'pass' as const, message: 'аудио и видео совпадают' },
    { id: 'stop_words' as const, status: 'pass' as const, message: 'стоп-слов нет' },
    { id: 'aigc' as const, status: 'pass' as const, message: 'is_aigc=true' },
    { id: 'readability' as const, status: 'pass' as const, message: '125 слов/мин' },
  ],
  metrics: {
    durationSec: 47.9,
    audioDurationSec: 47.9,
    videoDurationSec: 47.9,
    integratedLufs: -16.1,
    truePeakDb: -1.3,
    loudnessRange: 7.2,
    words: 150,
    wordsPerMinute: 125,
    maxSentenceWords: 20,
    audioGaps: [0.08],
    stopWords: [],
    isAigc: true,
  },
  createdAt: '2026-11-05T16:00:00.000Z',
};

describe('qc contracts', () => {
  it('accepts a valid report', () => {
    expect(qcReportSchema.safeParse(report).success).toBe(true);
  });

  it('rejects an unknown check or empty checks', () => {
    expect(
      qcReportSchema.safeParse({
        ...report,
        checks: [{ id: 'video', status: 'pass', message: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      qcReportSchema.safeParse({ ...report, checks: [] }).success,
    ).toBe(false);
  });

  it('rejects an unknown verdict', () => {
    expect(
      qcReportSchema.safeParse({ ...report, verdict: 'ok' }).success,
    ).toBe(false);
  });
});
