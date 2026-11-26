import type { LlmJsonClient, LlmJsonRequest, LlmJsonResponse } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { themeById } from '../themes.js';
import {
  bandIssues,
  flatFrame,
  generateScene,
  missingFragments,
  normalizeFragments,
  pickScreenLine,
  repeatedText,
  stripBackdrop,
  type DrawDepiction,
  type DrawScript,
} from './scene-pipeline.js';
import type { DrawNode } from './schema.js';

const SCRIPT: DrawScript = {
  idea: 'Мелкие списания съедают бюджет',
  onScreen: ['Деньги уходят'],
  situation: 'Человек проверяет баланс утром и не понимает, куда делись деньги.',
};

const DEPICTION: DrawDepiction = {
  carrier: {
    what: 'экран банка',
    parts: [
      { part: 'шапка', detail: 'название банка', text: 'Банк' },
      { part: 'сумма', detail: 'крупная цифра', text: 'Списано 299 ₽' },
      { part: 'кнопка', detail: 'отмена подписки', text: 'Отменить' },
    ],
  },
  elements: [
    { what: 'уведомление', text: 'Списано 299 ₽', emphasis: 'main' },
    { what: 'иконка', text: '🔔', emphasis: 'support' },
  ],
};

const NODES = {
  nodes: [
    {
      type: 'box',
      x: 72,
      y: 200,
      w: 800,
      h: 900,
      fill: '#111111',
      children: [
        {
          type: 'text',
          x: 24,
          y: 24,
          w: 740,
          text: 'Списано 299 ₽',
          token: 'body',
          color: '#FFFFFF',
        },
      ],
    },
    {
      type: 'text',
      x: 72,
      y: 1300,
      w: 818,
      text: 'Деньги уходят',
      token: 'headline',
      color: '#FFFFFF',
    },
  ],
};

function fakeClient(answers: readonly unknown[]): {
  client: LlmJsonClient;
  requests: LlmJsonRequest[];
} {
  const requests: LlmJsonRequest[] = [];

  return {
    requests,
    client: {
      async complete(request: LlmJsonRequest): Promise<LlmJsonResponse> {
        requests.push(request);
        const answer = answers[requests.length - 1];

        if (answer === undefined) {
          throw new Error('no answer for this call');
        }

        return {
          content: JSON.stringify(answer),
          usage: { promptTokens: 100, completionTokens: 50 },
          model: 'fake',
        };
      },
    },
  };
}

describe('three-call scene pipeline', () => {
  it('feeds each stage the result of the previous one', async () => {
    const { client, requests } = fakeClient([SCRIPT, DEPICTION, NODES]);
    const result = await generateScene({
      topic: 'подписки',
      theme: themeById('studio-dark'),
      seconds: 6,
      client,
      thinking: 'enabled',
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]?.user).toContain('подписки');
    expect(requests[1]?.user).toContain('куда делись деньги');
    expect(requests[2]?.user).toContain('Списано 299 ₽');
    expect(requests[2]?.user).toContain('Деньги уходят');
    expect(requests[2]?.thinking).toBe('enabled');

    expect(result.words).toBeGreaterThan(0);
    expect(result.nodes).toHaveLength(2);
    expect(result.tokens.prompt).toBe(300);
  });

  it('uses an arc beat instead of a free topic when a brief is given', async () => {
    const { client, requests } = fakeClient([SCRIPT, DEPICTION, NODES]);

    await generateScene({
      topic: 'подписки',
      brief: { intent: 'списания возвращаются каждый месяц', narration: 'Деньги уходят.' },
      theme: themeById('studio-dark'),
      seconds: 6,
      client,
      thinking: 'disabled',
    });

    expect(requests[0]?.user).toContain('Мысль сцены: списания возвращаются каждый месяц');
    expect(requests[0]?.user).toContain('1. Деньги уходят.');
  });
});

describe('scene pipeline helpers', () => {
  it('drops a childless full-frame backdrop', () => {
    const nodes: DrawNode[] = [
      { kind: 'box', x: 72, y: 80, w: 818, h: 1540, fill: '#111111' },
      { kind: 'text', x: 72, y: 100, w: 600, text: 'Слово', token: 'body' },
    ];
    const result = stripBackdrop(nodes);

    expect(result.nodes).toHaveLength(1);
    expect(result.fixes).toContain('backdrop-dropped');
  });

  it('calls a text-only frame flat', () => {
    const nodes: DrawNode[] = [
      { kind: 'text', x: 72, y: 100, w: 600, text: 'Раз', token: 'body' },
      { kind: 'text', x: 72, y: 200, w: 600, text: 'Два', token: 'body' },
    ];

    expect(flatFrame(nodes)).not.toBeNull();
    expect(flatFrame([{ kind: 'box', x: 72, y: 80, w: 200, h: 200 }])).toBeNull();
  });

  it('calls four identical rows a stuck loop', () => {
    const row = (y: number): DrawNode => ({
      kind: 'text',
      x: 72,
      y,
      w: 600,
      text: '−299 ₽ Подписка «Кино»',
      token: 'body',
    });

    expect(repeatedText([row(100), row(200), row(300), row(400), row(500)])).toBeNull();
    expect(
      repeatedText([row(100), row(200), row(300), row(400), row(500), row(600), row(700)]),
    ).not.toBeNull();
  });

  it('uses a finished clause of the line, not a chopped fragment', () => {
    const line = 'Сегодня деньги уходят незаметно.';
    const result = normalizeFragments(['деньги уходят'], [line]);

    expect(result.fragments).toEqual(['Сегодня деньги уходят незаметно.']);
    expect(result.fixes).toContain('line-clause:1');
  });

  it('requires the line in the reserved band and the carrier above it', () => {
    const line = 'Деньги уходят';
    const ok: DrawNode[] = [
      { kind: 'box', x: 72, y: 80, w: 818, h: 1000 },
      { kind: 'text', x: 72, y: 1240, w: 818, text: line, token: 'headline' },
    ];

    expect(bandIssues(ok, [line])).toEqual([]);
    expect(
      bandIssues(
        [
          { kind: 'box', x: 72, y: 80, w: 818, h: 1500 },
          { kind: 'text', x: 72, y: 1240, w: 818, text: line, token: 'headline' },
        ],
        [line],
      ).length,
    ).toBeGreaterThan(0);
    expect(
      bandIssues([{ kind: 'text', x: 72, y: 200, w: 818, text: line, token: 'body' }], [line]).length,
    ).toBeGreaterThan(0);
  });

  it('rejects a fragment that ends on a comma', () => {
    const line = 'Эти суммы конкурируют с тем, что вы даже не помните.';

    expect(pickScreenLine('Эти суммы конкурируют с тем,', line)).toBe(
      'Эти суммы конкурируют с тем, что вы даже не помните.',
    );
    expect(
      pickScreenLine('Дело не в сумме, а в том', 'Дело не в сумме, а в том, что ты не помнишь.'),
    ).toBe('Дело не в сумме, а в том, что ты не помнишь.');
  });

  it('keeps a complete sentence whole and cuts a broken line at a clause', () => {
    expect(
      pickScreenLine('', 'И сразу увидишь, как освобождаются деньги, которые раньше уходили в никуда.'),
    ).toBe('И сразу увидишь, как освобождаются деньги, которые раньше уходили в никуда.');
    expect(pickScreenLine('', 'Раздели все подписки на две группы: те,')).toBe(
      'Раздели все подписки на две группы',
    );
  });

  it('requires the fragments in paint order', () => {
    const nodes: DrawNode[] = [
      { kind: 'text', x: 72, y: 100, w: 600, text: 'Деньги уходят', token: 'body' },
      { kind: 'text', x: 72, y: 200, w: 600, text: 'Проверь подписки', token: 'body' },
    ];

    expect(missingFragments(nodes, ['Деньги уходят', 'Проверь подписки'])).toHaveLength(0);
    expect(missingFragments(nodes, ['Проверь подписки', 'Деньги уходят'])).toHaveLength(1);
    expect(missingFragments(nodes, ['Ничего нет'])).toHaveLength(1);
  });
});
