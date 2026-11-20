import { PRIMITIVES, type PrimitiveId } from '../catalog.js';
import { parseComposition } from '../composition.js';
import { lintQuality } from '../quality.js';
import { rawSceneSignature } from '../signature.js';
import { uiSceneSchema } from '../spec.js';
import { UI_THEME_IDS, type UiThemeId } from '../themes.js';
import type { RunSource, TopicSource } from './sources.js';

/**
 * Counting side of the bench. Two families of numbers, deliberately apart:
 *
 *  - `model.*` — what the model invented or mixed up. This is the vocabulary
 *    gap and it must not improve when we relax a gate;
 *  - `gate.*` — what our own rules rejected. This is our strictness, and it
 *    must not improve the vocabulary column.
 *
 * Archives are re-read with today's contract, not the contract of their day:
 * that is the only way to compare runs, and it is why the numbers are labelled
 * as re-validated rather than historical. Nothing here guesses: a value the
 * archive does not carry stays `null` with a source of `n/a`, never `0`.
 */

export interface CodeCount {
  readonly code: string;
  readonly count: number;
}

export interface Census {
  /** Attempt documents read. */
  readonly attempts: number;
  /** Scene bodies censused inside those documents. */
  readonly scenes: number;
  /** Documents that carried neither an episode nor a scene. */
  readonly unparsed: number;
  /** Structure of the attempts: how many bodies, how many distinct shapes. */
  readonly structure: {
    readonly total: number;
    readonly unique: number;
    readonly invalid: number;
  };
  readonly model: readonly CodeCount[];
  readonly gate: readonly CodeCount[];
}

export interface TopicMetrics {
  readonly slug: string;
  readonly planned: number | null;
  readonly produced: number | null;
  readonly lost: number | null;
  readonly lostSource: 'report' | 'attempts' | 'n/a';
  readonly reported: boolean;
  readonly degraded: { readonly count: number | null; readonly source: 'report' | 'n/a' };
  /** The fallback archetype is not implemented yet: n/a, not zero. */
  readonly fallback: { readonly count: null; readonly source: 'n/a' };
  readonly scenes: {
    readonly count: number;
    readonly unique: number;
    readonly coarseUnique: number;
    readonly signatures: readonly string[];
    readonly coarseSignatures: readonly string[];
    readonly unparsed: number;
  };
  readonly vocabulary: {
    readonly primitives: readonly string[];
    readonly devices: readonly string[];
  };
  readonly census: Census;
}

export interface RunTotals {
  /** Null when no topic of the run carried the number. */
  readonly planned: number | null;
  readonly plannedTopics: number;
  readonly produced: number | null;
  readonly producedTopics: number;
  readonly lost: number | null;
  readonly lostTopics: number;
  readonly degraded: number | null;
  readonly degradedTopics: number;
  readonly scenes: number;
  readonly uniqueScenes: number;
  readonly signatureRatio: number;
  /** Distinct primitive sets per film: the guard against "same scene twice". */
  readonly coarseUniqueScenes: number;
  readonly coarseRatio: number;
  /** Distinct primitives (plus devices, when a scene has no element tree) per film. */
  readonly vocabularyPerFilm: number;
  readonly attempts: number;
  readonly censusedScenes: number;
  readonly model: readonly CodeCount[];
  readonly gate: readonly CodeCount[];
}

export interface RunMetrics {
  readonly run: string;
  readonly topics: readonly TopicMetrics[];
  readonly totals: RunTotals;
}

export interface Aggregate extends RunTotals {
  readonly runs: number;
  readonly reportedRuns: number;
  readonly degradedRuns: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function bump(counts: Map<string, number>, code: string): void {
  counts.set(code, (counts.get(code) ?? 0) + 1);
}

function sortCounts(counts: Map<string, number>): CodeCount[] {
  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([code, count]) => ({ code, count }));
}

function themeOf(scene: Record<string, unknown>): UiThemeId {
  const value = scene['themeId'];

  return typeof value === 'string' && (UI_THEME_IDS as readonly string[]).includes(value)
    ? (value as UiThemeId)
    : 'studio-dark';
}

/** Codes produced by the schema layer, not by our gates. */
const MODEL_ISSUES = new Set([
  'dangling-link',
  'element-budget',
  'primitive-budget',
  'sequence-unknown-element',
  'text-not-supported',
]);

const PARAMETER_ISSUES: Readonly<Record<string, string>> = {
  'parameter-type': 'invalid-type',
  'parameter-range': 'invalid-range',
  'parameter-enum': 'invalid-enum',
  'parameter-length': 'too-long',
  'invalid-spec': 'invalid-spec',
};

const GATE_ISSUES = new Set(['typography-fit', 'grid-overlap', 'surface-overlap']);

function contractSupports(primitive: PrimitiveId, parameter: string): boolean {
  return Object.hasOwn(PRIMITIVES[primitive].parameters, parameter);
}

function otherPrimitiveSupports(primitive: PrimitiveId, parameter: string): boolean {
  return (Object.keys(PRIMITIVES) as PrimitiveId[]).some(
    (candidate) => candidate !== primitive && contractSupports(candidate, parameter),
  );
}

/**
 * Vocabulary census of one raw composition. Parameters are checked here rather
 * than through the validator: a property borrowed from another primitive
 * (`tone` on a plate, `background` on a label) is a mix-up, not a typo, and it
 * deserves its own row.
 */
function censusSpec(raw: unknown, model: Map<string, number>, gate: Map<string, number>): void {
  if (!isRecord(raw) || !Array.isArray(raw['elements']) || raw['elements'].length === 0) {
    bump(model, 'invalid-spec');
    return;
  }

  for (const element of raw['elements']) {
    if (!isRecord(element)) {
      bump(model, 'invalid-spec');
      continue;
    }

    const primitive = typeof element['primitive'] === 'string' ? element['primitive'] : '';

    if (!Object.hasOwn(PRIMITIVES, primitive)) {
      bump(model, 'unknown-primitive');
      continue;
    }

    const known = primitive as PrimitiveId;
    const params = isRecord(element['params']) ? element['params'] : {};

    for (const parameter of Object.keys(params)) {
      if (contractSupports(known, parameter)) {
        continue;
      }

      if (otherPrimitiveSupports(known, parameter)) {
        bump(model, 'property-mixup');
      } else {
        bump(model, 'unknown-parameter');
      }
    }

    for (const transition of strings(element['transitions'])) {
      if (!PRIMITIVES[known].transitions.includes(transition)) {
        bump(model, 'transition-dropped');
      }
    }

    for (const state of strings(element['states'])) {
      if (!PRIMITIVES[known].states.includes(state)) {
        bump(model, 'unknown-state');
      }
    }

    for (const operation of strings(element['operations'])) {
      if (!PRIMITIVES[known].operations.includes(operation)) {
        bump(model, 'unknown-operation');
      }
    }
  }

  const parsed = parseComposition(raw);

  for (const issue of parsed.issues) {
    if (GATE_ISSUES.has(issue.code)) {
      bump(gate, issue.code);
    } else if (MODEL_ISSUES.has(issue.code)) {
      bump(model, issue.code);
    } else if (Object.hasOwn(PARAMETER_ISSUES, issue.code)) {
      bump(model, PARAMETER_ISSUES[issue.code] ?? issue.code);
    }
  }

  if (parsed.spec !== null) {
    for (const issue of lintQuality(parsed.spec, themeOf(raw as Record<string, unknown>))) {
      bump(gate, `quality:${issue.code}`);
    }
  }
}

function censusDevice(scene: unknown, model: Map<string, number>): void {
  const parsed = uiSceneSchema.safeParse(scene);

  if (parsed.success) {
    return;
  }

  for (const issue of parsed.error.issues) {
    switch (String(issue.code)) {
      case 'unrecognized_keys':
        bump(model, 'unknown-parameter');
        break;
      case 'invalid_type':
        bump(model, 'invalid-type');
        break;
      case 'invalid_value':
        bump(model, 'invalid-enum');
        break;
      case 'too_big':
      case 'too_small':
        bump(model, 'invalid-range');
        break;
      default:
        bump(model, 'invalid-scene');
    }
  }
}

function censusScene(scene: unknown, model: Map<string, number>, gate: Map<string, number>): void {
  if (!isRecord(scene)) {
    bump(model, 'invalid-scene');
    return;
  }

  if (scene['device'] === 'spec') {
    censusSpec(scene['spec'], model, gate);
    return;
  }

  censusDevice(scene, model);
}

function censusOf(topic: TopicSource): Census {
  const model = new Map<string, number>();
  const gate = new Map<string, number>();
  const signatures = new Set<string>();
  let bodies = 0;
  let invalid = 0;
  let unparsed = 0;

  for (const document of topic.attempts) {
    const scenes = scenesOf(document);

    if (scenes === null) {
      unparsed += 1;
      continue;
    }

    for (const scene of scenes) {
      censusScene(scene, model, gate);
      bodies += 1;

      const signature = rawSceneSignature(scene);

      if (signature.kind === 'invalid') {
        invalid += 1;
      } else {
        signatures.add(signature.key);
      }
    }
  }

  return {
    attempts: topic.attempts.length,
    scenes: bodies,
    unparsed: unparsed + topic.brokenFiles.length,
    structure: { total: bodies, unique: signatures.size, invalid },
    model: sortCounts(model),
    gate: sortCounts(gate),
  };
}

function scenesOf(document: unknown): readonly unknown[] | null {
  if (isRecord(document) && Array.isArray(document['scenes'])) {
    return document['scenes'];
  }

  if (isRecord(document) && typeof document['device'] === 'string') {
    return [document];
  }

  return null;
}

/** Planned scenes come from the attempt files; the report only confirms them. */
function plannedOf(topic: TopicSource): number | null {
  return topic.plannedScenes;
}

function topicOf(topic: TopicSource): TopicMetrics {
  const scenes = scenesOf(topic.episode) ?? [];
  const structure = scenes.map((scene) => rawSceneSignature(scene));
  const signatures = structure.map((signature) => signature.key);
  const coarseSignatures = structure.map((signature) => signature.coarse);
  const unique = new Set(signatures).size;
  const coarseUnique = new Set(coarseSignatures).size;

  const primitives = new Set<string>();
  const devices = new Set<string>();

  for (const scene of scenes) {
    if (!isRecord(scene)) {
      continue;
    }

    if (scene['device'] === 'spec') {
      const spec = scene['spec'];

      if (isRecord(spec) && Array.isArray(spec['elements'])) {
        for (const element of spec['elements']) {
          if (isRecord(element) && typeof element['primitive'] === 'string') {
            primitives.add(element['primitive']);
          }
        }
      }
    } else if (typeof scene['device'] === 'string') {
      devices.add(scene['device']);
    }
  }

  const report = topic.report;
  const reported = isRecord(report) && numberOrNull(report['planned']) !== null;
  const reportedProduced = isRecord(report) ? numberOrNull(report['produced']) : null;
  const planned = (isRecord(report) ? numberOrNull(report['planned']) : null) ?? plannedOf(topic);
  const produced = reportedProduced ?? (topic.episode === null ? null : scenes.length);
  const degraded = isRecord(report) ? numberOrNull(report['degraded']) : null;

  let lost: number | null = null;

  if (planned !== null && produced !== null) {
    lost = planned - produced;
  }

  return {
    slug: topic.slug,
    planned,
    produced,
    lost,
    lostSource: reported ? 'report' : planned !== null ? 'attempts' : 'n/a',
    reported,
    degraded: { count: degraded, source: degraded === null ? 'n/a' : 'report' },
    fallback: { count: null, source: 'n/a' },
    scenes: {
      count: scenes.length,
      unique,
      coarseUnique,
      signatures,
      coarseSignatures,
      unparsed: scenesOf(topic.episode) === null && topic.episode !== null ? 1 : 0,
    },
    vocabulary: {
      primitives: [...primitives].sort(),
      devices: [...devices].sort(),
    },
    census: censusOf(topic),
  };
}

function mergeCounts(
  topics: readonly TopicMetrics[],
  pick: (topic: TopicMetrics) => readonly CodeCount[],
): CodeCount[] {
  const merged = new Map<string, number>();

  for (const topic of topics) {
    for (const entry of pick(topic)) {
      merged.set(entry.code, (merged.get(entry.code) ?? 0) + entry.count);
    }
  }

  return sortCounts(merged);
}

function sum(values: readonly (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function known(values: readonly (number | null)[]): number | null {
  return values.some((value) => value !== null) ? sum(values) : null;
}

function totalsOf(topics: readonly TopicMetrics[]): RunTotals {
  const degradedTopics = topics.filter((topic) => topic.degraded.count !== null);
  const scenes = sum(topics.map((topic) => topic.scenes.count));
  const uniqueScenes = sum(topics.map((topic) => topic.scenes.unique));
  const coarseUniqueScenes = sum(topics.map((topic) => topic.scenes.coarseUnique));
  const units = topics.map(
    (topic) => topic.vocabulary.primitives.length + topic.vocabulary.devices.length,
  );

  return {
    planned: known(topics.map((topic) => topic.planned)),
    plannedTopics: topics.filter((topic) => topic.planned !== null).length,
    produced: known(topics.map((topic) => topic.produced)),
    producedTopics: topics.filter((topic) => topic.produced !== null).length,
    lost: known(topics.map((topic) => topic.lost)),
    lostTopics: topics.filter((topic) => topic.lost !== null).length,
    degraded: degradedTopics.length === 0
      ? null
      : sum(degradedTopics.map((topic) => topic.degraded.count)),
    degradedTopics: degradedTopics.length,
    scenes,
    uniqueScenes,
    signatureRatio: scenes === 0 ? 0 : Number((uniqueScenes / scenes).toFixed(3)),
    coarseUniqueScenes,
    coarseRatio: scenes === 0 ? 0 : Number((coarseUniqueScenes / scenes).toFixed(3)),
    vocabularyPerFilm: topics.length === 0
      ? 0
      : Number((sum(units) / topics.length).toFixed(2)),
    attempts: sum(topics.map((topic) => topic.census.attempts)),
    censusedScenes: sum(topics.map((topic) => topic.census.scenes)),
    model: mergeCounts(topics, (topic) => topic.census.model),
    gate: mergeCounts(topics, (topic) => topic.census.gate),
  };
}

export function measureRun(source: RunSource): RunMetrics {
  const topics = source.topics.map(topicOf);

  return { run: source.run, topics, totals: totalsOf(topics) };
}

export function measureRuns(sources: readonly RunSource[]): RunMetrics[] {
  return sources.map(measureRun);
}

export function aggregateOf(runs: readonly RunMetrics[]): Aggregate {
  return {
    runs: runs.length,
    reportedRuns: runs.filter((run) => run.topics.some((topic) => topic.reported)).length,
    degradedRuns: runs.filter((run) => run.totals.degraded !== null).length,
    ...totalsOf(runs.flatMap((run) => run.topics)),
  };
}
