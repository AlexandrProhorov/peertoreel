import { describe, expect, it } from 'vitest';
import { layoutPlan } from './layout.js';
import { drawPlanSchema, type DrawPlan } from './plan.js';
import { drawSceneNodesSchema } from './schema.js';
import { measureText } from './text-metrics.js';

function plan(input: unknown): DrawPlan {
  return drawPlanSchema.parse(input);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function childrenOf(node: Record<string, unknown>): Record<string, unknown>[] {
  return (node['children'] as Record<string, unknown>[] | undefined) ?? [];
}

function findNode(
  nodes: readonly unknown[],
  predicate: (node: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  for (const value of nodes) {
    const node = asRecord(value);

    if (predicate(node)) {
      return node;
    }

    const found = findNode(childrenOf(node), predicate);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

const receipt = {
  composition: 'stack',
  surface: 'card',
  density: 'normal',
  blocks: [
    { role: 'header', title: 'ЧЕК', subtitle: 'Кофейня на углу' },
    {
      role: 'rows',
      items: [
        { left: 'Капучино', right: '280 ₽' },
        { left: 'Круассан', right: '190 ₽' },
        { left: 'Латте', right: '320 ₽' },
      ],
      motion: { transition: 'print', at: 0.1 },
    },
    { role: 'divider' },
    { role: 'total', label: 'ИТОГО', value: '790 ₽', motion: { transition: 'tick', at: 1.2 } },
    { role: 'footer', text: 'Спасибо за покупку' },
  ],
};

describe('draw layout: receipt', () => {
  it('wraps the plan into one card that stays inside the safe area', () => {
    const nodes = layoutPlan(plan(receipt));
    const card = asRecord(nodes[0]);

    expect(nodes).toHaveLength(1);
    expect(card['kind']).toBe('box');
    expect(Number(card['x'])).toBe(72);
    expect(Number(card['y'])).toBe(80);
    expect(Number(card['x']) + Number(card['w'])).toBeLessThanOrEqual(1008);
    expect(Number(card['y']) + Number(card['h'])).toBeLessThanOrEqual(1620);
  });

  it('prints the rows and ticks the total', () => {
    const nodes = layoutPlan(plan(receipt));
    const rows = findNode(nodes, (node) => node['transition'] === 'print');
    const total = findNode(nodes, (node) => node['text'] === '790 ₽');

    expect(rows).toBeDefined();
    expect(total?.['transition']).toBe('tick');
    expect(total?.['at']).toBe(1.2);
  });

  it('keeps every pair of a row on one line', () => {
    const nodes = layoutPlan(plan(receipt));
    const left = findNode(nodes, (node) => node['text'] === 'Капучино');
    const right = findNode(nodes, (node) => node['text'] === '280 ₽');

    expect(left?.['y']).toBe(right?.['y']);
    expect(Number(left?.['x']) + Number(left?.['w'])).toBeLessThanOrEqual(Number(right?.['x']));
  });

  it('gives the label enough width, or drops it a step of the scale', () => {
    const nodes = layoutPlan(plan({ blocks: [{ role: 'total', label: 'ИТОГО', value: '1 330 ₽' }] }));
    const label = findNode(nodes, (node) => node['text'] === 'ИТОГО');
    const width = Number(label?.['w']);
    const token = String(label?.['token']);
    const size = token === 'headline' ? 72 : token === 'card' ? 56 : token === 'body' ? 44 : 38;

    expect(measureText('ИТОГО', size, 1)).toBeLessThanOrEqual(width);
  });
});

describe('draw layout: determinism and variety', () => {
  it('the same plan gives the same nodes', () => {
    expect(layoutPlan(plan(receipt))).toEqual(layoutPlan(plan(receipt)));
  });

  it('a different density gives different geometry', () => {
    expect(layoutPlan(plan({ ...receipt, density: 'airy' }))).not.toEqual(layoutPlan(plan(receipt)));
  });

  it('rows may be drawn inline without columns', () => {
    const inline = layoutPlan(
      plan({ blocks: [{ role: 'rows', style: 'inline', items: [{ left: 'Хлеб', right: '120 ₽' }] }] }),
    );

    expect(findNode(inline, (node) => node['text'] === 'Хлеб — 120 ₽')).toBeDefined();
  });

  it('a counter ticks its value and shows the label under it', () => {
    const nodes = layoutPlan(plan({ blocks: [{ role: 'counter', value: '1330', label: 'баллов' }] }));
    const value = findNode(nodes, (node) => node['text'] === '1330');
    const label = findNode(nodes, (node) => node['text'] === 'баллов');

    expect(value?.['transition']).toBe('tick');
    expect(Number(label?.['y'])).toBeGreaterThan(Number(value?.['y']));
  });
});

describe('draw layout: panels and visual roles', () => {
  it('sets two panels side by side with equal width', () => {
    const nodes = layoutPlan(
      plan({
        composition: 'panels',
        panels: [
          { blocks: [{ role: 'header', title: 'Март' }, { role: 'total', label: 'Итого', value: '240 ₽' }] },
          { blocks: [{ role: 'header', title: 'Май' }, { role: 'total', label: 'Итого', value: '340 ₽' }] },
        ],
      }),
    );

    expect(nodes).toHaveLength(2);

    const [left, right] = nodes.map(asRecord);

    expect(Number(left?.['w'])).toBe(Number(right?.['w']));
    expect(Number(left?.['x']) + Number(left?.['w'])).toBeLessThan(Number(right?.['x']));
    expect(Number(right?.['x']) + Number(right?.['w'])).toBeLessThanOrEqual(1008);
  });

  it('draws icons as their own block', () => {
    const nodes = layoutPlan(
      plan({ surface: 'none', blocks: [{ role: 'icons', items: ['🔔', '⏱'], size: 'large' }] }),
    );
    const icons = nodes.filter((node) => asRecord(node)['kind'] === 'icon');

    expect(icons).toHaveLength(2);
    expect(Number(asRecord(icons[0])['size'])).toBe(112);
  });

  it('fills a bar by its value', () => {
    const nodes = layoutPlan(
      plan({ surface: 'none', blocks: [{ role: 'figure', shape: 'bar', value: 0.5 }] }),
    );
    const [track, fill] = nodes.map(asRecord);
    const trackWidth = Number(track?.['w']);

    expect(Number(fill?.['w'])).toBe(Math.round(trackWidth * 0.5));
  });

  it('wraps a badge into a pill with readable text', () => {
    const nodes = layoutPlan(plan({ surface: 'none', blocks: [{ role: 'badge', text: '−70%' }] }));
    const badge = asRecord(nodes[0]);
    const text = asRecord((badge['children'] as unknown[])[0]);

    expect(badge['kind']).toBe('box');
    expect(Number(badge['r'])).toBeGreaterThan(0);
    expect(Number(text['x'])).toBeGreaterThan(0);
    expect(Number(text['w'])).toBeLessThan(Number(badge['w']));
  });

  it('a panel without a card draws straight on the background', () => {
    const nodes = layoutPlan(
      plan({
        composition: 'panels',
        panels: [
          { surface: 'none', blocks: [{ role: 'counter', value: '47', label: 'уведомлений' }] },
          { surface: 'none', blocks: [{ role: 'counter', value: '6', label: 'минут' }] },
        ],
      }),
    );

    expect(
      nodes.every((node) => {
        const record = asRecord(node);
        return record['kind'] !== 'box' || record['fill'] === undefined;
      }),
    ).toBe(true);
  });
});

describe('draw layout: output is a valid node tree', () => {
  it('passes the draw schema without losing nodes', () => {
    const nodes = layoutPlan(plan(receipt));
    const parsed = drawSceneNodesSchema.parse(nodes);

    expect(parsed).toHaveLength(nodes.length);
    expect(findNode(parsed, (node) => node['transition'] === 'print')).toBeDefined();
  });
});
