import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_COMPONENT_IDS,
  storyboardSchema,
  type Storyboard,
} from './storyboard.js';
import { storyboardFixture15Deg } from './storyboard.fixture.js';
import {
  RECIPE_LAYER_KINDS,
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  STORYBOARD_RECIPE_IDS,
  STORYBOARD_RECIPES,
  InvalidRecipeSlotError,
  UnknownRecipeVariantError,
  UnknownSceneRecipeError,
  getRecipeVariant,
  getStoryboardRecipe,
  parseRecipeSlots,
  type RecipeVariant,
} from './storyboard.recipes.js';

function fixture(): Storyboard {
  return structuredClone(storyboardFixture15Deg);
}

function recipeStoryboard(): Storyboard {
  const board = fixture();
  const hook = board.scenes[0]!;

  hook.objects = [];
  hook.implementation = {
    type: 'recipe',
    recipeId: 'hook-hero',
    variant: 'subject-lead',
    slots: {
      title: 'ПОЧЕМУ НЕБО СИНЕЕ?',
      kicker: 'НАУКА',
      subject: { assetKey: 'water-drop' },
    },
  };

  return board;
}

function issuePaths(board: Storyboard): string[] {
  const result = storyboardSchema.safeParse(board);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => issue.path.map(String).join('.'));
}

describe('recipe catalog', () => {
  it('declares exactly the five M3.4 recipes', () => {
    expect(STORYBOARD_RECIPES.map((recipe) => recipe.id)).toEqual([
      ...STORYBOARD_RECIPE_IDS,
    ]);
  });

  it('gives every recipe two or three variants with unique ids', () => {
    for (const recipe of STORYBOARD_RECIPES) {
      expect(recipe.variants.length).toBeGreaterThanOrEqual(2);
      expect(recipe.variants.length).toBeLessThanOrEqual(3);

      const variantIds = recipe.variants.map((variant) => variant.id);
      expect(new Set(variantIds).size).toBe(variantIds.length);
    }
  });

  it('keeps required/optional slot lists in sync with the specs', () => {
    for (const recipe of STORYBOARD_RECIPES) {
      const required = recipe.slotSpecs
        .filter((spec) => spec.required)
        .map((spec) => spec.name);
      const optional = recipe.slotSpecs
        .filter((spec) => !spec.required)
        .map((spec) => spec.name);

      expect([...recipe.requiredSlots].sort()).toEqual(required.sort());
      expect([...recipe.optionalSlots].sort()).toEqual(optional.sort());

      const names = recipe.slotSpecs.map((spec) => spec.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('keeps variants renderable: implemented background, bound layers, valid windows', () => {
    for (const recipe of STORYBOARD_RECIPES) {
      for (const variant of recipe.variants) {
        expect(STORYBOARD_COMPONENT_IDS).toContain(
          variant.background.componentId,
        );
        expect(variant.layers.length).toBeGreaterThan(0);

        const layerIds = variant.layers.map((layer) => layer.id);
        expect(new Set(layerIds).size).toBe(layerIds.length);

        for (const layer of variant.layers) {
          expect(RECIPE_LAYER_KINDS).toContain(layer.kind);
          expect(recipe.allowedLayers).toContain(layer.kind);
          expect(layer.from).toBeGreaterThanOrEqual(0);
          expect(layer.from).toBeLessThan(layer.to);
          expect(layer.to).toBeLessThanOrEqual(1);

          if (['text', 'pill', 'hud-chip', 'subject', 'image'].includes(layer.kind)) {
            expect(layer.slot).not.toBeNull();
          }

          if (layer.kind === 'chart') {
            expect(layer.chart).not.toBeNull();
            expect(Object.keys(layer.chartSlots).length).toBeGreaterThan(0);
          }

          if (
            ['particles', 'light', 'overlay', 'character'].includes(layer.kind)
          ) {
            expect(layer.content).not.toBeNull();
          }
        }
      }
    }
  });

  it('contains no topic-specific Russian strings', () => {
    expect(JSON.stringify(STORYBOARD_RECIPES)).not.toMatch(/[\u0400-\u04FF]/);
  });

  it('maps every starter key to a text-free-package path', () => {
    expect(Object.keys(STARTER_ASSET_CATALOG).sort()).toEqual(
      [...STARTER_ASSET_KEYS].sort(),
    );

    for (const key of STARTER_ASSET_KEYS) {
      const entry = STARTER_ASSET_CATALOG[key];

      expect(entry.path).toBe(`assets/starter/${key}.svg`);
      expect(entry.license).toBe('authored');
      expect(entry.tags.length).toBeGreaterThan(0);
    }
  });

  it('looks up recipes and variants deterministically', () => {
    expect(getStoryboardRecipe('cta')?.id).toBe('cta');
    expect(getStoryboardRecipe('nope')).toBeNull();
    expect(getRecipeVariant('cta', 'pill-button')?.id).toBe('pill-button');
    expect(getRecipeVariant('cta', 'nope')).toBeNull();
  });
});

describe('recipe slot parsing', () => {
  const hookSlots = {
    title: 'ПОЧЕМУ НЕБО СИНЕЕ?',
    kicker: 'НАУКА',
  };

  it('fills absent optional slots with defaults and no diagnostics', () => {
    const parsed = parseRecipeSlots('hook-hero', 'subject-lead', hookSlots);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.slots).toEqual({
      title: 'ПОЧЕМУ НЕБО СИНЕЕ?',
      kicker: 'НАУКА',
      highlight: null,
      subject: null,
    });
  });

  it('throws a typed error for a missing required slot', () => {
    expect(() => parseRecipeSlots('hook-hero', 'subject-lead', {})).toThrow(
      InvalidRecipeSlotError,
    );

    try {
      parseRecipeSlots('hook-hero', 'subject-lead', {});
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRecipeSlotError);
      expect((error as InvalidRecipeSlotError).reason).toBe('missing_required');
      expect((error as InvalidRecipeSlotError).path).toBe('title');
    }
  });

  it('throws typed errors for unknown recipes and variants', () => {
    expect(() => parseRecipeSlots('nope', 'subject-lead', {})).toThrow(
      UnknownSceneRecipeError,
    );
    expect(() => parseRecipeSlots('hook-hero', 'nope', hookSlots)).toThrow(
      UnknownRecipeVariantError,
    );
  });

  it('defaults an invalid optional slot and records invalid_value', () => {
    const parsed = parseRecipeSlots('hook-hero', 'subject-lead', {
      ...hookSlots,
      kicker: 42,
    });

    expect(parsed.slots.kicker).toBeNull();
    expect(parsed.diagnostics).toEqual([
      { path: 'kicker', reason: 'invalid_value', received: 42 },
    ]);
  });

  it('drops an unknown slot key with unknown_key', () => {
    const parsed = parseRecipeSlots('hook-hero', 'subject-lead', {
      ...hookSlots,
      somethingElse: 'x',
    });

    expect(parsed.diagnostics).toEqual([
      { path: 'somethingElse', reason: 'unknown_key', received: 'x' },
    ]);
    expect(parsed.slots).not.toHaveProperty('somethingElse');
  });

  it('rejects an unknown starter key in a required subject slot', () => {
    expect(() =>
      parseRecipeSlots('fact-object', 'stage', {
        subject: { assetKey: 'unicorn' },
        fact: 'ФАКТ',
      }),
    ).toThrow(InvalidRecipeSlotError);
  });

  it('rejects an unknown starter key even in an optional subject slot', () => {
    expect(() =>
      parseRecipeSlots('hook-hero', 'subject-lead', {
        ...hookSlots,
        subject: { assetKey: 'unicorn' },
      }),
    ).toThrow(InvalidRecipeSlotError);

    try {
      parseRecipeSlots('hook-hero', 'subject-lead', {
        ...hookSlots,
        subject: { assetKey: 'unicorn' },
      });
    } catch (error) {
      expect((error as InvalidRecipeSlotError).path).toBe('subject.assetKey');
      expect((error as InvalidRecipeSlotError).received).toEqual({
        assetKey: 'unicorn',
      });
    }
  });

  it('defaults an optional subject of the wrong shape and records invalid_value', () => {
    const parsed = parseRecipeSlots('hook-hero', 'subject-lead', {
      ...hookSlots,
      subject: 'dog-snout',
    });

    expect(parsed.slots.subject).toBeNull();
    expect(parsed.diagnostics).toEqual([
      { path: 'subject', reason: 'invalid_value', received: 'dog-snout' },
    ]);
  });

  it('parses metric and steps slots for comparison and process', () => {
    const comparison = parseRecipeSlots('comparison', 'bars', {
      left: { label: 'A', value: '100%', fraction: 1 },
      right: { label: 'B', value: '35%', fraction: 0.35 },
    });
    const process = parseRecipeSlots('process', 'timeline', {
      steps: [
        { label: 'ОДИН', detail: 'первый' },
        { label: 'ДВА' },
      ],
    });

    expect(comparison.slots.left).toEqual({
      label: 'A',
      value: '100%',
      fraction: 1,
    });
    expect(process.slots.steps).toEqual([
      { label: 'ОДИН', detail: 'первый' },
      { label: 'ДВА', detail: null },
    ]);
  });
});

describe('recipe scene validation', () => {
  it('accepts a valid recipe scene', () => {
    expect(issuePaths(recipeStoryboard())).toEqual([]);
  });

  it('rejects unknown variants with a path to the variant', () => {
    const board = recipeStoryboard();
    const hook = board.scenes[0]!;

    if (hook.implementation.type !== 'recipe') {
      throw new Error('expected recipe');
    }

    hook.implementation.variant = 'nope';

    expect(issuePaths(board)).toContain('scenes.0.implementation.variant');
  });

  it('rejects a missing required slot with a path to the slot', () => {
    const board = recipeStoryboard();
    const hook = board.scenes[0]!;

    if (hook.implementation.type !== 'recipe') {
      throw new Error('expected recipe');
    }

    hook.implementation.slots = {};

    expect(issuePaths(board)).toContain('scenes.0.implementation.slots.title');
  });

  it('rejects an unknown starter asset with a nested path', () => {
    const board = recipeStoryboard();
    const hook = board.scenes[0]!;

    if (hook.implementation.type !== 'recipe') {
      throw new Error('expected recipe');
    }

    hook.implementation.slots = {
      title: 'ПОЧЕМУ?',
      subject: { assetKey: 'unicorn' },
    };

    expect(issuePaths(board)).toContain(
      'scenes.0.implementation.slots.subject.assetKey',
    );
  });

  it('rejects non-empty objects on a recipe scene', () => {
    const board = recipeStoryboard();
    board.scenes[0]!.objects = [
      {
        id: 'extra',
        kind: 'text',
        content: 'ЛИШНИЙ ТЕКСТ',
        animation: 'pulse',
        syncToWord: null,
        startSec: 0.5,
        endSec: 5,
      },
    ];

    expect(issuePaths(board)).toContain('scenes.0.objects');
  });

  it('requires content for a subject scene object', () => {
    const board = fixture();
    board.scenes[0]!.objects = [
      {
        id: 'subject',
        kind: 'subject',
        content: null,
        animation: 'pop-in',
        syncToWord: null,
        startSec: 0,
        endSec: 5,
      },
    ];

    expect(issuePaths(board)).toContain('scenes.0.objects.0.content');
  });
});

describe('variant typing', () => {
  it('exposes a variant shape with a camera hint', () => {
    const variant: RecipeVariant =
      getStoryboardRecipe('fact-object')!.variants[0]!;

    expect(variant.cameraHint.shot).toBeDefined();
    expect(variant.background.params).toBeTypeOf('object');
  });
});
