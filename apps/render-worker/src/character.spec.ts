import {
  CARTOON_CHARACTER_BLUEPRINT,
  CARTOON_CHARACTER_EMOTIONS,
  CARTOON_CHARACTER_POSES,
  cartoonCharacterParamsSchema,
  type CartoonCharacterParams,
} from '@peertoreel/contracts';
import { createHash } from 'node:crypto';
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }

  return value;
}

/** Key-order-independent digest of the rendered primitives. */
function geometryDigest(shapes: readonly CharacterShape[]): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(shapes)))
    .digest('hex')
    .slice(0, 16);
}

/**
 * M3.6b.8 golden fixture, captured from `characterLayers` *before* geometry
 * moved into `CARTOON_CHARACTER_BLUEPRINT`. A mismatch is a visual change, not
 * an improvement: the blueprint refactor must stay pixel-identical.
 */
const GOLDEN_GEOMETRY = [
  { emotion: 'neutral', pose: 'idle', frame: 17, digest: '00bc1dea89590b37' },
  { emotion: 'neutral', pose: 'wave', frame: 17, digest: '12c10b92c6dde053' },
  { emotion: 'happy', pose: 'idle', frame: 17, digest: '76cdca5f9a8f42ae' },
  { emotion: 'happy', pose: 'wave', frame: 17, digest: '945a3dec95cb1799' },
  { emotion: 'surprised', pose: 'idle', frame: 17, digest: '0db81c4180497968' },
  { emotion: 'surprised', pose: 'wave', frame: 17, digest: '8a9c5f746ba98393' },
  { emotion: 'angry', pose: 'idle', frame: 17, digest: '58b741457b0ccb85' },
  { emotion: 'angry', pose: 'wave', frame: 17, digest: '572f918c3f75df2a' },
  { emotion: 'sad', pose: 'idle', frame: 17, digest: '619b1f339d4ca04d' },
  { emotion: 'sad', pose: 'wave', frame: 17, digest: '73df222e47da4d97' },
] as const;

describe('cartoon character geometry', () => {
  it('matches the pre-blueprint golden signature for every emotion and pose', () => {
    for (const entry of GOLDEN_GEOMETRY) {
      const shapes = characterLayers(
        params({ emotion: entry.emotion, pose: entry.pose }),
        entry.frame,
        FPS,
      );

      expect(geometryDigest(shapes), `${entry.emotion}/${entry.pose}`).toBe(
        entry.digest,
      );
    }
  });

  it('draws shapes in the blueprint order', () => {
    const shapes = characterLayers(params(), 0, FPS);

    expect(shapes.map((item) => item.id)).toEqual([
      'arm-left',
      'arm-right',
      'hand-left',
      'hand-right',
      'torso',
      'neck',
      'ear-left',
      'ear-right',
      'head',
      'hair',
      'eye-left',
      'eye-right',
      'pupil-left',
      'pupil-right',
      'brow-left',
      'brow-right',
      'mouth',
    ]);
    expect(CARTOON_CHARACTER_BLUEPRINT.drawOrder).toEqual([
      'arms',
      'hands',
      'torso',
      'neck',
      'ears',
      'head',
      'hair',
      'eyes',
      'pupils',
      'brows',
      'mouth',
    ]);
  });

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

  it('points the right hand to the side in the point pose', () => {
    const idle = characterLayers(params({ pose: 'idle' }), 0, FPS);
    const point = characterLayers(params({ pose: 'point' }), 0, FPS);
    const idleHand = shape(idle, 'hand-right');
    const pointHand = shape(point, 'hand-right');

    expect(idleHand.kind).toBe('circle');
    expect(pointHand.kind).toBe('circle');

    if (idleHand.kind === 'circle' && pointHand.kind === 'circle') {
      expect(pointHand.cx).toBeGreaterThan(idleHand.cx);
      expect(pointHand.cy).toBeLessThan(idleHand.cy);
      expect(pointHand.cy).toBeLessThan(470);
    }
  });

  it('adds accessories in blueprint z-zones and keeps base order without them', () => {
    const base = characterLayers(params(), 0, FPS);
    const dressed = characterLayers(
      params({ accessories: ['glasses', 'scarf', 'hat'] }),
      0,
      FPS,
    );
    const ids = dressed.map((item) => item.id);
    const baseIds = base.map((item) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining(['glasses-left', 'glasses-bridge', 'scarf-band', 'hat-brim']),
    );
    expect(ids.indexOf('scarf-band')).toBeGreaterThan(ids.indexOf('neck'));
    expect(ids.indexOf('scarf-band')).toBeLessThan(ids.indexOf('head'));
    expect(ids.indexOf('hat-brim')).toBeGreaterThan(ids.indexOf('hair'));
    expect(ids.indexOf('hat-brim')).toBeLessThan(ids.indexOf('eye-left'));
    expect(ids.indexOf('glasses-left')).toBeGreaterThan(ids.indexOf('mouth'));
    expect(baseIds).not.toContain('hat-brim');
    expect(ids.filter((id) => baseIds.includes(id))).toEqual(baseIds);
  });

  it('raises the right hand only in the wave pose', () => {    const idle = characterLayers(params({ pose: 'idle' }), 0, FPS);
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
