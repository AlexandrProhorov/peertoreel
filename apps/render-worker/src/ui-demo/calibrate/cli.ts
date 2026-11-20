import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';
import { lintMeasurements } from '../lint/rules.js';
import type { Violation } from '../lint/measure.js';
import { measureUiEpisode } from '../lint/render.js';

/**
 * Calibration for frame checks.
 *
 * `collect` measures archived scenes one by one and writes a still plus the rule
 * hits; `score` compares those hits with hand labels. A rule is promoted to an
 * error only after this: until then a threshold is a guess, and a guess that
 * gates scenes costs retries for nothing.
 *
 *   ui:calibrate collect --root out --out out/calibration --limit 30
 *   ui:calibrate score --hits out/calibration/hits.json --labels labels.json
 */

const RULES = ['unrelated-overlap', 'text-overflow', 'critical-overlap'] as const;

type RuleName = (typeof RULES)[number];

interface Hit {
  readonly run: string;
  readonly topic: string;
  readonly sceneId: string;
  readonly still: string;
  readonly rules: readonly RuleName[];
  readonly violations: ReadonlyArray<{
    readonly rule: string;
    readonly severity: string;
    readonly element: string;
    readonly message: string;
  }>;
}

interface Labels {
  readonly [key: string]: { readonly overlap?: boolean; readonly hole?: boolean };
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];

  return value === undefined || value.startsWith('--') ? undefined : value;
}

function commandOf(argv: readonly string[]): string {
  return argv.find((argument) => !argument.startsWith('--')) ?? '';
}

async function directories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function sceneEpisode(episode: UiEpisode, index: number): UiEpisode | null {
  const scene = episode.scenes[index];

  if (scene === undefined) {
    return null;
  }

  return { ...episode, scenes: [scene], speech: [], captions: false };
}

function rulesOf(violations: readonly Violation[]): RuleName[] {
  const found = new Set<RuleName>();

  for (const violation of violations) {
    if ((RULES as readonly string[]).includes(violation.rule)) {
      found.add(violation.rule as RuleName);
    }
  }

  return [...found];
}

async function collect(): Promise<void> {
  const cwd = process.cwd();
  const root = path.resolve(cwd, optionValue('--root') ?? 'out');
  const out = path.resolve(cwd, optionValue('--out') ?? 'out/calibration');
  const limit = Number(optionValue('--limit') ?? '30');
  const runsFilter = optionValue('--runs')?.split(',').map((run) => run.trim());
  const hits: Hit[] = [];

  const runs = (await directories(root)).filter((run) =>
    runsFilter === undefined ? run.startsWith('film-') : runsFilter.includes(run),
  );

  for (const run of runs) {
    for (const topic of await directories(path.join(root, run))) {
      if (hits.length >= limit) {
        break;
      }

      const episodePath = path.join(root, run, topic, 'episode.json');
      let raw: unknown;

      try {
        raw = JSON.parse(await readFile(episodePath, 'utf8'));
      } catch {
        continue;
      }

      const parsed = uiEpisodeSchema.safeParse(raw);

      if (!parsed.success) {
        continue;
      }

      for (let index = 0; index < parsed.data.scenes.length && hits.length < limit; index += 1) {
        const single = sceneEpisode(parsed.data, index);

        if (single === null) {
          continue;
        }

        const sceneId = single.scenes[0]?.id ?? `scene-${index + 1}`;
        const dir = path.join(out, run, topic, `${index + 1}-${sceneId}`);
        await mkdir(dir, { recursive: true });

        const measured = await measureUiEpisode({ episode: single, policy: 'settled', outDir: dir });
        const violations = lintMeasurements(measured.measurements);

        hits.push({
          run,
          topic,
          sceneId,
          still: measured.stillPath,
          rules: rulesOf(violations),
          violations: violations.map((violation) => ({
            rule: violation.rule,
            severity: violation.severity,
            element: violation.element,
            message: violation.message,
          })),
        });

        console.log(
          `${run}/${topic}/${sceneId}: ${hits[hits.length - 1]?.rules.join(', ') || 'clean'}`,
        );
      }
    }
  }

  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'hits.json'), `${JSON.stringify(hits, null, 2)}\n`, 'utf8');
  console.log(`\n${hits.length} scene(s) → ${path.join(out, 'hits.json')}`);
}

interface Counts {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

function empty(): Counts {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

async function score(): Promise<void> {
  const hitsPath = optionValue('--hits');
  const labelsPath = optionValue('--labels');

  if (hitsPath === undefined || labelsPath === undefined) {
    throw new Error('usage: ui:calibrate score --hits <hits.json> --labels <labels.json>');
  }

  const hits = JSON.parse(await readFile(hitsPath, 'utf8')) as Hit[];
  const labels = JSON.parse(await readFile(labelsPath, 'utf8')) as Labels;

  const overlap = empty();
  let labelled = 0;

  for (const hit of hits) {
    const key = `${hit.run}/${hit.topic}/${hit.sceneId}`;
    const label = labels[key];

    if (label === undefined) {
      continue;
    }

    labelled += 1;
    const predicted = hit.rules.includes('unrelated-overlap');

    if (label.overlap === undefined) {
      continue;
    }

    if (label.overlap && predicted) overlap.tp += 1;
    else if (label.overlap) overlap.fn += 1;
    else if (predicted) overlap.fp += 1;
    else overlap.tn += 1;
  }

  const report = (name: string, counts: Counts): string => {
    const precision = counts.tp + counts.fp === 0 ? null : counts.tp / (counts.tp + counts.fp);
    const recall = counts.tp + counts.fn === 0 ? null : counts.tp / (counts.tp + counts.fn);
    const show = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(2));

    return `${name}: tp=${counts.tp} fp=${counts.fp} fn=${counts.fn} tn=${counts.tn} precision=${show(precision)} recall=${show(recall)}`;
  };

  const text = [
    `labelled scenes: ${labelled} of ${hits.length}`,
    report('unrelated-overlap', overlap),
  ].join('\n');

  console.log(text);
  await writeFile(
    path.join(path.dirname(hitsPath), 'score.json'),
    `${JSON.stringify({ labelled, overlap }, null, 2)}\n`,
    'utf8',
  );
}

const command = commandOf(process.argv.slice(2));

if (command === 'collect') {
  await collect();
} else if (command === 'score') {
  await score();
} else {
  console.log('usage: ui:calibrate collect|score');
  process.exitCode = 1;
}
