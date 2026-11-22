import { describe, expect, it } from 'vitest';
import { uiSceneSchema, type SpecScene } from '../spec.js';
import { addLateAction, sceneOnlyAttempt } from './attempt.js';

/**
 * Two attempt-level repairs from the 2026-11-23 series: our own `speech` copy
 * must not cost an attempt, and a still frame is fixed with one late action
 * before the scene is degraded.
 */

function element(
  id: string,
  primitive: string,
  params: Record<string, unknown> = {},
  layout: Record<string, number> = { x: 72, y: 200, width: 818, height: 200 },
) {
  return {
    id,
    primitive,
    layout,
    params,
    states: [],
    transitions: [],
    operations: [],
    links: [],
  };
}

function scene(
  elements: readonly ReturnType<typeof element>[],
  sequence: readonly { element: string; transition: string; at?: number }[],
  thesisIds: readonly string[] = ['thesis'],
): SpecScene {
  return {
    id: 'still-scene',
    device: 'spec',
    durationSec: 8,
    revealSec: 2,
    themeId: 'studio-dark',
    thesisIds: [...thesisIds],
    spec: {
      kind: 'composition',
      focus: 'thesis',
      elements: elements.map((item) => ({
        ...item,
        states: [...item.states],
        transitions: [...item.transitions],
        operations: [...item.operations],
        links: [...item.links],
      })),
      sequence: sequence.map((step) => ({ ...step })),
    },
  } as unknown as SpecScene;
}

function filmScene(
  sequence: readonly { element: string; transition: string; at?: number }[],
): SpecScene {
  return scene(
    [
      element('stage', 'stage', { background: '#0A0A0B' }, { x: 0, y: 0, width: 1080, height: 1920 }),
      element('thesis', 'label', {
        text: 'Скидка — иллюзия',
        token: 'headline',
        tone: 'ink',
      }),
      element(
        'price',
        'card',
        { background: '#CCFF00', text: 'Скидка 50%', token: 'headline' },
        { x: 72, y: 600, width: 400, height: 300 },
      ),
    ],
    sequence,
  );
}

describe('the attempt carries one scene', () => {
  it('drops the speech and captions the voice stage owns', () => {
    const raw = {
      schemaVersion: 1,
      themeId: 'studio-lime',
      captions: 'yes',
      speech: ['broken'],
      scenes: [{ id: 'one' }, { id: 'two' }],
    };
    const cleaned = sceneOnlyAttempt(raw) as Record<string, unknown>;

    expect(cleaned).not.toHaveProperty('speech');
    expect(cleaned).not.toHaveProperty('captions');
    expect(cleaned['scenes']).toEqual([{ id: 'one' }]);
  });

  it('passes through anything that is not an episode', () => {
    expect(sceneOnlyAttempt('text')).toBe('text');
    expect(sceneOnlyAttempt(null)).toBe(null);
    expect(sceneOnlyAttempt({ id: 'scene' })).toEqual({ id: 'scene' });
  });
});

describe('a still frame gets one late action', () => {
  it('highlights the thesis when every cue fires early', () => {
    const repaired = addLateAction(
      filmScene([
        { element: 'thesis', transition: 'appear', at: 0 },
        { element: 'thesis', transition: 'type', at: 0.4 },
      ]),
      8,
    );

    expect(repaired).not.toBeNull();
    expect(repaired?.spec.sequence.at(-1)).toEqual({
      element: 'thesis',
      transition: 'highlight',
      at: 4.4,
    });
    expect(uiSceneSchema.safeParse(repaired).success).toBe(true);
  });

  it('leaves a scene that already changes late in the film alone', () => {
    const target = filmScene([
      { element: 'thesis', transition: 'appear', at: 0 },
      { element: 'thesis', transition: 'highlight', at: 5 },
    ]);

    expect(addLateAction(target, 8)).toBeNull();
  });

  it('gives up when no element can be highlighted', () => {
    const target = scene(
      [element('stage', 'stage'), element('bar', 'track', { length: 818, thickness: 24 })],
      [{ element: 'bar', transition: 'fill', at: 0.4 }],
      [],
    );

    expect(addLateAction(target, 8)).toBeNull();
  });
});
