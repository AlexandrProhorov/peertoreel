import {
  CARTOON_CHARACTER_EMOTIONS,
  CARTOON_CHARACTER_POSES,
  cartoonCharacterParamsSchema,
  type CartoonCharacterParams,
} from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_VIEWBOX,
  characterLayers,
  type CharacterShape,
} from './character.js';

const FPS = 30;

function params(
  overrides: Partial<CartoonCharacterParams> = {},
): CartoonCharacterParams {
  return cartoonCharacterParamsSchema.parse(overrides);
}

function shape(shapes: readonly CharacterShape[], id: string): CharacterShape {
  const found = shapes.find((candidate) => candidate.id === id);

  if (found === undefined) {
    throw new Error(`shape "${id}" is missing`);
  }

  return found;
}

function signature(shapes: readonly CharacterShape[]): string {
  return JSON.stringify(shapes);
}

function withinCanvas(value: number, max: number): boolean {
  return value >= 0 && value <= max;
}

describe('cartoon character geometry', () => {
  it('has a visibly different face for every emotion', () => {
    const signatures = CARTOON_CHARACTER_EMOTIONS.map((emotion) =>
      signature(characterLayers(params({ emotion }), 0, FPS)),
    );

    expect(new Set(signatures).size).toBe(CARTOON_CHARACTER_EMOTIONS.length);
  });

  it('changes brows, eyes and mouth together', () => {
    const neutral = characterLayers(params({ emotion: 'neutral' }), 0, FPS);
    const sad = characterLayers(params({ emotion: 'sad' }), 0, FPS);
    const surprised = characterLayers(params({ emotion: 'surprised' }), 0, FPS);
    const neutralBrow = shape(neutral, 'brow-left');
    const sadBrow = shape(sad, 'brow-left');

    expect(signature(neutral)).not.toBe(signature(sad));
    expect(shape(sad, 'eye-left')).not.toEqual(shape(neutral, 'eye-left'));
    expect(shape(sad, 'mouth')).not.toEqual(shape(neutral, 'mouth'));
    expect(neutralBrow.kind).toBe('rect');
    expect(sadBrow.kind).toBe('rect');

    if (neutralBrow.kind === 'rect' && sadBrow.kind === 'rect') {
      expect(sadBrow.rotation?.angle).toBeLessThan(
        neutralBrow.rotation?.angle ?? 0,
      );
    }

    expect(shape(surprised, 'mouth').kind).toBe('ellipse');
  });

  it('raises the right hand only in the wave pose', () => {
    const idle = characterLayers(params({ pose: 'idle' }), 0, FPS);
    const wave = characterLayers(params({ pose: 'wave' }), 0, FPS);
    const idleHand = shape(idle, 'hand-right');
    const waveHand = shape(wave, 'hand-right');

    expect(idleHand.kind).toBe('circle');
    expect(waveHand.kind).toBe('circle');

    if (idleHand.kind === 'circle' && waveHand.kind === 'circle') {
      expect(waveHand.cy).toBeLessThan(idleHand.cy);
      expect(waveHand.cx).toBeGreaterThan(idleHand.cx);
    }
  });

  it('is deterministic for the same params and frame', () => {
    const input = params({ emotion: 'happy', pose: 'wave' });

    expect(signature(characterLayers(input, 12, FPS))).toBe(
      signature(characterLayers(input, 12, FPS)),
    );
    expect(signature(characterLayers(input, 12, FPS))).not.toBe(
      signature(characterLayers(input, 40, FPS)),
    );
  });

  it('freezes when bob is zero and pose is idle', () => {
    const input = params({ bob: 0, pose: 'idle' });

    expect(signature(characterLayers(input, 0, FPS))).toBe(
      signature(characterLayers(input, 45, FPS)),
    );
  });

  it('keeps every shape inside the viewBox for all emotions and poses', () => {
    for (const emotion of CARTOON_CHARACTER_EMOTIONS) {
      for (const pose of CARTOON_CHARACTER_POSES) {
        const shapes = characterLayers(params({ emotion, pose }), 17, FPS);

        for (const item of shapes) {
          if (item.kind === 'rect') {
            expect(withinCanvas(item.x, CHARACTER_VIEWBOX.width)).toBe(true);
            expect(
              withinCanvas(item.x + item.width, CHARACTER_VIEWBOX.width),
            ).toBe(true);
            expect(withinCanvas(item.y, CHARACTER_VIEWBOX.height)).toBe(true);
            expect(
              withinCanvas(item.y + item.height, CHARACTER_VIEWBOX.height),
            ).toBe(true);
          } else if (item.kind === 'ellipse') {
            expect(withinCanvas(item.cx - item.rx, CHARACTER_VIEWBOX.width)).toBe(
              true,
            );
            expect(withinCanvas(item.cx + item.rx, CHARACTER_VIEWBOX.width)).toBe(
              true,
            );
            expect(withinCanvas(item.cy - item.ry, CHARACTER_VIEWBOX.height)).toBe(
              true,
            );
            expect(withinCanvas(item.cy + item.ry, CHARACTER_VIEWBOX.height)).toBe(
              true,
            );
          } else if (item.kind === 'circle') {
            expect(withinCanvas(item.cx - item.r, CHARACTER_VIEWBOX.width)).toBe(
              true,
            );
            expect(withinCanvas(item.cx + item.r, CHARACTER_VIEWBOX.width)).toBe(
              true,
            );
            expect(withinCanvas(item.cy - item.r, CHARACTER_VIEWBOX.height)).toBe(
              true,
            );
            expect(withinCanvas(item.cy + item.r, CHARACTER_VIEWBOX.height)).toBe(
              true,
            );
          }
        }
      }
    }
  });
});
