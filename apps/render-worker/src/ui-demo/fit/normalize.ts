import { TYPE_BOX_RULES, tokenForHeight } from '../typography-rules.js';
import { CANVAS, CRITICAL_SAFE_BOUNDS } from '../platform.js';
import {
  deriveTiming,
  sceneDurationSec,
  sceneFloorSec,
  stretchTiming,
} from '../timing-plan.js';
import {
  accentPlate,
  accentPlateInk,
  UI_THEME_IDS,
  themeById,
  type UiTheme,
  type UiThemeId,
} from '../themes.js';
import { clampLayout } from './clamp.js';
import { snapThemeColors } from './colors.js';
import { contrast, toneColor } from '../quality.js';
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

      /* Text must sit inside the padding; a track or a line that merely crosses
         the edge still has to respect it. */
      const minimal = primitive === 'track' || primitive === 'line' ? 1 : box.width * box.height * 0.5;

      if (overlapX * overlapY < minimal) {
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

/**
 * A progress rail is a long bar filled along its short side. Models sometimes
 * declare a tall box for it — "the total grew taller" reads as vertical — and
 * the renderer then stretched the rail into that box, with the fill running
 * across 24 px. The contract's `length` and `thickness` own the geometry; the
 * box is rebuilt around them, centred where the model put it.
 */
function repairTracks(elements: readonly Unknown[], repairs: Repair[]): Unknown[] {
  return elements.map((element) => {
    if (element['primitive'] !== 'track' || !isObject(element['layout'])) {
      return element;
    }

    const layout = element['layout'] as Record<string, unknown>;
    const params = isObject(element['params']) ? element['params'] : {};

    if (typeof layout['x'] !== 'number' || typeof layout['y'] !== 'number') {
      return element;
    }

    const width = typeof layout['width'] === 'number' ? layout['width'] : 0;
    const height = typeof layout['height'] === 'number' ? layout['height'] : 0;
    const declaredLength = typeof params['length'] === 'number' ? params['length'] : null;
    const declaredThickness =
      typeof params['thickness'] === 'number' ? params['thickness'] : null;
    const long = Math.max(width, height, declaredLength ?? 0);
    const short = Math.min(...[width, height, declaredThickness ?? Number.POSITIVE_INFINITY]
      .filter((value) => value > 0));

    if (!(long > 0) || !(short > 0)) {
      return element;
    }

    const length = Math.min(long, CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left);
    const thickness = Math.min(short, length);
    const centreX = layout['x'] + width / 2;
    const centreY = layout['y'] + height / 2;
    const x = Math.min(
      Math.max(CRITICAL_SAFE_BOUNDS.left, centreX - length / 2),
      CRITICAL_SAFE_BOUNDS.right - length,
    );
    const y = Math.min(Math.max(0, centreY - thickness / 2), CANVAS.height - thickness);

    const nextLayout = { x, y, width: length, height: thickness };

    if (
      width === length &&
      height === thickness &&
      params['length'] === length &&
      params['thickness'] === thickness
    ) {
      return element;
    }

    repairs.push({
      element: typeof element['id'] === 'string' ? element['id'] : null,
      path: 'track-axis',
      reason: 'a progress rail is horizontal: the box is rebuilt from length and thickness',
      from: `${width}x${height}`,
      to: `${length}x${thickness}`,
    });

    return {
      ...element,
      layout: nextLayout,
      params: { ...params, length, thickness },
    };
  });
}

/**
 * A divider belongs to the surface it sits on. A line whose middle lands inside
 * a card is snapped to that card's edge so it cannot hide underneath or stick
 * out of the frame like a stray tick.
 */
function repairLines(elements: readonly Unknown[], repairs: Repair[]): Unknown[] {
  const surfaces = elements.filter((element) => {
    const primitive = element['primitive'];
    const layout = element['layout'];

    return (
      (primitive === 'card' || primitive === 'pill' || primitive === 'bubble') &&
      isObject(layout) &&
      typeof layout['x'] === 'number' &&
      typeof layout['y'] === 'number' &&
      typeof layout['width'] === 'number' &&
      typeof layout['height'] === 'number'
    );
  });

  return elements.map((element) => {
    if (element['primitive'] !== 'line' || !isObject(element['params'])) {
      return element;
    }

    const params = element['params'];
    const x1 = params['fromX'];
    const y1 = params['fromY'];
    const x2 = params['toX'];
    const y2 = params['toY'];

    if (
      typeof x1 !== 'number' ||
      typeof y1 !== 'number' ||
      typeof x2 !== 'number' ||
      typeof y2 !== 'number'
    ) {
      return element;
    }

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const host = surfaces.find((surface) => {
      const layout = surface['layout'] as Record<string, number>;

      return (
        midX >= layout['x']! &&
        midX <= layout['x']! + layout['width']! &&
        midY >= layout['y']! &&
        midY <= layout['y']! + layout['height']!
      );
    });

    if (host === undefined) {
      return element;
    }

    const layout = host['layout'] as Record<string, number>;
    const inset = 8;
    const left = layout['x']! + inset;
    const right = layout['x']! + layout['width']! - inset;
    const top = layout['y']! + inset;
    const bottom = layout['y']! + layout['height']! - inset;
    const clampX = (value: number): number => Math.min(Math.max(value, left), right);
    const clampY = (value: number): number => Math.min(Math.max(value, top), bottom);
    const next = {
      fromX: clampX(x1),
      fromY: clampY(y1),
      toX: clampX(x2),
      toY: clampY(y2),
    };

    if (
      next.fromX === x1 &&
      next.fromY === y1 &&
      next.toX === x2 &&
      next.toY === y2
    ) {
      return element;
    }

    repairs.push({
      element: typeof element['id'] === 'string' ? element['id'] : null,
      path: 'line-inside-surface',
      reason: 'a divider belongs to its surface: the segment is snapped to the surface edge',
      from: `${x1}..${x2} / ${y1}..${y2}`,
      to: `${next.fromX}..${next.toX} / ${next.fromY}..${next.toY}`,
    });

    return { ...element, params: { ...params, ...next } };
  });
}

/**
 * A card without its own caption that swallows its children leaves a hole in
 * the frame: the surface is drawn at a size the content never fills. Hug the
 * content instead of keeping the author's box.
 */
function shrinkCards(elements: readonly Unknown[], repairs: Repair[]): Unknown[] {
  return elements.map((element) => {
    if (element['primitive'] !== 'card' || !isObject(element['layout'])) {
      return element;
    }

    const params = isObject(element['params']) ? element['params'] : {};
    const caption = params['text'];

    if (typeof caption === 'string' && caption.trim() !== '') {
      return element;
    }

    const box = element['layout'] as Record<string, number>;
    const outer = {
      x: box['x'] ?? 0,
      y: box['y'] ?? 0,
      width: box['width'] ?? 0,
      height: box['height'] ?? 0,
    };

    if (!(outer.width > 0 && outer.height > 0)) {
      return element;
    }

    const children = elements.filter((other) => {
      if (other === element || !isObject(other['layout'])) {
        return false;
      }

      const inner = other['layout'] as Record<string, number>;
      const child = {
        x: inner['x'] ?? 0,
        y: inner['y'] ?? 0,
        width: inner['width'] ?? 0,
        height: inner['height'] ?? 0,
      };

      return child.width > 0 && child.height > 0 && containsBox(outer, child);
    });

    if (children.length === 0) {
      return element;
    }

    const boxes = children.map((child) => child['layout'] as Record<string, number>);
    const left = Math.min(...boxes.map((inner) => inner['x'] ?? 0));
    const top = Math.min(...boxes.map((inner) => inner['y'] ?? 0));
    const right = Math.max(...boxes.map((inner) => (inner['x'] ?? 0) + (inner['width'] ?? 0)));
    const bottom = Math.max(...boxes.map((inner) => (inner['y'] ?? 0) + (inner['height'] ?? 0)));
    const contentArea = (right - left) * (bottom - top);

    if (contentArea >= 0.5 * outer.width * outer.height) {
      return element;
    }

    const pad = 40;
    const x = Math.max(0, left - pad);
    const y = Math.max(0, top - pad);
    const width = Math.min(CANVAS.width - x, right - left + pad * 2);
    const height = Math.min(CANVAS.height - y, bottom - top + pad * 2);

    repairs.push({
      element: typeof element['id'] === 'string' ? element['id'] : null,
      path: 'card-hugs-content',
      reason: 'an empty surface reads as a hole: the box shrinks to the content it holds',
      from: `${outer.width}x${outer.height}`,
      to: `${width}x${height}`,
    });

    return { ...element, layout: { x, y, width, height } };
  });
}

function stackTracks(elements: readonly Unknown[], repairs: Repair[]): Unknown[] {
  /* A rail that lands on a captioned surface is unreadable: slide it below that
     surface instead of leaving the fill hidden under a card. */
  const surfaces = elements
    .filter((element) =>
      ['card', 'pill', 'bubble'].includes(String(element['primitive'])),
    )
    .map((element) => ({
      box: rawBox(element),
      text: (element['params'] as Record<string, unknown> | undefined)?.['text'],
    }))
    .filter(
      (item): item is { box: { x: number; y: number; width: number; height: number }; text: string } =>
        item.box !== null && typeof item.text === 'string' && item.text.trim() !== '',
    );

  const out = elements.map((element) => {
    const box = rawBox(element);

    if (element['primitive'] !== 'track' || box === null) {
      return element;
    }

    const hits = surfaces.filter((surface) => intersects(box, surface.box) > 0);

    if (hits.length === 0) {
      return element;
    }

    const bottom = Math.max(...hits.map((surface) => surface.box.y + surface.box.height));
    const left = Math.min(...hits.map((surface) => surface.box.x));
    const width = Math.min(
      box.width,
      CRITICAL_SAFE_BOUNDS.right - Math.max(left, CRITICAL_SAFE_BOUNDS.left),
    );
    const y = Math.min(bottom + 24, CANVAS.height - box.height);

    repairs.push({
      element: typeof element['id'] === 'string' ? element['id'] : null,
      path: 'track-below-surface',
      reason: 'the rail was hidden under a captioned surface',
      from: String(box.y),
      to: String(y),
    });

    return {
      ...element,
      layout: { ...box, x: Math.max(left, CRITICAL_SAFE_BOUNDS.left), y, width },
      params: isObject(element['params']) ? { ...element['params'], length: width } : element['params'],
    };
  });

  const rails: Array<{
    index: number;
    box: { x: number; y: number; width: number; height: number };
    element: Unknown;
  }> = [];

  out.forEach((element, index) => {
    const box = rawBox(element);

    if (element['primitive'] === 'track' && box !== null) {
      rails.push({ index, box, element });
    }
  });

  rails.sort((left, right) => left.box.y - right.box.y || left.index - right.index);

  const stacked = [...out];
  let previous: { x: number; y: number; width: number; height: number } | null = null;

  for (const rail of rails) {
    if (previous !== null && intersects(rail.box, previous) > 0) {
      /* Stacked instead of overlapping: two horizontal rails read as a comparison
         when one sits under the other, aligned to the same left edge. */
      const y = Math.min(
        previous.y + previous.height + 24,
        CANVAS.height - rail.box.height,
      );
      const nextBox: { x: number; y: number; width: number; height: number } = {
        ...rail.box,
        x: previous.x,
        y,
      };

      stacked[rail.index] = { ...rail.element, layout: nextBox };
      repairs.push({
        element: typeof rail.element['id'] === 'string' ? rail.element['id'] : null,
        path: 'track-stack',
        reason: 'rails are stacked instead of overlapping',
        from: String(previous.y),
        to: String(y),
      });
      previous = nextBox;

      continue;
    }

    previous = rail.box;
  }

  return stacked;
}

/** Tokens the hierarchy gate accepts as the main message. */
const HIERARCHY_TOKENS = ['card', 'headline', 'display'] as const;

/**
 * Colour is the code's job. When the model puts white copy on an accent plate,
 * the gate rejects the scene for contrast; the honest repair is to pick the ink
 * the palette already has rather than burn a retry on a colour.
 */
function fixContrast(
  elements: readonly Unknown[],
  theme: UiTheme | null,
  repairs: Repair[],
): Unknown[] {
  if (theme === null) {
    return [...elements];
  }

  const stageFill = elements
    .map((element) => (element['primitive'] === 'stage' ? element['params'] : null))
    .map((params) => (isObject(params) && typeof params['background'] === 'string' ? params['background'] : null))
    .find((value) => value !== null);
  const frame = stageFill ?? theme.background;

  return elements.map((element) => {
    const primitive = element['primitive'];
    const layout = element['layout'];

    if (
      !['label', 'pill', 'bubble'].includes(String(primitive)) ||
      !isObject(element['params']) ||
      !isObject(layout)
    ) {
      return element;
    }

    const params = element['params'];
    const box = rawBox(element);
    const tone = typeof params['tone'] === 'string' ? params['tone'] : undefined;
    const explicit = typeof params['textColor'] === 'string' ? params['textColor'] : null;
    const color = explicit ?? toneColor(theme, tone);

    if (color === null || box === null) {
      return element;
    }

    const container = elements
      .filter((other) => other !== element && ['card', 'pill', 'bubble'].includes(String(other['primitive'])))
      .map((other) => ({
        background: (other['params'] as Record<string, unknown> | undefined)?.['background'],
        box: rawBox(other),
      }))
      .filter(
        (item): item is { background: string; box: { x: number; y: number; width: number; height: number } } =>
          item.box !== null && typeof item.background === 'string' && containsBox(item.box, box),
      )
      .pop();
    const background =
      (typeof params['background'] === 'string' ? params['background'] : null) ??
      container?.background ??
      frame;
    const large = typeof params['token'] === 'string' && HIERARCHY_TOKENS.includes(params['token'] as never);
    const threshold = large ? 3 : 4.5;
    const current = contrast(color, background);

    if (current === null || current >= threshold) {
      return element;
    }

    const candidates = [theme.ink, theme.accentInk, '#FFFFFF', '#0B0B0C'];
    const best = candidates
      .map((candidate) => ({ candidate, ratio: contrast(candidate, background) ?? 0 }))
      .sort((left, right) => right.ratio - left.ratio)[0];

    if (best === undefined || best.ratio < threshold) {
      return element;
    }

    repairs.push({
      element: typeof element['id'] === 'string' ? element['id'] : null,
      path: 'contrast-fixed',
      reason: `ink on ${background} had ${current.toFixed(2)}:1`,
      from: color,
      to: best.candidate,
    });

    const rest = { ...params };

    delete rest['tone'];

    return { ...element, params: { ...rest, textColor: best.candidate } };
  });
}

/** The smallest accepted token that fits the box, so promotion adds as little copy pressure as possible. */
function hierarchyTokenFor(height: number): string {
  for (const token of HIERARCHY_TOKENS) {
    const rule = TYPE_BOX_RULES[token];

    if (height >= rule.minHeight && height <= rule.maxHeight) {
      return token;
    }
  }

  return 'card';
}

/**
 * An empty surface may have been the main message: the model draws a big coin,
 * the empty-surface rule removes it, and the scene is left with body copy only.
 * Instead of failing the hierarchy gate, the largest remaining text is promoted
 * to the smallest large token its box can hold — the copy stays, the frame gets
 * a main message back.
 */
function ensureHierarchy(elements: readonly Unknown[], repairs: Repair[]): Unknown[] {
  const withText = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element['primitive'] !== 'stage')
    .filter(({ element }) => {
      const params = isObject(element['params']) ? element['params'] : null;

      return (
        params !== null &&
        typeof params['text'] === 'string' &&
        params['text'].trim() !== ''
      );
    });

  const hasLarge = withText.some(({ element }) => {
    const token = (element['params'] as Record<string, unknown>)['token'];

    return typeof token === 'string' && (HIERARCHY_TOKENS as readonly string[]).includes(token);
  });

  if (hasLarge || withText.length === 0) {
    return [...elements];
  }

  const target = withText
    .map(({ element, index }) => {
      const layout = isObject(element['layout']) ? element['layout'] : {};
      const width = typeof layout['width'] === 'number' ? layout['width'] : 0;
      const height = typeof layout['height'] === 'number' ? layout['height'] : 0;

      return { element, index, area: width * height, height };
    })
    .sort((left, right) => right.area - left.area || left.index - right.index)[0];

  if (target === undefined) {
    return [...elements];
  }

  const params = target.element['params'] as Record<string, unknown>;
  const token = hierarchyTokenFor(target.height);
  const next = [...elements];

  next[target.index] = { ...target.element, params: { ...params, token } };
  repairs.push({
    element: typeof target.element['id'] === 'string' ? target.element['id'] : null,
    path: 'hierarchy-promoted',
    reason: 'the main token left with a removed surface; the largest text takes its place',
    from: typeof params['token'] === 'string' ? params['token'] : '-',
    to: token,
  });

  return next;
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

      const sceneTheme =
        typeof scene['themeId'] === 'string'
          ? scene['themeId']
          : typeof salvaged['themeId'] === 'string'
            ? salvaged['themeId']
            : 'studio-dark';
      const theme = (UI_THEME_IDS as readonly string[]).includes(sceneTheme)
        ? themeById(sceneTheme as UiThemeId)
        : null;
      /* Colour is a theme decision, not a model one: roles and palette hexes are
         resolved before geometry, so the gates compare palette colours only. */
      const normalized = elements.map(normalizeElement);
      const colored = theme === null ? normalized : snapThemeColors(normalized, theme, repairs);
      /* Geometry next: insets and separation decide the final boxes, and only
         then can "empty" be judged — a card may have received its label. */
      const prepared = applyInsets(separateSurfaces(colored));
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

      /* A scene without an accent has no focus: the model often draws the accent
         on a surface the empty-surface rule removes. The largest remaining
         element becomes the focus, which is both the accent and the hierarchy. */
      if (focus === undefined && finalElements.length > 0) {
        const accent = theme?.accent.toLowerCase();
        const hasAccent = finalElements.some((element) => {
          const params = isObject(element['params']) ? element['params'] : {};
          const tone = params['tone'];

          if (tone === 'accent') {
            return true;
          }

          return [params['color'], params['background'], params['textColor']].some(
            (value) =>
              accent !== undefined &&
              typeof value === 'string' &&
              value.toLowerCase() === accent,
          );
        });

        if (!hasAccent) {
          /* Prefer copy over surfaces: painting a focus on a card would repair
             its visibility, and an invisible surface is the model's defect, not
             ours to hide. */
          const target = finalElements
            .map((element, index) => {
              const params = isObject(element['params']) ? element['params'] : {};

              return {
                element,
                index,
                box: rawBox(element),
                text: typeof params['text'] === 'string' && params['text'].trim() !== '',
                copy: ['label', 'pill', 'bubble'].includes(String(element['primitive'])),
              };
            })
            .filter((item) => item.element['primitive'] !== 'stage' && item.box !== null && item.text)
            .sort(
              (left, right) =>
                Number(right.copy) - Number(left.copy) ||
                (right.box?.width ?? 0) * (right.box?.height ?? 0) -
                  (left.box?.width ?? 0) * (left.box?.height ?? 0) ||
                left.index - right.index,
            )[0];

          if (target !== undefined && typeof target.element['id'] === 'string') {
            focus = target.element['id'];
            finalElements = applyFocus(finalElements, focus, theme);
            repairs.push({
              element: target.element['id'],
              path: 'focus-assigned',
              reason: 'the scene had no accent: the largest element becomes the focus',
              from: '-',
              to: target.element['id'],
            });
          }
        }
      }

      /* Timing: an ordered list without `at` becomes absolute cues here. The
         cue list fills the planned scene instead of leaving a frozen tail. */
      const sequence = spec['sequence'];
      const ordered = (Array.isArray(sequence) ? sequence.filter(isObject) : []).filter(
        (step) => !dropped.has(String(step['element'])),
      );
      /* A press the model wrote must have an answer: if the target has no
         activate step, one is inserted right after the tap. The gesture stays,
         and the frame shows a reaction instead of a cursor that lands for nothing. */
      const answered = new Set(
        ordered
          .filter((step) => step['transition'] === 'activate')
          .map((step) => String(step['element'])),
      );
      const withAnswers: Unknown[] = [];

      for (const step of ordered) {
        withAnswers.push(step);

        const target = step['target'];

        if (
          step['transition'] === 'tap' &&
          typeof target === 'string' &&
          !answered.has(target)
        ) {
          withAnswers.push({ element: target, transition: 'activate' });
          answered.add(target);
          repairs.push({
            element: target,
            path: 'tap-answer',
            reason: 'the target answers the press',
            from: '-',
            to: 'activate',
          });
        }
      }

      const steps = withAnswers;
      const needsTiming = steps.some((step) => step['at'] === undefined);
      const planned = typeof scene['durationSec'] === 'number' ? scene['durationSec'] : 0;
      const derived = needsTiming
        ? deriveTiming(
            steps.map((step) => ({
              element: String(step['element'] ?? ''),
              transition: String(step['transition'] ?? ''),
              ...(typeof step['weight'] === 'number' ? { weight: step['weight'] } : {}),
              ...(typeof step['text'] === 'string' ? { text: step['text'] } : {}),
              ...(typeof step['target'] === 'string' ? { target: step['target'] } : {}),
              ...(typeof step['at'] === 'number' ? { at: step['at'] } : {}),
            })),
          )
        : null;
      /* The arc's seconds are the timing contract: a scene lives until its
         action finishes and holds long enough to be read, and a longer plan is
         filled by stretching the action, not by a frozen tail. */
      const cues = derived === null
        ? steps.map((step) => ({
            at: typeof step['at'] === 'number' ? step['at'] : 0,
            transition: String(step['transition'] ?? ''),
          }))
        : derived.cues;
      const durationSec = cues.length === 0
        ? planned
        : derived === null
          ? Math.max(planned, sceneFloorSec(cues))
          : sceneDurationSec({ plannedSec: planned, cues });
      const stretched =
        derived === null ? null : stretchTiming(derived, durationSec);
      const timing =
        stretched === null
          ? null
          : { cues: stretched.cues, durationSec: stretched.durationSec };

      /* Rails last: the box must agree with the contract before the quality gate
         sees the scene. */
      finalElements = ensureHierarchy(finalElements, repairs);
      finalElements = fixContrast(finalElements, theme, repairs);
      finalElements = shrinkCards(stackTracks(repairTracks(repairLines(finalElements, repairs), repairs), repairs), repairs);

      return {
        ...scene,
        ...(durationSec > 0 ? { durationSec } : {}),
        spec: {
          ...spec,
          ...(timing === null ? {} : { sequence: timing.cues }),
          ...(timing !== null ? {} : dropped.size === 0 && steps === ordered ? {} : {
            sequence: steps,
          }),
          ...(focus === undefined ? { focus: undefined } : { focus }),
          elements: finalElements,
        },
      };
    }),
  };
}
