import { describe, expect, it } from 'vitest';
import { drawSceneNodesSchema } from './schema.js';

interface TextNode {
  kind: 'text';
  x: number;
  y: number;
  w: number;
  text: string;
  token?: string;
}

interface BoxNode {
  kind: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
  children?: unknown[];
}

function parse(nodes: readonly unknown[]): Record<string, unknown>[] {
  return drawSceneNodesSchema.parse(nodes) as unknown as Record<string, unknown>[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function text(overrides: Partial<TextNode> & Pick<TextNode, 'text' | 'x' | 'y' | 'w'>): TextNode {
  return { kind: 'text', token: 'body', ...overrides };
}

function box(overrides: Partial<BoxNode> & Pick<BoxNode, 'x' | 'y' | 'w' | 'h'>): BoxNode {
  return { kind: 'box', ...overrides };
}

describe('draw node salvage: widening', () => {
  it('widens a wrapping headline into the free space of its card', () => {
    const [card] = parse([
      box({
        x: 72,
        y: 80,
        w: 792,
        h: 300,
        children: [
          text({ text: 'Рейс SU-245', x: 40, y: 40, w: 400, token: 'headline' }),
          box({ x: 600, y: 60, w: 80, h: 80 }),
        ],
      }),
    ]);

    const children = asRecord(card)['children'] as Record<string, unknown>[];

    /* 11 glyphs of 72 px need 428 px; the icon starts at 600. */
    expect(Number(children[0]?.['w'])).toBe(560);
  });

  it('does not widen past a sibling that shares the row', () => {
    const [card] = parse([
      box({
        x: 0,
        y: 0,
        w: 800,
        h: 300,
        children: [
          text({ text: 'Очень длинная строка для проверки', x: 40, y: 40, w: 120, token: 'headline' }),
          box({ x: 240, y: 40, w: 80, h: 80 }),
        ],
      }),
    ]);

    const children = asRecord(card)['children'] as Record<string, unknown>[];

    /* The free room ends where the icon starts: 240 - 40. */
    expect(Number(children[0]?.['w'])).toBe(200);
  });

  it('keeps a single-line text untouched', () => {
    const [node] = parse([text({ text: '14:02', x: 40, y: 220, w: 856 })]) as [
      Record<string, unknown>,
    ];

    expect(node['w']).toBe(856);
  });
});

describe('draw node salvage: separation', () => {
  it('separates a wrapped headline from its caption at the second level', () => {
    const [card] = parse([
      box({
        x: 0,
        y: 0,
        w: 300,
        h: 600,
        children: [
          text({ text: 'Очень длинный заголовок строки', x: 20, y: 20, w: 260, token: 'headline' }),
          text({ text: 'Подпись', x: 20, y: 100, w: 260 }),
        ],
      }),
    ]);

    const children = asRecord(card)['children'] as Record<string, unknown>[];

    /* Five lines at 72 px end at 398; the caption may not start above that. */
    expect(Number(children[1]?.['y'])).toBeGreaterThanOrEqual(20 + 5 * 72 * 1.05 + 12 - 1);
  });

  it('pushes a text down when it still wraps', () => {
    const [card] = parse([
      box({
        x: 0,
        y: 0,
        w: 300,
        h: 600,
        children: [
          text({ text: 'Очень длинный заголовок строки', x: 20, y: 20, w: 260, token: 'headline' }),
          text({ text: 'Подпись', x: 20, y: 100, w: 260 }),
        ],
      }),
    ]);

    const children = asRecord(card)['children'] as Record<string, unknown>[];
    const headlineBottom = 20 + 5 * 72 * 1.05;

    expect(Number(children[1]?.['y'])).toBeGreaterThanOrEqual(headlineBottom + 12 - 1);
  });

  it('keeps a receipt row on one line: the price is not pushed down', () => {
    const parsed = parse([
      text({ text: 'Капучино', x: 60, y: 240, w: 480 }),
      text({ text: '280 ₽', x: 520, y: 240, w: 220 }),
    ]);

    const [name, price] = parsed.map(asRecord);

    expect(Number(name?.['w'])).toBe(460);
    expect(Number(price?.['y'])).toBe(240);
  });

  it('aligns a price with its label on one line', () => {
    const parsed = parse([
      text({ text: 'ИТОГО', x: 60, y: 810, w: 340, token: 'headline' }),
      text({ text: '1330 ₽', x: 400, y: 800, w: 340, token: 'headline' }),
    ]);

    expect(Number(asRecord(parsed[0])['y'])).toBe(800);
    expect(Number(asRecord(parsed[1])['y'])).toBe(800);
  });

  it('pushes a text that covers the previous one in the same column', () => {
    const parsed = parse([
      text({ text: 'Одинаковый состав', x: 48, y: 480, w: 400, token: 'headline' }),
      text({ text: 'та же цена', x: 48, y: 500, w: 400 }),
    ]);

    expect(Number(asRecord(parsed[1])['y'])).toBeGreaterThan(480);
  });
});

describe('draw node salvage: safe area', () => {
  it('lifts a thesis that would sit under the caption rail', () => {
    const parsed = parse([
      text({ text: 'Итог растёт, строки остаются', x: 72, y: 1640, w: 936, token: 'headline' }),
    ]);

    const node = asRecord(parsed[0]);
    const height = Number(node['h'] ?? 2 * 72 * 1.05);

    expect(Number(node['y']) + height).toBeLessThanOrEqual(1620);
  });

  it('moves a dashed divider off the row above it', () => {
    const parsed = parse([
      text({ text: 'Масло — 150 ₽', x: 48, y: 370, w: 856 }),
      { kind: 'line', x1: 48, x2: 904, y1: 380, y2: 380 },
    ]);

    const line = asRecord(parsed[1]);
    const rowBottom = 370 + 44 * 1.3;

    expect(Number(line['y1'])).toBeGreaterThanOrEqual(rowBottom + 10 - 1);
  });
});

describe('draw node salvage: duplicates', () => {
  it('drops the headline repeated as a footer', () => {
    const parsed = parse([
      text({ text: 'Рост без движения', x: 72, y: 140, w: 864, token: 'headline' }),
      text({ text: 'баллы копятся', x: 72, y: 240, w: 864 }),
      text({ text: 'Рост без движения', x: 72, y: 1290, w: 864, token: 'headline' }),
    ]);

    expect(parsed).toHaveLength(2);
  });

  it('keeps a repeated receipt row: the same body line may happen twice', () => {
    const parsed = parse([
      text({ text: 'Кофе — 250 ₽', x: 48, y: 220, w: 856 }),
      text({ text: 'Кофе — 250 ₽', x: 48, y: 900, w: 856 }),
    ]);

    expect(parsed).toHaveLength(2);
  });

  it('drops a cut footer of the same sentence', () => {
    const parsed = parse([
      text({ text: 'баллы копятся, но не тратятся', x: 72, y: 240, w: 864 }),
      text({ text: 'копятся, но не тратятся', x: 72, y: 1400, w: 864 }),
    ]);

    expect(parsed).toHaveLength(1);
  });
});

describe('draw node salvage: containers', () => {
  it('grows a box that is too short for its children', () => {
    const [card] = parse([
      box({
        x: 72,
        y: 200,
        w: 792,
        h: 300,
        children: [
          text({ text: 'Рейс SU-245', x: 40, y: 40, w: 400, token: 'headline' }),
          text({ text: 'Москва → Сочи', x: 40, y: 120, w: 400 }),
          text({ text: 'Задержка:', x: 40, y: 200, w: 400 }),
          text({ text: '+15 мин', x: 40, y: 240, w: 400, token: 'headline' }),
        ],
      }),
    ]);

    /* Four rows end at ~350 px, the author wrote 300. */
    expect(Number(asRecord(card)['h'])).toBeGreaterThanOrEqual(340);
  });

  it('pushes a card down when its neighbour above has grown', () => {
    const parsed = parse([
      box({
        x: 72,
        y: 200,
        w: 792,
        h: 300,
        children: [text({ text: '+15 мин', x: 40, y: 350, w: 400, token: 'headline' })],
      }),
      box({ x: 72, y: 540, w: 792, h: 300 }),
    ]);

    expect(Number(asRecord(parsed[1])['y'])).toBeGreaterThan(540);
  });
});

describe('draw node salvage: idempotence', () => {
  it('repairing twice gives the same nodes', () => {
    const once = parse([
      box({
        x: 72,
        y: 80,
        w: 792,
        h: 300,
        children: [
          text({ text: 'Рейс SU-245', x: 40, y: 40, w: 400, token: 'headline' }),
          text({ text: 'Москва → Сочи', x: 40, y: 120, w: 400 }),
        ],
      }),
    ]);
    const twice = parse(once);

    expect(twice).toEqual(once);
  });
});
