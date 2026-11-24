import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET, validateDrawNodes } from './validate.js';
import type { DrawNode } from './schema.js';

const BOUNDS = { left: 72, top: 80, right: 1008, bottom: 1620 };

function text(overrides: Partial<Extract<DrawNode, { kind: 'text' }>> & { text: string }): DrawNode {
  return {
    kind: 'text',
    x: 72,
    y: 200,
    w: 400,
    token: 'body',
    ...overrides,
  } as DrawNode;
}

describe('draw validator: budget', () => {
  it('rejects a frame with too many top-level nodes', () => {
    const nodes = Array.from({ length: FRAME_BUDGET.nodes + 1 }, (_, index) =>
      text({ text: `строка ${String(index)}`, y: 200 + index * 100 }),
    );
    const result = validateDrawNodes(nodes, BOUNDS, FRAME_BUDGET);

    expect(result.rejected).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('too-many-nodes');
  });

  it('rejects a frame with too many words', () => {
    const result = validateDrawNodes(
      [text({ text: 'раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать', w: 900 })],
      BOUNDS,
      FRAME_BUDGET,
    );

    expect(result.rejected).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('too-many-words');
  });

  it('accepts a short frame', () => {
    const result = validateDrawNodes([text({ text: '−70%', token: 'display' })], BOUNDS);

    expect(result.rejected).toBe(false);
    expect(result.words).toBe(1);
  });
});

describe('draw validator: objects', () => {
  it('widens a text box to its measured line when there is room', () => {
    const result = validateDrawNodes([text({ text: 'Кофейня на углу', w: 60 })], BOUNDS);

    expect(result.rejected).toBe(false);
    expect(Number((result.nodes[0] as { w: number }).w)).toBeGreaterThan(60);
  });

  it('drops the token when there is no room to grow', () => {
    const node = text({ text: 'Очень длинная строка без места', w: 200, token: 'headline' });
    const result = validateDrawNodes([node], { ...BOUNDS, right: 272 });

    expect(result.rejected).toBe(false);
    expect((result.nodes[0] as { token?: string }).token).not.toBe('headline');
  });

  it('nudges a small collision down', () => {
    const result = validateDrawNodes(
      [
        text({ text: 'Первая строка', y: 200, w: 400 }),
        text({ text: 'Вторая строка', y: 252, w: 400 }),
      ],
      BOUNDS,
    );

    const [, second] = result.nodes as { y: number }[];

    expect(result.rejected).toBe(false);
    expect(Number(second?.y)).toBeGreaterThan(252);
  });

  it('rejects a collision that needs a redesign', () => {
    const result = validateDrawNodes(
      [
        text({ text: 'Первая строка', y: 200, w: 400, token: 'display' }),
        text({ text: 'Вторая строка', y: 260, w: 400 }),
      ],
      BOUNDS,
    );

    expect(result.rejected).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('text-collision');
  });

  it('clamps a node that left the frame', () => {
    const result = validateDrawNodes([text({ text: 'Край', x: 40, y: 40 })], BOUNDS);

    expect((result.nodes[0] as { x: number }).x).toBe(72);
    expect((result.nodes[0] as { y: number }).y).toBe(80);
  });
});
