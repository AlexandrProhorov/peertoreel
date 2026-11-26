import { describe, expect, it } from 'vitest';
import { textPlanIssues } from './carrier.js';
import type { TreatmentScene } from './treatment.js';
import type { DrawNode } from './schema.js';

const SCENE: TreatmentScene = {
  id: 'line',
  function: 'proof',
  frame: 'carrier',
  intent: 'мысль',
  narration: 'За год набегает 35 880 ₽ — этого хватит на хороший отпуск.',
  seconds: 6,
  theme: 'studio-dark',
  texts: [{ text: 'За год набегает', role: 'setup' }],
};

const SLOTS = [{ index: 0, zone: 'middle' as const }];
const TEXT: DrawNode = {
  kind: 'text',
  x: 72,
  y: 700,
  w: 818,
  text: 'За год набегает',
  token: 'headline',
};

describe('text plan gate', () => {
  it('accepts a beat inside its zone', () => {
    expect(textPlanIssues([TEXT], SCENE, SLOTS)).toHaveLength(0);
  });

  it('rejects a beat outside its zone', () => {
    const issues = textPlanIssues([{ ...TEXT, y: 200 } as DrawNode], SCENE, SLOTS);

    expect(issues.some((issue) => issue.includes('зоне middle'))).toBe(true);
  });

  it('rejects a carrier node that covers the text', () => {
    const issues = textPlanIssues(
      [TEXT, { kind: 'box', x: 72, y: 700, w: 818, h: 200 }],
      SCENE,
      SLOTS,
    );

    expect(issues.some((issue) => issue.includes('пересекает текст'))).toBe(true);
  });
});
