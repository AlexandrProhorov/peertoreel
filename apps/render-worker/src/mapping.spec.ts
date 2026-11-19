import {
  storyboardFixture15Deg,
  type StoryboardScene,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  UnsupportedSceneComponentError,
  resolveSceneComponent,
  resolvedScenePropsSchema,
} from './mapping.js';

function sceneAt(index: number): StoryboardScene {
  return structuredClone(storyboardFixture15Deg.scenes[index]!);
}

describe('scene component mapping', () => {
  it('resolves the implementation with fully defaulted params', () => {
    expect(resolveSceneComponent(sceneAt(0))).toEqual({
      componentId: 'parallax-city',
      params: {
        buildingsSeed: 42,
        lamp: 'right',
        snowDensity: 1.2,
        focus: 'street',
        roadGlow: true,
      },
      source: 'implementation',
      recipe: null,
      slotDiagnostics: [],
      diagnostics: [],
    });
  });

  it('uses the declared fallback for an image_animation scene', () => {
    const resolved = resolveSceneComponent(sceneAt(1));

    expect(resolved.componentId).toBe('parallax-city');
    expect(resolved.source).toBe('fallback');
    expect(resolved.params).toMatchObject({
      buildingsSeed: 7,
      focus: 'car-silhouette',
    });
  });

  it('does not treat image_animation as a programmatic implementation', () => {
    const scene = sceneAt(0);
    scene.implementation = {
      type: 'image_animation',
      componentId: 'parallax-city',
      params: { buildingsSeed: 5 },
      imagePrompt: 'stylized car',
      refIds: [],
    };
    scene.fallback.params = { buildingsSeed: 11 };

    const resolved = resolveSceneComponent(scene);

    expect(resolved.componentId).toBe('parallax-city');
    expect(resolved.source).toBe('fallback');
    expect(resolved.params).toMatchObject({ buildingsSeed: 11 });
  });

  it('uses the fallback for a hybrid scene', () => {
    const scene = sceneAt(0);
    scene.implementation = {
      type: 'hybrid',
      layers: [
        {
          role: 'background',
          source: 'programmatic',
          spec: { componentId: 'parallax-city' },
        },
      ],
    };

    expect(resolveSceneComponent(scene).source).toBe('fallback');
  });

  it('uses the fallback for an unimplemented gauge scene', () => {
    const resolved = resolveSceneComponent(sceneAt(2));

    expect(resolved.componentId).toBe('kinetic-typography');
    expect(resolved.source).toBe('fallback');
    expect(resolved.params).toMatchObject({ text: '-40% ЁМКОСТИ' });
  });

  it('resolves kinetic typography params from the implementation', () => {
    const resolved = resolveSceneComponent(sceneAt(3));

    expect(resolved).toMatchObject({
      componentId: 'kinetic-typography',
      source: 'implementation',
      diagnostics: [],
      params: {
        text: '15 МИНУТ',
        accentWords: ['15'],
        preset: 'counter',
        align: 'center',
        underline: false,
      },
    });
  });

  it('uses the fallback for an ai_video scene', () => {
    const resolved = resolveSceneComponent(sceneAt(4));

    expect(resolved.componentId).toBe('parallax-city');
    expect(resolved.source).toBe('fallback');
    expect(resolved.params).toMatchObject({
      buildingsSeed: 99,
      focus: 'car-silhouette',
    });
  });

  it('uses the explicit CTA fallback instead of a generic component', () => {
    const resolved = resolveSceneComponent(sceneAt(5));

    expect(resolved.componentId).toBe('kinetic-typography');
    expect(resolved.source).toBe('fallback');
    expect(resolved.params).toMatchObject({ text: 'ЗДОРОВЕЕ' });
  });

  it('throws when neither implementation nor fallback is implemented', () => {
    const scene = sceneAt(0);
    scene.implementation = {
      type: 'image_animation',
      componentId: 'image-parallax',
      params: {},
      imagePrompt: 'stylized car',
      refIds: [],
    };
    scene.fallback = {
      type: 'programmatic',
      componentId: 'cta-card',
      params: { text: 'CTA' },
    };

    expect(() => resolveSceneComponent(scene)).toThrow(
      UnsupportedSceneComponentError,
    );
    expect(() => resolveSceneComponent(scene)).toThrow(/cta-card/);
  });

  it('propagates params diagnostics from the resolved side', () => {
    const scene = sceneAt(0);
    scene.implementation = {
      type: 'programmatic',
      componentId: 'parallax-city',
      params: { buildingsSeed: 'hello' },
    };

    const resolved = resolveSceneComponent(scene);

    expect(resolved.componentId).toBe('parallax-city');
    expect(resolved.diagnostics).toEqual([
      {
        path: 'buildingsSeed',
        reason: 'invalid_value',
        received: 'hello',
      },
    ]);

    if (resolved.componentId !== 'parallax-city') {
      throw new Error('expected parallax-city');
    }

    expect(resolved.params.buildingsSeed).toBe(42);
  });

  it('does not put log-only fields into the resolved render props', () => {
    const resolved = resolveSceneComponent(sceneAt(0));
    const props = resolvedScenePropsSchema.parse({
      componentId: resolved.componentId,
      params: resolved.params,
      recipe: resolved.recipe,
      source: resolved.source,
      diagnostics: resolved.diagnostics,
    });

    expect(props).toEqual({
      componentId: 'parallax-city',
      params: resolved.params,
      recipe: null,
    });
  });

  it('rejects an unknown component in resolved props', () => {
    expect(
      resolvedScenePropsSchema.safeParse({
        componentId: 'cta-card',
        params: {},
        recipe: null,
      }).success,
    ).toBe(false);
  });

  it('resolves a recipe scene once into background params and a layer plan', () => {
    const scene = sceneAt(0);
    scene.objects = [];
    scene.implementation = {
      type: 'recipe',
      recipeId: 'hook-hero',
      variant: 'subject-lead',
      slots: {
        title: 'ПОЧЕМУ НЕБО СИНЕЕ?',
        kicker: 'НАУКА',
        subject: { assetKey: 'water-drop' },
      },
    };

    const resolved = resolveSceneComponent(scene);

    expect(resolved.componentId).toBe('parallax-city');
    expect(resolved.source).toBe('implementation');
    expect(resolved.recipe).toMatchObject({
      id: 'hook-hero',
      variant: 'subject-lead',
    });
    expect(resolved.recipe?.layers.map((layer) => layer.kind)).toEqual([
      'subject',
      'text',
      'hud-chip',
    ]);
    expect(resolved.recipe?.layers.map((layer) => layer.content)).toEqual([
      'assets/starter/water-drop.svg',
      'ПОЧЕМУ НЕБО СИНЕЕ?',
      'НАУКА',
    ]);
    expect(resolved.slotDiagnostics).toEqual([]);
  });

  it('never masks a recipe error with the declared fallback', () => {
    const scene = sceneAt(0);
    scene.objects = [];
    scene.implementation = {
      type: 'recipe',
      recipeId: 'fact-object',
      variant: 'stage',
      slots: { fact: 'ФАКТ' },
    };

    expect(() => resolveSceneComponent(scene)).toThrow(/subject/);
  });
});
