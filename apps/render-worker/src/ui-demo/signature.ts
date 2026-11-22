import { PRIMITIVES } from './catalog.js';
import type { UiScene } from './spec.js';

/**
 * Structural signature of a scene: what the scene is made of, never what it says.
 *
 * Diversity is measured on structure, so copy must not reach the key — otherwise
 * the model raises the metric by telling the same composition in new words.
 * The signature carries:
 *  - the primitives in appearance order;
 *  - relations between elements: containment (`a>b`), overlap (`a~b`), nearness (`a-b`);
 *  - a differing pair of the same primitive (`diff:<primitive>`): two bars of
 *    different length, a thin and a thick one — the comparison the frame shows.
 *
 * Elements are named by their ordinal in appearance order, not by model-chosen
 * ids: ids are text, and text is exactly what the signature must ignore.
 *
 * The tolerant entry point exists for raw attempts: a failed attempt is still
 * evidence of what the model tried, so it must produce a signature or an
 * explicit `invalid`, never a silent skip.
 */

const NEAR_GAP = 48;
const DIFFERENCE_RATIO = 1.2;

export type SignatureKind = 'spec' | 'device' | 'invalid';

export interface SceneSignature {
  /** Canonical, text-free key; equal keys mean the same structure. */
  readonly key: string;
  /**
   * Type-level key: the same primitives regardless of arrangement. The strict
   * key almost never repeats, so it cannot notice "every scene is a label and a
   * track"; the coarse one can, and the two answer different questions.
   */
  readonly coarse: string;
  readonly kind: SignatureKind;
  /** True when the input was a raw, unvalidated attempt rather than a scene. */
  readonly partial: boolean;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ElementView {
  readonly primitive: string;
  readonly known: boolean;
  readonly box: Box | null;
  readonly numbers: readonly number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boxOf(layout: unknown): Box | null {
  if (!isRecord(layout)) {
    return null;
  }

  const x = finite(layout['x']);
  const y = finite(layout['y']);
  const width = finite(layout['width']) ?? 0;
  const height = finite(layout['height']) ?? 0;

  return x === null || y === null ? null : { x, y, width, height };
}

function numericParams(params: unknown): number[] {
  if (!isRecord(params)) {
    return [];
  }

  const values: number[] = [];

  for (const key of Object.keys(params).sort()) {
    const value = finite(params[key]);

    if (value !== null) {
      values.push(value);
    }
  }

  return values;
}

function elementView(primitive: unknown, layout: unknown, params: unknown): ElementView {
  const name = typeof primitive === 'string' ? primitive : 'unknown';

  return {
    primitive: name,
    known: Object.hasOwn(PRIMITIVES, name),
    box: boxOf(layout),
    numbers: numericParams(params),
  };
}

function overlaps(a: Box, b: Box): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return width > 0.5 && height > 0.5;
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

/** Beside each other: a gap within a label's width, and projections overlap. */
function near(a: Box, b: Box): boolean {
  const horizontalGap = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  const horizontalOverlap =
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5;
  const verticalOverlap =
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;

  return (
    (horizontalGap >= 0 && horizontalGap <= NEAR_GAP && verticalOverlap) ||
    (verticalGap >= 0 && verticalGap <= NEAR_GAP && horizontalOverlap)
  );
}

function relationsOf(elements: readonly ElementView[]): string[] {
  const relations: string[] = [];

  for (let first = 0; first < elements.length; first += 1) {
    for (let second = first + 1; second < elements.length; second += 1) {
      const a = elements[first]?.box;
      const b = elements[second]?.box;

      if (a === null || a === undefined || b === null || b === undefined) {
        continue;
      }

      if (contains(a, b)) {
        relations.push(`${first}>${second}`);
      } else if (contains(b, a)) {
        relations.push(`${second}>${first}`);
      } else if (overlaps(a, b)) {
        relations.push(`${first}~${second}`);
      } else if (near(a, b)) {
        relations.push(`${first}-${second}`);
      }
    }
  }

  return relations;
}

function ratioDiffers(values: readonly number[]): boolean {
  const positive = values.filter((value) => value > 0);

  if (positive.length < 2) {
    return false;
  }

  const smallest = Math.min(...positive);
  const largest = Math.max(...positive);

  return largest / smallest >= DIFFERENCE_RATIO;
}

/** Two elements of one kind that differ: the comparison the frame is about. */
function differingPairs(elements: readonly ElementView[]): string[] {
  const groups = new Map<string, ElementView[]>();

  for (const element of elements) {
    const group = groups.get(element.primitive) ?? [];
    group.push(element);
    groups.set(element.primitive, group);
  }

  const diffs: string[] = [];

  for (const [primitive, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 2) {
      continue;
    }

    const widths = group.map((element) => element.box?.width ?? 0);
    const heights = group.map((element) => element.box?.height ?? 0);
    const numbers = group.flatMap((element) => element.numbers);

    if (ratioDiffers(widths) || ratioDiffers(heights) || ratioDiffers(numbers)) {
      diffs.push(primitive);
    }
  }

  return diffs;
}

function compose(sections: readonly string[]): string {
  return sections.join('|');
}

/** Appearance order: sequence first, then declaration order among the silent ones. */
function orderOfAppearance(ids: readonly string[], sequence: unknown): string[] {
  const firstSeen = new Map<string, number>();

  if (Array.isArray(sequence)) {
    sequence.forEach((entry, index) => {
      if (!isRecord(entry)) {
        return;
      }

      const id = entry['element'];

      if (typeof id === 'string' && !firstSeen.has(id)) {
        firstSeen.set(id, index);
      }
    });
  }

  const ranked = ids
    .map((id, index) => ({
      id,
      index,
      rank: firstSeen.get(id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank));

  return ranked.map((item) => item.id);
}

interface SpecShape {
  readonly elements: readonly unknown[];
  readonly sequence: unknown;
}

function specShape(raw: unknown): SpecShape | null {
  if (!isRecord(raw)) {
    return null;
  }

  const elements = raw['elements'];

  if (!Array.isArray(elements) || elements.length === 0) {
    return null;
  }

  return { elements, sequence: raw['sequence'] };
}

function specSignature(shape: SpecShape): SceneSignature {
  const declared: { id: string; view: ElementView }[] = [];

  shape.elements.forEach((raw, index) => {
    if (!isRecord(raw)) {
      return;
    }

    const id = typeof raw['id'] === 'string' ? raw['id'] : `#${index}`;

    declared.push({
      id,
      view: elementView(raw['primitive'], raw['layout'], raw['params']),
    });
  });

  if (declared.length === 0) {
    return {
      key: compose(['spec', 'empty']),
      coarse: compose(['spec', 'empty']),
      kind: 'spec',
      partial: false,
    };
  }

  const ordered = orderOfAppearance(
    declared.map((item) => item.id),
    shape.sequence,
  );
  const byId = new Map(declared.map((item) => [item.id, item.view]));
  const elements = ordered
    .map((id) => byId.get(id))
    .filter((view): view is ElementView => view !== undefined);

  const tokens = elements.map((element) => (element.known ? element.primitive : 'unknown'));
  const relations = relationsOf(elements);
  const diffs = differingPairs(elements);

  return {
    key: compose([
      'spec',
      `order=${tokens.join(',')}`,
      `rel=${relations.length === 0 ? 'none' : relations.join(',')}`,
      `diff=${diffs.length === 0 ? 'none' : diffs.join(',')}`,
    ]),
    coarse: compose(['spec', `set=${[...tokens].sort().join(',')}`]),
    kind: 'spec',
    partial: false,
  };
}

const BASE_KEYS = new Set(['id', 'device', 'enter', 'durationSec', 'themeId', 'revealSec', 'degraded']);

/**
 * Device scenes have no element tree: their structure is the shape of the
 * device fields. Arrays contribute their length, nullable fields their
 * presence, strings and numbers only their presence — never their value.
 */
function deviceSignature(device: string, fields: Record<string, unknown>): SceneSignature {
  const parts: string[] = [];

  for (const key of Object.keys(fields).sort()) {
    if (BASE_KEYS.has(key)) {
      continue;
    }

    const value = fields[key];

    if (Array.isArray(value)) {
      parts.push(`${key}=${value.length}`);
    } else if (typeof value === 'boolean') {
      parts.push(`${key}=${value}`);
    } else if (value === null) {
      continue;
    } else if (value !== undefined) {
      parts.push(key);
    }
  }

  return {
    key: compose(['device', device, ...(parts.length === 0 ? ['empty'] : parts)]),
    coarse: compose(['device', device]),
    kind: 'device',
    partial: false,
  };
}

/** Signature of a validated scene. Text never reaches the key. */
export function sceneSignature(scene: UiScene): SceneSignature {
  if (scene.device === 'spec') {
    return specSignature({ elements: scene.spec.elements, sequence: scene.spec.sequence });
  }

  return deviceSignature(scene.device, scene as unknown as Record<string, unknown>);
}

/**
 * Tolerant signature of a raw attempt: unknown primitives become `unknown`,
 * and a body without a device becomes `invalid`. The caller counts those
 * separately instead of dropping them from the denominator.
 */
export function rawSceneSignature(raw: unknown): SceneSignature {
  if (!isRecord(raw)) {
    return { key: 'invalid', coarse: 'invalid', kind: 'invalid', partial: true };
  }

  const device = raw['device'];

  if (device === 'spec') {
    const shape = specShape(raw['spec']);

    return shape === null
      ? {
          key: compose(['spec', 'empty']),
          coarse: compose(['spec', 'empty']),
          kind: 'spec',
          partial: true,
        }
      : { ...specSignature(shape), partial: true };
  }

  if (typeof device === 'string' && device.length > 0) {
    return { ...deviceSignature(device, raw), partial: true };
  }

  return { key: 'invalid', coarse: 'invalid', kind: 'invalid', partial: true };
}
