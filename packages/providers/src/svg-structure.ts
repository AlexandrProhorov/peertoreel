/**
 * Structural guard for generated SVG (M3.6b.6).
 *
 * The model occasionally draws a "top face" as a slanted quad above the body,
 * turning a flat front view into an isometric one. Prompt rules reduce the
 * chance; this check catches the geometry without a vision call. It runs on the
 * raw model output, before `normalizeSvg`, so normalization cannot hide it.
 *
 * v1 understands rects, polygons, and the path subset the prompt may use
 * (`M/L/H/V/l/h/v/z`). Curves (`C/Q/A`) are skipped: no detector, no guess.
 */

export const SVG_STRUCTURE_CODES = [
  'top_face_polygon',
  'perspective_transform',
] as const;
export type SvgStructureCode = (typeof SVG_STRUCTURE_CODES)[number];

export interface SvgStructureViolation {
  readonly code: SvgStructureCode;
  /** Russian reason, safe for the corrective retry prompt (≤500 chars). */
  readonly reason: string;
  /** Short element snippet for logs; never the whole document. */
  readonly element: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Body {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)/g;
const HORIZONTAL_TOLERANCE = 1;
const ADJACENCY_TOLERANCE = 6;
const MIN_SLANT = 8;
const MIN_AREA_FRACTION = 0.02;
const MIN_EDGE_OVERLAP = 0.6;
const DEFAULT_CANVAS = { width: 400, height: 400 };

const TRANSFORM_ELEMENT =
  /<([a-zA-Z][\w:-]*)\b[^>]*\btransform\s*=\s*["']([^"']*)["'][^>]*>/;
const VIEW_BOX =
  /viewBox\s*=\s*["']\s*[-+]?[\d.]+\s+[-+]?[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i;

const TOP_FACE_REASON =
  'Четырёхугольник с наклонными рёбрами образует верхнюю грань над корпусом; ' +
  'в плоской проекции верхняя плоскость не рисуется — корпус это один прямоугольник.';

const TRANSFORM_REASON =
  'Атрибут transform (поворот, наклон, матрица) запрещён: стиль плоский, ' +
  'все примитивы осевые, без поворотов и перспективы.';

function numbersOf(value: string): number[] {
  return (value.match(NUMBER) ?? []).map(Number);
}

function attributeOf(attributes: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(
    attributes,
  );
  const raw = match?.[1];

  if (raw === undefined) {
    return null;
  }

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

function canvasOf(svg: string): { width: number; height: number } {
  const match = VIEW_BOX.exec(svg);
  const width = match?.[1] === undefined ? Number.NaN : Number.parseFloat(match[1]);
  const height = match?.[2] === undefined ? Number.NaN : Number.parseFloat(match[2]);

  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : DEFAULT_CANVAS;
}

function rectsOf(svg: string): Body[] {
  const bodies: Body[] = [];

  for (const match of svg.matchAll(/<rect\b([^>]*?)\/?>/gi)) {
    const attributes = match[1] ?? '';
    const x = attributeOf(attributes, 'x') ?? 0;
    const y = attributeOf(attributes, 'y') ?? 0;
    const width = attributeOf(attributes, 'width');
    const height = attributeOf(attributes, 'height');

    if (width !== null && height !== null && width > 0 && height > 0) {
      bodies.push({ x, y, width, height });
    }
  }

  return bodies;
}

/**
 * Vertices of a closed axis-aligned-subset path; `null` when the path uses a
 * command v1 does not model, has several subpaths, or is not closed.
 */
function pathVertices(d: string): Point[] | null {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g);

  if (tokens === null) {
    return null;
  }

  const points: Point[] = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let closed = false;

  const readNumber = (): number | null => {
    const token = tokens[index];

    if (token === undefined || /^[a-zA-Z]$/.test(token)) {
      return null;
    }

    index += 1;
    const parsed = Number(token);

    return Number.isFinite(parsed) ? parsed : null;
  };

  while (index < tokens.length) {
    const token = tokens[index];

    if (token === undefined) {
      break;
    }

    if (/^[a-zA-Z]$/.test(token)) {
      index += 1;

      if (token === 'z' || token === 'Z') {
        closed = true;
        break;
      }

      if (!'MmLlHhVv'.includes(token)) {
        return null;
      }

      command = token;
      continue;
    }

    if (command === '') {
      return null;
    }

    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper === 'M' || upper === 'L') {
      const first = readNumber();
      const second = readNumber();

      if (first === null || second === null) {
        return null;
      }

      x = relative ? x + first : first;
      y = relative ? y + second : second;
      points.push({ x, y });

      if (upper === 'M') {
        // A second subpath would break the single-quad assumption.
        if (points.length > 1) {
          return null;
        }

        command = relative ? 'l' : 'L';
      }

      continue;
    }

    if (upper === 'H') {
      const value = readNumber();

      if (value === null) {
        return null;
      }

      x = relative ? x + value : value;
      points.push({ x, y });
      continue;
    }

    const value = readNumber();

    if (value === null) {
      return null;
    }

    y = relative ? y + value : value;
    points.push({ x, y });
  }

  if (!closed || points.length !== 4) {
    return null;
  }

  return points;
}

function polygonVertices(pointsAttribute: string): Point[] | null {
  const values = numbersOf(pointsAttribute);

  if (values.length !== 8) {
    return null;
  }

  const points: Point[] = [];

  for (let index = 0; index < values.length; index += 2) {
    const x = values[index];
    const y = values[index + 1];

    if (x === undefined || y === undefined) {
      return null;
    }

    points.push({ x, y });
  }

  return points;
}

function isHorizontal(left: Point, right: Point): boolean {
  return Math.abs(left.y - right.y) <= HORIZONTAL_TOLERANCE;
}

function shoelaceArea(points: readonly Point[]): number {
  let sum = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];

    if (current === undefined || next === undefined) {
      return 0;
    }

    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

function edgeOverlap(
  left: number,
  right: number,
  body: Body,
): number {
  const bodyLeft = body.x;
  const bodyRight = body.x + body.width;
  const overlap = Math.min(right, bodyRight) - Math.max(left, bodyLeft);

  return Math.max(0, overlap);
}

/**
 * A closed quad with two horizontal edges and two slanted ones that sits on top
 * of a body rect is the isometric "lid" pattern. A standalone trapezoid (a cup,
 * a lampshade) has no adjacent body and stays valid.
 */
function topFaceBody(
  vertices: readonly Point[],
  bodies: readonly Body[],
): Body | null {
  if (vertices.length !== 4) {
    return null;
  }

  const edges = vertices.map((point, index) => ({
    from: point,
    to: vertices[(index + 1) % vertices.length] as Point,
  }));
  const horizontal = edges.filter((edge) => isHorizontal(edge.from, edge.to));
  const slanted = edges.filter(
    (edge) =>
      !isHorizontal(edge.from, edge.to) &&
      Math.abs(edge.to.x - edge.from.x) >= MIN_SLANT &&
      Math.abs(edge.to.y - edge.from.y) >= MIN_SLANT,
  );

  if (horizontal.length !== 2 || slanted.length !== 2) {
    return null;
  }

  const lower = horizontal.reduce((best, edge) =>
    edge.from.y > best.from.y ? edge : best,
  );
  const upper = horizontal.find((edge) => edge !== lower);

  if (upper === undefined || upper.from.y >= lower.from.y) {
    return null;
  }

  const left = Math.min(lower.from.x, lower.to.x);
  const right = Math.max(lower.from.x, lower.to.x);

  for (const body of bodies) {
    if (Math.abs(body.y - lower.from.y) > ADJACENCY_TOLERANCE) {
      continue;
    }

    const overlap = edgeOverlap(left, right, body);

    if (overlap >= (right - left) * MIN_EDGE_OVERLAP) {
      return body;
    }
  }

  return null;
}

function quadViolations(
  vertices: readonly Point[],
  bodies: readonly Body[],
  canvas: { width: number; height: number },
): SvgStructureViolation[] {
  if (shoelaceArea(vertices) < canvas.width * canvas.height * MIN_AREA_FRACTION) {
    return [];
  }

  if (topFaceBody(vertices, bodies) === null) {
    return [];
  }

  return [
    {
      code: 'top_face_polygon',
      reason: TOP_FACE_REASON,
      element: `path ${vertices
        .map((point) => `${point.x},${point.y}`)
        .join(' ')}`,
    },
  ];
}

/** Deterministic, network-free structural violations, cheapest check first. */
export function inspectSvgStructure(svg: string): SvgStructureViolation[] {
  const violations: SvgStructureViolation[] = [];
  const transform = TRANSFORM_ELEMENT.exec(svg);

  if (transform !== null) {
    violations.push({
      code: 'perspective_transform',
      reason: TRANSFORM_REASON,
      element: transform[0].slice(0, 120),
    });
  }

  const bodies = rectsOf(svg);
  const canvas = canvasOf(svg);
  const candidates: Point[][] = [];

  for (const match of svg.matchAll(/<path\b([^>]*?)\/?>/gi)) {
    const d = /\bd\s*=\s*["']([^"']+)["']/i.exec(match[1] ?? '');

    if (d?.[1] === undefined) {
      continue;
    }

    const vertices = pathVertices(d[1]);

    if (vertices !== null) {
      candidates.push(vertices);
    }
  }

  for (const match of svg.matchAll(/<polygon\b([^>]*?)\/?>/gi)) {
    const points = /\bpoints\s*=\s*["']([^"']+)["']/i.exec(match[1] ?? '');
    const vertices =
      points?.[1] === undefined ? null : polygonVertices(points[1]);

    if (vertices !== null) {
      candidates.push(vertices);
    }
  }

  for (const vertices of candidates) {
    violations.push(...quadViolations(vertices, bodies, canvas));
  }

  return violations;
}
