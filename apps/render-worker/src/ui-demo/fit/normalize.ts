import { tokenForHeight } from '../typography-rules.js';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { deriveTiming, stretchTiming } from '../timing-plan.js';
import {
  accentPlate,
  accentPlateInk,
  UI_THEME_IDS,
  themeById,
  type UiTheme,
  type UiThemeId,
} from '../themes.js';
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

function containsBox(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
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

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
}

function separateSurfaces(elements: readonly Unknown[]): Unknown[] {
  const result = elements.map((element) => ({ ...element }));
  const boxes = result
    .map((element, index) => ({ index, box: asBoxed(element) }))
    .filter((item): item is { index: number; box: Boxed } => item.box !== null);
  /* A card with a label on it is text-bearing even though the card itself has no
     `text`: overlaps were judged by the card's own copy only, so two labelled
     cards could share pixels. */
  const textInside = result
    .filter((element) => ['label', 'pill', 'bubble'].includes(String(element['primitive'])))
    .map((element) => rawBox(element))
    .filter((box): box is NonNullable<ReturnType<typeof rawBox>> => box !== null);

  const coveredByText = (box: Boxed): boolean => {
    if (carriesText(box.element)) {
      return true;
    }

    return textInside.some((text) => {
      if (text.x === box.x && text.y === box.y && text.width === box.width) {
        return false;
      }

      return intersects(text, box) >= text.width * text.height * 0.5;
    });
  };

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

      const textBearing = coveredByText(first.box) || coveredByText(second.box);
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
        /* No room to the right or below: the overlap stays and the validator
           rejects it for text surfaces. Shrinking the card here looked helpful
           but narrowed the copy inside and turned a layout problem into a text
           overflow. The model has to make the cards narrower itself. */
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

/** Air between content and the card edge when the card declares none. */
const MIN_INSET = 24;/** Elements placed on a card by coordinates, not laid out inside it. */
const INSET_PRIMITIVES = new Set(['label', 'pill', 'bubble', 'track', 'thumb']);

function cardPadding(card: Unknown): number {
  const params = card['params'];
  const padding = isObject(params) ? params['padding'] : undefined;

  return typeof padding === 'number' && Number.isFinite(padding)
    ? Math.max(MIN_INSET, Math.round(padding))
    : MIN_INSET;
}

/**
 * A child of a card is placed by coordinates, so the card's `padding` never
 * moves it: the model puts a label on the rounded edge or a track across the
 * whole card. Code applies the padding to the box, narrows text to the inner
 * width and shortens a track to it. Geometry repair, not a new composition.
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
    const primitive = element['primitive'];

    if (typeof primitive !== 'string' || !INSET_PRIMITIVES.has(primitive)) {
      continue;
    }

    const box = rawBox(element);

    if (box === null) {
      continue;
    }

    for (const card of cards) {
      if (card.element === element) {
        continue;
      }

      const cardBox = card.box;
      const overlapX =
        Math.min(box.x + box.width, cardBox.x + cardBox.width) - Math.max(box.x, cardBox.x);
      const overlapY =
        Math.min(box.y + box.height, cardBox.y + cardBox.height) - Math.max(box.y, cardBox.y);

      /* An element that merely grazes a card is not inside it. */
      if (overlapX <= 0 || overlapY <= 0) {
        continue;
      }

      if (overlapX * overlapY < box.width * box.height * 0.5) {
        continue;
      }

      const layout = element['layout'];

      if (!isObject(layout)) {
        continue;
      }

      const pad = cardPadding(card.element);
      const innerX = cardBox.x + pad;
      const innerY = cardBox.y + pad;
      const innerWidth = cardBox.width - pad * 2;
      const innerHeight = cardBox.height - pad * 2;

      if (innerWidth <= 0 || innerHeight <= 0) {
        continue;
      }

      const next = { ...layout };
      const width = Math.min(box.width, innerWidth);
      const height = Math.min(box.height, innerHeight);

      next['x'] = Math.min(Math.max(box.x, innerX), innerX + innerWidth - width);
      next['y'] = Math.min(Math.max(box.y, innerY), innerY + innerHeight - height);

      if (width !== box.width) {
        next['width'] = width;

        /* A track's rail is a parameter, not the box: shorten it too, or the
           bar still runs past the padding. */
        if (primitive === 'track') {
          const params = element['params'];

          if (isObject(params) && typeof params['length'] === 'number') {
            element['params'] = {
              ...params,
              length: Math.min(params['length'], innerWidth),
            };
          }
        }
      }

      if (height !== box.height && primitive !== 'track') {
        next['height'] = height;
      }

      if (
        next['x'] !== layout['x'] ||
        next['y'] !== layout['y'] ||
        next['width'] !== layout['width'] ||
        next['height'] !== layout['height']
      ) {
        element['layout'] = next;
        box.x = Number(next['x']);
        box.y = Number(next['y']);
        box.width = Number(next['width'] ?? box.width);
        box.height = Number(next['height'] ?? box.height);
      }
    }
  }

  return result;
}

/**
 * The bridge before `card.text` reaches every caller: a surface with no copy and
 * nothing inside is removed instead of rejecting the scene. The repair carries
 * its own code, so "accepted without repairs" stays honest.
 */
function dropEmptySurfaces(
  elements: readonly Unknown[],
  repairs: Repair[],
  themeId: string,
): { elements: Unknown[]; dropped: Set<string> } {
  const surfaces = elements
    .filter((element) => ['card', 'pill', 'bubble'].includes(String(element['primitive'])))
    .map((element) => ({ element, box: rawBox(element) }))
    .filter(
      (item): item is { element: Unknown; box: NonNullable<ReturnType<typeof rawBox>> } =>
        item.box !== null,
    );
  const hasOwnText = (element: Unknown): boolean => {
    const params = element['params'];

    return (
      isObject(params) &&
      typeof params['text'] === 'string' &&
      params['text'].trim() !== ''
    );
  };
  const containsSomething = (surface: Unknown, box: NonNullable<ReturnType<typeof rawBox>>): boolean =>
    elements.some((other) => {
      if (other === surface || other['primitive'] === 'stage') {
        return false;
      }

      const inner = rawBox(other);

      return inner !== null && containsBox(box, inner);
    });
  const blanks = surfaces.filter((candidate) => {
    if (hasOwnText(candidate.element) || containsSomething(candidate.element, candidate.box)) {
      return false;
    }

    return !surfaces.some(
      (other) =>
        other.element !== candidate.element && containsBox(other.box, candidate.box),
    );
  });
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(a, b) * 0.1;
  const compared = (blank: (typeof blanks)[number]): boolean =>
    blanks.some(
      (other) =>
        other.element !== blank.element &&
        ((near(other.box.width, blank.box.width) &&
          Math.abs(other.box.height - blank.box.height) > blank.box.height * 0.2) ||
          (near(other.box.height, blank.box.height) &&
            Math.abs(other.box.width - blank.box.width) > blank.box.width * 0.2)),
    );
  const droppedElements = new Set<Unknown>();
  const dropped = new Set<string>();
  const theme = (UI_THEME_IDS as readonly string[]).includes(themeId)
    ? themeById(themeId as UiThemeId)
    : null;
  const accent = theme?.accent.toLowerCase() ?? null;
  const accentInk = theme?.accentInk ?? '#0B0B0C';
  const carriesAccent = (element: Unknown): boolean => {
    const params = element['params'];

    return (
      accent !== null &&
      isObject(params) &&
      typeof params['background'] === 'string' &&
      params['background'].toLowerCase() === accent
    );
  };

  for (const blank of blanks) {
    if (compared(blank)) {
      continue;
    }

    const id = blank.element['id'];

    /* The accent is a property of a surface, not a block: before the empty card
       goes, its lime fill moves to a captioned surface that stays. */
    if (carriesAccent(blank.element)) {
      const target = surfaces
        .filter(
          (candidate) =>
            candidate.element !== blank.element &&
            !droppedElements.has(candidate.element) &&
            hasOwnText(candidate.element),
        )
        .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];

      if (target !== undefined) {
        const primitive = target.element['primitive'];
        const params = target.element['params'];
        const targetId = target.element['id'];

        if (isObject(params)) {
          target.element['params'] = {
            ...params,
            background: theme?.accent,
            ...(primitive === 'card' ? {} : { textColor: accentInk }),
          };
          repairs.push({
            element: typeof targetId === 'string' ? targetId : null,
            path: 'accent-transferred',
            reason: `accent moves from the removed "${String(id)}"`,
            from: String(id),
            to: String(targetId),
          });
        }
      }
    }

    repairs.push({
      element: typeof id === 'string' ? id : null,
      path: 'surface-removed',
      reason: 'empty surface',
      from: String(blank.element['primitive'] ?? 'surface'),
      to: '(removed)',
    });
    droppedElements.add(blank.element);

    if (typeof id === 'string') {
      dropped.add(id);
    }
  }

  return {
    elements: elements.filter((element) => !droppedElements.has(element)),
    dropped,
  };
}

/**
 * Box containment for raw boxes (the repair works before types are known).
 */
/** The declared focus gets the accent: a marked caption or an accent fill. */
function applyFocus(
  elements: readonly Unknown[],
  focus: unknown,
  theme: UiTheme | null,
): Unknown[] {
  if (typeof focus !== 'string' || theme === null) {
    return [...elements];
  }

  return elements.map((element) => {
    if (element['id'] !== focus) {
      return element;
    }

    const params = isObject(element['params']) ? { ...element['params'] } : {};
    const primitive = element['primitive'];

    if (primitive === 'label') {
      params['mark'] = true;
    } else if (primitive === 'pill' || primitive === 'bubble') {
      params['background'] = accentPlate(theme);
      params['textColor'] = accentPlateInk(theme);
    } else if (primitive === 'card') {
      params['background'] = accentPlate(theme);
    }

    return { ...element, params };
  });
}

function normalizeElement(element: Unknown): Unknown {  const primitive = element['primitive'];
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

      /* Geometry first: insets and separation decide the final boxes, and only
         then can "empty" be judged — a card may have received its label. */
      const prepared = applyInsets(separateSurfaces(elements.map(normalizeElement)));
      const sceneTheme =
        typeof scene['themeId'] === 'string'
          ? scene['themeId']
          : typeof salvaged['themeId'] === 'string'
            ? salvaged['themeId']
            : 'studio-dark';
      const theme = (UI_THEME_IDS as readonly string[]).includes(sceneTheme)
        ? themeById(sceneTheme as UiThemeId)
        : null;
      const focused = applyFocus(prepared, spec['focus'], theme);
      const { elements: kept, dropped } = dropEmptySurfaces(focused, repairs, sceneTheme);

      /* A focus can outlive its element: the blank it pointed at may have been
         removed. Retarget to the largest captioned surface instead of leaving a
         dangling reference and an "no accent" rejection. */
      let focus: unknown = spec['focus'];
      let finalElements = kept;

      if (typeof focus === 'string' && dropped.has(focus)) {
        const target = kept
          .filter(
            (element) =>
              ['card', 'pill', 'bubble'].includes(String(element['primitive'])) &&
              typeof (element['params'] as Record<string, unknown> | undefined)?.['text'] ===
                'string',
          )
          .sort((a, b) => {
            const first = rawBox(a);
            const second = rawBox(b);

            return (
              (second === null ? 0 : second.width * second.height) -
              (first === null ? 0 : first.width * first.height)
            );
          })[0];

        if (target !== undefined) {
          repairs.push({
            element: typeof target['id'] === 'string' ? target['id'] : null,
            path: 'focus-retargeted',
            reason: 'the focused element was removed',
            from: focus,
            to: String(target['id']),
          });
          focus = target['id'];
        } else {
          focus = undefined;
        }

        finalElements = applyFocus(kept, focus, theme);
      }

      /* Timing: an ordered list without `at` becomes absolute cues here. The
         cue list fills the planned scene instead of leaving a frozen tail. */
      const sequence = spec['sequence'];
      const ordered = (Array.isArray(sequence) ? sequence.filter(isObject) : []).filter(
        (step) => !dropped.has(String(step['element'])),
      );
      const needsTiming = ordered.some((step) => step['at'] === undefined);
      const planned = typeof scene['durationSec'] === 'number' ? scene['durationSec'] : 0;
      const timing = needsTiming
        ? stretchTiming(
            deriveTiming(
              ordered.map((step) => ({
                element: String(step['element'] ?? ''),
                transition: String(step['transition'] ?? ''),
                ...(typeof step['weight'] === 'number' ? { weight: step['weight'] } : {}),
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
          ...(timing !== null ? {} : dropped.size === 0 ? {} : {
            sequence: ordered,
          }),
          ...(focus === undefined ? { focus: undefined } : { focus }),
          elements: finalElements,
        },
      };
    }),
  };
}
