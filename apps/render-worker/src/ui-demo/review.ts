import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * Frame-level review, as a log and not a gate.
 *
 * Gates prove geometry; they cannot see whether the frame moves. This pass
 * samples the rendered film at two frames per second, computes the difference
 * between neighbours and reports dead time: the share of the film where the
 * picture does not change. It also records what the scene is made of, so a
 * version of the prompt can be compared with the previous one on the same film.
 */

const run = promisify(execFile);
const SAMPLE_FPS = 2;
const WIDTH = 32;
const HEIGHT = 56;
const BYTES = WIDTH * HEIGHT;
/** Max change of one 8x8 block below this means nothing visibly moved. */
const STILL_THRESHOLD = 8;
const BLOCK = 8;

export interface DeadReport {
  readonly sampledFrames: number;
  readonly deadFrames: number;
  readonly deadSeconds: number;
  readonly longestStillSeconds: number;
  /** Seconds after the last visible change: how long the film lives past its point. */
  readonly tailSeconds: number;
}

/** Pure: a run of `true` is a stretch of the film that does not change. */
export function stillRuns(diffs: readonly number[], threshold = STILL_THRESHOLD): number[] {
  const runs: number[] = [];
  let current = 0;

  for (const diff of diffs) {
    if (diff < threshold) {
      current += 1;
    } else {
      if (current > 0) {
        runs.push(current);
      }

      current = 0;
    }
  }

  if (current > 0) {
    runs.push(current);
  }

  return runs;
}

export function reviewDiffs(diffs: readonly number[]): DeadReport {
  const runs = stillRuns(diffs);
  const deadFrames = diffs.filter((diff) => diff < STILL_THRESHOLD).length;
  let lastChange = -1;

  for (let index = 0; index < diffs.length; index += 1) {
    if ((diffs[index] ?? 0) >= STILL_THRESHOLD) {
      lastChange = index;
    }
  }

  return {
    sampledFrames: diffs.length + 1,
    deadFrames,
    deadSeconds: Number((deadFrames / SAMPLE_FPS).toFixed(1)),
    longestStillSeconds: Number(((Math.max(0, ...runs) + 1) / SAMPLE_FPS).toFixed(1)),
    tailSeconds: Number(((diffs.length - lastChange) / SAMPLE_FPS).toFixed(1)),
  };
}

async function sampleFrames(mp4: string): Promise<number[]> {
  const { stdout } = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      mp4,
      '-vf',
      `fps=${SAMPLE_FPS},scale=${WIDTH}:${HEIGHT},format=gray`,
      '-f',
      'rawvideo',
      '-',
    ],
    { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
  );
  const frames = Math.floor(stdout.length / BYTES);
  const diffs: number[] = [];

  for (let index = 1; index < frames; index += 1) {
    /* A typed letter or a small chip changes a few pixels only: a full-frame
       average would call that "still". The maximum over 8x8 blocks keeps a
       local change visible while flat frames stay at zero. */
    let peak = 0;

    for (let by = 0; by + BLOCK <= HEIGHT; by += BLOCK) {
      for (let bx = 0; bx + BLOCK <= WIDTH; bx += BLOCK) {
        let sum = 0;

        for (let y = 0; y < BLOCK; y += 1) {
          for (let x = 0; x < BLOCK; x += 1) {
            const offset = (by + y) * WIDTH + (bx + x);

            sum += Math.abs(
              stdout[index * BYTES + offset]! - stdout[(index - 1) * BYTES + offset]!,
            );
          }
        }

        peak = Math.max(peak, sum / (BLOCK * BLOCK));
      }
    }

    diffs.push(peak);
  }

  return diffs;
}

interface Episode {
  readonly scenes: ReadonlyArray<{
    readonly id: string;
    readonly durationSec: number;
    readonly spec: {
      readonly focus?: string;
      readonly elements: ReadonlyArray<{ readonly primitive: string; readonly params: Record<string, unknown> }>;
      readonly sequence: ReadonlyArray<{ readonly transition: string }>;
    };
  }>;
}

async function reviewEpisode(dir: string): Promise<unknown> {
  const episode = JSON.parse(await readFile(path.join(dir, 'episode.json'), 'utf8')) as Episode;
  const diffs = await sampleFrames(path.join(dir, 'render', 'episode.mp4'));
  const dead = reviewDiffs(diffs);
  const primitives = new Set<string>();
  let textElements = 0;

  for (const scene of episode.scenes) {
    for (const element of scene.spec.elements) {
      primitives.add(element.primitive);

      if (typeof element.params['text'] === 'string') {
        textElements += 1;
      }
    }
  }

  return {
    dir: path.basename(dir),
    seconds: Number(episode.scenes.reduce((sum, scene) => sum + scene.durationSec, 0).toFixed(1)),
    ...dead,
    deadShare: Number((dead.deadSeconds / Math.max(0.1, dead.sampledFrames / SAMPLE_FPS)).toFixed(2)),
    textElements,
    primitives: [...primitives].sort(),
    deadShareAt: Object.fromEntries([0.5, 1, 1.5, 2, 3].map((threshold) => [String(threshold), Number((diffs.filter((diff) => diff < threshold).length / Math.max(1, diffs.length)).toFixed(2))])),
  };
}

async function main(): Promise<void> {
  const root = process.argv[2];

  if (root === undefined) {
    throw new Error('usage: ui:review <run-dir>');
  }

  const report: unknown[] = [];

  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || ['render', 'review'].includes(entry.name)) {
      continue;
    }

    const dir = path.join(root, entry.name);

    try {
      const item = await reviewEpisode(dir);

      report.push(item);
      console.log(JSON.stringify(item));
    } catch (error: unknown) {
      console.log(`${entry.name}: review failed — ${error instanceof Error ? error.message : error}`);
    }
  }

  await mkdir(path.join(root, 'review'), { recursive: true });
  await writeFile(
    path.join(root, 'review', 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
