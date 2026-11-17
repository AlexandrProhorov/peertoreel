import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { measureUiEpisode } from '../lint/render.js';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';
import { MIN_FONT_SCALE } from '../typography-rules.js';

/**
 * Auto-fit: shrink a label's font until its text fits the declared box.
 *
 * The model cannot estimate glyph widths, and asking it to try harder is not an
 * engineering answer. This pass measures the rendered text, scales it down by
 * the measured ratio and stops at the contract floor (0.5). Whatever still does
 * not fit is reported — the linter will reject it, which is correct: the copy is
 * too long for the frame, not the font too big.
 */

const MAX_PASSES = 3;

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Option ${name} requires a value`);
  }

  return value;
}

function floorTo(value: number, step = 0.05): number {
  return Math.floor(value / step) * step;
}

interface Fix {
  readonly elementId: string;
  readonly from: number;
  readonly to: number;
}

export async function autofitEpisode(
  episode: UiEpisode,
  outDir: string,
): Promise<{ episode: UiEpisode; fixes: Fix[]; remaining: string[] }> {
  let current = episode;
  const fixes: Fix[] = [];
  let remaining: string[] = [];

  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    const measurement = await measureUiEpisode({
      episode: current,
      policy: 'settled',
      outDir: path.join(outDir, `pass-${pass}`),
    });
    const overflowing = measurement.measurements
      .flatMap((scene) => scene.boxes)
      .filter(
        (box) =>
          box.overflowText === true &&
          box.elementId !== undefined &&
          box.boxHeight !== undefined &&
          box.contentHeight !== undefined,
      );

    if (overflowing.length === 0) {
      remaining = [];
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
          const box = overflowing.find((item) => item.elementId === element.id);

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
    remaining = overflowing.map((box) => box.elementId ?? 'unnamed');
    void mkdir;
  }

  return { episode: current, fixes, remaining };
}

async function main(): Promise<void> {
  const input = optionValue('--input');

  if (input === undefined) {
    throw new Error('--input <episode.json> is required');
  }

  const cwd = process.cwd();
  const out = optionValue('--out');
  const outPath = path.resolve(cwd, out ?? input);
  const raw: unknown = JSON.parse(await readFile(path.resolve(cwd, input), 'utf8'));
  const episode = uiEpisodeSchema.parse(raw);
  const result = await autofitEpisode(episode, path.resolve(cwd, 'out/ui-fit'));
  const rechecked = await measureUiEpisode({
    episode: result.episode,
    policy: 'settled',
    outDir: path.resolve(cwd, 'out/ui-fit/final'),
  });
  const stillBroken = rechecked.measurements
    .flatMap((scene) => scene.boxes)
    .filter((box) => box.overflowText === true)
    .map((box) => box.elementId ?? box.name);

  await writeFile(
    outPath,
    `${JSON.stringify(result.episode, null, 2)}\n`,
    'utf8',
  );

  for (const fix of result.fixes) {
    console.log(`${fix.elementId}: font ${fix.from} → ${fix.to}`);
  }

  console.log(
    stillBroken.length === 0
      ? `fitted: text fits everywhere, written to ${outPath}`
      : `still overflowing (copy too long): ${stillBroken.join(', ')} — ${outPath}`,
  );

  if (stillBroken.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
