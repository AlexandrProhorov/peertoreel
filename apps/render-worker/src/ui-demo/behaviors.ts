/**
 * Behaviour registry: the semantic layer between an idea and a capability.
 *
 * A behaviour has a meaning, a semantic signature (target / initial state /
 * action / progression / final state) and the operations a composition would
 * use. Operations alone never prove a match: filling an empty grid and
 * occluding existing text both change the visible area, but they are different
 * behaviours.
 *
 * `implementedByPrimitives` mirrors what the renderer can actually do today.
 * Identity (known / proposed) and executability (supported / unsupported) are
 * independent: a brand-new behaviour can still be composable, and a known one
 * can still be unsupported.
 */
export const SIGNATURE_DIMENSIONS = [
  'target',
  'initialState',
  'action',
  'progression',
  'finalState',
] as const;

export type SignatureDimension = (typeof SIGNATURE_DIMENSIONS)[number];

export const TARGETS = [
  'empty-area',
  'existing-text',
  'existing-object',
  'single-element',
  'whole-frame',
] as const;

export const INITIAL_STATES = ['absent', 'visible', 'partially-visible'] as const;

export const ACTIONS = [
  'reveal',
  'fill',
  'occlude',
  'move',
  'type',
  'transform',
  'terminate',
] as const;

export const PROGRESSIONS = [
  'none',
  'sequential',
  'continuous',
  'left-to-right',
  'along-axis',
] as const;

export const FINAL_STATES = [
  'visible',
  'filled',
  'hidden',
  'ended',
  'moved',
] as const;

export interface BehaviorSignature {
  readonly target: (typeof TARGETS)[number];
  readonly initialState: (typeof INITIAL_STATES)[number];
  readonly action: (typeof ACTIONS)[number];
  readonly progression: (typeof PROGRESSIONS)[number];
  readonly finalState: (typeof FINAL_STATES)[number];
}

export interface BehaviorDefinition {
  readonly id: string;
  readonly meaning: string;
  readonly signature: BehaviorSignature;
  /** Operations a composition must use to realise it. */
  readonly operations: readonly string[];
  /** True only when the renderer performs this behaviour today. */
  readonly implementedByPrimitives: boolean;
}

export const BEHAVIORS: readonly BehaviorDefinition[] = [
  {
    id: 'appear-fade',
    meaning: 'элемент появляется растворением',
    signature: {
      target: 'single-element',
      initialState: 'absent',
      action: 'reveal',
      progression: 'none',
      finalState: 'visible',
    },
    operations: ['reveal'],
    implementedByPrimitives: true,
  },
  {
    id: 'slide-in',
    meaning: 'элемент въезжает в кадр',
    signature: {
      target: 'single-element',
      initialState: 'absent',
      action: 'move',
      progression: 'along-axis',
      finalState: 'moved',
    },
    operations: ['move'],
    implementedByPrimitives: true,
  },
  {
    id: 'scale-in',
    meaning: 'элемент проявляется через масштаб',
    signature: {
      target: 'single-element',
      initialState: 'partially-visible',
      action: 'transform',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['scale'],
    implementedByPrimitives: true,
  },
  {
    id: 'sequence-stagger',
    meaning: 'элементы появляются по очереди',
    signature: {
      target: 'empty-area',
      initialState: 'absent',
      action: 'reveal',
      progression: 'sequential',
      finalState: 'visible',
    },
    operations: ['stagger'],
    implementedByPrimitives: true,
  },
  {
    id: 'type-on',
    meaning: 'текст набирается по символам',
    signature: {
      target: 'empty-area',
      initialState: 'absent',
      action: 'type',
      progression: 'sequential',
      finalState: 'visible',
    },
    operations: ['type-on'],
    implementedByPrimitives: true,
  },
  {
    id: 'draw-progressively',
    meaning: 'линия прорисовывается от начала к концу',
    signature: {
      target: 'empty-area',
      initialState: 'absent',
      action: 'reveal',
      progression: 'left-to-right',
      finalState: 'visible',
    },
    operations: ['extend'],
    implementedByPrimitives: true,
  },
  {
    id: 'fill-progressively',
    meaning: 'пустая область заполняется по мере движения',
    signature: {
      target: 'empty-area',
      initialState: 'absent',
      action: 'fill',
      progression: 'sequential',
      finalState: 'filled',
    },
    operations: ['fill'],
    implementedByPrimitives: true,
  },
  {
    id: 'drag-along-track',
    meaning: 'маркер едет вдоль дорожки',
    signature: {
      target: 'single-element',
      initialState: 'visible',
      action: 'move',
      progression: 'along-axis',
      finalState: 'moved',
    },
    operations: ['move'],
    implementedByPrimitives: true,
  },
  {
    id: 'move-along-scale',
    meaning: 'маркер движется по шкале времени',
    signature: {
      target: 'single-element',
      initialState: 'visible',
      action: 'move',
      progression: 'along-axis',
      finalState: 'moved',
    },
    operations: ['move'],
    implementedByPrimitives: true,
  },
  {
    id: 'grow-shape',
    meaning: 'объект растёт, меняя масштаб',
    signature: {
      target: 'existing-object',
      initialState: 'partially-visible',
      action: 'transform',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['scale'],
    implementedByPrimitives: true,
  },
  {
    id: 'hold-static',
    meaning: 'кадр держится без движения',
    signature: {
      target: 'whole-frame',
      initialState: 'visible',
      action: 'reveal',
      progression: 'none',
      finalState: 'visible',
    },
    operations: ['hold'],
    implementedByPrimitives: true,
  },
  {
    id: 'terminate-abruptly',
    meaning: 'линия обрывается, продолжение не возникает',
    signature: {
      target: 'existing-object',
      initialState: 'visible',
      action: 'terminate',
      progression: 'none',
      finalState: 'ended',
    },
    operations: ['break'],
    implementedByPrimitives: false,
  },
  {
    id: 'highlight-sweep',
    meaning: 'подсветка проходит по тексту, выделяя фрагмент',
    signature: {
      target: 'existing-text',
      initialState: 'visible',
      action: 'reveal',
      progression: 'left-to-right',
      finalState: 'visible',
    },
    operations: ['highlight'],
    implementedByPrimitives: false,
  },
  {
    id: 'mask-conceal',
    meaning: 'существующий текст постепенно перекрывается маской',
    signature: {
      target: 'existing-text',
      initialState: 'visible',
      action: 'occlude',
      progression: 'left-to-right',
      finalState: 'hidden',
    },
    operations: ['occlude'],
    implementedByPrimitives: false,
  },
  {
    id: 'feed-scroll',
    meaning: 'лента элементов непрерывно прокручивается',
    signature: {
      target: 'whole-frame',
      initialState: 'visible',
      action: 'move',
      progression: 'continuous',
      finalState: 'moved',
    },
    operations: ['scroll'],
    implementedByPrimitives: false,
  },
  {
    id: 'compress-stream',
    meaning: 'поток сжимается в плотную полосу',
    signature: {
      target: 'whole-frame',
      initialState: 'visible',
      action: 'transform',
      progression: 'continuous',
      finalState: 'moved',
    },
    operations: ['resize'],
    implementedByPrimitives: false,
  },
  {
    id: 'count-up',
    meaning: 'число растёт во времени',
    signature: {
      target: 'existing-text',
      initialState: 'visible',
      action: 'type',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['count'],
    implementedByPrimitives: false,
  },
  {
    id: 'cursor-to-submit',
    meaning: 'курсор превращается в кнопку отправки',
    signature: {
      target: 'single-element',
      initialState: 'visible',
      action: 'transform',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['morph'],
    implementedByPrimitives: false,
  },
  {
    id: 'drop-settle',
    meaning: 'объект входит из-за кадра, фиксируется и передаёт импульс',
    signature: {
      target: 'single-element',
      initialState: 'absent',
      action: 'move',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['drop'],
    implementedByPrimitives: false,
  },
  {
    id: 'idle-bob',
    meaning: 'объект плавно покачивается без действия',
    signature: {
      target: 'existing-object',
      initialState: 'visible',
      action: 'move',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['bob'],
    implementedByPrimitives: false,
  },
  {
    id: 'attention-pulse',
    meaning: 'элемент пульсирует, привлекая внимание',
    signature: {
      target: 'single-element',
      initialState: 'visible',
      action: 'transform',
      progression: 'continuous',
      finalState: 'visible',
    },
    operations: ['pulse'],
    implementedByPrimitives: false,
  },
];

const BY_ID = new Map(BEHAVIORS.map((behavior) => [behavior.id, behavior]));

export function behaviorById(id: string): BehaviorDefinition | null {
  return BY_ID.get(id) ?? null;
}

/** Behaviour any composition of primitives can preserve today. */
export function primitiveBehaviors(): Set<string> {
  return new Set(
    BEHAVIORS.filter((behavior) => behavior.implementedByPrimitives).map(
      (behavior) => behavior.id,
    ),
  );
}

/** Operations the renderer performs, regardless of the behaviour they serve. */
export function supportedOperations(): Set<string> {
  return new Set(
    BEHAVIORS.filter((behavior) => behavior.implementedByPrimitives).flatMap(
      (behavior) => behavior.operations,
    ),
  );
}
