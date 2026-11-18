import { describe, expect, it } from 'vitest';
import type { CompositionSpec } from './composition.js';
import { lintQuality } from './quality.js';
import { UI_THEMES, type UiThemeId } from './themes.js';

/**
 * The palette must satisfy the gate the gate applies to it.
 *
 * `body`/`muted` on the light theme used to be 3.43:1, so every second scene in
 * that theme was rejected — a colour bug that looked like a model bug.
 */

function sceneFor(themeId: UiThemeId, tone: string): CompositionSpec {
  return {
    kind: 'composition' as const,
    elements: [
      {
        id: 'stage',
        primitive: 'stage',
        layout: { x: 0, y: 0, width: 1080, height: 1920 },
        params: { background: UI_THEMES[themeId].background },
        states: [],
        transitions: [],
        operations: [],
        links: [],
      },
      {
        id: 'title',
        primitive: 'label',
        layout: { x: 72, y: 300, width: 800, height: 120 },
        params: { text: 'Заголовок', token: 'headline', tone, weight: 700 },
        states: [],
        transitions: [],
        operations: [],
        links: [],
      },
      {
        id: 'body',
        primitive: 'label',
        layout: { x: 72, y: 1200, width: 800, height: 120 },
        params: { text: 'Пояснение', token: 'body', tone, weight: 400 },
        states: [],
        transitions: [],
        operations: [],
        links: [],
      },
    ],
    sequence: [],
  };
}

describe('theme palette satisfies the contrast gate', () => {
  for (const themeId of Object.keys(UI_THEMES) as UiThemeId[]) {
    for (const tone of ['ink', 'muted']) {
      it(`${themeId}: ${tone} clears the thresholds`, () => {
        const issues = lintQuality(sceneFor(themeId, tone), themeId);

        expect(issues.filter((issue) => issue.code === 'text-contrast')).toEqual([]);
      });
    }
  }
});
