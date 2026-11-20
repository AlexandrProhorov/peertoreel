import { describe, expect, it } from 'vitest';
import { aggregateOf, measureRun, measureRuns } from './metrics.js';
import type { RunSource, TopicSource } from './sources.js';

/**
 * The bench must never turn a missing field into a zero: `n/a` is the honest
 * answer for archives that predate a report field, and the first series would
 * otherwise "improve" by changing the report schema.
 */

function titleStack(id: string, title: string): unknown {
  return {
    id,
    device: 'title-stack',
    durationSec: 5,
    title,
    subtitle: null,
    eyebrow: null,
    align: 'center',
    highlightWords: [],
    icons: [],
    vertical: 'upper',
    centerMark: false,
  };
}

function episode(scenes: readonly unknown[]): unknown {
  return { schemaVersion: 1, themeId: 'studio-dark', scenes, speech: [], captions: false };
}

function topic(patch: Partial<TopicSource>): TopicSource {
  return {
    slug: 'topic',
    report: null,
    episode: null,
    arc: null,
    attempts: [],
    plannedScenes: null,
    brokenFiles: [],
    arcAttempts: 0,
    ...patch,
  };
}

const SPEC_ATTEMPT = {
  schemaVersion: 1,
  themeId: 'studio-dark',
  scenes: [
    {
      id: 'scene',
      device: 'spec',
      durationSec: 5,
      spec: {
        kind: 'composition',
        elements: [
          {
            id: 'plate',
            primitive: 'card',
            layout: { x: 100, y: 300, width: 500, height: 200 },
            params: { text: 'Скидка', tone: 'accent', mystery: 1 },
            states: [],
            transitions: ['zoom'],
            operations: [],
            links: [],
          },
        ],
        sequence: [],
      },
    },
  ],
};

describe('run metrics', () => {
  it('counts lost scenes from the report when the report carries them', () => {
    const metrics = measureRun({
      run: 'film-a',
      topics: [
        topic({
          report: { slug: 'topic', planned: 4, produced: 3 },
          episode: episode([titleStack('s1', 'один')]),
        }),
      ],
    });

    expect(metrics.totals.lost).toBe(1);
    expect(metrics.topics[0]?.lostSource).toBe('report');
  });

  it('keeps degraded as n/a for a run that never wrote the field', () => {
    const metrics = measureRun({
      run: 'film-b',
      topics: [topic({ report: { slug: 'topic', planned: 4, produced: 4 } })],
    });

    expect(metrics.topics[0]?.degraded).toEqual({ count: null, source: 'n/a' });
    expect(metrics.totals.degraded).toBeNull();
    expect(metrics.totals.degradedTopics).toBe(0);
  });

  it('sums degraded only for topics that reported it', () => {
    const metrics = measureRun({
      run: 'film-c',
      topics: [
        topic({ report: { slug: 'topic', planned: 4, produced: 4, degraded: 1 } }),
        topic({ slug: 'other', report: { slug: 'other', planned: 2, produced: 2 } }),
      ],
    });

    expect(metrics.totals.degraded).toBe(1);
    expect(metrics.totals.degradedTopics).toBe(1);
  });

  it('falls back to the attempt scene indices when the report says nothing', () => {
    const metrics = measureRun({
      run: 'film-d',
      topics: [
        topic({
          plannedScenes: 4,
          episode: episode([titleStack('s1', 'один'), titleStack('s2', 'два')]),
        }),
      ],
    });

    expect(metrics.topics[0]?.planned).toBe(4);
    expect(metrics.topics[0]?.lost).toBe(2);
    expect(metrics.topics[0]?.lostSource).toBe('attempts');
  });

  it('does not count the same composition in new words as diversity', () => {
    const metrics = measureRun({
      run: 'film-e',
      topics: [
        topic({ episode: episode([titleStack('s1', 'первый'), titleStack('s2', 'второй')]) }),
      ],
    });

    expect(metrics.topics[0]?.scenes.count).toBe(2);
    expect(metrics.topics[0]?.scenes.unique).toBe(1);
    expect(metrics.totals.signatureRatio).toBe(0.5);
  });

  it('counts the primitive cast per film, not the arrangement', () => {
    const metrics = measureRun({
      run: 'film-e2',
      topics: [
        topic({ episode: episode([titleStack('s1', 'первый'), titleStack('s2', 'второй')]) }),
      ],
    });

    expect(metrics.topics[0]?.scenes.coarseUnique).toBe(1);
    expect(metrics.totals.coarseRatio).toBe(0.5);
  });

  it('separates invented vocabulary from gate rejections', () => {
    const metrics = measureRun({
      run: 'film-f',
      topics: [topic({ attempts: [SPEC_ATTEMPT] })],
    });

    const codes = new Set(metrics.topics[0]?.census.model.map((entry) => entry.code));
    const gate = new Set(metrics.topics[0]?.census.gate.map((entry) => entry.code));

    /* `tone` exists on label and pill but not on card: a mix-up, not a typo. */
    expect(codes.has('property-mixup')).toBe(true);
    expect(codes.has('unknown-parameter')).toBe(true);
    expect(codes.has('transition-dropped')).toBe(true);

    /* Our own rejections stay in their own column and their own namespace. */
    expect(gate.has('quality:density')).toBe(true);

    for (const code of gate) {
      const own = code.startsWith('quality:') ||
        ['typography-fit', 'grid-overlap', 'surface-overlap'].includes(code);

      expect(own).toBe(true);
      expect(codes.has(code)).toBe(false);
    }
  });

  it('describes attempt structure separately from the episode', () => {
    const metrics = measureRun({
      run: 'film-g',
      topics: [topic({ attempts: [SPEC_ATTEMPT, SPEC_ATTEMPT] })],
    });

    expect(metrics.topics[0]?.census.structure).toEqual({ total: 2, unique: 1, invalid: 0 });
  });

  it('aggregates several runs without inventing numbers', () => {
    const runs: RunSource[] = [
      {
        run: 'film-h',
        topics: [topic({ report: { slug: 'topic', planned: 4, produced: 4, degraded: 0 } })],
      },
      {
        run: 'film-i',
        topics: [topic({ report: { slug: 'topic', planned: 4, produced: 3 } })],
      },
    ];

    const aggregate = aggregateOf(measureRuns(runs));

    expect(aggregate.runs).toBe(2);
    expect(aggregate.degradedRuns).toBe(1);
    expect(aggregate.lost).toBe(1);
    expect(aggregate.degraded).toBe(0);
  });
});
