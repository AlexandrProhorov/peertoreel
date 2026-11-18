/**
 * Line geometry, in frame coordinates.
 *
 * A line is written the way SVG writes one: `from`/`to` are points of the
 * 1080×1920 frame. The element's `layout` is its bounding box — validated and
 * read by the quality gate — never an offset. Treating it as an offset moved a
 * foreign author's line twice and pushed it off the frame.
 */

export interface LineEndpoints {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

type Params = Readonly<Record<string, string | number | boolean>>;

function num(params: Params, key: string, fallback: number): number {
  const value = params[key];

  return typeof value === 'number' ? value : fallback;
}

/** `drawProgress` 0..1 shortens the line from its start, keeping the direction. */
export function lineEndpoints(params: Params, drawProgress = 1): LineEndpoints {
  const fromX = num(params, 'fromX', 0);
  const fromY = num(params, 'fromY', 0);
  const toX = num(params, 'toX', 600);
  const toY = num(params, 'toY', 0);

  return {
    fromX,
    fromY,
    toX: fromX + (toX - fromX) * drawProgress,
    toY: fromY + (toY - fromY) * drawProgress,
  };
}
