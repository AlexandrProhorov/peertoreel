import {
  PRIMITIVES,
  type ParameterSpec,
  type PrimitiveContract,
  type PrimitiveId,
} from '../catalog.js';
import { tokenForHeight } from '../typography-rules.js';
import { COLOR_ROLES } from '../themes.js';
import { aliasedParameter, aliasedState, parameterBelongsToAnother, transitionIsOperation } from './aliases.js';

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

/**
 * Repairs that change what the viewer sees, as opposed to pixel bookkeeping.
 * "Accepted without repairs" is a weak signal while colour names are rewritten
 * on every card; the semantic share is what measures whether the model learned
 * the contract.
 */
export const SEMANTIC_REPAIRS: ReadonlySet<string> = new Set([
  'surface-removed',
  'accent-transferred',
  'focus-retargeted',
  'caption-attached',
  'grid',
]);

export function isSemanticRepair(path: string): boolean {
  return SEMANTIC_REPAIRS.has(path);
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

function isColorRoleName(value: string): boolean {
  return COLOR_ROLES.some((role) => role.toLowerCase() === value.trim().toLowerCase());
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
      /* A role name (`accent`, `surface`, `ink`) is resolved against the theme
         later: here it is enough to keep the token instead of dropping it. */
      const named = typeof value === 'string' && isColorRoleName(value);

      if (typeof value === 'string' && (value.startsWith('#') || named)) {
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

/** The text primitives: they need an ink, and the box implies the type size. */
const TEXT_PRIMITIVES = new Set<PrimitiveId>(['label', 'pill', 'bubble']);

function salvageTextStyle(
  element: Unknown,
  params: Unknown,
  id: string | null,
  primitive: PrimitiveId,
  repairs: Repair[],
): Unknown {
  if (!TEXT_PRIMITIVES.has(primitive)) {
    return params;
  }

  const next: Unknown = { ...params };
  const layout = element['layout'];

  /* Two names for one ink: an explicit colour is the author's choice, the tone
     is a theme name. Keeping both lets the renderer and the gate disagree — the
     renderer painted `textColor`, the gate read `tone` and rejected the scene. */
  if (next['tone'] !== undefined && next['textColor'] !== undefined) {
    repairs.push({
      element: id,
      path: `${primitive}.tone`,
      reason: 'explicit textColor wins',
      from: String(next['tone']),
      to: '(removed)',
    });
    delete next['tone'];
  }

  const text = next['text'];

  if (typeof text !== 'string' || text.trim() === '') {
    return next;
  }

  if (
    next['token'] === undefined &&
    isObject(layout) &&
    typeof layout['height'] === 'number'
  ) {
    const token = tokenForHeight('body', layout['height']);

    next['token'] = token;
    repairs.push({
      element: id,
      path: `${primitive}.token`,
      reason: 'type size follows the box',
      from: '(missing)',
      to: token,
    });
  }

  /* Only on the theme surface: on a declared background the ink must be chosen
     by the author, and the contrast gate decides. */
  if (next['tone'] === undefined && next['textColor'] === undefined && next['background'] === undefined) {
    next['tone'] = 'ink';
    repairs.push({
      element: id,
      path: `${primitive}.tone`,
      reason: 'default theme ink',
      from: '(missing)',
      to: 'ink',
    });
  }

  return next;
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
  const states = new Set<string>(
    Array.isArray(element['states'])
      ? element['states'].filter((state): state is string => typeof state === 'string')
      : [],
  );

  for (const [key, value] of Object.entries(params)) {
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      drop(repairs, id, `${primitive}.${key}`, 'not a scalar value', value);
      continue;
    }

    const rule = contract.parameters[key];

    if (rule === undefined) {
      const state = aliasedState(primitive as PrimitiveId, key);

      if (state !== null && value === true) {
        states.add(state);
        repairs.push({
          element: id,
          path: `${primitive}.${key}`,
          reason: 'state written as a parameter',
          from: describe(value),
          to: `states.${state}`,
        });
        continue;
      }

      const alias = aliasedParameter(primitive as PrimitiveId, key);

      if (alias !== null) {
        next[alias] = value;
        repairs.push({
          element: id,
          path: `${primitive}.${key}`,
          reason: 'alias: the model wrote a known typo',
          from: String(key),
          to: alias,
        });
        continue;
      }

      drop(
        repairs,
        id,
        `${primitive}.${key}`,
        parameterBelongsToAnother(primitive as PrimitiveId, key)
          ? 'parameter belongs to another primitive'
          : 'parameter is not documented',
        value,
      );
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

  return salvageDeclarations(
    {
      ...element,
      ...(states.size === 0 ? {} : { states: [...states] }),
      params: salvageTextStyle(element, next, id, primitive as PrimitiveId, repairs),
    },
    id,
    primitive as PrimitiveId,
    contract,
    repairs,
  );
}

/**
 * The element also declares what it can do in `states`, `transitions` and
 * `operations`. An undeclared name is a promise the renderer does not keep, and
 * the model writes `scale` there even when the cue list is clean.
 */
function salvageDeclarations(
  element: Unknown,
  id: string | null,
  primitive: PrimitiveId,
  contract: PrimitiveContract,
  repairs: Repair[],
): Unknown {
  const next: Unknown = { ...element };

  for (const key of ['states', 'transitions', 'operations'] as const) {
    const declared = element[key];

    if (!Array.isArray(declared)) {
      continue;
    }

    const allowed = contract[key];

    next[key] = declared.filter((value) => {
      if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
        return true;
      }

      drop(repairs, id, `${primitive}.${key}.${describe(value)}`, 'not in the contract', value);

      return false;
    });
  }

  return next;
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
        transitionIsOperation(primitive as PrimitiveId, transition)
          ? 'operation written as a transition'
          : 'transition is not in the contract',
        transition,
      );
      continue;
    }

    /* A press without a target is a gesture with no reaction: it does not fail
       the scene, it is dropped with the reason. A removed target is the same
       case — the tap has nothing left to press. */
    if (transition === 'tap') {
      const target = step['target'];
      const targetExists =
        target === undefined ? false : byId.has(String(target));

      if (!targetExists) {
        drop(
          repairs,
          typeof elementId === 'string' ? elementId : null,
          typeof elementId === 'string' ? `${elementId as string}.tap` : 'tap',
          target === undefined ? 'tap without a target' : 'tap on a removed target',
          String(target ?? '(missing)'),
        );
        continue;
      }
    }

    kept.push(step);
  }

  return kept;
}

/**
 * Episode-level salvage: the version field is metadata, not meaning. A model
 * sometimes answers `{"type": "json_object", ...}` — echoing the API option in
 * place of `schemaVersion` — and the scene is otherwise complete.
 */
export function salvageEpisode(raw: unknown, repairs: Repair[]): unknown {
  if (!isObject(raw)) {
    return raw;
  }

  const version = raw['schemaVersion'];

  if (version === 1) {
    return raw;
  }

  if (version === undefined || version === '1') {
    repairs.push({
      element: null,
      path: 'schemaVersion',
      reason: 'missing or written as text',
      from: describe(version),
      to: '1',
    });

    return { ...raw, schemaVersion: 1 };
  }

  return raw;
}

interface SceneBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function boxOf(element: Unknown): SceneBox | null {
  const layout = element['layout'];

  if (!isObject(layout)) {
    return null;
  }

  const x = Number(layout['x']);
  const y = Number(layout['y']);
  const width = Number(layout['width'] ?? 0);
  const height = Number(layout['height'] ?? 0);

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function overlaps(a: SceneBox, b: SceneBox): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return overlapX > 0 && overlapY > 0;
}

/**
 * A grid is a background pattern, so the decoration yields to the content: when
 * the model stands text or a surface on its cells, the grid goes. Text on cells
 * is unreadable and a lime card on lime cells is invisible; removing the
 * pattern changes neither the copy nor the layout.
 */
function dropCoveredGrids(
  elements: readonly Unknown[],
  repairs: Repair[],
): { elements: Unknown[]; dropped: Set<string> } {
  const boxes = elements.map((element) => ({ element, box: boxOf(element) }));
  const droppedElements = new Set<Unknown>();
  const dropped = new Set<string>();

  for (const grid of boxes) {
    if (grid.element['primitive'] !== 'grid' || grid.box === null) {
      continue;
    }

    for (const other of boxes) {
      if (
        other.element === grid.element ||
        other.element['primitive'] === 'stage' ||
        other.box === null ||
        !overlaps(grid.box, other.box)
      ) {
        continue;
      }

      const gridId = grid.element['id'];
      drop(
        repairs,
        typeof gridId === 'string' ? gridId : null,
        'grid',
        `decoration under "${String(other.element['id'])}"`,
        'grid',
      );
      droppedElements.add(grid.element);

      if (typeof gridId === 'string') {
        dropped.add(gridId);
      }

      break;
    }
  }

  return {
    elements: elements.filter((element) => !droppedElements.has(element)),
    dropped,
  };
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

  const salvaged = spec['elements']
    .filter(isObject)
    .map((element) => salvageElement(element, repairs));
  const { elements, dropped } = dropCoveredGrids(salvaged, repairs);
  const sequence = Array.isArray(spec['sequence'])
    ? salvageSequence(
        elements,
        spec['sequence']
          .filter(isObject)
          .filter((step) => !dropped.has(String(step['element']))),
        repairs,
      )
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
