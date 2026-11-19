import path from 'node:path';
import { TRANSITION_IDS, type TransitionId } from './transitions.js';
import {
  renderComposition,
  UI_MICRO_COMPOSITION_ID,
  UI_MOTION_COMPOSITION_ID,
} from './render.js';
import { UI_MICRO_DEFAULT_PROPS } from './UiMicro.js';

/**
 * Motion lab: one clip per transition mechanism over the same A → B pair, plus
 * a micro-interaction sheet. Everything is frame-driven and deterministic.
 */
function usage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/render-worker ui:motion -- [--out <dir>] [--only zoom,blur] [--duration 2.4] [--window 0.5] [--no-micro]

Renders 1080x1920/30 clips: transition-<id>.mp4 for every mechanism and
micro-interactions.mp4.
`);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

function numberOption(name: string, fallback: number): number {
  const raw = optionValue(name);

  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received "${raw}"`);
  }

  return value;
}

function transitionsValue(): TransitionId[] {
  const raw = optionValue('--only');

  if (raw === undefined) {
    return [...TRANSITION_IDS];
  }

  const requested = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of requested) {
    if (!(TRANSITION_IDS as readonly string[]).includes(entry)) {
      throw new Error(
        `Unknown transition "${entry}". Known: ${TRANSITION_IDS.join(', ')}`,
      );
    }
  }

  return requested as TransitionId[];
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    usage();

    return;
  }

  const cwd = process.cwd();
  const outDir = path.resolve(cwd, optionValue('--out') ?? 'out/ui-motion');
  const durationSec = numberOption('--duration', 2.4);
  const window = numberOption('--window', 0.5);
  const withMicro = !process.argv.includes('--no-micro');
  const requested = transitionsValue();

  for (const transitionId of requested) {
    const result = await renderComposition({
      compositionId: UI_MOTION_COMPOSITION_ID,
      inputProps: { transitionId, durationSec, window },
      outPath: path.join(outDir, `transition-${transitionId}.mp4`),
    });

    console.log(
      `${transitionId}: ${result.durationInFrames} frames, ${result.renderMs} ms -> ${result.outPath}`,
    );
  }

  if (withMicro) {
    const result = await renderComposition({
      compositionId: UI_MICRO_COMPOSITION_ID,
      inputProps: UI_MICRO_DEFAULT_PROPS,
      outPath: path.join(outDir, 'micro-interactions.mp4'),
    });

    console.log(
      `micro: ${result.durationInFrames} frames, ${result.renderMs} ms -> ${result.outPath}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
