import { z } from 'zod';
import {
  MAX_ELEMENTS_PER_SCENE,
  MAX_INSTANCES_PER_PRIMITIVE,
  PRIMITIVES,
  type PrimitiveId,
} from './catalog.js';
import { checkTextBox } from './typography-rules.js';

const specValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const compositionLayoutSchema = z.object({
  x: z.number().finite().min(0).max(1080),
  y: z.number().finite().min(0).max(1920),
  width: z.number().finite().min(1).max(1080).optional(),
  height: z.number().finite().min(1).max(1920).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

export const compositionElementSchema = z.object({
  id: z.string().min(1).max(24),
  primitive: z.string().min(1).max(24),
  layout: compositionLayoutSchema,
  params: z.record(z.string().min(1).max(40), specValueSchema).default({}),
  states: z.array(z.string().min(1).max(32)).max(4).default([]),
  /* The declared list is bounded by the primitive's own list, not by 4: card and
     label now expose up to seven transitions and the model lists them. */
  transitions: z.array(z.string().min(1).max(32)).max(8).default([]),
  operations: z.array(z.string().min(1).max(32)).max(6).default([]),
  links: z.array(z.string().min(1).max(24)).max(4).default([]),
});

export const compositionSpecSchema = z.object({
  kind: z.literal('composition'),
  /** The element budget is enforced by the validator so it can be reported. */
  elements: z.array(compositionElementSchema).min(1).max(24),
  sequence: z
    .array(
      z.object({
        at: z.number().finite().nonnegative().optional(),
        element: z.string().min(1).max(24),
        transition: z.string().min(1).max(32),
        /** A cue may replace the element's text; an empty string clears it. */
        text: z.string().max(80).optional(),
      }),
    )
    .max(24)
    .default([]),
});

export type CompositionSpec = z.infer<typeof compositionSpecSchema>;

export type CompositionIssueCode =
  | 'invalid-spec'
  | 'unknown-primitive'
  | 'unknown-parameter'
  | 'parameter-type'
  | 'parameter-range'
  | 'parameter-enum'
  | 'parameter-length'
  | 'typography-fit'
  | 'unknown-state'
  | 'unknown-transition'
  | 'unknown-operation'
  | 'dangling-link'
  | 'element-budget'
  | 'primitive-budget'
  | 'sequence-unknown-element'
  | 'text-not-supported'
  | 'grid-overlap'
  | 'surface-overlap';

export interface CompositionIssue {
  readonly code: CompositionIssueCode;
  readonly element: string | null;
  readonly message: string;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

function intersection(a: Box, b: Box): number {
  const overlapX = Math.min(a.x + (a.width ?? 0), b.x + (b.width ?? 0)) - Math.max(a.x, b.x);
  const overlapY =
    Math.min(a.y + (a.height ?? 0), b.y + (b.height ?? 0)) - Math.max(a.y, b.y);

  return overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + (inner.width ?? 0) <= outer.x + (outer.width ?? 0) + 0.5 &&
    inner.y + (inner.height ?? 0) <= outer.y + (outer.height ?? 0) + 0.5
  );
}

/** A surface that carries its own copy: two of them cannot share pixels. */
function carriesText(element: CompositionSpec['elements'][number]): boolean {
  const text = (element.params as Readonly<Record<string, unknown>>)['text'];

  return ['pill', 'bubble', 'card'].includes(element.primitive) && typeof text === 'string' && text.trim() !== '';
}

function checkParameter(
  elementId: string,
  primitive: PrimitiveId,
  key: string,
  value: string | number | boolean,
): CompositionIssue[] {
  const contract = PRIMITIVES[primitive];
  const rule = contract.parameters[key];

  if (rule === undefined) {
    return [
      {
        code: 'unknown-parameter',
        element: elementId,
        message: `${primitive}.${key}: parameter is not documented`,
      },
    ];
  }

  const issues: CompositionIssue[] = [];
  const fail = (code: CompositionIssueCode, message: string): void => {
    issues.push({ code, element: elementId, message });
  };

  switch (rule.type) {
    case 'number':
      if (typeof value !== 'number') {
        fail('parameter-type', `${primitive}.${key}: expected number`);
      } else if (rule.min !== undefined && value < rule.min) {
        fail('parameter-range', `${primitive}.${key}: ${value} < ${rule.min}`);
      } else if (rule.max !== undefined && value > rule.max) {
        fail('parameter-range', `${primitive}.${key}: ${value} > ${rule.max}`);
      }
      break;
    case 'enum':
      if (
        !((rule.values ?? []) as readonly (string | number | boolean)[]).includes(
          value,
        )
      ) {
        fail(
          'parameter-enum',
          `${primitive}.${key}: "${String(value)}" is not one of ${JSON.stringify(rule.values)}`,
        );
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        fail('parameter-type', `${primitive}.${key}: expected string`);
      } else if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        fail(
          'parameter-length',
          `${primitive}.${key}: ${value.length} > ${rule.maxLength} chars`,
        );
      }
      break;
    case 'color':
      if (typeof value !== 'string' || !value.startsWith('#')) {
        fail('parameter-type', `${primitive}.${key}: expected #hex color`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        fail('parameter-type', `${primitive}.${key}: expected boolean`);
      }
      break;
    case 'asset':
      if (typeof value !== 'string') {
        fail('parameter-type', `${primitive}.${key}: expected asset key`);
      }
      break;
  }

  return issues;
}

/**
 * The whole-chain check: primitive exists, every parameter is documented and in
 * range, states/transitions/operations are contracted, links resolve, budgets
 * hold. A composition that needs behaviour outside these contracts is not a
 * composition — it is a creation request.
 */
export function validateComposition(spec: CompositionSpec): CompositionIssue[] {
  const issues: CompositionIssue[] = [];
  const fail = (
    code: CompositionIssueCode,
    element: string | null,
    message: string,
  ): void => {
    issues.push({ code, element, message });
  };

  if (spec.elements.length > MAX_ELEMENTS_PER_SCENE) {
    fail(
      'element-budget',
      null,
      `composition has ${spec.elements.length} elements (max ${MAX_ELEMENTS_PER_SCENE})`,
    );
  }

  const ids = new Set(spec.elements.map((element) => element.id));
  const perPrimitive = new Map<string, number>();

  for (const element of spec.elements) {
    const contract = PRIMITIVES[element.primitive as PrimitiveId];

    if (contract === undefined) {
      fail('unknown-primitive', element.id, `unknown primitive "${element.primitive}"`);
      continue;
    }

    if (
      element.layout.x + (element.layout.width ?? 0) > 1080 ||
      element.layout.y + (element.layout.height ?? 0) > 1920
    ) {
      fail(
        'element-budget',
        element.id,
        `layout of "${element.id}" leaves the frame: ${JSON.stringify(element.layout)}`,
      );
    }

    perPrimitive.set(
      element.primitive,
      (perPrimitive.get(element.primitive) ?? 0) + 1,
    );

    for (const [key, value] of Object.entries(element.params)) {
      issues.push(
        ...checkParameter(element.id, element.primitive as PrimitiveId, key, value),
      );
    }

    for (const state of element.states) {
      if (!contract.states.includes(state)) {
        fail(
          'unknown-state',
          element.id,
          `${element.primitive} has no state "${state}"`,
        );
      }
    }

    for (const transition of element.transitions) {
      if (!contract.transitions.includes(transition)) {
        fail(
          'unknown-transition',
          element.id,
          `${element.primitive} has no transition "${transition}"`,
        );
      }
    }

    for (const operation of element.operations) {
      if (!contract.operations.includes(operation)) {
        fail(
          'unknown-operation',
          element.id,
          `${element.primitive} cannot "${operation}"`,
        );
      }
    }

    /* Text conventions: the box dictates the token. Applies where the element
       carries text and declares its own height. */
    if (['label', 'pill', 'bubble'].includes(element.primitive)) {
      const token = element.params['token'];
      const problem =
        typeof token === 'string'
          ? checkTextBox(token, element.layout.height)
          : null;

      if (problem !== null) {
        fail('typography-fit', element.id, problem);
      }
    }

    for (const link of element.links) {
      if (!ids.has(link)) {
        fail('dangling-link', element.id, `link to unknown element "${link}"`);
      }
    }
  }

  for (const [primitive, count] of perPrimitive) {
    if (count > MAX_INSTANCES_PER_PRIMITIVE) {
      fail(
        'primitive-budget',
        primitive,
        `${count} × ${primitive} (max ${MAX_INSTANCES_PER_PRIMITIVE})`,
      );
    }
  }

  /* A grid paints its cells as content; text on cells is unreadable. A surface
     may sit on a grid (a screen over a pattern) — that is a composition, and
     the contrast gate decides whether it is visible at all. */
  const grids = spec.elements.filter((element) => element.primitive === 'grid');
  const TEXT = ['label', 'pill', 'bubble'];

  for (const grid of grids) {
    for (const element of spec.elements) {
      if (!TEXT.includes(element.primitive)) {
        continue;
      }

      if (intersection(grid.layout, element.layout) > 0) {
        fail(
          'grid-overlap',
          element.id,
          `"${element.id}" stands on the grid "${grid.id}": a grid is a background pattern, text on cells is unreadable`,
        );
      }
    }
  }

  const textSurfaces = spec.elements.filter(carriesText);

  for (let i = 0; i < textSurfaces.length; i += 1) {
    for (let j = i + 1; j < textSurfaces.length; j += 1) {
      const first = textSurfaces[i];
      const second = textSurfaces[j];

      if (first === undefined || second === undefined) {
        continue;
      }

      if (
        intersection(first.layout, second.layout) === 0 ||
        contains(first.layout, second.layout) ||
        contains(second.layout, first.layout)
      ) {
        continue;
      }

      fail(
        'surface-overlap',
        second.id,
        `"${second.id}" overlaps "${first.id}" and both carry text`,
      );
    }
  }

  for (const step of spec.sequence) {
    const element = spec.elements.find((item) => item.id === step.element);

    if (element === undefined) {
      fail(
        'sequence-unknown-element',
        null,
        `sequence references unknown element "${step.element}"`,
      );
      continue;
    }

    const contract = PRIMITIVES[element.primitive as PrimitiveId];

    if (contract !== undefined && !contract.transitions.includes(step.transition)) {
      fail(
        'unknown-transition',
        element.id,
        `sequence: ${element.primitive} has no transition "${step.transition}"; allowed: ${(contract?.transitions ?? []).join(', ')}`,
      );
    }

    /* A cue may replace the text of a text element. On a container that text is
       silently dropped today, so the spec would promise something it cannot do. */
    if (
      step.text !== undefined &&
      !['label', 'pill', 'bubble'].includes(element.primitive)
    ) {
      fail(
        'text-not-supported',
        element.id,
        `sequence: ${element.primitive} cannot change its text`,
      );
    }
  }

  return issues;
}

/**
 * A scene must develop, but development is not "every element animates".
 *
 * The old rule demanded a cue with a property transition, and the model answered
 * with the one primitive that has motion built in — a progress bar in half the
 * scenes. Whether a scene changes is now measured on the rendered frame (see
 * `verify/motion.ts`); how it changes is a directing decision.
 */
export interface CompositionParseResult {
  readonly spec: CompositionSpec | null;
  readonly issues: CompositionIssue[];
}

/** Schema-first entry point: shape errors and contract errors in one list. */
export function parseComposition(raw: unknown): CompositionParseResult {
  const parsed = compositionSpecSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      spec: null,
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid-spec' as const,
        element: null,
        message: `${issue.path.length > 0 ? issue.path.join('.') : '$'}: ${issue.message}`,
      })),
    };
  }

  return { spec: parsed.data, issues: validateComposition(parsed.data) };
}
