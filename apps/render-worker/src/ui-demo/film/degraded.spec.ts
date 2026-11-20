import { describe, expect, it } from 'vitest';
import {
  degradeScene,
  fallbackScene,
  hasContent,
  sceneMarkOf,
  titleFromAttempts,
} from './degraded.js';
import { uiEpisodeSchema, uiSceneSchema, type SpecScene } from '../spec.js';
import { normalizeRawEpisode } from '../fit/normalize.js';

/**
 * A film never loses a scene. These cases pin the two ways a scene survives
 * when its attempts run out: the last repaired picture, or the plan's stage
 * with the model's best sentence — marked as ours.
 */

const theme = 'studio-lime' as const;

function fallback(intent = 'Скидка исчезает на кассе'): SpecScene {
  return fallbackScene({ id: 'claim', seconds: 8, theme, intent });
}

function labelCopy(scene: SpecScene): string {
  const label = scene.spec.elements.find((element) => element.id === 'claim');
  const text = (label?.params as Record<string, unknown> | undefined)?.['text'];

  return typeof text === 'string' ? text : '';
}

describe('degraded scene', () => {
  it('keeps a fallback scene valid and on the planned seconds', () => {
    const scene = fallback();

    expect(uiSceneSchema.safeParse(scene).success).toBe(true);
    expect(scene.durationSec).toBe(8);
    expect(scene.degraded?.reasons).toHaveLength(1);
  });

  it('trims an intent that is longer than the label contract', () => {
    const scene = fallbackScene({
      id: 'long',
      seconds: 6,
      theme,
      intent: 'слово '.repeat(60).trim(),
    });
    const copy = labelCopy(scene);

    expect(copy.length).toBeLessThanOrEqual(80);
    expect(copy.endsWith('…')).toBe(true);
  });

  it('restores the planned seconds without touching the picture', () => {
    const scene = fallback();
    const shortened: SpecScene = { ...scene, durationSec: 2.4, degraded: undefined };
    const degraded = degradeScene(shortened, 8, ['сцена статична']);

    expect(degraded.durationSec).toBe(8);
    expect(degraded.spec.elements).toHaveLength(scene.spec.elements.length);
    expect(degraded.degraded?.reasons).toEqual(['сцена статична']);
  });

  it('keeps a degraded scene inside the contract duration bounds', () => {
    expect(degradeScene(fallback(), 40, ['слишком длинная']).durationSec).toBe(20);
  });

  it('marks a fallback as ours, not as a repaired model scene', () => {
    const scene = fallback();

    expect(scene.fallback?.reason).toContain('fallback');
    expect(sceneMarkOf(scene)).toBe('fallback');
    expect(sceneMarkOf(degradeScene(scene, 8, ['сцена статична']))).toBe('fallback');
    expect(sceneMarkOf({ ...scene, fallback: undefined })).toBe('degraded');
    expect(sceneMarkOf({ ...scene, fallback: undefined, degraded: undefined })).toBeNull();
  });

  it('keeps the model sentence when a failed attempt produced one', () => {
    const scene = fallbackScene(
      { id: 'claim', seconds: 8, theme, intent: 'Скидка исчезает на кассе' },
      { title: 'Цена выросла на 40 процентов за год' },
    );

    expect(labelCopy(scene)).toBe('Цена выросла на 40 процентов за год');
  });

  it('takes the longest text from the rejected attempts', () => {
    const attempt = (text: string): unknown => ({
      scenes: [
        {
          device: 'spec',
          spec: {
            kind: 'composition',
            elements: [
              { id: 'a', primitive: 'label', params: { text } },
              { id: 'b', primitive: 'card', params: { text: 'плюс' } },
            ],
          },
        },
      ],
    });

    expect(titleFromAttempts([attempt('Скидка'), attempt('Цена выросла за год')])).toBe(
      'Цена выросла за год',
    );
    expect(titleFromAttempts([{ scenes: [{ device: 'spec', spec: { elements: [] } }] }])).toBeNull();
  });

  it('survives the normalizer with its fallback mark intact', () => {
    const normalized = uiEpisodeSchema.safeParse(
      normalizeRawEpisode({
        schemaVersion: 1,
        themeId: theme,
        captions: false,
        speech: [],
        scenes: [fallback()],
      }),
    );

    expect(normalized.success).toBe(true);

    if (normalized.success) {
      expect(normalized.data.scenes[0]?.fallback?.reason).toContain('fallback');
    }
  });

  it('tells a husk from a scene that says something', () => {
    const husk = {
      ...fallback(),
      spec: {
        ...fallback().spec,
        elements: fallback().spec.elements.map((element) => ({
          ...element,
          params: element.id === 'claim' ? {} : element.params,
        })),
      },
    } as SpecScene;
    const object = {
      ...fallback(),
      spec: {
        ...fallback().spec,
        elements: [
          ...fallback().spec.elements,
          {
            id: 'thing',
            primitive: 'object',
            layout: { x: 100, y: 100, width: 300, height: 300 },
            params: { asset: 'starter/lock' },
            states: [],
            transitions: [],
            operations: [],
            links: [],
          },
        ],
      },
    } as SpecScene;

    expect(hasContent(husk)).toBe(false);
    expect(hasContent(object)).toBe(true);
    expect(hasContent(fallback())).toBe(true);
  });
});
