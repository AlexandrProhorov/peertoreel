import {
  STORYBOARD_RECIPES,
  InvalidRecipeSlotError,
  UnknownRecipeVariantError,
  UnknownSceneRecipeError,
  type RecipeSceneImplementation,
  type StoryboardRecipeId,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { resolveRecipeScene } from './recipes.js';

function slotsFor(recipeId: StoryboardRecipeId): Record<string, unknown> {
  switch (recipeId) {
    case 'hook-hero':
      return { title: 'ПОЧЕМУ НЕБО СИНЕЕ?' };
    case 'fact-object':
      return { fact: 'ФАКТ', subject: { assetKey: 'dog-snout' } };
    case 'comparison':
      return {
        left: { label: 'A', value: '100%', fraction: 1 },
        right: { label: 'B', value: '35%', fraction: 0.35 },
      };
    case 'process':
      return {
        steps: [{ label: 'ОДИН' }, { label: 'ДВА', detail: 'деталь' }],
      };
    case 'cta':
      return { action: 'ПОДПИШИСЬ' };
  }
}

function implementation(
  recipeId: StoryboardRecipeId,
  variant: string,
  slots: Record<string, unknown> = slotsFor(recipeId),
): RecipeSceneImplementation {
  return {
    type: 'recipe',
    recipeId,
    variant,
    slots: slots as RecipeSceneImplementation['slots'],
  };
}

describe('recipe resolution', () => {
  it('resolves every catalog variant into an implemented background and layers', () => {
    for (const recipe of STORYBOARD_RECIPES) {
      for (const variant of recipe.variants) {
        const resolved = resolveRecipeScene(
          implementation(recipe.id, variant.id),
        );

        expect(['parallax-city', 'kinetic-typography']).toContain(
          resolved.componentId,
        );
        expect(resolved.recipe.id).toBe(recipe.id);
        expect(resolved.recipe.variant).toBe(variant.id);
        expect(resolved.recipe.layers.length).toBeGreaterThan(0);
        expect(resolved.slotDiagnostics).toEqual([]);
      }
    }
  });

  it('is deterministic for the same recipe, variant and slots', () => {
    const first = resolveRecipeScene(
      implementation('fact-object', 'stage'),
    );
    const second = resolveRecipeScene(
      implementation('fact-object', 'stage'),
    );

    expect(second).toEqual(first);
  });

  it('binds text and subject slots into layer content', () => {
    const resolved = resolveRecipeScene(
      implementation('fact-object', 'stage', {
        subject: { assetKey: 'brick-wall' },
        fact: 'КИРПИЧ ДЕРЖИТ ТЕПЛО',
        metric: '×3',
      }),
    );

    expect(resolved.recipe.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'subject',
          content: 'assets/starter/brick-wall.svg',
        }),
        expect.objectContaining({
          kind: 'pill',
          content: 'КИРПИЧ ДЕРЖИТ ТЕПЛО',
        }),
        expect.objectContaining({ kind: 'text', content: '×3' }),
      ]),
    );
  });

  it('drops layers whose optional slot is absent', () => {
    const resolved = resolveRecipeScene(
      implementation('hook-hero', 'subject-lead', { title: 'ВОПРОС' }),
    );

    expect(
      resolved.recipe.layers.map((layer) => layer.id),
    ).toEqual(['headline']);
  });

  it('expands comparison metrics and process steps into chart items', () => {
    const comparison = resolveRecipeScene(
      implementation('comparison', 'bars', {
        left: { label: 'МОКРЫЙ', value: '100%', fraction: 1 },
        right: { label: 'СУХОЙ', value: '35%', fraction: 0.35 },
      }),
    );
    const process = resolveRecipeScene(
      implementation('process', 'timeline', {
        steps: [
          { label: 'ОДИН', detail: 'первый' },
          { label: 'ДВА' },
        ],
      }),
    );
    const bars = comparison.recipe.layers.find(
      (layer) => layer.kind === 'chart',
    );
    const steps = process.recipe.layers.find(
      (layer) => layer.kind === 'chart',
    );

    expect(bars?.chart).toBe('comparison-bars');
    expect(bars?.items).toEqual([
      { label: 'МОКРЫЙ', value: '100%', detail: null, fraction: 1 },
      { label: 'СУХОЙ', value: '35%', detail: null, fraction: 0.35 },
    ]);
    expect(steps?.chart).toBe('process-steps');
    expect(steps?.items).toEqual([
      { label: 'ОДИН', value: null, detail: 'первый', fraction: null },
      { label: 'ДВА', value: null, detail: null, fraction: null },
    ]);
  });

  it('produces different plans for different variants and recipes', () => {
    const hookA = resolveRecipeScene(
      implementation('hook-hero', 'subject-lead'),
    );
    const hookB = resolveRecipeScene(
      implementation('hook-hero', 'ghost-question'),
    );
    const cta = resolveRecipeScene(implementation('cta', 'pill-button'));

    expect(hookA.componentId).not.toBe(hookB.componentId);
    expect(hookA.recipe.layers).not.toEqual(hookB.recipe.layers);
    expect(cta.recipe.layers).not.toEqual(hookA.recipe.layers);
  });

  it('throws typed errors for unknown recipes, variants and required slots', () => {
    expect(() =>
      resolveRecipeScene({
        type: 'recipe',
        recipeId: 'nope' as StoryboardRecipeId,
        variant: 'stage',
        slots: {},
      }),
    ).toThrow(UnknownSceneRecipeError);
    expect(() => resolveRecipeScene(implementation('cta', 'nope'))).toThrow(
      UnknownRecipeVariantError,
    );
    expect(() =>
      resolveRecipeScene(implementation('fact-object', 'stage', { fact: 'X' })),
    ).toThrow(InvalidRecipeSlotError);
  });

  it('never substitutes a generic background for an unknown asset key', () => {
    expect(() =>
      resolveRecipeScene(
        implementation('fact-object', 'stage', {
          fact: 'X',
          subject: { assetKey: 'unicorn' },
        }),
      ),
    ).toThrow(InvalidRecipeSlotError);
  });
});
