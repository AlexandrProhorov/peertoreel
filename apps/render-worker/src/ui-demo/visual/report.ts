import { CANVAS, CRITICAL_SAFE_BOUNDS, boundsHeight, boundsWidth } from '../platform.js';
import type { MeasuredBox, SceneMeasurement } from '../lint/measure.js';

/**
 * Visual measurements of a rendered scene — numbers, not verdicts.
 *
 * They exist to tell "the frame is empty" apart from "the frame is dense" and
 * to catch placeholder copy. They are deliberately not thresholds: a scene can
 * be sparse on purpose, and a rule like `elements >= 5` teaches the model to
 * fill space with noise. Read the report, do not gate on it.
 */

const GRID_STEP = 30;

export interface VisualReport {
  readonly sceneId: string;
  readonly frame: number;
  readonly boxes: number;
  /** Fraction of the content area covered by any box. */
  readonly occupied: number;
  /** Coverage of the left / centre / right third of the frame, 0..1 each. */
  readonly horizontal: readonly [number, number, number];
  /** Coverage of the top / middle / bottom third of the frame, 0..1 each. */
  readonly vertical: readonly [number, number, number];
  /** Independent clusters: boxes that touch belong to one cluster. */
  readonly groups: number;
  /** Largest single box as a fraction of the content area. */
  readonly largestShare: number;
  readonly textChars: number;
  /** Copy that reads as filler rather than content. */
  readonly placeholders: readonly string[];
}

function contentArea(): { left: number; top: number; right: number; bottom: number } {
  return CRITICAL_SAFE_BOUNDS;
}

function coveredCells(boxes: readonly MeasuredBox[]): {
  occupied: number;
  horizontal: [number, number, number];
  vertical: [number, number, number];
} {
  const columns = Math.ceil(CANVAS.width / GRID_STEP);
  const rows = Math.ceil(CANVAS.height / GRID_STEP);
  const cells = new Set<number>();
  const columnCells = [0, 0, 0];
  const rowCells = [0, 0, 0];

  for (const box of boxes) {
    const left = Math.max(0, box.rect.x);
    const top = Math.max(0, box.rect.y);
    const right = Math.min(CANVAS.width, box.rect.x + box.rect.width);
    const bottom = Math.min(CANVAS.height, box.rect.y + box.rect.height);

    if (right <= left || bottom <= top) {
      continue;
    }

    const fromColumn = Math.floor(left / GRID_STEP);
    const toColumn = Math.min(columns - 1, Math.floor(right / GRID_STEP));
    const fromRow = Math.floor(top / GRID_STEP);
    const toRow = Math.min(rows - 1, Math.floor(bottom / GRID_STEP));

    for (let row = fromRow; row <= toRow; row += 1) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        cells.add(row * columns + column);
      }
    }
  }

  /* Thirds are counted by cell, so a wide object covers every region it spans —
     a big box on the left that reaches the middle is not "left only". */
  for (const cell of cells) {
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    const columnIndex = Math.min(
      2,
      Math.floor((column * GRID_STEP) / (CANVAS.width / 3)),
    );
    const rowIndex = Math.min(
      2,
      Math.floor((row * GRID_STEP) / (CANVAS.height / 3)),
    );

    columnCells[columnIndex] = (columnCells[columnIndex] ?? 0) + 1;
    rowCells[rowIndex] = (rowCells[rowIndex] ?? 0) + 1;
  }

  const perColumn = columns / 3;
  const perRow = rows / 3;

  return {
    occupied: cells.size / (columns * rows),
    horizontal: [
      (columnCells[0] ?? 0) / (perColumn * rows),
      (columnCells[1] ?? 0) / (perColumn * rows),
      (columnCells[2] ?? 0) / (perColumn * rows),
    ],
    vertical: [
      (rowCells[0] ?? 0) / (columns * perRow),
      (rowCells[1] ?? 0) / (columns * perRow),
      (rowCells[2] ?? 0) / (columns * perRow),
    ],
  };
}

function touches(first: MeasuredBox, second: MeasuredBox): boolean {
  return (
    first.rect.x < second.rect.x + second.rect.width &&
    second.rect.x < first.rect.x + first.rect.width &&
    first.rect.y < second.rect.y + second.rect.height &&
    second.rect.y < first.rect.y + first.rect.height
  );
}

function clusterCount(boxes: readonly MeasuredBox[]): number {
  const parent = boxes.map((_, index) => index);

  const find = (index: number): number => {
    let current = index;

    while (parent[current] !== current) {
      current = parent[current] ?? current;
    }

    return current;
  };

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const first = boxes[i];
      const second = boxes[j];

      if (first !== undefined && second !== undefined && touches(first, second)) {
        parent[find(j)] = find(i);
      }
    }
  }

  return new Set(boxes.map((_, index) => find(index))).size;
}

const FILLER_WORDS =
  /^(текст|заголовок|подпись|кнопка|элемент|заглушка|пример|контент|placeholder|lorem)\b/i;
const TRAILING_NUMBER = /^(?<stem>[^\d]+?)\s*\d+$/u;

/**
 * Filler copy: a generic word, or the same stem repeated with a number —
 * "Подписка 1", "Подписка 2". One numbered item may be legitimate; a family of
 * them is not.
 */
function placeholdersOf(texts: readonly string[]): string[] {
  const found = new Set<string>();
  const stems = new Map<string, number>();
  const repeats = new Map<string, number>();

  for (const text of texts) {
    const trimmed = text.trim();

    if (FILLER_WORDS.test(trimmed)) {
      found.add(trimmed);
    }

    repeats.set(trimmed, (repeats.get(trimmed) ?? 0) + 1);

    const match = TRAILING_NUMBER.exec(trimmed);
    const stem = match?.groups?.['stem']?.trim().toLowerCase();

    if (stem !== undefined && stem.length > 1) {
      stems.set(stem, (stems.get(stem) ?? 0) + 1);
    }
  }

  for (const [stem, count] of stems) {
    if (count > 1) {
      found.add(`${stem} N (${count} шт.)`);
    }
  }

  /* The same label three times is a template, not content. */
  for (const [text, count] of repeats) {
    if (count > 2) {
      found.add(`${text} ×${count}`);
    }
  }

  return [...found];
}

export function describeScene(measurement: SceneMeasurement): VisualReport {
  /* A backdrop is a box that fills the frame; it is not content. */
  const backdrop = CANVAS.width * CANVAS.height * 0.9;
  const boxes = measurement.boxes.filter(
    (box) =>
      box.kind !== 'device' && box.rect.width * box.rect.height < backdrop,
  );
  const area = contentArea();
  const total = boundsWidth(area) * boundsHeight(area);
  const texts = measurement.boxes
    .map((box) => box.text ?? '')
    .filter((text) => text.trim().length > 0);
  const largest = boxes.reduce(
    (max, box) => Math.max(max, box.rect.width * box.rect.height),
    0,
  );
  const coverage = coveredCells(boxes);

  return {
    sceneId: measurement.sceneId,
    frame: measurement.frame,
    boxes: boxes.length,
    occupied: Number(coverage.occupied.toFixed(3)),
    horizontal: coverage.horizontal.map((value) => Number(value.toFixed(3))) as [
      number,
      number,
      number,
    ],
    vertical: coverage.vertical.map((value) => Number(value.toFixed(3))) as [
      number,
      number,
      number,
    ],
    groups: boxes.length === 0 ? 0 : clusterCount(boxes),
    largestShare: total === 0 ? 0 : Number(Math.min(1, largest / total).toFixed(3)),
    textChars: texts.reduce((sum, text) => sum + text.length, 0),
    placeholders: placeholdersOf(texts),
  };
}

export function describeMeasurements(
  measurements: readonly SceneMeasurement[],
): VisualReport[] {
  return measurements.map(describeScene);
}
