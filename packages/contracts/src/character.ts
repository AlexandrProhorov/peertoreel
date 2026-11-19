import { z } from 'zod';
import type { ScenePart } from './scene-part.js';

/**
 * Procedural presenter blueprint (M3.6b.8).
 *
 * Single source of truth for the character's geometry: canvas, part
 * primitives, anchors, bounds and z-zone insertion points. The renderer only
 * maps a blueprint to SVG shapes and adds motion/expression; it must not
 * invent coordinates (ADR-0015: geometry is code, never a prompt).
 *
 * Frontal view only. Profile and three-quarter views are a separate slice and
 * must not be pre-declared here "for later".
 */

export const CHARACTER_BLUEPRINT_VERSION = 'v1';

/**
 * Presenter contract enums. They live in this leaf module so both the
 * component params (storyboard.components) and recipe slots can import them
 * without a module cycle.
 */
export const CARTOON_CHARACTER_EMOTIONS = [
  'neutral',
  'happy',
  'surprised',
  'angry',
  'sad',
] as const;
export const CARTOON_CHARACTER_POSES = ['idle', 'wave', 'point'] as const;
export const CARTOON_CHARACTER_ANCHORS = ['left', 'center', 'right'] as const;
export const CARTOON_CHARACTER_ACCESSORIES = [
  'glasses',
  'scarf',
  'hat',
] as const;
export type CartoonCharacterAccessory =
  (typeof CARTOON_CHARACTER_ACCESSORIES)[number];
export type CartoonCharacterEmotion =
  (typeof CARTOON_CHARACTER_EMOTIONS)[number];
export type CartoonCharacterPose = (typeof CARTOON_CHARACTER_POSES)[number];

/**
 * One list and one rule for both the slot and the semantic plan (M3.6b.7.4):
 * duplicates are rejected at the schema boundary, not deduplicated silently.
 */
export const characterAccessoriesSchema = z
  .array(z.enum(CARTOON_CHARACTER_ACCESSORIES))
  .max(CARTOON_CHARACTER_ACCESSORIES.length)
  .default([])
  .refine(
    (items) => new Set(items).size === items.length,
    'Accessories must not repeat',
  );

export const CHARACTER_VIEWS = ['front'] as const;
export type CharacterView = (typeof CHARACTER_VIEWS)[number];

export const CHARACTER_CANVAS = { width: 400, height: 700 } as const;

export interface CharacterPoint {
  readonly x: number;
  readonly y: number;
}

export interface CharacterBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CharacterEllipse {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface CharacterRoundedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx: number;
}

/** One quadratic segment: control point and end point. */
export interface CharacterQuadraticCurve {
  readonly control: CharacterPoint;
  readonly to: CharacterPoint;
}

export interface CharacterCurvePath {
  readonly start: CharacterPoint;
  readonly curves: readonly CharacterQuadraticCurve[];
  /** Hair is a closed silhouette; face strokes stay open. */
  readonly closed?: boolean;
}

export const CHARACTER_MOUTH_KINDS = [
  'smile',
  'big-smile',
  'open',
  'frown',
  'small-frown',
] as const;
export type CharacterMouthKind = (typeof CHARACTER_MOUTH_KINDS)[number];

export type CharacterMouthGeometry =
  | ({ readonly kind: 'ellipse' } & CharacterEllipse)
  | {
      readonly kind: 'path';
      readonly path: CharacterCurvePath;
      readonly strokeWidth: number;
    };

export const CHARACTER_ANCHOR_IDS = [
  'head-top',
  'head-left',
  'head-right',
  'face-center',
  'eye-left',
  'eye-right',
  'mouth',
  'neck',
  'torso-front',
  'torso-back',
  'shoulder-left',
  'shoulder-right',
  'hand-idle-left',
  'hand-idle-right',
] as const;
export type CharacterAnchorId = (typeof CHARACTER_ANCHOR_IDS)[number];

export const CHARACTER_BOUNDS_IDS = [
  'head',
  'neck',
  'torso',
  'shoulders',
  'hand-left',
  'hand-right',
] as const;
export type CharacterBoundsId = (typeof CHARACTER_BOUNDS_IDS)[number];

/** Drawable body groups, back to front (`drawOrder` fixes the sequence). */
export const CHARACTER_PART_IDS = [
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
] as const;
export type CharacterPartId = (typeof CHARACTER_PART_IDS)[number];

/**
 * Z-zones for add-on layers (accessories in M3.6b.7.3, semantic parts in
 * M3.6b.7.4). A zone names the base part it is drawn *after*; `null` means
 * "behind everything". Base parts keep their own order in `drawOrder`.
 */
export const CHARACTER_LAYER_IDS = [
  'behind-body',
  'behind-head',
  'over-body',
  'over-hair',
  'above-face',
] as const;
export type CharacterLayerId = (typeof CHARACTER_LAYER_IDS)[number];

export interface CharacterLayerZone {
  readonly id: CharacterLayerId;
  readonly insertAfter: CharacterPartId | null;
}

export interface CharacterFace {
  readonly eye: {
    readonly leftX: number;
    readonly rightX: number;
    readonly cy: number;
    readonly rx: number;
    readonly pupilRadius: number;
  };
  readonly brow: {
    readonly leftX: number;
    readonly rightX: number;
    readonly width: number;
    readonly height: number;
    readonly rx: number;
    /** Distance from the brow's left edge to its rotation pivot. */
    readonly pivotInsetX: number;
    /** Pivot sits this far below the brow's top edge. */
    readonly pivotOffsetY: number;
  };
  readonly mouths: Readonly<Record<CharacterMouthKind, CharacterMouthGeometry>>;
}

export interface CharacterBody {
  readonly head: CharacterEllipse;
  readonly ear: {
    /** Horizontal distance from the head axis to each ear centre. */
    readonly offsetX: number;
    readonly cy: number;
    readonly r: number;
  };
  readonly hair: CharacterCurvePath;
  readonly neck: CharacterRoundedRect;
  readonly torso: CharacterRoundedRect;
}

export interface CharacterArms {
  readonly strokeWidth: number;
  readonly handRadius: number;
  readonly shoulderLeft: CharacterPoint;
  readonly shoulderRight: CharacterPoint;
  readonly idleHandLeft: CharacterPoint;
  readonly idleHandRight: CharacterPoint;
  /** Unrotated wave hand position; the renderer rotates it around the shoulder. */
  readonly waveHandRight: CharacterPoint;
  /** Pointing hand: straight out to the side at shoulder height (M3.6b.7.3). */
  readonly pointHandRight: CharacterPoint;
  /** Left-hand tilt applied in the wave pose (radians). */
  readonly waveLeftAngle: number;
}

/**
 * Accessory geometry (M3.6b.7.3). Shapes are placed by the renderer into the
 * blueprint's z-zones; the numbers live here so a rig edit cannot leave a hat
 * floating over the old head.
 */
export interface CharacterAccessoryGeometry {
  readonly glasses: {
    /** Lens radius around each `eye-*` anchor. */
    readonly lensRadius: number;
    readonly strokeWidth: number;
    readonly bridgeFromX: number;
    readonly bridgeToX: number;
    readonly bridgeY: number;
  };
  readonly hat: {
    readonly brim: CharacterRoundedRect;
    readonly crown: CharacterRoundedRect;
  };
  readonly scarf: {
    readonly band: CharacterRoundedRect;
    readonly tail: CharacterRoundedRect;
  };
}

export interface CharacterBlueprint {
  readonly version: string;
  readonly view: CharacterView;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly body: CharacterBody;
  readonly arms: CharacterArms;
  readonly face: CharacterFace;
  readonly accessories: CharacterAccessoryGeometry;
  readonly anchors: Readonly<Record<CharacterAnchorId, CharacterPoint>>;
  readonly bounds: Readonly<Record<CharacterBoundsId, CharacterBounds>>;
  readonly drawOrder: readonly CharacterPartId[];
  readonly layers: readonly CharacterLayerZone[];
}

const head: CharacterEllipse = { cx: 200, cy: 250, rx: 108, ry: 122 };
const ear = { offsetX: 104, cy: 252, r: 18 };
const neck: CharacterRoundedRect = {
  x: 180,
  y: 346,
  width: 40,
  height: 60,
  rx: 16,
};
const torso: CharacterRoundedRect = {
  x: 110,
  y: 398,
  width: 180,
  height: 252,
  rx: 70,
};
const arms: CharacterArms = {
  strokeWidth: 42,
  handRadius: 22,
  shoulderLeft: { x: 120, y: 440 },
  shoulderRight: { x: 280, y: 440 },
  idleHandLeft: { x: 106, y: 586 },
  idleHandRight: { x: 294, y: 586 },
  waveHandRight: { x: 372, y: 364 },
  pointHandRight: { x: 376, y: 432 },
  waveLeftAngle: -0.05,
};
const face: CharacterFace = {
  eye: { leftX: 160, rightX: 240, cy: 244, rx: 22, pupilRadius: 9 },
  brow: {
    leftX: 132,
    rightX: 220,
    width: 48,
    height: 11,
    rx: 5,
    pivotInsetX: 24,
    pivotOffsetY: 5,
  },
  mouths: {
    smile: {
      kind: 'path',
      path: {
        start: { x: 178, y: 312 },
        curves: [{ control: { x: 200, y: 324 }, to: { x: 222, y: 312 } }],
      },
      strokeWidth: 6,
    },
    'big-smile': {
      kind: 'path',
      path: {
        start: { x: 164, y: 304 },
        curves: [{ control: { x: 200, y: 350 }, to: { x: 236, y: 304 } }],
      },
      strokeWidth: 7,
    },
    open: { kind: 'ellipse', cx: 200, cy: 314, rx: 14, ry: 19 },
    frown: {
      kind: 'path',
      path: {
        start: { x: 176, y: 326 },
        curves: [{ control: { x: 200, y: 304 }, to: { x: 224, y: 326 } }],
      },
      strokeWidth: 7,
    },
    'small-frown': {
      kind: 'path',
      path: {
        start: { x: 182, y: 322 },
        curves: [{ control: { x: 200, y: 310 }, to: { x: 218, y: 322 } }],
      },
      strokeWidth: 6,
    },
  },
};

const accessories: CharacterAccessoryGeometry = {
  glasses: {
    lensRadius: 30,
    strokeWidth: 5,
    bridgeFromX: 190,
    bridgeToX: 210,
    bridgeY: 244,
  },
  hat: {
    brim: { x: 96, y: 112, width: 208, height: 18, rx: 9 },
    crown: { x: 136, y: 62, width: 128, height: 54, rx: 16 },
  },
  scarf: {
    band: { x: 150, y: 372, width: 100, height: 24, rx: 12 },
    tail: { x: 214, y: 394, width: 26, height: 84, rx: 12 },
  },
};

function handBounds(center: CharacterPoint): CharacterBounds {  const size = arms.handRadius * 2;

  return {
    x: center.x - arms.handRadius,
    y: center.y - arms.handRadius,
    width: size,
    height: size,
  };
}

/**
 * Front-facing host rig. Anchors and bounds are derived from the same part
 * primitives, so a geometry edit cannot leave a stale anchor behind.
 */
export const CARTOON_CHARACTER_BLUEPRINT: CharacterBlueprint = {
  version: CHARACTER_BLUEPRINT_VERSION,
  view: 'front',
  canvas: CHARACTER_CANVAS,
  body: {
    head,
    ear,
    hair: {
      start: { x: 92, y: 238 },
      closed: true,
      curves: [
        { control: { x: 92, y: 124 }, to: { x: 200, y: 118 } },
        { control: { x: 308, y: 124 }, to: { x: 308, y: 238 } },
        { control: { x: 292, y: 178 }, to: { x: 200, y: 174 } },
        { control: { x: 108, y: 178 }, to: { x: 92, y: 238 } },
      ],
    },
    neck,
    torso,
  },
  arms,
  face,
  accessories,
  anchors: {
    'head-top': { x: head.cx, y: head.cy - head.ry },
    'head-left': { x: head.cx - head.rx, y: head.cy },
    'head-right': { x: head.cx + head.rx, y: head.cy },
    'face-center': { x: head.cx, y: head.cy },
    'eye-left': { x: face.eye.leftX, y: face.eye.cy },
    'eye-right': { x: face.eye.rightX, y: face.eye.cy },
    mouth: { x: head.cx, y: 314 },
    neck: { x: neck.x + neck.width / 2, y: neck.y + neck.height / 2 },
    'torso-front': { x: torso.x + torso.width / 2, y: torso.y + 52 },
    'torso-back': { x: torso.x + torso.width / 2, y: torso.y },
    'shoulder-left': arms.shoulderLeft,
    'shoulder-right': arms.shoulderRight,
    'hand-idle-left': arms.idleHandLeft,
    'hand-idle-right': arms.idleHandRight,
  },
  bounds: {
    head: {
      x: head.cx - head.rx,
      y: head.cy - head.ry,
      width: head.rx * 2,
      height: head.ry * 2,
    },
    neck: {
      x: neck.x,
      y: neck.y,
      width: neck.width,
      height: neck.height,
    },
    torso: {
      x: torso.x,
      y: torso.y,
      width: torso.width,
      height: torso.height,
    },
    shoulders: {
      x: arms.shoulderLeft.x - arms.strokeWidth / 2,
      y: arms.shoulderLeft.y - arms.strokeWidth / 2,
      width: arms.shoulderRight.x - arms.shoulderLeft.x + arms.strokeWidth,
      height: arms.strokeWidth,
    },
    'hand-left': handBounds(arms.idleHandLeft),
    'hand-right': handBounds(arms.idleHandRight),
  },
  drawOrder: [
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
  ],
  layers: [
    { id: 'behind-body', insertAfter: null },
    { id: 'behind-head', insertAfter: 'ears' },
    { id: 'over-body', insertAfter: 'torso' },
    { id: 'over-hair', insertAfter: 'hair' },
    { id: 'above-face', insertAfter: 'mouth' },
  ],
};

// ---------------------------------------------------------------------------
// Semantic layer (M3.6b.7.4)
// ---------------------------------------------------------------------------

/**
 * How the presenter joins the episode. Only `transformation` has a rig today;
 * `standalone_character` is declared so the contract is stable, and the
 * builder rejects it explicitly until the animal rig lands (M3.6b.7.5).
 */
export const CHARACTER_STRATEGIES = [
  'transformation',
  'standalone_character',
] as const;
export type CharacterStrategy = (typeof CHARACTER_STRATEGIES)[number];

export const CHARACTER_ROLES = ['hook', 'explain', 'cta'] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];

/**
 * What the director may say about the presenter. No emotion, pose, anchor,
 * coordinates or part names: the role comes from the validated scene part
 * (`hook`/`beat`/`cta`), never from the model.
 */
export const characterPlanSchema = z.object({
  /** Who the presenter is, in one phrase. */
  entity: z.string().trim().min(1).max(80),
  strategy: z.enum(CHARACTER_STRATEGIES).default('transformation'),
  accessories: characterAccessoriesSchema,
});
export type CharacterPlan = z.infer<typeof characterPlanSchema>;

/**
 * Scene part → role → expression. One table, so `hook` can never render as a
 * happy wave while `cta` renders surprised.
 */
export const CHARACTER_ROLE_EXPRESSION: Readonly<
  Record<
    ScenePart,
    {
      readonly role: CharacterRole;
      readonly emotion: CartoonCharacterEmotion;
      readonly pose: CartoonCharacterPose;
    }
  >
> = {
  hook: { role: 'hook', emotion: 'surprised', pose: 'idle' },
  beat: { role: 'explain', emotion: 'neutral', pose: 'idle' },
  cta: { role: 'cta', emotion: 'happy', pose: 'wave' },
};

/** The only way to obtain a role; the model never supplies one. */
export function characterRoleForPart(part: ScenePart): CharacterRole {
  return CHARACTER_ROLE_EXPRESSION[part].role;
}

/** Slot parameters produced from a plan; structurally a `RecipeCharacter`. */
export type ResolvedCharacterPlan = {
  readonly preset: 'host';
  readonly emotion: CartoonCharacterEmotion;
  readonly pose: CartoonCharacterPose;
  readonly anchor: 'center';
  readonly accessories: CartoonCharacterAccessory[];
};

export class UnsupportedCharacterStrategyError extends Error {
  constructor(readonly strategy: CharacterStrategy) {
    super(
      `Character strategy "${strategy}" is not supported by the renderer yet; ` +
        'only "transformation" has a rig (standalone characters land in M3.6b.7.5)',
    );
    this.name = 'UnsupportedCharacterStrategyError';
  }
}

/**
 * Deterministic plan → slot parameters. `part` is the validated scene part, so
 * the expression is a function of the storyboard, not of model output.
 */
export function resolveCharacterPlan(
  plan: CharacterPlan,
  part: ScenePart,
): ResolvedCharacterPlan {
  if (plan.strategy !== 'transformation') {
    throw new UnsupportedCharacterStrategyError(plan.strategy);
  }

  const expression = CHARACTER_ROLE_EXPRESSION[part];

  return {
    preset: 'host',
    emotion: expression.emotion,
    pose: expression.pose,
    anchor: 'center',
    accessories: [...plan.accessories],
  };
}
