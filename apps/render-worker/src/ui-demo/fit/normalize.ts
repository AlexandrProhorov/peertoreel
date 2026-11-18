import { tokenForHeight } from '../typography-rules.js';
import { deriveTiming } from '../timing-plan.js';
import { clampLayout } from './clamp.js';
import { salvageScene, type Repair } from './salvage.js';

/**
 * Normalisation before validation: the two things the model is bad at and code
 * is good at — clamping a box into the safe zone and picking the type size the
 * box implies. It works on the raw JSON because the strict schema rejects a
 * scene for exactly these two reasons.
 */

type Unknown = Record<string, unknown>;

function isObject(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bordered surfaces must not touch: two cards that overlap by a few pixels read
 * as a rendering glitch, not as a design. A large overlap is left alone — a
 * stack of messages or a collage is a legitimate technique.
 */
const SURFACE_PRIMITIVES = new Set(['card', 'pill', 'bubble']);
const MIN_GAP = 16;
/** Overlap above this share of the smaller surface is treated as intentional. */
const INTENTIONAL_OVERLAP = 0.35;

interface Boxed {
  readonly element: Unknown;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function asBoxed(element: Unknown): Boxed | null {
  const primitive = element['primitive'];
  const layout = element['layout'];

  if (
    typeof primitive !== 'string' ||
    !SURFACE_PRIMITIVES.has(primitive) ||
    !isObject(layout)
  ) {
    return null;
  }

  const x = Number(layout['x']);
  const y = Number(layout['y']);
  const width = Number(layout['width'] ?? 0);
  const height = Number(layout['height'] ?? 0);

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return { element, x, y, width, height };
}

function intersects(a: Boxed, b: Boxed): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
}

function separateSurfaces(elements: readonly Unknown[]): Unknown[] {
  const result = elements.map((element) => ({ ...element }));
  const boxes = result
    .map((element, index) => ({ index, box: asBoxed(element) }))
    .filter((item): item is { index: number; box: Boxed } => item.box !== null);

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const first = boxes[i];
      const second = boxes[j];

      if (first === undefined || second === undefined) {
        continue;
      }

      const overlap = intersects(first.box, second.box);
      const smaller = Math.min(
        first.box.width * first.box.height,
        second.box.width * second.box.height,
      );

      if (overlap === 0 || overlap > smaller * INTENTIONAL_OVERLAP) {
        continue;
      }

      /* Push the later box to the right of the earlier one, or below it when the
         frame has no room. */
      const target = result[second.index];
      const layout = target?.['layout'];

      if (!isObject(layout)) {
        continue;
      }

      const rightX = first.box.x + first.box.width + MIN_GAP;
      const fitsRight = rightX + second.box.width <= 890;
      const next = fitsRight
        ? { x: rightX, y: second.box.y }
        : { x: second.box.x, y: first.box.y + first.box.height + MIN_GAP };

      result[second.index] = { ...target, layout: { ...layout, ...next } };
      boxes[j] = {
        ...second,
        box: { ...second.box, x: next.x, y: next.y },
      };
    }
  }

  return result;
}

function normalizeElement(element: Unknown): Unknown {
  const primitive = element['primitive'];
  const layout = element['layout'];

  if (typeof primitive !== 'string' || !isObject(layout) || primitive === 'stage') {
    return element;
  }

  const withLayout = clampLayout({
    layout: layout as { x: number; y: number; width?: number; height?: number },
  }) as { layout: Unknown };

  const params = isObject(element['params']) ? element['params'] : null;
  const token = params?.['token'];

  if (
    params === null ||
    typeof token !== 'string' ||
    !['label', 'pill', 'bubble'].includes(primitive)
  ) {
    return { ...element, layout: withLayout.layout };
  }

  const nextToken = tokenForHeight(token, withLayout.layout['height'] as number | undefined);

  return {
    ...element,
    layout: withLayout.layout,
    params: nextToken === token ? params : { ...params, token: nextToken },
  };
}

export function normalizeRawEpisode(raw: unknown, repairs: Repair[] = []): unknown {
  if (!isObject(raw) || !Array.isArray(raw['scenes'])) {
    return raw;
  }

  return {
    ...raw,
    scenes: raw['scenes'].map((rawScene) => {
      /* Salvage first: unknown parameters, `"none"` colours and out-of-range
         numbers are cut before the strict schema sees them. What cannot be
         repaired without changing the meaning is left for the validator. */
      const scene = salvageScene(rawScene, repairs);

      if (!isObject(scene) || !isObject(scene['spec'])) {
        return scene;
      }

      const spec = scene['spec'];
      const elements = spec['elements'];

      if (!Array.isArray(elements)) {
        return scene;
      }

      /* Timing: an ordered list without `at` becomes absolute cues here, and the
         scene length follows from them — the model no longer guesses seconds. */
      const sequence = spec['sequence'];
      const ordered = Array.isArray(sequence) ? sequence.filter(isObject) : [];
      const needsTiming = ordered.some((step) => step['at'] === undefined);
      const timing = needsTiming
        ? deriveTiming(
            ordered.map((step) => ({
              element: String(step['element'] ?? ''),
              transition: String(step['transition'] ?? ''),
              ...(typeof step['text'] === 'string' ? { text: step['text'] } : {}),
            })),
          )
        : null;

      return {
        ...scene,
        ...(timing === null
          ? {}
          : {
              /* The plan says how long the scene should feel, the steps say how
                 long the action takes. Never shorter than the action. */
              durationSec: Math.max(
                typeof scene['durationSec'] === 'number' ? scene['durationSec'] : 0,
                timing.durationSec,
              ),
            }),
        spec: {
          ...spec,
          ...(timing === null ? {} : { sequence: timing.cues }),
          elements: separateSurfaces(elements.map(normalizeElement)),
        },
      };
    }),
  };
}
