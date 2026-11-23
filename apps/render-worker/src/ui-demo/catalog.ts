/**
 * The contract layer: what the factory really can express, not what a prompt
 * claims it can. Every primitive declares parameters, states, transitions,
 * operations and constraints; every implementation declares the operations it
 * actually performs.
 *
 * A composition is valid only if each of its elements stays inside these
 * contracts. `reuse` is allowed only for implementations that exist in code
 * (verified), never for declared-but-unbuilt ones.
 */

import { MIN_FONT_SCALE } from './typography-rules.js';

export const MAX_ELEMENTS_PER_SCENE = 9;
/** The stage is mandatory, so it never spends a slot of its own. */
export const MAX_CONTENT_ELEMENTS = MAX_ELEMENTS_PER_SCENE - 1;
/** A row of four chips is a normal interface; five means the scene repeats itself. */
export const MAX_INSTANCES_PER_PRIMITIVE = 6;

export type PrimitiveId =
  | 'stage'
  | 'card'
  | 'pill'
  | 'bubble'
  | 'avatar'
  | 'object'
  | 'label'
  | 'thumb'
  | 'track'
  | 'grid'
  | 'line';

export type AffordanceId =
  | 'quoted-prompt'
  | 'input-entry'
  | 'feed-scroll'
  | 'enumeration'
  | 'control-adjust'
  | 'reveal-hidden'
  | 'answer-reveal'
  | 'dialogue'
  | 'social-proof'
  | 'timeline'
  | 'counter'
  | 'grid-fill'
  | 'object-focus'
  | 'emphasis';

export type ParameterType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'color'
  | 'enum'
  | 'asset';

export interface ParameterSpec {
  readonly type: ParameterType;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly (string | number)[];
  readonly maxLength?: number;
}

export interface PrimitiveContract {
  readonly parameters: Readonly<Record<string, ParameterSpec>>;
  readonly states: readonly string[];
  readonly transitions: readonly string[];
  readonly operations: readonly string[];
  /** Every primitive can appear and disappear: lifecycle is not per case. */
  readonly lifecycles: readonly ['appear', 'disappear'];
  /**
   * The primitive draws its own copy. Declared once: every gate that treats
   * text specially reads `TEXT_PRIMITIVES` derived from this flag, so a new
   * text primitive cannot be wired into rendering and forgotten in a gate.
   */
  readonly carriesText?: boolean;
}

const LIFECYCLE: readonly ['appear', 'disappear'] = ['appear', 'disappear'];

export const PRIMITIVES: Readonly<Record<PrimitiveId, PrimitiveContract>> = {
  stage: {
    parameters: {
      background: { type: 'color' },
      grid: { type: 'boolean' },
      vignette: { type: 'boolean' },
    },
    states: ['rest'],
    transitions: ['appear', 'disappear'],
    operations: ['hold'],
    lifecycles: LIFECYCLE,
  },
  card: {
    parameters: {
      background: { type: 'color' },
      radius: { type: 'number', min: 0, max: 48 },
      padding: { type: 'number', min: 0, max: 80 },
      border: { type: 'color' },
      elevation: { type: 'enum', values: ['low', 'high'] },
      shadow: { type: 'enum', values: ['none', 'soft', 'strong'] },
      shadowColor: { type: 'color' },
      /** A caption belongs to the surface: one element, one padding, one slot. */
      text: { type: 'string', maxLength: 80 },
      token: { type: 'enum', values: ['display', 'headline', 'card', 'body', 'bubble', 'selection', 'input', 'caption', 'label', 'name'] },
      fontScale: { type: 'number', min: MIN_FONT_SCALE, max: 1 },
      align: { type: 'enum', values: ['left', 'center', 'right'] },
    },
    states: ['rest', 'highlighted', 'active'],
    transitions: ['appear', 'disappear', 'hold', 'move', 'scale', 'highlight', 'activate'],
    operations: ['reveal', 'move', 'scale'],
    lifecycles: LIFECYCLE,
    carriesText: true,
  },
  pill: {
    parameters: {
      background: { type: 'color' },
      textColor: { type: 'color' },
      /** Semantic ink, the same dictionary as `label`. One name for one idea. */
      tone: { type: 'enum', values: ['ink', 'muted', 'accent', 'surface', 'accent-ink'] },
      radius: { type: 'number', min: 0, max: 999 },
      paddingX: { type: 'number', min: 0, max: 120 },
      paddingY: { type: 'number', min: 0, max: 80 },
      gap: { type: 'number', min: 0, max: 64 },
      shadow: { type: 'enum', values: ['none', 'soft', 'strong'] },
      token: {
        type: 'enum',
        values: ['display', 'headline', 'card', 'body', 'bubble', 'selection', 'input', 'caption', 'label', 'name'],
      },
      text: { type: 'string', maxLength: 80 },
    },
    states: ['rest', 'active'],
    transitions: ['appear', 'disappear', 'activate', 'type', 'hold'],
    operations: ['reveal', 'move', 'scale', 'type-on'],
    lifecycles: LIFECYCLE,
    carriesText: true,
  },
  bubble: {
    parameters: {
      side: { type: 'enum', values: ['left', 'right'] },
      background: { type: 'color' },
      textColor: { type: 'color' },
      tone: { type: 'enum', values: ['ink', 'muted', 'accent', 'surface', 'accent-ink'] },
      token: {
        type: 'enum',
        values: ['display', 'headline', 'card', 'body', 'bubble', 'selection', 'input', 'caption', 'label', 'name'],
      },
      text: { type: 'string', maxLength: 160 },
    },
    states: ['rest', 'shown', 'active'],
    transitions: ['appear', 'disappear', 'type', 'hold', 'activate'],
    operations: ['reveal', 'type-on', 'move'],
    lifecycles: LIFECYCLE,
    carriesText: true,
  },
  avatar: {
    parameters: {
      asset: { type: 'asset' },
      size: { type: 'number', min: 48, max: 200 },
      ring: { type: 'boolean' },
    },
    states: ['rest'],
    transitions: ['appear', 'disappear'],
    operations: ['reveal', 'move', 'scale', 'rotate'],
    lifecycles: LIFECYCLE,
  },
  object: {
    parameters: {
      asset: { type: 'asset' },
      size: { type: 'number', min: 80, max: 700 },
      rotation: { type: 'number', min: -15, max: 15 },
      shadow: { type: 'boolean' },
    },
    states: ['rest', 'highlighted'],
    transitions: ['appear', 'disappear'],
    operations: ['reveal', 'move', 'scale', 'rotate'],
    lifecycles: LIFECYCLE,
  },
  label: {
    parameters: {
      text: { type: 'string', maxLength: 80 },
      tone: { type: 'enum', values: ['ink', 'muted', 'accent', 'surface', 'accent-ink'] },
      /** Explicit ink, the same dictionary as `pill`/`bubble`. */
      textColor: { type: 'color' },
      token: { type: 'enum', values: ['display', 'headline', 'card', 'body', 'bubble', 'selection', 'input', 'caption', 'label', 'name'] },
      weight: { type: 'enum', values: [400, 500, 600, 700, 800] },
      align: { type: 'enum', values: ['left', 'center', 'right'] },
      /** Multiplier for the token size; the floor is the auto-fit floor. */
      fontScale: { type: 'number', min: MIN_FONT_SCALE, max: 1 },
      /** A marker plate behind the words: accent ink that reads on any theme. */
      mark: { type: 'boolean' },
    },
    states: ['rest', 'active'],
    transitions: ['appear', 'disappear', 'type', 'hold', 'move', 'scale', 'highlight', 'activate'],
    operations: ['reveal', 'type-on', 'move'],
    lifecycles: LIFECYCLE,
    carriesText: true,
  },
  thumb: {
    parameters: {
      size: { type: 'number', min: 12, max: 80 },
      color: { type: 'color' },
      axis: { type: 'enum', values: ['x', 'y'] },
    },
    states: ['rest', 'dragging', 'released'],
    /**
     * A tap carries its target: the cursor travels to it and the target reacts.
     * `grab` stays out — a press with no target and no reaction is a no-op.
     */
    transitions: ['appear', 'disappear', 'tap', 'drag', 'release'],
    operations: ['move', 'scale'],
    lifecycles: LIFECYCLE,
  },
  track: {
    parameters: {
      length: { type: 'number', min: 80, max: 900 },
      thickness: { type: 'number', min: 2, max: 24 },
      color: { type: 'color' },
      fill: { type: 'number', min: 0, max: 1 },
      /** Where the rail snaps in two, as a fraction of its length. */
      breakAt: { type: 'number', min: 0, max: 1 },
    },
    states: ['rest', 'filling', 'broken'],
    transitions: ['appear', 'disappear', 'fill', 'break', 'reset'],
    operations: ['reveal', 'fill', 'move'],
    lifecycles: LIFECYCLE,
  },
  grid: {
    parameters: {
      columns: { type: 'number', min: 2, max: 8 },
      rows: { type: 'number', min: 2, max: 8 },
      gap: { type: 'number', min: 0, max: 40 },
      cell: { type: 'enum', values: ['dot', 'emoji', 'avatar'] },
    },
    states: ['rest', 'filling', 'full'],
    transitions: ['appear', 'disappear', 'fill', 'reset'],
    operations: ['reveal', 'stagger', 'move'],
    lifecycles: LIFECYCLE,
  },
  line: {
    parameters: {
      dashed: { type: 'boolean' },
      color: { type: 'color' },
      width: { type: 'number', min: 1, max: 12 },
      fromX: { type: 'number', min: 0, max: 1080 },
      fromY: { type: 'number', min: 0, max: 1920 },
      toX: { type: 'number', min: 0, max: 1080 },
      toY: { type: 'number', min: 0, max: 1920 },
    },
    states: ['rest', 'drawing', 'broken'],
    transitions: ['appear', 'disappear', 'draw', 'break', 'reset'],
    operations: ['reveal', 'extend'],
    lifecycles: LIFECYCLE,
  },
};

export interface ImplementationContract {
  readonly id: string;
  readonly affordances: readonly AffordanceId[];
  /** Named behaviours from the registry this implementation fully preserves. */
  readonly behaviors: readonly string[];
  readonly parameters: readonly string[];
  readonly operations: readonly string[];
  readonly states: readonly string[];
  readonly transitions: readonly string[];
  readonly maxTextChars?: number;
  readonly maxItems?: number;
  readonly compositionProfile: {
    readonly dominantElement:
      | 'card'
      | 'text'
      | 'bubbles'
      | 'input'
      | 'object'
      | 'grid'
      | 'control'
      | 'stream'
      | 'line';
    readonly density: 'low' | 'medium' | 'high';
  };
}

/**
 * Only implementations that exist in code. Anything else is a request to
 * create, not a reuse: declared capabilities must never count as coverage.
 */
export const IMPLEMENTATIONS: readonly ImplementationContract[] = [
  {
    id: 'prompt-card',
    behaviors: ['appear-fade', 'type-on', 'slide-in', 'scale-in'],
    affordances: ['quoted-prompt', 'emphasis'],
    parameters: ['badge', 'cardText', 'caption'],
    operations: ['reveal', 'type-on', 'move', 'scale'],
    states: ['rest', 'shown'],
    transitions: ['appear', 'type'],
    maxTextChars: 400,
    compositionProfile: { dominantElement: 'card', density: 'medium' },
  },
  {
    id: 'title-stack',
    behaviors: ['appear-fade', 'type-on', 'slide-in', 'scale-in', 'sequence-stagger'],
    affordances: ['emphasis'],
    parameters: ['title', 'subtitle', 'eyebrow', 'align', 'icons', 'vertical', 'centerMark'],
    operations: ['reveal', 'type-on', 'move', 'scale', 'stagger', 'bob'],
    states: ['rest', 'shown'],
    transitions: ['appear', 'type'],
    maxTextChars: 120,
    compositionProfile: { dominantElement: 'text', density: 'low' },
  },
  {
    id: 'text-selection',
    behaviors: ['appear-fade', 'highlight-sweep', 'sequence-stagger'],
    affordances: ['reveal-hidden'],
    parameters: ['title', 'lines', 'selectionLineIndex'],
    operations: ['reveal', 'stagger', 'highlight', 'scale'],
    states: ['rest', 'shown'],
    transitions: ['appear', 'highlight'],
    maxTextChars: 80,
    maxItems: 8,
    compositionProfile: { dominantElement: 'text', density: 'medium' },
  },
  {
    id: 'chat-reconstruction',
    behaviors: ['appear-fade', 'sequence-stagger', 'scale-in'],
    affordances: ['dialogue'],
    parameters: ['title', 'avatar', 'messages'],
    operations: ['reveal', 'stagger', 'pop', 'bob'],
    states: ['rest', 'shown'],
    transitions: ['appear'],
    maxTextChars: 160,
    maxItems: 5,
    compositionProfile: { dominantElement: 'bubbles', density: 'medium' },
  },
  {
    id: 'social-proof',
    behaviors: ['appear-fade', 'slide-in', 'sequence-stagger'],
    affordances: ['social-proof'],
    parameters: ['title', 'cards'],
    operations: ['reveal', 'stagger', 'pop', 'rotate', 'move'],
    states: ['rest', 'shown'],
    transitions: ['appear'],
    maxTextChars: 80,
    maxItems: 3,
    compositionProfile: { dominantElement: 'card', density: 'medium' },
  },
  {
    id: 'prediction-input',
    behaviors: ['type-on', 'appear-fade'],
    affordances: ['input-entry'],
    parameters: ['prompt', 'answer', 'object'],
    operations: ['reveal', 'type-on', 'fade', 'bob', 'move', 'scale'],
    states: ['rest', 'shown'],
    transitions: ['appear', 'type'],
    maxTextChars: 80,
    compositionProfile: { dominantElement: 'input', density: 'low' },
  },
  {
    id: 'object-reveal',
    behaviors: ['appear-fade', 'type-on', 'scale-in'],
    affordances: ['object-focus', 'answer-reveal'],
    parameters: ['object', 'caption', 'tone', 'tiltDeg'],
    operations: ['reveal', 'type-on', 'bob', 'rotate', 'scale'],
    states: ['rest', 'shown'],
    transitions: ['appear'],
    maxTextChars: 60,
    compositionProfile: { dominantElement: 'object', density: 'low' },
  },
  {
    id: 'input-transform',
    behaviors: ['type-on', 'cursor-to-submit', 'appear-fade'],
    affordances: ['input-entry'],
    parameters: ['prompt', 'waitingLabel', 'answer'],
    operations: ['reveal', 'type-on', 'move', 'scale', 'pulse', 'stagger'],
    states: ['rest', 'typing', 'waiting', 'answered'],
    transitions: ['appear', 'type', 'submit', 'wait'],
    maxTextChars: 34,
    compositionProfile: { dominantElement: 'input', density: 'low' },
  },
  {
    id: 'impact-arrival',
    behaviors: ['drop-settle', 'appear-fade'],
    affordances: ['answer-reveal'],
    parameters: ['headline', 'index', 'object', 'caption'],
    operations: ['reveal', 'move', 'scale', 'rotate', 'pulse', 'stagger'],
    states: ['rest', 'landing', 'settled'],
    transitions: ['appear', 'land', 'pulse'],
    maxTextChars: 60,
    compositionProfile: { dominantElement: 'card', density: 'low' },
  },
  {
    id: 'scale-break',
    behaviors: ['move-along-scale', 'terminate-abruptly', 'appear-fade', 'draw-progressively'],
    affordances: ['timeline'],
    parameters: ['fromLabel', 'toLabel', 'title'],
    operations: ['reveal', 'extend', 'move', 'scale', 'highlight'],
    states: ['rest', 'drawing', 'broken'],
    transitions: ['appear', 'draw', 'break'],
    maxTextChars: 60,
    compositionProfile: { dominantElement: 'line', density: 'low' },
  },
];

export function implementationById(id: string): ImplementationContract | null {
  return IMPLEMENTATIONS.find((item) => item.id === id) ?? null;
}

export function hasOperation(implementation: ImplementationContract, operation: string): boolean {
  return implementation.operations.includes(operation);
}


/** Primitives that draw their own copy: derived, never hand-listed. */
export const TEXT_PRIMITIVES: ReadonlySet<PrimitiveId> = new Set(
  (Object.keys(PRIMITIVES) as PrimitiveId[]).filter((id) => PRIMITIVES[id].carriesText === true),
);

/** Primitives that paint a surface other elements can stand on. */
export const SURFACE_PRIMITIVES: ReadonlySet<PrimitiveId> = new Set<PrimitiveId>([
  'card',
  'pill',
  'bubble',
]);
