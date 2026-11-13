import { z } from 'zod';
import { jsonObjectSchema, type JsonObject, type JsonValue } from './json.js';
import type { ComponentParamDiagnostic } from './storyboard.components.js';
import type {
  SceneCameraMovement,
  SceneCameraShot,
  StoryboardComponentId,
} from './storyboard.js';

/**
 * Scene recipe catalog — data, not layouts and not per-topic code.
 *
 * A recipe explains an idea (required/optional slots, camera hint, allowed
 * layers); a variant decides which implemented background and which layer plan
 * express it. The resolved renderer value lives in `apps/render-worker`; see
 * ADR-0016.
 */
export const STORYBOARD_RECIPE_IDS = [
  'hook-hero',
  'fact-object',
  'comparison',
  'process',
  'cta',
] as const;
export type StoryboardRecipeId = (typeof STORYBOARD_RECIPE_IDS)[number];

/** Curated local starter pack. Files live under `apps/render-worker/public/`. */
export const STARTER_ASSET_KEYS = [
  'dog-snout',
  'water-drop',
  'thermometer',
  'scent-wave',
  'brick',
  'brick-wall',
  'house',
  'flame',
  'shield',
  'key-switch',
  'clock',
  'lightning',
] as const;
export type StarterAssetKey = (typeof STARTER_ASSET_KEYS)[number];

export const starterAssetKeySchema = z.enum(STARTER_ASSET_KEYS);

export interface StarterAssetCatalogEntry {
  /** Relative to `apps/render-worker/public/`. */
  readonly path: string;
  readonly tags: readonly string[];
  /** Every starter icon is authored for this repo: no third-party licence. */
  readonly license: 'authored';
}

export const STARTER_ASSET_CATALOG: Readonly<
  Record<StarterAssetKey, StarterAssetCatalogEntry>
> = {
  'dog-snout': {
    path: 'assets/starter/dog-snout.svg',
    tags: ['animal', 'dog', 'nose', 'wet-nose'],
    license: 'authored',
  },
  'water-drop': {
    path: 'assets/starter/water-drop.svg',
    tags: ['water', 'moisture', 'drop', 'liquid'],
    license: 'authored',
  },
  thermometer: {
    path: 'assets/starter/thermometer.svg',
    tags: ['temperature', 'cold', 'heat', 'measure'],
    license: 'authored',
  },
  'scent-wave': {
    path: 'assets/starter/scent-wave.svg',
    tags: ['smell', 'scent', 'wave', 'air'],
    license: 'authored',
  },
  brick: {
    path: 'assets/starter/brick.svg',
    tags: ['brick', 'material', 'building', 'clay'],
    license: 'authored',
  },
  'brick-wall': {
    path: 'assets/starter/brick-wall.svg',
    tags: ['brick', 'wall', 'masonry', 'house'],
    license: 'authored',
  },
  house: {
    path: 'assets/starter/house.svg',
    tags: ['house', 'building', 'home', 'brick'],
    license: 'authored',
  },
  flame: {
    path: 'assets/starter/flame.svg',
    tags: ['fire', 'heat', 'flame', 'danger'],
    license: 'authored',
  },
  shield: {
    path: 'assets/starter/shield.svg',
    tags: ['safety', 'shield', 'protection', 'durability'],
    license: 'authored',
  },
  'key-switch': {
    path: 'assets/starter/key-switch.svg',
    tags: ['key', 'action', 'unlock', 'switch'],
    license: 'authored',
  },
  clock: {
    path: 'assets/starter/clock.svg',
    tags: ['time', 'clock', 'duration', 'process'],
    license: 'authored',
  },
  lightning: {
    path: 'assets/starter/lightning.svg',
    tags: ['energy', 'power', 'fast', 'electricity'],
    license: 'authored',
  },
};

export function isStarterAssetKey(value: string): value is StarterAssetKey {
  return (STARTER_ASSET_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export const RECIPE_SLOT_KINDS = ['text', 'steps', 'subject', 'metric'] as const;
export type RecipeSlotKind = (typeof RECIPE_SLOT_KINDS)[number];

export interface RecipeStep {
  readonly label: string;
  readonly detail: string | null;
}

/**
 * Prefix for provider-generated subject keys (`subject/wifi-router`). A key
 * outside the curated Tier 0 pack is legal only together with `fallbackIcon`
 * and `prompt`, so a failed generation cannot leave a scene with no asset
 * (ADR-0016 D13).
 */
export const GENERATED_SUBJECT_KEY_PREFIX = 'subject/';

export interface RecipeSubject {
  /** Tier 0 key (`brick-wall`) or a generated key (`subject/wifi-router`). */
  readonly assetKey: string;
  /** Tier 0 fallback; mandatory when `assetKey` is generated. */
  readonly fallbackIcon: StarterAssetKey | null;
  /** Russian provider prompt; mandatory when `assetKey` is generated. */
  readonly prompt: string | null;
}

/**
 * Phrases that turn a flat front view into a perspective drawing. The provider
 * obeys the object description over the style line, so the prompt is cleaned
 * before it reaches an adapter (M3.6b.5 follow-up).
 */
const PERSPECTIVE_PHRASES: readonly RegExp[] = [
  /сверху[\s-]*сбоку/gi,
  /три[\s-]*четверти/gi,
  /изометр[а-яё]*/gi,
  /3\s*[dд]/gi,
  /объ[её]м[а-яё]*/gi,
  /под\s+углом/gi,
  /сверху/gi,
  /ракурс[а-яё]*/gi,
  /перспектив[а-яё]*/gi,
  /наклон[а-яё]*/gi,
];

const ALLOWED_VIEW = /(спереди|сбоку|анфас|в\s+профиль)/i;

const FLAT_PROJECTION = 'плоская 2D-проекция без перспективы и верхней грани';

/**
 * Force a flat projection: drop perspective words, keep an explicit front/side
 * view when the author wrote one, and always state the flat constraint last.
 * Applied once at the resolver boundary; the result is not re-sanitized.
 */
export function sanitizeSubjectPrompt(prompt: string): string {
  let cleaned = prompt;

  for (const pattern of PERSPECTIVE_PHRASES) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  cleaned = cleaned
    .replace(/(^|[\s,])вид\s*(?=,|$)/gi, '$1')
    .replace(/\s*-\s*(?=,|$)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  const withView =
    cleaned.length === 0
      ? 'вид спереди'
      : ALLOWED_VIEW.test(cleaned)
        ? cleaned
        : `вид спереди, ${cleaned}`;

  return `${withView.slice(0, 1800)}, ${FLAT_PROJECTION}`;
}

export interface RecipeMetric {
  readonly label: string;
  readonly value: string;
  /** Relative bar length, 0..1. */
  readonly fraction: number;
}

export type RecipeSlotValue =
  | string
  | readonly RecipeStep[]
  | RecipeSubject
  | RecipeMetric
  | null;

export type RecipeSlots = Readonly<Record<string, RecipeSlotValue>>;

const recipeTextSlotSchema = z.string().min(1).max(200);

const recipeStepSchema = z.object({
  label: z.string().min(1).max(80),
  detail: z.string().min(1).max(80).nullable().default(null),
});

const recipeStepsSlotSchema = z.array(recipeStepSchema).min(2).max(4);

const recipeSubjectSlotSchema = z.object({
  assetKey: z.string().min(1).max(200),
  fallbackIcon: starterAssetKeySchema.nullable().default(null),
  prompt: z.string().min(1).max(2000).nullable().default(null),
});

const recipeMetricSlotSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(24),
  fraction: z.number().finite().min(0).max(1),
});

type RecipeSlotSchema =
  | typeof recipeTextSlotSchema
  | typeof recipeStepsSlotSchema
  | typeof recipeSubjectSlotSchema
  | typeof recipeMetricSlotSchema;

export interface RecipeSlotSpec {
  readonly name: string;
  readonly kind: RecipeSlotKind;
  readonly required: boolean;
  /** Applied for an absent optional slot. Required slots always use `null`. */
  readonly defaultValue: RecipeSlotValue;
  readonly schema: RecipeSlotSchema;
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export const RECIPE_LAYER_KINDS = [
  'text',
  'pill',
  'hud-chip',
  'subject',
  'image',
  'chart',
  'particles',
  'light',
  'overlay',
  'character',
] as const;
export type RecipeLayerKind = (typeof RECIPE_LAYER_KINDS)[number];

export const RECIPE_CHART_KINDS = [
  'comparison-bars',
  'process-steps',
] as const;
export type RecipeChartKind = (typeof RECIPE_CHART_KINDS)[number];

export const RECIPE_LAYER_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'upper-center',
  'center',
  'lower-center',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type RecipeLayerAnchor = (typeof RECIPE_LAYER_ANCHORS)[number];

export const RECIPE_LAYER_SIZES = ['sm', 'md', 'lg', 'hero'] as const;
export type RecipeLayerSize = (typeof RECIPE_LAYER_SIZES)[number];

export const RECIPE_LAYER_TONES = [
  'text',
  'accent',
  'cold',
  'danger',
] as const;
export type RecipeLayerTone = (typeof RECIPE_LAYER_TONES)[number];

export interface RecipeLayerLayout {
  readonly anchor: RecipeLayerAnchor;
  readonly size: RecipeLayerSize;
  readonly tone: RecipeLayerTone;
}

export interface RecipeLayerTemplate {
  readonly id: string;
  readonly kind: RecipeLayerKind;
  /** Slot that supplies text content or a subject object. */
  readonly slot: string | null;
  /** Static content for non-slot layers (`snow`, `lamp`, `car`, …). */
  readonly content: string | null;
  readonly chart: RecipeChartKind | null;
  /** Chart item slot bindings (`left`, `right` for bars; `steps` for steps). */
  readonly chartSlots: Readonly<Record<string, string>>;
  readonly layout: RecipeLayerLayout;
  /** Clip-local window as fractions of the scene duration, 0..1. */
  readonly from: number;
  readonly to: number;
}

export interface RecipeVariant {
  readonly id: string;
  readonly label: string;
  readonly background: {
    readonly componentId: StoryboardComponentId;
    readonly params: JsonObject;
  };
  /** Director hint only: the rendered camera comes from `scene.camera`. */
  readonly cameraHint: {
    readonly shot: SceneCameraShot;
    readonly movement: SceneCameraMovement;
    readonly speed: number;
  };
  readonly layers: readonly RecipeLayerTemplate[];
}

export interface StoryboardRecipe {
  readonly id: StoryboardRecipeId;
  readonly purpose: string;
  readonly requiredSlots: readonly string[];
  readonly optionalSlots: readonly string[];
  readonly slotSpecs: readonly RecipeSlotSpec[];
  readonly allowedLayers: readonly RecipeLayerKind[];
  readonly variants: readonly RecipeVariant[];
}

// ---------------------------------------------------------------------------
// Catalog data
// ---------------------------------------------------------------------------

const TEXT = recipeTextSlotSchema;

function textSlot(
  name: string,
  required: boolean,
  defaultValue: string | null = null,
): RecipeSlotSpec {
  return {
    name,
    kind: 'text',
    required,
    defaultValue,
    schema: TEXT,
  };
}

function subjectSlot(
  name: string,
  required: boolean,
): RecipeSlotSpec {
  return {
    name,
    kind: 'subject',
    required,
    defaultValue: null,
    schema: recipeSubjectSlotSchema,
  };
}

function stepsSlot(name: string): RecipeSlotSpec {
  return {
    name,
    kind: 'steps',
    required: true,
    defaultValue: null,
    schema: recipeStepsSlotSchema,
  };
}

function metricSlot(name: string): RecipeSlotSpec {
  return {
    name,
    kind: 'metric',
    required: true,
    defaultValue: null,
    schema: recipeMetricSlotSchema,
  };
}

function textLayer(
  id: string,
  slot: string,
  anchor: RecipeLayerAnchor,
  size: RecipeLayerSize,
  tone: RecipeLayerTone,
  from = 0.02,
  to = 1,
): RecipeLayerTemplate {
  return {
    id,
    kind: 'text',
    slot,
    content: null,
    chart: null,
    chartSlots: {},
    layout: { anchor, size, tone },
    from,
    to,
  };
}

function pillLayer(
  id: string,
  slot: string,
  anchor: RecipeLayerAnchor,
  size: RecipeLayerSize,
  tone: RecipeLayerTone,
  from = 0.1,
  to = 1,
): RecipeLayerTemplate {
  return {
    id,
    kind: 'pill',
    slot,
    content: null,
    chart: null,
    chartSlots: {},
    layout: { anchor, size, tone },
    from,
    to,
  };
}

function chipLayer(
  id: string,
  slot: string,
  anchor: RecipeLayerAnchor,
  tone: RecipeLayerTone = 'cold',
  from = 0.08,
  to = 1,
): RecipeLayerTemplate {
  return {
    id,
    kind: 'hud-chip',
    slot,
    content: null,
    chart: null,
    chartSlots: {},
    layout: { anchor, size: 'sm', tone },
    from,
    to,
  };
}

function subjectLayer(
  id: string,
  slot: string,
  anchor: RecipeLayerAnchor,
  size: RecipeLayerSize,
  from = 0.12,
  to = 1,
): RecipeLayerTemplate {
  return {
    id,
    kind: 'subject',
    slot,
    content: null,
    chart: null,
    chartSlots: {},
    layout: { anchor, size, tone: 'text' },
    from,
    to,
  };
}

function chartLayer(
  id: string,
  chart: RecipeChartKind,
  chartSlots: Readonly<Record<string, string>>,
  anchor: RecipeLayerAnchor,
  size: RecipeLayerSize,
  tone: RecipeLayerTone,
  from = 0.12,
  to = 1,
): RecipeLayerTemplate {
  return {
    id,
    kind: 'chart',
    slot: null,
    content: null,
    chart,
    chartSlots,
    layout: { anchor, size, tone },
    from,
    to,
  };
}

const HOOK_LAYERS: readonly RecipeLayerKind[] = [
  'text',
  'pill',
  'hud-chip',
  'subject',
  'particles',
  'light',
];
const FACT_LAYERS: readonly RecipeLayerKind[] = [
  'text',
  'pill',
  'hud-chip',
  'subject',
  'image',
  'particles',
  'light',
  'overlay',
];
const COMPARISON_LAYERS: readonly RecipeLayerKind[] = [
  'text',
  'pill',
  'hud-chip',
  'subject',
  'chart',
];
const PROCESS_LAYERS: readonly RecipeLayerKind[] = [
  'text',
  'pill',
  'hud-chip',
  'subject',
  'chart',
  'particles',
];
const CTA_LAYERS: readonly RecipeLayerKind[] = [
  'text',
  'pill',
  'hud-chip',
  'subject',
  'particles',
  'light',
  'overlay',
];

export const STORYBOARD_RECIPES: readonly StoryboardRecipe[] = [
  {
    id: 'hook-hero',
    purpose:
      'Open with a question or a promise: one dominant subject or headline that earns the next five seconds.',
    requiredSlots: ['title'],
    optionalSlots: ['kicker', 'highlight', 'subject'],
    slotSpecs: [
      textSlot('title', true),
      textSlot('kicker', false),
      textSlot('highlight', false),
      subjectSlot('subject', false),
    ],
    allowedLayers: HOOK_LAYERS,
    variants: [
      {
        id: 'subject-lead',
        label: 'Subject leads, headline anchors the top',
        background: {
          componentId: 'parallax-city',
          params: {
            buildingsSeed: 101,
            lamp: 'right',
            snowDensity: 0.25,
            focus: 'skyline',
            roadGlow: true,
          },
        },
        cameraHint: { shot: 'wide', movement: 'pan', speed: 0.18 },
        layers: [
          subjectLayer('hero', 'subject', 'center', 'hero', 0.1),
          textLayer('headline', 'title', 'top-center', 'lg', 'text', 0.02),
          chipLayer('kicker', 'kicker', 'bottom-left'),
          pillLayer('highlight', 'highlight', 'bottom-right', 'md', 'accent', 0.55),
        ],
      },
      {
        id: 'ghost-question',
        label: 'Typographic question with a secondary subject',
        background: {
          componentId: 'kinetic-typography',
          params: {
            preset: 'backdrop',
            align: 'center',
            underline: true,
          },
        },
        cameraHint: { shot: 'medium', movement: 'zoom_in', speed: 0.12 },
        layers: [
          textLayer('question', 'title', 'upper-center', 'hero', 'text', 0.02),
          subjectLayer('hero', 'subject', 'bottom-right', 'lg', 0.22),
          chipLayer('kicker', 'kicker', 'top-left', 'accent'),
          pillLayer('highlight', 'highlight', 'lower-center', 'sm', 'cold', 0.6),
        ],
      },
    ],
  },
  {
    id: 'fact-object',
    purpose:
      'Explain one concrete fact about one concrete object; the subject must be visible, the fact readable.',
    requiredSlots: ['subject', 'fact'],
    optionalSlots: ['caption', 'metric'],
    slotSpecs: [
      subjectSlot('subject', true),
      textSlot('fact', true),
      textSlot('caption', false),
      textSlot('metric', false),
    ],
    allowedLayers: FACT_LAYERS,
    variants: [
      {
        id: 'stage',
        label: 'Subject on a lit stage with a fact pill',
        background: {
          componentId: 'parallax-city',
          params: {
            buildingsSeed: 202,
            lamp: 'center',
            snowDensity: 0,
            focus: 'street',
            roadGlow: false,
          },
        },
        cameraHint: { shot: 'medium', movement: 'dolly', speed: 0.16 },
        layers: [
          subjectLayer('object', 'subject', 'center', 'hero', 0.08),
          pillLayer('fact', 'fact', 'bottom-center', 'lg', 'accent', 0.35),
          chipLayer('caption', 'caption', 'top-center'),
          textLayer('metric', 'metric', 'upper-center', 'lg', 'cold', 0.2),
        ],
      },
      {
        id: 'closeup',
        label: 'Close-up subject with a large metric',
        background: {
          componentId: 'kinetic-typography',
          params: {
            preset: 'backdrop',
            align: 'center',
            underline: false,
          },
        },
        cameraHint: { shot: 'close_up', movement: 'zoom_in', speed: 0.22 },
        layers: [
          subjectLayer('object', 'subject', 'center', 'hero', 0.05),
          textLayer('metric', 'metric', 'upper-center', 'hero', 'cold', 0.15),
          textLayer('fact', 'fact', 'lower-center', 'md', 'text', 0.4),
          chipLayer('caption', 'caption', 'bottom-center', 'accent'),
        ],
      },
    ],
  },
  {
    id: 'comparison',
    purpose:
      'Put two measurable values side by side and make the difference obvious without labels baked into assets.',
    requiredSlots: ['left', 'right'],
    optionalSlots: ['title', 'verdict', 'leftSubject', 'rightSubject'],
    slotSpecs: [
      metricSlot('left'),
      metricSlot('right'),
      textSlot('title', false),
      textSlot('verdict', false),
      subjectSlot('leftSubject', false),
      subjectSlot('rightSubject', false),
    ],
    allowedLayers: COMPARISON_LAYERS,
    variants: [
      {
        id: 'bars',
        label: 'Two proportional bars with a verdict pill',
        background: {
          componentId: 'parallax-city',
          params: {
            buildingsSeed: 303,
            lamp: 'left',
            snowDensity: 0,
            focus: 'skyline',
            roadGlow: true,
          },
        },
        cameraHint: { shot: 'medium', movement: 'static', speed: 0 },
        layers: [
          textLayer('title', 'title', 'top-center', 'lg', 'text', 0.02),
          chartLayer(
            'compare',
            'comparison-bars',
            { left: 'left', right: 'right' },
            'center',
            'lg',
            'accent',
            0.1,
          ),
          pillLayer('verdict', 'verdict', 'bottom-center', 'lg', 'danger', 0.55),
        ],
      },
      {
        id: 'duel',
        label: 'Two subject cards facing each other',
        background: {
          componentId: 'kinetic-typography',
          params: {
            preset: 'backdrop',
            align: 'center',
            underline: false,
          },
        },
        cameraHint: { shot: 'wide', movement: 'tilt', speed: 0.1 },
        layers: [
          subjectLayer('left-object', 'leftSubject', 'bottom-left', 'lg', 0.1),
          subjectLayer('right-object', 'rightSubject', 'bottom-right', 'lg', 0.18),
          chartLayer(
            'compare',
            'comparison-bars',
            { left: 'left', right: 'right' },
            'upper-center',
            'md',
            'cold',
            0.08,
          ),
          pillLayer('verdict', 'verdict', 'center', 'md', 'danger', 0.6),
        ],
      },
    ],
  },
  {
    id: 'process',
    purpose:
      'Show a short ordered process: two to four steps, each with a plain-language label and an optional detail.',
    requiredSlots: ['steps'],
    optionalSlots: ['title', 'icon'],
    slotSpecs: [
      stepsSlot('steps'),
      textSlot('title', false),
      subjectSlot('icon', false),
    ],
    allowedLayers: PROCESS_LAYERS,
    variants: [
      {
        id: 'timeline',
        label: 'Horizontal timeline with numbered steps',
        background: {
          componentId: 'kinetic-typography',
          params: {
            preset: 'backdrop',
            align: 'center',
            underline: true,
          },
        },
        cameraHint: { shot: 'medium', movement: 'pan', speed: 0.1 },
        layers: [
          textLayer('title', 'title', 'top-center', 'lg', 'text', 0.02),
          chartLayer(
            'steps',
            'process-steps',
            { steps: 'steps' },
            'center',
            'lg',
            'accent',
            0.08,
          ),
        ],
      },
      {
        id: 'stack',
        label: 'Vertical stack with a supporting icon',
        background: {
          componentId: 'parallax-city',
          params: {
            buildingsSeed: 404,
            lamp: 'right',
            snowDensity: 0,
            focus: 'street',
            roadGlow: false,
          },
        },
        cameraHint: { shot: 'wide', movement: 'dolly', speed: 0.12 },
        layers: [
          subjectLayer('icon', 'icon', 'top-right', 'md', 0.08),
          textLayer('title', 'title', 'top-left', 'md', 'text', 0.02),
          chartLayer(
            'steps',
            'process-steps',
            { steps: 'steps' },
            'lower-center',
            'lg',
            'cold',
            0.12,
          ),
        ],
      },
    ],
  },
  {
    id: 'cta',
    purpose:
      'Close with one action: a short imperative, an optional subtitle and a single visual anchor.',
    requiredSlots: ['action'],
    optionalSlots: ['subtitle', 'subject'],
    slotSpecs: [
      textSlot('action', true),
      textSlot('subtitle', false),
      subjectSlot('subject', false),
    ],
    allowedLayers: CTA_LAYERS,
    variants: [
      {
        id: 'pill-button',
        label: 'Large pill button with a supporting chip',
        background: {
          componentId: 'kinetic-typography',
          params: {
            preset: 'backdrop',
            align: 'center',
            underline: false,
          },
        },
        cameraHint: { shot: 'medium', movement: 'zoom_in', speed: 0.08 },
        layers: [
          pillLayer('action', 'action', 'center', 'hero', 'accent', 0.05),
          chipLayer('subtitle', 'subtitle', 'lower-center', 'text', 0.3),
        ],
      },
      {
        id: 'prop',
        label: 'Subject prop anchors the call to action',
        background: {
          componentId: 'parallax-city',
          params: {
            buildingsSeed: 505,
            lamp: 'center',
            snowDensity: 0.15,
            focus: 'car-silhouette',
            roadGlow: true,
          },
        },
        cameraHint: { shot: 'wide', movement: 'static', speed: 0 },
        layers: [
          subjectLayer('object', 'subject', 'center', 'hero', 0.08),
          pillLayer('action', 'action', 'bottom-center', 'lg', 'accent', 0.25),
          chipLayer('subtitle', 'subtitle', 'top-center', 'cold', 0.15),
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Slot parsing
// ---------------------------------------------------------------------------

export class UnknownSceneRecipeError extends Error {
  constructor(readonly recipeId: string) {
    super(`Unknown scene recipe "${recipeId}"`);
    this.name = 'UnknownSceneRecipeError';
  }
}

export class UnknownRecipeVariantError extends Error {
  constructor(
    readonly recipeId: string,
    readonly variant: string,
  ) {
    super(`Recipe "${recipeId}" has no variant "${variant}"`);
    this.name = 'UnknownRecipeVariantError';
  }
}

export type RecipeSlotFailureReason = 'missing_required' | 'invalid_value';

export class InvalidRecipeSlotError extends Error {
  /** Dotted path inside `slots`, e.g. `subject.assetKey`. */
  readonly path: string;

  constructor(
    readonly recipeId: string,
    readonly slot: string,
    readonly reason: RecipeSlotFailureReason,
    readonly received: JsonValue,
    detail?: string,
  ) {
    const slotPath = detail ?? slot;

    super(`Recipe "${recipeId}" slot "${slot}" is ${reason} at ${slotPath}`);
    this.name = 'InvalidRecipeSlotError';
    this.path = slotPath;
  }
}

export interface ParsedRecipeSlots {
  slots: RecipeSlots;
  diagnostics: ComponentParamDiagnostic[];
}

export function isStoryboardRecipeId(
  value: string,
): value is StoryboardRecipeId {
  return (STORYBOARD_RECIPE_IDS as readonly string[]).includes(value);
}

export function getStoryboardRecipe(
  recipeId: string,
): StoryboardRecipe | null {
  return (
    STORYBOARD_RECIPES.find((recipe) => recipe.id === recipeId) ?? null
  );
}

export function getRecipeVariant(
  recipeId: string,
  variant: string,
): RecipeVariant | null {
  const recipe = getStoryboardRecipe(recipeId);

  return recipe?.variants.find((entry) => entry.id === variant) ?? null;
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAtPath(
  value: JsonValue,
  path: readonly PropertyKey[],
): JsonValue {
  let current: JsonValue = value;

  for (const segment of path) {
    if (typeof segment === 'number' && Array.isArray(current)) {
      current = current[segment] ?? null;
      continue;
    }

    if (typeof segment === 'string' && isJsonObject(current)) {
      current = current[segment] ?? null;
      continue;
    }

    return null;
  }

  return current;
}

function issuePath(
  slot: string,
  path: readonly PropertyKey[],
): string {
  return [slot, ...path.map((segment) => String(segment))].join('.');
}

/**
 * A generated subject key is legal only with a Tier 0 `fallbackIcon` and a
 * provider `prompt`; an unknown starter key stays a contract error, so a typo
 * cannot silently drop the subject and render an empty frame (ADR-0016 D13).
 */
function invalidSubjectAssetPath(
  slot: string,
  value: JsonValue,
): string | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const assetKey = value.assetKey;

  if (typeof assetKey === 'string' && !isStarterAssetKey(assetKey)) {
    if (!assetKey.startsWith(GENERATED_SUBJECT_KEY_PREFIX)) {
      return `${slot}.assetKey`;
    }

    if (
      typeof value.fallbackIcon !== 'string' ||
      !isStarterAssetKey(value.fallbackIcon)
    ) {
      return `${slot}.fallbackIcon`;
    }

    if (typeof value.prompt !== 'string' || value.prompt.trim().length === 0) {
      return `${slot}.prompt`;
    }
  }

  const fallbackIcon = value.fallbackIcon;

  if (
    typeof fallbackIcon === 'string' &&
    !isStarterAssetKey(fallbackIcon)
  ) {
    return `${slot}.fallbackIcon`;
  }

  return null;
}

/**
 * Validate raw slots against the catalog. Semantics mirror
 * `parseComponentParams` (ADR-0016 D3):
 *
 * - absent optional slot → default, no diagnostic;
 * - invalid optional slot → default + `invalid_value` per issue;
 * - unknown slot key → dropped + `unknown_key`;
 * - absent/invalid required slot → `InvalidRecipeSlotError`;
 * - unknown recipe/variant → typed error.
 */
export function parseRecipeSlots(
  recipeId: string,
  variant: string,
  rawSlots: JsonValue | undefined | null,
): ParsedRecipeSlots {
  const recipe = getStoryboardRecipe(recipeId);

  if (recipe === null) {
    throw new UnknownSceneRecipeError(recipeId);
  }

  if (getRecipeVariant(recipeId, variant) === null) {
    throw new UnknownRecipeVariantError(recipeId, variant);
  }

  const source = rawSlots ?? {};
  const diagnostics: ComponentParamDiagnostic[] = [];
  const slots: Record<string, RecipeSlotValue> = {};

  if (!isJsonObject(source)) {
    throw new InvalidRecipeSlotError(
      recipeId,
      '$',
      'invalid_value',
      source as JsonValue,
    );
  }

  for (const spec of recipe.slotSpecs) {
    if (!Object.hasOwn(source, spec.name)) {
      if (spec.required) {
        throw new InvalidRecipeSlotError(
          recipeId,
          spec.name,
          'missing_required',
          null,
        );
      }

      slots[spec.name] = spec.defaultValue;
      continue;
    }

    const received = source[spec.name] as JsonValue;

    if (spec.kind === 'subject') {
      const badAssetPath = invalidSubjectAssetPath(spec.name, received);

      if (badAssetPath !== null) {
        throw new InvalidRecipeSlotError(
          recipeId,
          spec.name,
          'invalid_value',
          received,
          badAssetPath,
        );
      }
    }

    const parsed = spec.schema.safeParse(received);

    if (parsed.success) {
      slots[spec.name] = parsed.data;
      continue;
    }

    if (spec.required) {
      const issue = parsed.error.issues[0];

      throw new InvalidRecipeSlotError(
        recipeId,
        spec.name,
        'invalid_value',
        received,
        issue ? issuePath(spec.name, issue.path) : spec.name,
      );
    }

    slots[spec.name] = spec.defaultValue;

    for (const issue of parsed.error.issues) {
      diagnostics.push({
        path: issuePath(spec.name, issue.path),
        reason: 'invalid_value',
        received: valueAtPath(received, issue.path),
      });
    }
  }

  for (const [key, received] of Object.entries(source)) {
    if (recipe.slotSpecs.some((spec) => spec.name === key)) {
      continue;
    }

    diagnostics.push({ path: key, reason: 'unknown_key', received });
  }

  return { slots, diagnostics };
}

// ---------------------------------------------------------------------------
// Implementation branch
// ---------------------------------------------------------------------------

export const recipeImplementationSchema = z.object({
  type: z.literal('recipe'),
  recipeId: z.enum(STORYBOARD_RECIPE_IDS),
  variant: z.string().min(1).max(80),
  slots: jsonObjectSchema,
});
export type RecipeSceneImplementation = z.infer<
  typeof recipeImplementationSchema
>;
