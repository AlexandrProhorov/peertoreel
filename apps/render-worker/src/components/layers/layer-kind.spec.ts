import {
  RECIPE_LAYER_KINDS,
  sceneObjectKindSchema,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  recipeRenderer,
  sceneObjectRenderer,
} from './layer-kind.js';

describe('layer dispatch', () => {
  it('maps every scene object kind to a renderer', () => {
    const kinds = sceneObjectKindSchema.options;
    const renderers = kinds.map(sceneObjectRenderer);

    expect(kinds.length).toBeGreaterThan(0);
    expect(renderers).toContain('asset');
    expect(renderers).toContain('text');
    expect(sceneObjectRenderer('image')).toBe('asset');
    expect(sceneObjectRenderer('subject')).toBe('asset');
    expect(sceneObjectRenderer('shape')).toBe('none');
  });

  it('maps every recipe layer kind to a renderer', () => {
    const renderers = RECIPE_LAYER_KINDS.map(recipeRenderer);

    expect(new Set(RECIPE_LAYER_KINDS).size).toBe(RECIPE_LAYER_KINDS.length);
    expect(renderers).toContain('subject');
    expect(renderers).toContain('hud-chip');
    expect(recipeRenderer('image')).toBe('subject');
  });

  it('throws on an unknown kind instead of silently returning null', () => {
    expect(() =>
      sceneObjectRenderer('unknown' as never),
    ).toThrow(/Unsupported scene object kind/);
    expect(() => recipeRenderer('unknown' as never)).toThrow(
      /Unsupported recipe layer kind/,
    );
  });
});
