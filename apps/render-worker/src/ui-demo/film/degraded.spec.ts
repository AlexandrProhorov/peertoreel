import { describe, expect, it } from 'vitest';
import { degradeScene, fallbackScene } from './degraded.js';
import { uiSceneSchema, type SpecScene } from '../spec.js';

/**
 * A film never loses a scene. These cases pin the two ways a scene survives
 * when its attempts run out: the last repaired picture, or the arc's sentence.
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
});
