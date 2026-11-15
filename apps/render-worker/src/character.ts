import {
  CARTOON_CHARACTER_BLUEPRINT,
  type CartoonCharacterAccessory,
  type CartoonCharacterParams,
  type CharacterCurvePath,
  type CharacterMouthGeometry,
} from '@peertoreel/contracts';

/**
 * Procedural presenter geometry (M3.6b.7.1, blueprint in M3.6b.8).
 *
 * Pure data: the React component only maps these shapes to SVG elements and
 * never decides coordinates. Body geometry, anchors and bounds come from
 * `CARTOON_CHARACTER_BLUEPRINT`; this module adds expression and motion and
 * keeps every base number in the contract (M3.6b.8: golden signature must not
 * change). Everything is derived from `frame`/`fps`, so the same params
 * produce the same frames (no `Math.random`, no wall clock).
 */

const BLUEPRINT = CARTOON_CHARACTER_BLUEPRINT;

export const CHARACTER_VIEWBOX = BLUEPRINT.canvas;

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
      readonly stroke?: string | null;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: 'circle';
      readonly id: string;
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: string;
      readonly stroke?: string | null;
      readonly strokeWidth?: number;
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
  readonly mouth: keyof typeof BLUEPRINT.face.mouths;
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

/** `M x y Q cx cy x2 y2 …`; the blueprint owns the points, not the syntax. */
function curvePathData(path: CharacterCurvePath, y: (value: number) => number): string {
  const segments = path.curves.map(
    (curve) =>
      `Q ${curve.control.x} ${y(curve.control.y)} ${curve.to.x} ${y(curve.to.y)}`,
  );
  const parts = [`M ${path.start.x} ${y(path.start.y)}`, ...segments];

  if (path.closed === true) {
    parts.push('Z');
  }

  return parts.join(' ');
}

function accessoryShapes(
  accessory: CartoonCharacterAccessory,
  params: CartoonCharacterParams,
  y: (value: number) => number,
): CharacterShape[] {
  const { accessories, face } = BLUEPRINT;

  switch (accessory) {
    case 'glasses':
      return [
        {
          kind: 'ellipse',
          id: 'glasses-left',
          cx: face.eye.leftX,
          cy: y(face.eye.cy),
          rx: accessories.glasses.lensRadius,
          ry: accessories.glasses.lensRadius,
          fill: 'none',
          stroke: params.ink,
          strokeWidth: accessories.glasses.strokeWidth,
        },
        {
          kind: 'ellipse',
          id: 'glasses-right',
          cx: face.eye.rightX,
          cy: y(face.eye.cy),
          rx: accessories.glasses.lensRadius,
          ry: accessories.glasses.lensRadius,
          fill: 'none',
          stroke: params.ink,
          strokeWidth: accessories.glasses.strokeWidth,
        },
        {
          kind: 'path',
          id: 'glasses-bridge',
          d: `M ${accessories.glasses.bridgeFromX} ${y(accessories.glasses.bridgeY)} L ${accessories.glasses.bridgeToX} ${y(accessories.glasses.bridgeY)}`,
          stroke: params.ink,
          strokeWidth: accessories.glasses.strokeWidth,
          fill: null,
        },
      ];
    case 'hat': {
      const { brim, crown } = accessories.hat;

      return [
        {
          kind: 'rect',
          id: 'hat-brim',
          x: brim.x,
          y: y(brim.y),
          width: brim.width,
          height: brim.height,
          rx: brim.rx,
          fill: params.accent,
        },
        {
          kind: 'rect',
          id: 'hat-crown',
          x: crown.x,
          y: y(crown.y),
          width: crown.width,
          height: crown.height,
          rx: crown.rx,
          fill: params.accent,
        },
      ];
    }
    case 'scarf': {
      const { band, tail } = accessories.scarf;

      return [
        {
          kind: 'rect',
          id: 'scarf-band',
          x: band.x,
          y: y(band.y),
          width: band.width,
          height: band.height,
          rx: band.rx,
          // Ink, not accent: the torso is accent and the scarf would vanish.
          fill: params.ink,
        },
        {
          kind: 'rect',
          id: 'scarf-tail',
          x: tail.x,
          y: y(tail.y),
          width: tail.width,
          height: tail.height,
          rx: tail.rx,
          fill: params.ink,
        },
      ];
    }
  }
}

/** Accessory → the base part it must be drawn after (blueprint z-zones). */
const ACCESSORY_AFTER: Readonly<Record<CartoonCharacterAccessory, string>> = {
  glasses: 'mouth',
  hat: 'hair',
  scarf: 'neck',
};

function insertAccessories(
  shapes: CharacterShape[],
  params: CartoonCharacterParams,
  y: (value: number) => number,
): void {
  for (const accessory of params.accessories) {
    const anchor = ACCESSORY_AFTER[accessory];
    const index = shapes.findIndex((shape) => shape.id === anchor);

    if (index < 0) {
      throw new Error(
        `Character accessory "${accessory}" needs base part "${anchor}"`,
      );
    }

    shapes.splice(index + 1, 0, ...accessoryShapes(accessory, params, y));
  }
}

function mouthShape(
  mouth: CharacterMouthGeometry,
  ink: string,
  y: (value: number) => number,
): CharacterShape {  if (mouth.kind === 'ellipse') {
    return {
      kind: 'ellipse',
      id: 'mouth',
      cx: mouth.cx,
      cy: y(mouth.cy),
      rx: mouth.rx,
      ry: mouth.ry,
      fill: ink,
    };
  }

  return {
    kind: 'path',
    id: 'mouth',
    d: curvePathData(mouth.path, y),
    stroke: ink,
    strokeWidth: mouth.strokeWidth,
    fill: null,
  };
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
  const { head, ear, neck, torso, hair } = BLUEPRINT.body;
  const { arms, face } = BLUEPRINT;
  const leftShoulder: Point = {
    x: arms.shoulderLeft.x,
    y: y(arms.shoulderLeft.y),
  };
  const rightShoulder: Point = {
    x: arms.shoulderRight.x,
    y: y(arms.shoulderRight.y),
  };
  const leftHand = rotateAround(
    { x: arms.idleHandLeft.x, y: y(arms.idleHandLeft.y) },
    leftShoulder,
    wave ? arms.waveLeftAngle : 0,
  );
  const rightHand = wave
    ? rotateAround(
        { x: arms.waveHandRight.x, y: y(arms.waveHandRight.y) },
        rightShoulder,
        wavePhase,
      )
    : params.pose === 'point'
      ? { x: arms.pointHandRight.x, y: y(arms.pointHandRight.y) }
      : { x: arms.idleHandRight.x, y: y(arms.idleHandRight.y) };

  const arm = (
    id: string,
    from: Point,
    to: Point,
  ): Extract<CharacterShape, { kind: 'path' }> => ({
    kind: 'path',
    id,
    d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    stroke: params.accent,
    strokeWidth: arms.strokeWidth,
    fill: null,
  });

  const browY = y(emotions.browY);

  const shapes: CharacterShape[] = [
    arm('arm-left', leftShoulder, leftHand),
    arm('arm-right', rightShoulder, rightHand),
    {
      kind: 'circle',
      id: 'hand-left',
      cx: leftHand.x,
      cy: leftHand.y,
      r: arms.handRadius,
      fill: params.skin,
    },
    {
      kind: 'circle',
      id: 'hand-right',
      cx: rightHand.x,
      cy: rightHand.y,
      r: arms.handRadius,
      fill: params.skin,
    },
    {
      kind: 'rect',
      id: 'torso',
      x: torso.x,
      y: y(torso.y),
      width: torso.width,
      height: torso.height,
      rx: torso.rx,
      fill: params.accent,
    },
    {
      kind: 'rect',
      id: 'neck',
      x: neck.x,
      y: y(neck.y),
      width: neck.width,
      height: neck.height,
      rx: neck.rx,
      fill: params.skin,
    },
    {
      kind: 'circle',
      id: 'ear-left',
      cx: head.cx - ear.offsetX,
      cy: y(ear.cy),
      r: ear.r,
      fill: params.skin,
    },
    {
      kind: 'circle',
      id: 'ear-right',
      cx: head.cx + ear.offsetX,
      cy: y(ear.cy),
      r: ear.r,
      fill: params.skin,
    },
    {
      kind: 'ellipse',
      id: 'head',
      cx: head.cx,
      cy: y(head.cy),
      rx: head.rx,
      ry: head.ry,
      fill: params.skin,
    },
    {
      kind: 'path',
      id: 'hair',
      d: curvePathData(hair, y),
      stroke: null,
      strokeWidth: 0,
      fill: params.hair,
    },
    {
      kind: 'ellipse',
      id: 'eye-left',
      cx: face.eye.leftX,
      cy: y(face.eye.cy),
      rx: face.eye.rx,
      ry: emotions.eyeRy,
      fill: '#FFFFFF',
    },
    {
      kind: 'ellipse',
      id: 'eye-right',
      cx: face.eye.rightX,
      cy: y(face.eye.cy),
      rx: face.eye.rx,
      ry: emotions.eyeRy,
      fill: '#FFFFFF',
    },
    {
      kind: 'circle',
      id: 'pupil-left',
      cx: face.eye.leftX,
      cy: y(face.eye.cy + emotions.pupilDy),
      r: face.eye.pupilRadius,
      fill: params.ink,
    },
    {
      kind: 'circle',
      id: 'pupil-right',
      cx: face.eye.rightX,
      cy: y(face.eye.cy + emotions.pupilDy),
      r: face.eye.pupilRadius,
      fill: params.ink,
    },
    {
      kind: 'rect',
      id: 'brow-left',
      x: face.brow.leftX,
      y: browY,
      width: face.brow.width,
      height: face.brow.height,
      rx: face.brow.rx,
      fill: params.ink,
      rotation: {
        angle: emotions.browTilt,
        cx: face.brow.leftX + face.brow.pivotInsetX,
        cy: browY + face.brow.pivotOffsetY,
      },
    },
    {
      kind: 'rect',
      id: 'brow-right',
      x: face.brow.rightX,
      y: browY,
      width: face.brow.width,
      height: face.brow.height,
      rx: face.brow.rx,
      fill: params.ink,
      rotation: {
        angle: -emotions.browTilt,
        cx: face.brow.rightX + face.brow.pivotInsetX,
        cy: browY + face.brow.pivotOffsetY,
      },
    },
    // Legacy geometry: the mouth has never followed the breathing offset.
    // M3.6b.8 is a pixel-identical refactor, so it keeps the accepted frames.
    mouthShape(face.mouths[emotions.mouth], params.ink, (value) => value),
  ];

  insertAccessories(shapes, params, y);

  return shapes;
}
