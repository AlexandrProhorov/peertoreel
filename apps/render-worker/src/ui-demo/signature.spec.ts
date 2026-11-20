import { describe, expect, it } from 'vitest';
import { rawSceneSignature, sceneSignature } from './signature.js';
import type { UiScene } from './spec.js';

/**
 * The signature is the diversity meter, so it must be blind to copy and sharp
 * to structure: same layout in new words is the same scene, a different
 * arrangement is a different one.
 */

function sceneOf(elements: readonly unknown[], sequence: readonly unknown[] = []): UiScene {
  return {
    id: 'scene',
    device: 'spec',
    durationSec: 5,
    revealSec: 1,
    spec: { kind: 'composition', elements, sequence },
  } as unknown as UiScene;
}

function element(
  id: string,
  primitive: string,
  layout: Record<string, number>,
  params: Record<string, string | number | boolean> = {},
): unknown {
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

const after = (scene: UiScene): string => sceneSignature(scene).key;

describe('scene signature', () => {
  it('is deterministic for the same scene', () => {
    const scene = sceneOf([
      element('stage', 'stage', { x: 0, y: 0, width: 1080, height: 1920 }),
      element('label', 'label', { x: 72, y: 260, width: 420, height: 110 }, { text: 'Цена' }),
    ]);

    expect(after(scene)).toBe(after(scene));
  });

  it('ignores copy: same composition in new words is one signature', () => {
    const first = sceneOf([
      element('card', 'card', { x: 100, y: 300, width: 500, height: 200 }, { text: 'Подписка' }),
      element('label', 'label', { x: 100, y: 600, width: 400, height: 80 }, { text: 'Скидка' }),
    ]);
    const second = sceneOf([
      element('card', 'card', { x: 100, y: 300, width: 500, height: 200 }, { text: 'Совсем другой текст' }),
      element('label', 'label', { x: 100, y: 600, width: 400, height: 80 }, { text: 'И ещё один' }),
    ]);

    expect(after(first)).toBe(after(second));
  });

  it('ignores model-chosen ids and colours', () => {
    const named = sceneOf([
      element('price-card', 'card', { x: 100, y: 300, width: 500, height: 200 }, {
        background: '#CCFF00',
      }),
      element('gap-label', 'label', { x: 100, y: 600, width: 400, height: 80 }, { tone: 'ink' }),
    ]);
    const renamed = sceneOf([
      element('a', 'card', { x: 100, y: 300, width: 500, height: 200 }, {
        background: '#0B0B0C',
      }),
      element('b', 'label', { x: 100, y: 600, width: 400, height: 80 }, { tone: 'accent' }),
    ]);

    expect(after(named)).toBe(after(renamed));
  });

  it('changes when the order of appearance changes', () => {
    const card = element('first', 'card', { x: 100, y: 300, width: 500, height: 200 });
    const label = element('second', 'label', { x: 100, y: 600, width: 400, height: 80 });

    const plain = sceneOf([card, label]);
    const reversed = sceneOf([card, label], [
      { element: 'second', transition: 'appear' },
      { element: 'first', transition: 'appear' },
    ]);

    expect(after(plain)).not.toBe(after(reversed));
    /* The coarse key answers a different question: same cast, same type. */
    expect(sceneSignature(plain).coarse).toBe(sceneSignature(reversed).coarse);
  });

  it('separates the type-level key from the arrangement', () => {
    const card = element('card', 'card', { x: 100, y: 300, width: 500, height: 200 });
    const label = element('label', 'label', { x: 100, y: 600, width: 400, height: 80 });

    const stacked = sceneOf([card, label]);
    const sideBySide = sceneOf([
      element('card', 'card', { x: 60, y: 300, width: 460, height: 600 }),
      element('label', 'label', { x: 560, y: 300, width: 400, height: 80 }),
    ]);

    expect(sceneSignature(stacked).key).not.toBe(sceneSignature(sideBySide).key);
    expect(sceneSignature(stacked).coarse).toBe(sceneSignature(sideBySide).coarse);
  });

  it('changes the coarse key when the cast of primitives changes', () => {
    const card = element('card', 'card', { x: 100, y: 300, width: 500, height: 200 });
    const label = element('label', 'label', { x: 100, y: 600, width: 400, height: 80 });
    const pill = element('pill', 'pill', { x: 100, y: 900, width: 300, height: 80 });

    expect(sceneSignature(sceneOf([card, label])).coarse).not.toBe(
      sceneSignature(sceneOf([card, label, pill])).coarse,
    );
  });

  it('marks a differing pair of one primitive as a comparison', () => {
    const equal = sceneOf([
      element('left', 'track', { x: 72, y: 400, width: 420, height: 20 }, { fill: 0.15 }),
      element('right', 'track', { x: 560, y: 400, width: 448, height: 20 }, { fill: 0.15 }),
    ]);
    const differ = sceneOf([
      element('left', 'track', { x: 72, y: 400, width: 420, height: 20 }, { fill: 0.15 }),
      element('right', 'track', { x: 560, y: 400, width: 448, height: 20 }, { fill: 1 }),
    ]);

    expect(sceneSignature(equal).key).toContain('diff=none');
    expect(sceneSignature(differ).key).toContain('diff=track');
  });

  it('records containment as a relation', () => {
    const scene = sceneOf([
      element('surface', 'card', { x: 100, y: 300, width: 600, height: 600 }),
      element('inner', 'label', { x: 140, y: 340, width: 200, height: 60 }),
    ]);

    expect(sceneSignature(scene).key).toContain('rel=0>1');
  });

  it('describes a device scene by counts, not by words', () => {
    const short = {
      id: 's',
      device: 'text-selection',
      durationSec: 5,
      title: 'Заголовок',
      lines: ['один', 'два'],
      selectionLineIndex: 0,
    } as unknown as UiScene;
    const long = {
      ...short,
      title: 'Другой заголовок',
      lines: ['один', 'два', 'три'],
    } as unknown as UiScene;

    expect(after(short)).toContain('lines=2');
    expect(after(short)).not.toBe(after(long));
  });
});

describe('raw attempt signature', () => {
  it('marks an unvalidated attempt as partial', () => {
    const signature = rawSceneSignature({
      id: 'scene',
      device: 'spec',
      spec: { kind: 'composition', elements: [element('bar', 'track', { x: 0, y: 0 })] },
    });

    expect(signature.partial).toBe(true);
    expect(signature.kind).toBe('spec');
  });

  it('keeps an invented primitive as an explicit unknown instead of dropping it', () => {
    const signature = rawSceneSignature({
      id: 'scene',
      device: 'spec',
      spec: { kind: 'composition', elements: [element('x', 'column', { x: 0, y: 0 })] },
    });

    expect(signature.key).toContain('unknown');
    expect(signature.partial).toBe(true);
  });

  it('reports a body without a device as invalid rather than guessing', () => {
    expect(rawSceneSignature({ title: 'нет устройства' })).toEqual({
      key: 'invalid',
      coarse: 'invalid',
      kind: 'invalid',
      partial: true,
    });
    expect(rawSceneSignature('строка')).toEqual({
      key: 'invalid',
      coarse: 'invalid',
      kind: 'invalid',
      partial: true,
    });
  });
});
