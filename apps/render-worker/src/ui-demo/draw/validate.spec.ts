import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET, validateDrawNodes } from './validate.js';
import type { DrawNode } from './schema.js';
import { contrast } from '../quality.js';
import { themeById } from '../themes.js';

const BOUNDS = { left: 72, top: 80, right: 1008, bottom: 1620 };
const THEME = themeById('studio-dark');

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
  it('keeps the author width and wraps instead of stretching the line', () => {
    const result = validateDrawNodes([text({ text: 'Кофейня на углу', w: 60 })], BOUNDS);

    expect(result.rejected).toBe(false);
    expect(Number((result.nodes[0] as { w: number }).w)).toBe(60);
  });

  it('drops the token for a word that cannot break', () => {
    const result = validateDrawNodes(
      [text({ text: 'Суперкалифраджилистик', w: 200, token: 'headline' })],
      BOUNDS,
    );

    expect(result.rejected).toBe(false);
    expect((result.nodes[0] as { token?: string }).token).not.toBe('headline');
  });

  it('keeps the author hex instead of snapping it to a tone', () => {
    const result = validateDrawNodes(
      [{ kind: 'box', x: 72, y: 80, w: 200, h: 100, fill: '#ff0000' }],
      BOUNDS,
      undefined,
      THEME,
    );

    expect((result.nodes[0] as { fill?: string }).fill).toBe('#ff0000');
  });

  it('resolves a role to the surface colour, not to its ink', () => {
    const result = validateDrawNodes(
      [{ kind: 'box', x: 72, y: 80, w: 200, h: 100, fill: 'surface' }],
      BOUNDS,
      undefined,
      THEME,
    );

    expect((result.nodes[0] as { fill?: string }).fill).toBe(THEME.surface);
  });

  it('replaces an unknown colour name with the default and records it', () => {
    const result = validateDrawNodes(
      [text({ text: 'видно', color: 'brandBlue' })],
      BOUNDS,
      undefined,
      THEME,
    );

    expect((result.nodes[0] as { color?: string }).color).toBe(THEME.ink);
    expect(result.fixes.some((fix) => fix.startsWith('palette:text'))).toBe(true);
  });

  it('shrinks an icon that does not fit its circle', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 100,
          y: 100,
          w: 300,
          h: 300,
          r: 150,
          children: [{ kind: 'icon', x: 0, y: 0, size: 400, emoji: '✈️' }],
        },
      ],
      BOUNDS,
    );
    const icon = (result.nodes[0] as { children?: { size: number }[] }).children?.[0];

    expect(icon?.size).toBeLessThanOrEqual(300 - 16);
  });

  it('raises an avatar above the surface it collides with', () => {
    const result = validateDrawNodes(
      [
        { kind: 'icon', x: 300, y: 300, size: 96, emoji: '👔' },
        { kind: 'box', x: 100, y: 100, w: 400, h: 400, fill: 'surface' },
      ],
      BOUNDS,
    );

    expect((result.nodes[1] as { kind: string }).kind).toBe('icon');
  });

  it('raises a text above the surface written after it', () => {
    const result = validateDrawNodes(
      [
        text({ text: 'какие закономерности', x: 200, y: 300, w: 400 }),
        { kind: 'box', x: 100, y: 280, w: 500, h: 160, fill: 'surface' },
      ],
      BOUNDS,
    );
    const kinds = result.nodes.map((node) => (node as { kind: string }).kind);

    expect(kinds).toEqual(['box', 'text']);
  });

  it('does not compare texts that live in different containers', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 72,
          y: 200,
          w: 400,
          h: 200,
          fill: 'surface',
          children: [text({ text: 'первое', x: 24, y: 24, w: 300 })],
        },
        {
          kind: 'box',
          x: 508,
          y: 200,
          w: 400,
          h: 200,
          fill: 'surface',
          children: [text({ text: 'второе', x: 24, y: 24, w: 300 })],
        },
      ],
      BOUNDS,
    );
    const first = (result.nodes[0] as unknown as { children: { y: number }[] }).children[0];
    const second = (result.nodes[1] as unknown as { children: { y: number }[] }).children[0];

    expect(first?.y).toBe(24);
    expect(second?.y).toBe(24);
    expect(result.rejected).toBe(false);
  });

  it('fixes a text that repeats the surface colour', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 100,
          y: 100,
          w: 400,
          h: 200,
          fill: '#FFFFFF',
          children: [text({ text: 'видно?', x: 24, y: 24, w: 300, color: '#FFFFFF' })],
        },
      ],
      BOUNDS,
      undefined,
      THEME,
    );
    const child = (result.nodes[0] as { children?: { color?: string }[] }).children?.[0];
    const ratio = contrast(child?.color ?? '', '#FFFFFF') ?? 0;

    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(result.fixes.some((fix) => fix.startsWith('contrast:'))).toBe(true);
  });

  it('judges contrast against a sibling surface painted under the text', () => {
    const result = validateDrawNodes(
      [
        { kind: 'box', x: 100, y: 100, w: 400, h: 200, fill: '#FFFFFF' },
        text({ text: 'на карточке', x: 140, y: 160, w: 300, color: THEME.ink }),
      ],
      BOUNDS,
      undefined,
      THEME,
    );
    const textNode = result.nodes[1] as { color?: string };
    const ratio = contrast(textNode.color ?? '', '#FFFFFF') ?? 0;

    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('counts and separates texts in a card that also holds a divider', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 72,
          y: 80,
          w: 400,
          h: 300,
          children: [
            text({ text: 'первая', x: 0, y: 0, w: 300 }),
            { kind: 'line', x1: 0, y1: 150, x2: 300, y2: 150, width: 2 },
            text({ text: 'вторая', x: 0, y: 50, w: 300 }),
          ],
        },
      ],
      BOUNDS,
    );
    const children = (result.nodes[0] as { children?: { y: number }[] }).children;

    expect(result.words).toBe(2);
    expect(Number(children?.[2]?.y)).toBeGreaterThan(50);
  });

  it('lifts a headline that straddles the top edge of a carrier', () => {
    const result = validateDrawNodes(
      [
        { kind: 'box', x: 72, y: 300, w: 500, h: 600, fill: '#111111' },
        text({ text: 'Заголовок', x: 72, y: 270, w: 400 }),
      ],
      BOUNDS,
    );
    const headline = result.nodes[1] as { y: number };

    expect(Number(headline?.y)).toBeLessThan(270);
    expect(result.fixes.some((fix) => fix.startsWith('lifted'))).toBe(true);
  });

  it('shrinks a text that cannot fit its card instead of growing the card', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 72,
          y: 80,
          w: 600,
          h: 300,
          children: [
            text({ text: 'Очень длинная строка заголовка', x: 20, y: 200, w: 560, token: 'display' }),
          ],
        },
      ],
      BOUNDS,
    );
    const child = (result.nodes[0] as { children?: { token?: string }[] }).children?.[0];

    expect(child?.token).not.toBe('display');
    expect(result.fixes.some((fix) => fix.startsWith('text-shrunk'))).toBe(true);
  });

  it('lifts a badge that grew onto the card content', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 100,
          y: 500,
          w: 800,
          h: 1000,
          children: [text({ text: 'Сделай отчёт', x: 40, y: 100, w: 600 })],
        },
        {
          kind: 'box',
          x: 120,
          y: 420,
          w: 600,
          h: 130,
          fill: '#E23A2E',
          children: [text({ text: 'Сэкономил 2 мин', x: 32, y: 36, w: 536, token: 'headline' })],
        },
      ],
      BOUNDS,
    );
    const badge = result.nodes[1] as { y: number; h: number };

    expect(Number(badge?.y)).toBeLessThan(420);
    expect(Number(badge?.y) + Number(badge?.h)).toBeLessThanOrEqual(500 - 12);
  });

  it('drops clip that would cut a child text', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 100,
          y: 100,
          w: 300,
          h: 200,
          clip: true,
          children: [text({ text: 'Строка', x: -20, y: 20, w: 100 })],
        },
      ],
      BOUNDS,
    );

    expect((result.nodes[0] as { clip?: boolean }).clip).toBe(false);
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

  it('pushes a large collision down instead of asking for another frame', () => {
    const result = validateDrawNodes(
      [
        text({ text: 'Первая строка', y: 200, w: 400, token: 'display' }),
        text({ text: 'Вторая строка', y: 260, w: 400 }),
      ],
      BOUNDS,
    );

    const [, second] = result.nodes as { y: number }[];

    expect(result.rejected).toBe(false);
    expect(Number(second?.y)).toBeGreaterThan(300);
    expect(result.fixes.some((fix) => fix.startsWith('text-pushed'))).toBe(true);
  });

  it('stacks two overlapping cards inside a carrier instead of one row', () => {
    const result = validateDrawNodes(
      [
        {
          kind: 'box',
          x: 72,
          y: 200,
          w: 500,
          h: 900,
          children: [
            { kind: 'box', x: 0, y: 0, w: 400, h: 300, fill: '#111111' },
            { kind: 'box', x: 20, y: 60, w: 400, h: 300, fill: '#222222' },
          ],
        },
      ],
      BOUNDS,
    );
    const children = (result.nodes[0] as { children?: { y: number }[] }).children;

    expect(result.rejected).toBe(false);
    expect(Number(children?.[1]?.y)).toBeGreaterThanOrEqual(316);
  });

  it('clamps a node that left the frame', () => {
    const result = validateDrawNodes([text({ text: 'Край', x: 40, y: 40 })], BOUNDS);

    expect((result.nodes[0] as { x: number }).x).toBe(72);
    expect((result.nodes[0] as { y: number }).y).toBe(80);
  });
});
