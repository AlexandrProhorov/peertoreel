import { tokenForHeight } from '../typography-rules.js';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { deriveTiming, stretchTiming } from '../timing-plan.js';
import { clampLayout } from './clamp.js';
import { salvageEpisode, salvageScene, type Repair } from './salvage.js';

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

/** A surface with its own copy: overlapping it means clipped text. */
function carriesText(element: Unknown): boolean {
  const params = element['params'];
  const primitive = element['primitive'];

  if (!isObject(params) || !['pill', 'bubble'].includes(String(primitive))) {
    return false;
  }

  const text = params['text'];

  return typeof text === 'string' && text.trim() !== '';
}

function containsBox(outer: Boxed, inner: Boxed): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

function asBoxed(element: Unknown): Boxed | null {
  const primitive = element['primitive'];
  const box = rawBox(element);

  if (typeof primitive !== 'string' || !SURFACE_PRIMITIVES.has(primitive) || box === null) {
    return null;
  }

  return { element, ...box };
}

function rawBox(element: Unknown): { x: number; y: number; width: number; height: number } | null {
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

      if (overlap === 0) {
        continue;
      }

      /* A chip inside a card is a design, not an overlap. */
      if (containsBox(first.box, second.box) || containsBox(second.box, first.box)) {
        continue;
      }

      const textBearing =
        carriesText(first.box.element) || carriesText(second.box.element);
      const smaller = Math.min(
        first.box.width * first.box.height,
        second.box.width * second.box.height,
      );

      /* Plain shapes may collage; a text surface cannot share pixels with
         another text surface — the copy gets clipped by the neighbour. */
      if (!textBearing && overlap > smaller * INTENTIONAL_OVERLAP) {
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
      const belowY = first.box.y + first.box.height + MIN_GAP;
      const fitsRight = rightX + second.box.width <= CRITICAL_SAFE_BOUNDS.right;
      const fitsBelow = belowY + second.box.height <= CRITICAL_SAFE_BOUNDS.bottom;
      /* Separation must not push a box out of the frame: when neither side has
         room, the overlap stays — a visible surface is worth more than 16px. */
      const next = fitsRight
        ? { x: rightX, y: second.box.y }
        : fitsBelow
          ? { x: second.box.x, y: belowY }
          : null;

      if (next === null) {
        continue;
      }

      result[second.index] = { ...target, layout: { ...layout, ...next } };
      boxes[j] = {
        ...second,
        box: { ...second.box, x: next.x, y: next.y },
      };
    }
  }

  return result;
}

/** Air between a label and the card it sits on. */
const MIN_TEXT_INSET = 24;

/**
 * A label on a card is placed by coordinates, so the card's `padding` never
 * moves it: the model puts the text on the rounded edge and the frame reads as
 * a missing inset. Shifting the label inside keeps the composition and fixes
 * the edge. Text wider than the card minus the inset is left alone.
 */
function applyInsets(elements: readonly Unknown[]): Unknown[] {
  const result = elements.map((element) => ({ ...element }));
  const cards = result
    .map((element) => ({ element, box: rawBox(element) }))
    .filter(
      (item): item is { element: Unknown; box: NonNullable<ReturnType<typeof rawBox>> } =>
        item.box !== null && item.element['primitive'] === 'card',
    );

  for (const element of result) {
    if (element['primitive'] !== 'label') {
      continue;
    }

    const box = rawBox(element);

    if (box === null) {
      continue;
    }

    for (const card of cards) {
      const cardBox = card.box;
      const overlapX =
        Math.min(box.x + box.width, cardBox.x + cardBox.width) - Math.max(box.x, cardBox.x);
      const overlapY =
        Math.min(box.y + box.height, cardBox.y + cardBox.height) - Math.max(box.y, cardBox.y);

      if (overlapX <= 0 || overlapY <= 0) {
        continue;
      }

      /* A label that merely grazes a card is not "inside" it. */
      if (overlapX * overlapY < box.width * box.height * 0.5) {
        continue;
      }

      const layout = element['layout'];

      if (!isObject(layout)) {
        continue;
      }

      const next = { ...layout };
      const maxWidth = cardBox.width - MIN_TEXT_INSET * 2;

      /* Text wider than the card's inner area is narrowed: padding means the
         copy stops before the edge, and the renderer wraps it. */
      if (maxWidth > 0) {
        const width = Math.min(box.width, maxWidth);

        next['width'] = width;
        next['x'] = Math.min(
          Math.max(box.x, cardBox.x + MIN_TEXT_INSET),
          cardBox.x + cardBox.width - MIN_TEXT_INSET - width,
        );
      }

      if (cardBox.height >= box.height + MIN_TEXT_INSET * 2) {
        next['y'] = Math.min(
          Math.max(box.y, cardBox.y + MIN_TEXT_INSET),
          cardBox.y + cardBox.height - MIN_TEXT_INSET - box.height,
        );
      }

      if (
        next['x'] !== layout['x'] ||
        next['y'] !== layout['y'] ||
        next['width'] !== layout['width']
      ) {
        element['layout'] = next;
        box.x = Number(next['x']);
        box.y = Number(next['y']);
        box.width = Number(next['width'] ?? box.width);
      }
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
  const salvaged = salvageEpisode(raw, repairs);

  if (!isObject(salvaged) || !Array.isArray(salvaged['scenes'])) {
    return salvaged;
  }

  return {
    ...salvaged,
    scenes: salvaged['scenes'].map((rawScene) => {
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

      /* Timing: an ordered list without `at` becomes absolute cues here. The
         cue list fills the planned scene instead of leaving a frozen tail. */
      const sequence = spec['sequence'];
      const ordered = Array.isArray(sequence) ? sequence.filter(isObject) : [];
      const needsTiming = ordered.some((step) => step['at'] === undefined);
      const planned = typeof scene['durationSec'] === 'number' ? scene['durationSec'] : 0;
      const timing = needsTiming
        ? stretchTiming(
            deriveTiming(
              ordered.map((step) => ({
                element: String(step['element'] ?? ''),
                transition: String(step['transition'] ?? ''),
                ...(typeof step['text'] === 'string' ? { text: step['text'] } : {}),
              })),
            ),
            planned,
          )
        : null;

      return {
        ...scene,
        ...(timing === null ? {} : { durationSec: timing.durationSec }),
        spec: {
          ...spec,
          ...(timing === null ? {} : { sequence: timing.cues }),
          elements: applyInsets(separateSurfaces(elements.map(normalizeElement))),
        },
      };
    }),
  };
}
