import path from 'node:path';
import { lintMeasurements } from '../lint/rules.js';
import { measureUiEpisode } from '../lint/render.js';
import type { UiEpisode } from '../spec.js';
import { MIN_FONT_SCALE, tokenForHeight } from '../typography-rules.js';
import { clampLayout } from './clamp.js';

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
  /** Text that still does not fit at the floor: the copy is too long. */
  readonly overflowing: readonly string[];
  /** Technical violations left after the repair. */
  readonly violations: readonly string[];
}

function floorTo(value: number, step = 0.05): number {
  return Math.floor(value / step) * step;
}

/** The box decides the type size on text elements; containers are left alone. */
function fitType<T extends { primitive: string; params: Record<string, string | number | boolean>; layout: { height?: number } }>(
  element: T,
): T {
  if (!['label', 'pill', 'bubble'].includes(element.primitive)) {
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
            const heightRatio =
              (box.boxHeight ?? 0) / Math.max(1, box.contentHeight ?? 1);
            const widthRatio =
              (box.boxWidth ?? 0) / Math.max(1, box.contentWidth ?? 1);
            const next = Math.max(
              MIN_FONT_SCALE,
              floorTo(currentScale * Math.min(heightRatio, widthRatio) * 0.95),
            );

            if (next >= currentScale) {
              return element;
            }

            fixes.push({ elementId: element.id, from: currentScale, to: next });

            return {
              ...element,
              params: { ...element.params, fontScale: Number(next.toFixed(2)) },
            };
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
    .map((box) => box.elementId ?? box.name);

  return {
    episode: current,
    fixes,
    overflowing: stillOverflowing,
    violations,
  };
}
