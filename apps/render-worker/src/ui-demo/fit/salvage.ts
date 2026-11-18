import { PRIMITIVES, type ParameterSpec, type PrimitiveId } from '../catalog.js';

/**
 * Salvage before validation: cut what cannot change the meaning.
 *
 * A foreign model writes `border: "none"`, `shadow: true` or an unknown
 * parameter, and the strict schema rejects the whole scene for a detail the code
 * can express — "no border" is the absence of the parameter, a boolean shadow is
 * the nearest enum value. Everything cut is recorded, so salvage never becomes a
 * silent fit: the report says what was changed and why.
 *
 * A rejection stays for what cannot be repaired without inventing a layout: an
 * element outside the frame, a static scene, text that does not fit.
 */

export interface Repair {
  readonly element: string | null;
  readonly path: string;
  readonly reason: string;
  readonly from: string;
  readonly to: string;
}

type Unknown = Record<string, unknown>;
type SpecValue = string | number | boolean;

function isObject(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function drop(
  repairs: Repair[],
  element: string | null,
  path: string,
  reason: string,
  value: unknown,
): null {
  repairs.push({ element, path, reason, from: describe(value), to: '(removed)' });

  return null;
}

function clampNumber(
  repairs: Repair[],
  element: string | null,
  path: string,
  rule: ParameterSpec,
  value: number,
): number {
  if (rule.min !== undefined && value < rule.min) {
    repairs.push({
      element,
      path,
      reason: 'below the allowed range',
      from: String(value),
      to: String(rule.min),
    });

    return rule.min;
  }

  if (rule.max !== undefined && value > rule.max) {
    repairs.push({
      element,
      path,
      reason: 'above the allowed range',
      from: String(value),
      to: String(rule.max),
    });

    return rule.max;
  }

  return value;
}

/** The nearest enum value name to a boolean, for `true`/`false` written by a model. */
function enumForBoolean(rule: ParameterSpec, value: boolean): SpecValue | null {
  const values = rule.values ?? [];

  if (!value) {
    return values.includes('none') ? 'none' : null;
  }

  if (values.includes('soft')) {
    return 'soft';
  }

  return values.find((candidate) => candidate !== 'none') ?? null;
}

function salvageValue(
  repairs: Repair[],
  element: string | null,
  primitive: PrimitiveId,
  key: string,
  rule: ParameterSpec,
  value: SpecValue,
): SpecValue | null {
  const path = `${primitive}.${key}`;

  switch (rule.type) {
    case 'color': {
      if (typeof value === 'string' && value.startsWith('#')) {
        return value;
      }

      return drop(
        repairs,
        element,
        path,
        value === 'none' || value === 'transparent'
          ? 'no colour — the parameter is removed and the theme applies'
          : 'not a #hex colour',
        value,
      );
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return drop(repairs, element, path, 'expected number', value);
      }

      return clampNumber(repairs, element, path, rule, value);
    }
    case 'enum': {
      if (
        ((rule.values ?? []) as readonly (string | number | boolean)[]).includes(value)
      ) {
        return value;
      }

      if (typeof value === 'boolean') {
        const mapped = enumForBoolean(rule, value);

        if (mapped !== null) {
          repairs.push({
            element,
            path,
            reason: 'boolean where an enum is declared',
            from: describe(value),
            to: String(mapped),
          });

          return mapped;
        }
      }

      return drop(repairs, element, path, 'not one of the allowed values', value);
    }
    case 'boolean': {
      return typeof value === 'boolean'
        ? value
        : drop(repairs, element, path, 'expected boolean', value);
    }
    default:
      return value;
  }
}

function salvageElement(element: Unknown, repairs: Repair[]): Unknown {
  const primitive = element['primitive'];

  if (typeof primitive !== 'string') {
    return element;
  }

  const contract = PRIMITIVES[primitive as PrimitiveId];

  if (contract === undefined) {
    /* An unknown primitive is not a detail: the scene is asking for something
       the factory cannot draw. The validator reports it. */
    return element;
  }

  const id = typeof element['id'] === 'string' ? element['id'] : null;
  const params = element['params'];

  if (!isObject(params)) {
    return element;
  }

  const next: Unknown = {};

  for (const [key, value] of Object.entries(params)) {
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      drop(repairs, id, `${primitive}.${key}`, 'not a scalar value', value);
      continue;
    }

    const rule = contract.parameters[key];

    if (rule === undefined) {
      drop(repairs, id, `${primitive}.${key}`, 'parameter is not documented', value);
      continue;
    }

    const salvaged = salvageValue(
      repairs,
      id,
      primitive as PrimitiveId,
      key,
      rule,
      value as SpecValue,
    );

    if (salvaged !== null) {
      next[key] = salvaged;
    }
  }

  return { ...element, params: next };
}

function salvageSequence(
  elements: readonly Unknown[],
  sequence: readonly Unknown[],
  repairs: Repair[],
): Unknown[] {
  const byId = new Map<string, Unknown>();

  for (const element of elements) {
    if (typeof element['id'] === 'string' && typeof element['primitive'] === 'string') {
      byId.set(element['id'], element);
    }
  }

  const kept: Unknown[] = [];

  for (const step of sequence) {
    const elementId = step['element'];
    const transition = step['transition'];
    const element = typeof elementId === 'string' ? byId.get(elementId) : undefined;
    const primitive = element?.['primitive'];
    const contract =
      typeof primitive === 'string' ? PRIMITIVES[primitive as PrimitiveId] : undefined;

    if (
      contract !== undefined &&
      typeof transition === 'string' &&
      !contract.transitions.includes(transition)
    ) {
      drop(
        repairs,
        typeof elementId === 'string' ? elementId : null,
        `${primitive as string}.${transition}`,
        'transition is not in the contract',
        transition,
      );
      continue;
    }

    kept.push(step);
  }

  return kept;
}

/** Returns a copy of the scene with the salvageable defects removed. */
export function salvageScene(scene: unknown, repairs: Repair[]): unknown {
  if (!isObject(scene)) {
    return scene;
  }

  const spec = scene['spec'];

  if (!isObject(spec) || !Array.isArray(spec['elements'])) {
    return scene;
  }

  const elements = spec['elements'].filter(isObject).map((element) => salvageElement(element, repairs));
  const sequence = Array.isArray(spec['sequence'])
    ? salvageSequence(elements, spec['sequence'].filter(isObject), repairs)
    : spec['sequence'];

  return {
    ...scene,
    spec: {
      ...spec,
      elements,
      ...(sequence === undefined ? {} : { sequence }),
    },
  };
}
