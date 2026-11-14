import type { CartoonCharacterParams } from '@peertoreel/contracts';

/**
 * Procedural presenter geometry (M3.6b.7.1).
 *
 * Pure data: the React component only maps these shapes to SVG elements and
 * never decides coordinates. Everything is derived from `frame`/`fps`, so the
 * same params produce the same frames (no `Math.random`, no wall clock).
 */

export const CHARACTER_VIEWBOX = { width: 400, height: 700 } as const;

export interface CharacterRotation {
  readonly angle: number;
  readonly cx: number;
  readonly cy: number;
}

export type CharacterShape =
  | {
      readonly kind: 'rect';
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
      readonly fill: string;
      readonly rotation?: CharacterRotation;
    }
  | {
      readonly kind: 'ellipse';
      readonly id: string;
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
      readonly fill: string;
    }
  | {
      readonly kind: 'circle';
      readonly id: string;
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: string;
    }
  | {
      readonly kind: 'path';
      readonly id: string;
      readonly d: string;
      readonly stroke: string | null;
      readonly strokeWidth: number;
      readonly fill: string | null;
    };

interface EmotionSpec {
  readonly browY: number;
  /** Degrees; positive tilts the left brow inward-down. */
  readonly browTilt: number;
  readonly eyeRy: number;
  readonly pupilDy: number;
  readonly mouth:
    | 'smile'
    | 'big-smile'
    | 'open'
    | 'frown'
    | 'small-frown';
}

const EMOTIONS: Readonly<Record<CartoonCharacterParams['emotion'], EmotionSpec>> = {
  neutral: {
    browY: 196,
    browTilt: 0,
    eyeRy: 26,
    pupilDy: 0,
    mouth: 'smile',
  },
  happy: {
    browY: 188,
    browTilt: 4,
    eyeRy: 16,
    pupilDy: -2,
    mouth: 'big-smile',
  },
  surprised: {
    browY: 178,
    browTilt: 0,
    eyeRy: 33,
    pupilDy: 0,
    mouth: 'open',
  },
  angry: {
    browY: 200,
    browTilt: 12,
    eyeRy: 21,
    pupilDy: 2,
    mouth: 'frown',
  },
  sad: {
    browY: 198,
    browTilt: -10,
    eyeRy: 23,
    pupilDy: 6,
    mouth: 'small-frown',
  },
};

interface Point {
  readonly x: number;
  readonly y: number;
}

function rotateAround(point: Point, pivot: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;

  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

function mouthPath(
  mouth: EmotionSpec['mouth'],
  ink: string,
): Extract<CharacterShape, { kind: 'path' }> | Extract<CharacterShape, { kind: 'ellipse' }> {
  switch (mouth) {
    case 'open':
      return {
        kind: 'ellipse',
        id: 'mouth',
        cx: 200,
        cy: 314,
        rx: 14,
        ry: 19,
        fill: ink,
      };
    case 'big-smile':
      return {
        kind: 'path',
        id: 'mouth',
        d: 'M 164 304 Q 200 350 236 304',
        stroke: ink,
        strokeWidth: 7,
        fill: null,
      };
    case 'frown':
      return {
        kind: 'path',
        id: 'mouth',
        d: 'M 176 326 Q 200 304 224 326',
        stroke: ink,
        strokeWidth: 7,
        fill: null,
      };
    case 'small-frown':
      return {
        kind: 'path',
        id: 'mouth',
        d: 'M 182 322 Q 200 310 218 322',
        stroke: ink,
        strokeWidth: 6,
        fill: null,
      };
    case 'smile':
      return {
        kind: 'path',
        id: 'mouth',
        d: 'M 178 312 Q 200 324 222 312',
        stroke: ink,
        strokeWidth: 6,
        fill: null,
      };
  }
}

/**
 * All character primitives for one frame, back to front. `frame` is the
 * Remotion frame; `fps` normalises the breathing/wave phase.
 */
export function characterLayers(
  params: CartoonCharacterParams,
  frame: number,
  fps: number,
): CharacterShape[] {
  const emotions = EMOTIONS[params.emotion];
  const t = fps > 0 ? frame / fps : 0;
  const bob = Math.sin(t * Math.PI * 0.7) * 6 * params.bob;
  const wavePhase = Math.sin(t * Math.PI * 2 * 0.8) * 0.12;
  const wave = params.pose === 'wave';

  const y = (value: number): number => value + bob;
  const leftShoulder: Point = { x: 120, y: y(440) };
  const rightShoulder: Point = { x: 280, y: y(440) };
  const leftHand = rotateAround(
    { x: 106, y: y(586) },
    leftShoulder,
    wave ? -0.05 : 0,
  );
  const rightHand = wave
    ? rotateAround({ x: 372, y: y(364) }, rightShoulder, wavePhase)
    : { x: 294, y: y(586) };

  const arm = (
    id: string,
    from: Point,
    to: Point,
  ): Extract<CharacterShape, { kind: 'path' }> => ({
    kind: 'path',
    id,
    d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    stroke: params.accent,
    strokeWidth: 42,
    fill: null,
  });

  const browY = y(emotions.browY);

  return [
    arm('arm-left', leftShoulder, leftHand),
    arm('arm-right', rightShoulder, rightHand),
    {
      kind: 'circle',
      id: 'hand-left',
      cx: leftHand.x,
      cy: leftHand.y,
      r: 22,
      fill: params.skin,
    },
    {
      kind: 'circle',
      id: 'hand-right',
      cx: rightHand.x,
      cy: rightHand.y,
      r: 22,
      fill: params.skin,
    },
    {
      kind: 'rect',
      id: 'torso',
      x: 110,
      y: y(398),
      width: 180,
      height: 252,
      rx: 70,
      fill: params.accent,
    },
    {
      kind: 'rect',
      id: 'neck',
      x: 180,
      y: y(346),
      width: 40,
      height: 60,
      rx: 16,
      fill: params.skin,
    },
    {
      kind: 'circle',
      id: 'ear-left',
      cx: 96,
      cy: y(252),
      r: 18,
      fill: params.skin,
    },
    {
      kind: 'circle',
      id: 'ear-right',
      cx: 304,
      cy: y(252),
      r: 18,
      fill: params.skin,
    },
    {
      kind: 'ellipse',
      id: 'head',
      cx: 200,
      cy: y(250),
      rx: 108,
      ry: 122,
      fill: params.skin,
    },
    {
      kind: 'path',
      id: 'hair',
      d: `M 92 ${y(238)} Q 92 ${y(124)} 200 ${y(118)} Q 308 ${y(124)} 308 ${y(238)} Q 292 ${y(178)} 200 ${y(174)} Q 108 ${y(178)} 92 ${y(238)} Z`,
      stroke: null,
      strokeWidth: 0,
      fill: params.hair,
    },
    {
      kind: 'ellipse',
      id: 'eye-left',
      cx: 160,
      cy: y(244),
      rx: 22,
      ry: emotions.eyeRy,
      fill: '#FFFFFF',
    },
    {
      kind: 'ellipse',
      id: 'eye-right',
      cx: 240,
      cy: y(244),
      rx: 22,
      ry: emotions.eyeRy,
      fill: '#FFFFFF',
    },
    {
      kind: 'circle',
      id: 'pupil-left',
      cx: 160,
      cy: y(244 + emotions.pupilDy),
      r: 9,
      fill: params.ink,
    },
    {
      kind: 'circle',
      id: 'pupil-right',
      cx: 240,
      cy: y(244 + emotions.pupilDy),
      r: 9,
      fill: params.ink,
    },
    {
      kind: 'rect',
      id: 'brow-left',
      x: 132,
      y: browY,
      width: 48,
      height: 11,
      rx: 5,
      fill: params.ink,
      rotation: { angle: emotions.browTilt, cx: 156, cy: browY + 5 },
    },
    {
      kind: 'rect',
      id: 'brow-right',
      x: 220,
      y: browY,
      width: 48,
      height: 11,
      rx: 5,
      fill: params.ink,
      rotation: { angle: -emotions.browTilt, cx: 244, cy: browY + 5 },
    },
    mouthPath(emotions.mouth, params.ink),
  ];
}
