import {
  STARTER_ASSET_KEYS,
  STORYBOARD_RECIPES,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  storyboardPromptCatalog,
  storyboardPromptStarterAssets,
  storyboardSystemPrompt,
  storyboardUserPrompt,
} from './prompt.js';

describe('storyboard director prompt', () => {
  it('derives the catalog from contracts, not a duplicate list', () => {
    const catalog = storyboardPromptCatalog();

    expect(catalog.map((recipe) => recipe.id)).toEqual(
      STORYBOARD_RECIPES.map((recipe) => recipe.id),
    );

    for (const recipe of catalog) {
      const source = STORYBOARD_RECIPES.find(
        (candidate) => candidate.id === recipe.id,
      )!;

      expect(recipe.variants).toEqual(
        source.variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
        })),
      );
      expect(recipe.slots.map((slot) => slot.name)).toEqual(
        source.slotSpecs.map((spec) => spec.name),
      );
    }
  });

  it('describes every slot kind with an explicit JSON shape', () => {
    const shapes = storyboardPromptCatalog().flatMap((recipe) =>
      recipe.slots.map((slot) => slot.shape),
    );

    expect(shapes.some((shape) => shape.includes('assetKey'))).toBe(true);
    expect(shapes.some((shape) => shape.includes('fraction'))).toBe(true);
    expect(shapes.some((shape) => shape.includes('label'))).toBe(true);
  });

  it('lists every starter key with tags', () => {
    const assets = storyboardPromptStarterAssets();

    expect(assets.map((asset) => asset.key)).toEqual([...STARTER_ASSET_KEYS]);

    for (const asset of assets) {
      expect(asset.tags.length).toBeGreaterThan(0);
    }
  });

  it('puts the topic, catalog and starter keys into the user prompt', () => {
    const prompt = storyboardUserPrompt('Почему у собак мокрый нос?');

    expect(prompt).toContain('Почему у собак мокрый нос?');
    expect(prompt).toContain('"id": "hook-hero"');
    expect(prompt).toContain('"key": "dog-snout"');
    expect(prompt).toContain('"id": "fact-object"');
  });

  it('forbids invented ids, timings and assets in the system prompt', () => {
    const prompt = storyboardSystemPrompt();

    expect(prompt).toContain('ТОЛЬКО один JSON');
    expect(prompt).toContain('не назначаешь тайминги');
    expect(prompt).toContain('subject/<');
    expect(prompt).toContain('fallbackIcon');
    expect(prompt).toContain('recipeId');
  });
});
