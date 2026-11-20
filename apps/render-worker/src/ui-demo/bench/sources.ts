import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Reading side of the bench: every archive under `out/` becomes a plain value.
 * Nothing is interpreted here — parsing and counting live in `metrics.ts`, so
 * the bench can be re-run over the same files without touching a model.
 */

export interface TopicSource {
  readonly slug: string;
  /** One element of the run's `report.json`, when that run wrote one. */
  readonly report: unknown;
  readonly episode: unknown;
  readonly arc: unknown;
  /** Raw `scene-<n>-attempt-<k>.json` documents, in scene then attempt order. */
  readonly attempts: readonly unknown[];
  /** Highest scene index named by the attempt files, or null when there are none. */
  readonly plannedScenes: number | null;
  /** Attempt files that could not be read as JSON at all. */
  readonly brokenFiles: readonly string[];
  readonly arcAttempts: number;
}

export interface RunSource {
  readonly run: string;
  readonly topics: readonly TopicSource[];
}

const SCENE_ATTEMPT = /^scene-(\d+)-attempt-(\d+)\.json$/;
const ARC_ATTEMPT = /^arc-attempt-\d+\.json$/;

async function readJson(path: string): Promise<{ value: unknown; ok: boolean }> {
  try {
    const text = await readFile(path, 'utf8');

    return { value: JSON.parse(text) as unknown, ok: true };
  } catch {
    return { value: null, ok: false };
  }
}

async function directories(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function attemptOrder(name: string): number {
  const match = SCENE_ATTEMPT.exec(name);

  if (match === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  const scene = Number(match[1] ?? 0);
  const attempt = Number(match[2] ?? 0);

  return scene * 1000 + attempt;
}

function reportForSlug(report: unknown, slug: string): unknown {
  if (!Array.isArray(report)) {
    return null;
  }

  return report.find((entry) => {
    return typeof entry === 'object' && entry !== null &&
      (entry as Record<string, unknown>)['slug'] === slug;
  }) ?? null;
}

async function readTopic(directory: string, slug: string, runReport: unknown): Promise<TopicSource> {
  const names = await readdir(directory);
  const broken: string[] = [];
  const attempts: unknown[] = [];
  let arcAttempts = 0;
  let plannedScenes: number | null = null;

  for (const name of names.sort((a, b) => attemptOrder(a) - attemptOrder(b))) {
    const match = SCENE_ATTEMPT.exec(name);

    if (match !== null) {
      plannedScenes = Math.max(plannedScenes ?? 0, Number(match[1] ?? 0));

      const { value, ok } = await readJson(join(directory, name));

      if (ok) {
        attempts.push(value);
      } else {
        broken.push(name);
      }
    } else if (ARC_ATTEMPT.test(name)) {
      arcAttempts += 1;
    }
  }

  const episode = await readJson(join(directory, 'episode.json'));
  const arc = await readJson(join(directory, 'arc.json'));

  return {
    slug,
    report: reportForSlug(runReport, slug),
    episode: episode.ok ? episode.value : null,
    arc: arc.ok ? arc.value : null,
    attempts,
    plannedScenes,
    brokenFiles: broken,
    arcAttempts,
  };
}

async function readRunReport(directory: string): Promise<unknown> {
  const root = await readJson(join(directory, 'report.json'));

  if (root.ok) {
    return root.value;
  }

  /* Some runs keep the report under `review/`. */
  const review = await readJson(join(directory, 'review', 'report.json'));

  return review.ok ? review.value : null;
}

function hasTopicData(topic: TopicSource): boolean {
  return (
    topic.episode !== null ||
    topic.arc !== null ||
    topic.attempts.length > 0 ||
    topic.brokenFiles.length > 0 ||
    topic.arcAttempts > 0 ||
    topic.plannedScenes !== null
  );
}

/** Every run directory that carries at least one topic with data. */
export async function scanRuns(root: string): Promise<RunSource[]> {
  const runNames = (await directories(root)).filter((name) => name.startsWith('film-'));
  const runs: RunSource[] = [];

  for (const run of runNames) {
    const runDirectory = join(root, run);
    const report = await readRunReport(runDirectory);
    const topics: TopicSource[] = [];
    const seen = new Set<string>();

    for (const slug of await directories(runDirectory)) {
      const topic = await readTopic(join(runDirectory, slug), slug, report);

      if (hasTopicData(topic)) {
        topics.push(topic);
        seen.add(slug);
      }
    }

    /* A topic that failed before writing a directory is still a planned scene
       budget: keep its report entry instead of losing it from the denominator. */
    if (Array.isArray(report)) {
      for (const entry of report) {
        const slug = typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>)['slug']
          : null;

        if (typeof slug === 'string' && !seen.has(slug)) {
          topics.push({
            slug,
            report: reportForSlug(report, slug),
            episode: null,
            arc: null,
            attempts: [],
            plannedScenes: null,
            brokenFiles: [],
            arcAttempts: 0,
          });
        }
      }
    }

    if (topics.length > 0) {
      runs.push({ run, topics });
    }
  }

  return runs;
}
