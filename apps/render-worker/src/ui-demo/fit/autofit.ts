import path from 'node:path';
import { TEXT_PRIMITIVES } from '../catalog.js';
import { lintMeasurements } from '../lint/rules.js';
import { measureUiEpisode } from '../lint/render.js';
import type { UiEpisode } from '../spec.js';
import { MIN_FONT_SCALE, tokenForHeight } from '../typography-rules.js';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { clampLayout } from './clamp.js';
import { growToFit } from './grow.js';

/**
 * Repair pass: clamp the layout, then fit the text, then report what is left.
 *
 * It runs inside the director, after validation and before the episode is
 * stored, so "generated" and "renderable" mean the same thing. What it does not
 * do is change the script: a scene whose copy does not fit is reported, not
 * rewritten.
 */

const MAX_PASSES = 3;

export interface FitOptions {
  readonly outDir: string;
}

export interface FitResult {
  readonly episode: UiEpisode;
  readonly fixes: ReadonlyArray<{ elementId: string; from: number; to: number }>;
  /** Boxes that were grown to take the copy without shrinking the type. */
  readonly grown: ReadonlyArray<{ elementId: string; width: number; height: number }>;
  /** Text that still does not fit at the floor: the copy is too long. */
  readonly overflowing: readonly string[];
  /** Technical violations left after the repair. */
  readonly violations: readonly string[];
}

function floorTo(value: number, step = 0.05): number {
  return Math.floor(value / step) * step;
}

function rectOf(element: {
  layout: { x: number; y: number; width?: number; height?: number };
}): { x: number; y: number; width: number; height: number } {
  return {
    x: element.layout.x,
    y: element.layout.y,
    width: element.layout.width ?? 0,
    height: element.layout.height ?? 0,
  };
}

/** The box decides the type size on text elements; containers are left alone. */
function fitType<T extends { primitive: string; params: Record<string, string | number | boolean>; layout: { height?: number } }>(
  element: T,
): T {
  if (TEXT_PRIMITIVES.has(element.primitive as never)) {
    return element;
  }

  const token = element.params['token'];

  if (typeof token !== 'string') {
    return element;
  }

  const next = tokenForHeight(token, element.layout.height);

  return next === token
    ? element
    : { ...element, params: { ...element.params, token: next } };
}

export async function repairEpisode(
  episode: UiEpisode,
  options: FitOptions,
): Promise<FitResult> {
  let current: UiEpisode = {
    ...episode,
    scenes: episode.scenes.map((scene) =>
      scene.device !== 'spec'
        ? scene
        : {
            ...scene,
            spec: {
              ...scene.spec,
              elements: scene.spec.elements.map((element) =>
                element.primitive === 'stage' ? element : fitType(clampLayout(element)),
              ),
            },
          },
    ),
  } as UiEpisode;
  const fixes: FitResult['fixes'][number][] = [];
  const grownFixes: FitResult['grown'][number][] = [];

  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const measurement = await measureUiEpisode({
      episode: current,
      policy: 'settled',
      outDir: path.join(options.outDir, `pass-${pass}`),
    });
    const overflowingBoxes = measurement.measurements
      .flatMap((scene) => scene.boxes)
      .filter(
        (box) =>
          box.overflowText === true &&
          box.elementId !== undefined &&
          box.boxHeight !== undefined &&
          box.contentHeight !== undefined,
      );

    if (overflowingBoxes.length === 0) {
      break;
    }

    const scenes = current.scenes.map((scene) => {
      if (scene.device !== 'spec') {
        return scene;
      }

      return {
        ...scene,
        spec: {
          ...scene.spec,
          elements: scene.spec.elements.map((element) => {
            const box = overflowingBoxes.find(
              (item) => item.elementId === element.id,
            );

            if (box === undefined) {
              return element;
            }

            const currentScale =
              typeof element.params.fontScale === 'number'
                ? element.params.fontScale
                : 1;
            /* Grow first: the frame usually has room, and the type size is part
               of the design. The font shrinks only for what the frame cannot
               take. */
            const obstacles = scene.spec.elements
              .filter((other) => other.id !== element.id)
              .map(rectOf)
              .filter((rect) => rect.width > 0 && rect.height > 0);
            const need = {
              width: (box.contentWidth ?? 0) + 8,
              height: (box.contentHeight ?? 0) + 8,
            };
            const grown = growToFit(rectOf(element), need, obstacles, CRITICAL_SAFE_BOUNDS);

            if (grown.grew) {
              grownFixes.push({
                elementId: element.id,
                width: Number(grown.layout.width.toFixed(1)),
                height: Number(grown.layout.height.toFixed(1)),
              });
            }

            /* A box that reached the size the copy asked for needs no font cut:
               the next measurement pass confirms it. */
            const satisfied =
              grown.layout.width >= need.width - 0.5 && grown.layout.height >= need.height - 0.5;
            const heightRatio =
              grown.layout.height / Math.max(1, box.contentHeight ?? 1);
            const widthRatio =
              grown.layout.width / Math.max(1, box.contentWidth ?? 1);
            const next = satisfied
              ? currentScale
              : Math.max(
                  MIN_FONT_SCALE,
                  floorTo(currentScale * Math.min(heightRatio, widthRatio) * 0.95),
                );

            if (next >= currentScale && !grown.grew) {
              return element;
            }

            const layout = grown.grew
              ? {
                  ...element.layout,
                  width: grown.layout.width,
                  height: grown.layout.height,
                }
              : element.layout;
            const params =
              next >= currentScale
                ? element.params
                : { ...element.params, fontScale: Number(next.toFixed(2)) };

            if (next < currentScale) {
              fixes.push({ elementId: element.id, from: currentScale, to: next });
            }

            return { ...element, layout, params };
          }),
        },
      };
    });

    current = { ...current, scenes } as UiEpisode;
  }

  const finalMeasurement = await measureUiEpisode({
    episode: current,
    policy: 'settled',
    outDir: path.join(options.outDir, 'final'),
  });
  const violations = lintMeasurements(finalMeasurement.measurements)
    .filter((violation) => violation.severity === 'error')
    .map((violation) => `${violation.rule}: ${violation.message}`);
  const stillOverflowing = finalMeasurement.measurements
    .flatMap((scene) => scene.boxes)
    .filter((box) => box.overflowText === true)
    .map((box) => {
      /* Say how much room the copy needs: "clock needs 840px in 308px" is a
         correction the model can act on, an id is not. */
      const id = box.elementId ?? box.name;
      const copy =
        box.text === undefined ? '' : ` "${box.text.slice(0, 24)}"`;
      const content = box.contentWidth === undefined ? null : Math.round(box.contentWidth);
      const available = box.boxWidth === undefined ? null : Math.round(box.boxWidth);

      return content === null || available === null
        ? `${id}${copy}`
        : `${id}${copy}: ${content}px in ${available}px`;
    });

  return {
    episode: current,
    fixes,
    grown: grownFixes,
    overflowing: stillOverflowing,
    violations,
  };
}
