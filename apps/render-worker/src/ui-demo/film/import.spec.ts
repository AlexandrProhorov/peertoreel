import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { uiEpisodeSchema } from '../spec.js';
import { importForeignEpisode } from './import.js';

/**
 * The fixtures are the comparison run of 2026-11-19: the same topic answered by
 * three models. The old adapter lived in `out/`, so "4 of 4 scenes" could not be
 * checked anywhere but the author's machine; these tests make the claim
 * reproducible. The JSON is the raw answer — no hand edits.
 */

const here = dirname(fileURLToPath(import.meta.url));
const foreign = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(here, '../../../fixtures/foreign', name), 'utf8'));

const models = [
  'gpt-subscriptions.json',
  'claude-subscriptions.json',
  'deepseek-subscriptions.json',
] as const;

describe('foreign model import', () => {
  for (const model of models) {
    it(`${model}: keeps every scene`, () => {
      const result = importForeignEpisode(foreign(model));

      expect(result.statuses).toHaveLength(4);
      expect(result.lost).toBe(0);
      expect(result.episode).not.toBeNull();
      expect(uiEpisodeSchema.safeParse(result.episode).success).toBe(true);
    });
  }

  it('reports what it salvaged instead of hiding the repair', () => {
    const gpt = importForeignEpisode(foreign('gpt-subscriptions.json'));
    const claude = importForeignEpisode(foreign('claude-subscriptions.json'));
    const deepseek = importForeignEpisode(foreign('deepseek-subscriptions.json'));

    expect(gpt.repairs.map((repair) => repair.path)).toContain('card.border');
    expect(claude.repairs.map((repair) => repair.path)).toContain('thumb.grab');
    expect(deepseek.repairs.map((repair) => repair.path)).toContain('card.shadow');
  });

  it('keeps every scene duration from the model, not a default', () => {
    const result = importForeignEpisode(foreign('claude-subscriptions.json'));
    const durations = result.episode?.scenes.map((scene) => scene.durationSec) ?? [];

    /* The scene never gets shorter than the action it contains; the first one
       gains 0.1s from its typed title and its steps. */
    expect(durations).toEqual([5.1, 7, 8, 7]);
  });

  it('rejects a scene the contract cannot repair', () => {
    const result = importForeignEpisode({
      thesis: 'x',
      scenes: [
        {
          id: 'broken',
          seconds: 5,
          theme: 'studio-dark',
          spec: {
            elements: [
              {
                id: 'x',
                primitive: 'hologram',
                layout: { x: 72, y: 600, width: 480, height: 240 },
                params: {},
              },
            ],
            sequence: [],
          },
        },
      ],
    });

    expect(result.lost).toBe(1);
    expect(result.statuses[0]?.reasons.join(' ')).toContain('hologram');
    expect(result.episode).toBeNull();
  });

  it('rejects a surface painted the colour of its stage', () => {
    const result = importForeignEpisode({
      scenes: [
        {
          id: 'invisible',
          seconds: 5,
          theme: 'studio-lime',
          spec: {
            elements: [
              {
                id: 'bg',
                primitive: 'stage',
                layout: { x: 0, y: 0, width: 1080, height: 1920 },
                params: { background: '#FFFFFF' },
              },
              {
                id: 'card',
                primitive: 'card',
                layout: { x: 72, y: 600, width: 480, height: 320 },
                params: { background: '#FFFFFF' },
              },
              {
                id: 'title',
                primitive: 'label',
                layout: { x: 72, y: 200, width: 480, height: 160 },
                params: { text: 'заголовок', token: 'headline', tone: 'ink' },
              },
            ],
            sequence: [
              { element: 'bg', transition: 'appear' },
              { element: 'card', transition: 'appear' },
              { element: 'title', transition: 'appear' },
            ],
          },
        },
      ],
    });

    expect(result.lost).toBe(1);
    expect(result.statuses[0]?.reasons.join(' ')).toContain('surface-visible');
  });
});
