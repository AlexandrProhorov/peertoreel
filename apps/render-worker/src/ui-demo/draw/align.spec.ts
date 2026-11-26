import { describe, expect, it } from 'vitest';
import { alignDrawToLines, alignTextBeats } from './align.js';
import type { UiScene } from '../spec.js';

const SCENE: Extract<UiScene, { device: 'draw' }> = {
  id: 'hook',
  device: 'draw',
  durationSec: 6,
  revealSec: 0.8,
  nodes: [
    { kind: 'text', x: 72, y: 100, w: 600, text: 'Деньги уходят', token: 'headline' },
    { kind: 'box', x: 72, y: 300, w: 600, h: 400, fill: '#111111' },
  ],
};

const CUE = {
  text: 'Сегодня деньги уходят незаметно.',
  startSec: 1,
  endSec: 4,
} as const;

const WORDS = [
  { word: 'Сегодня', start: 0, end: 0.4 },
  { word: 'деньги', start: 0.5, end: 0.9 },
  { word: 'уходят', start: 1, end: 1.4 },
  { word: 'незаметно', start: 1.5, end: 2 },
];

describe('draw alignment to spoken lines', () => {
  it('puts the text on the start of its first word inside the line', () => {
    const result = alignDrawToLines(SCENE, [CUE], [WORDS]);

    expect(result.aligned).toBe(true);
    expect(result.scene.nodes[0]).toMatchObject({ kind: 'text', at: 1.5, transition: 'type' });
    expect(SCENE.nodes[0]).not.toHaveProperty('at');
  });

  it('reports a line without a text element and keeps the scene', () => {
    const result = alignDrawToLines(SCENE, [{ ...CUE, text: 'Совсем другая реплика' }], [WORDS]);

    expect(result.aligned).toBe(false);
    expect(result.reasons[0]).toContain('line 1');
    expect(result.scene.nodes).toHaveLength(2);
  });
});

describe('text beats alignment', () => {
  it('starts a punchline at its first word', () => {
    const scene: Extract<UiScene, { device: 'draw' }> = {
      id: 'year',
      device: 'draw',
      durationSec: 6,
      revealSec: 0.8,
      nodes: [
        {
          kind: 'text',
          x: 72,
          y: 1300,
          w: 818,
          text: 'этого хватит на хороший отпуск.',
          token: 'headline',
        },
      ],
      textBeats: [
        {
          text: 'этого хватит на хороший отпуск.',
          role: 'punchline',
          zone: 'bottom',
        },
      ],
    };
    const words = [
      { word: 'За', start: 0, end: 0.2 },
      { word: 'год', start: 0.3, end: 0.5 },
      { word: 'этого', start: 0.7, end: 1 },
    ];
    const result = alignTextBeats(scene, words);

    expect(result.aligned).toBe(true);
    expect(result.scene.nodes[0]).toMatchObject({ at: 0.7, transition: 'type' });
  });
});
