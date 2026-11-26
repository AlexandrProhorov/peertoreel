import { describe, expect, it } from 'vitest';
import { ZONES } from './carrier.js';
import { composeStatement } from './statement.js';
import type { TreatmentScene } from './treatment.js';

const SCENE: TreatmentScene = {
  id: 'year',
  function: 'cost',
  frame: 'statement',
  intent: 'годовая сумма',
  narration: 'За год набегает 35 880 ₽ — этого хватит на хороший отпуск.',
  seconds: 6,
  theme: 'studio-lime',
  texts: [
    { text: '35 880 ₽', role: 'number' },
    { text: 'За год набегает', role: 'setup' },
    { text: 'этого хватит на хороший отпуск.', role: 'punchline' },
  ],
};

describe('statement frame', () => {
  it('puts each beat in its own zone: number top, setup middle, punchline bottom', () => {
    const { nodes, slots } = composeStatement(SCENE);

    expect(slots.map((slot) => slot.zone)).toEqual(['top', 'middle', 'bottom']);
    expect(nodes[0]).toMatchObject({ kind: 'box', y: ZONES.top.top });

    const texts = nodes.filter((node) => node.kind === 'text');

    expect(texts[0]).toMatchObject({ text: '35 880 ₽', token: 'display' });
    expect(Number(texts[0]?.y)).toBeGreaterThanOrEqual(ZONES.top.top);
    expect(Number(texts[1]?.y)).toBeGreaterThanOrEqual(ZONES.middle.top);
    expect(Number(texts[2]?.y)).toBeGreaterThanOrEqual(ZONES.bottom.top);
  });
});
