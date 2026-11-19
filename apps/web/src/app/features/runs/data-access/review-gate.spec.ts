import type { QcReport } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { canApproveReview } from './review-gate';

const qc: QcReport = {
  verdict: 'pass',
  checks: [{ id: 'duration', status: 'pass', message: '47.9 с' }],
  metrics: {
    durationSec: 47.9,
    audioDurationSec: 47.9,
    videoDurationSec: 47.9,
    integratedLufs: -14.2,
    truePeakDb: -1.3,
    loudnessRange: 7.2,
    words: 150,
    wordsPerMinute: 188,
    maxSentenceWords: 12,
    audioGaps: [0.08],
    stopWords: [],
    isAigc: true,
  },
  createdAt: '2026-11-05T16:00:00.000Z',
};

describe('canApproveReview', () => {
  it('requires a passing QC report on the pipeline path', () => {
    expect(canApproveReview({ mode: 'pipeline', state: 'REVIEW' }, null)).toBe(false);
    expect(
      canApproveReview({ mode: 'pipeline', state: 'REVIEW' }, { ...qc, verdict: 'fail' }),
    ).toBe(false);
    expect(canApproveReview({ mode: 'pipeline', state: 'REVIEW' }, qc)).toBe(true);
  });

  it('lets an episode run be approved without QC', () => {
    expect(canApproveReview({ mode: 'episode', state: 'REVIEW' }, null)).toBe(true);
  });

  it('only approves from REVIEW', () => {
    expect(canApproveReview({ mode: 'episode', state: 'SCRIPT_READY' }, null)).toBe(false);
    expect(canApproveReview({ mode: 'pipeline', state: 'RENDERING' }, qc)).toBe(false);
  });
});
