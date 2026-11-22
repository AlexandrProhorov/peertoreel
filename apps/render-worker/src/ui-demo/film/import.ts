import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairEpisode } from '../fit/autofit.js';
import { normalizeRawEpisode } from '../fit/normalize.js';
import type { Repair } from '../fit/salvage.js';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';

/**
 * Import another model's answer as an episode.
 *
 * The comparison asks three models for the same film and judges the result. The
 * old adapter lived in `out/` and read a file from one machine, so "4 of 4
 * scenes" could not be reproduced. This tool reads a foreign answer from the
 * repository, maps it to our episode shape, runs the normalisation the director
 * uses and reports which scenes survived — the fixtures live in
 * `fixtures/foreign/`.
 *
 * Usage:
 *   ui:import fixtures/foreign/claude-subscriptions.json out/claude/episode.json
 *   ui:import --input <file> --out <episode.json>
 *
 * Exit code is 1 when at least one scene is lost, so the check fails on a
 * machine that is not the author's.
 */

export interface ImportSceneStatus {
  readonly id: string;
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export interface ImportResult {
  readonly episode: UiEpisode | null;
  readonly statuses: readonly ImportSceneStatus[];
  readonly repairs: readonly Repair[];
  readonly lost: number;
}

interface ForeignScene {
  readonly id?: unknown;
  readonly seconds?: unknown;
  readonly theme?: unknown;
  readonly themeId?: unknown;
  readonly spec?: unknown;
}

interface ForeignEpisode {
  readonly scenes?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);

  return fenced?.[1] ?? trimmed;
}

function sceneToOurShape(scene: ForeignScene, index: number): unknown {
  const spec = isObject(scene.spec) ? scene.spec : {};
  /* A foreign answer names the theme in `theme`; our own episodes use
     `themeId`. Reading both keeps an episode re-importable. */
  const theme = typeof scene.theme === 'string' ? scene.theme : scene.themeId;

  return {
    id: typeof scene.id === 'string' && scene.id.length > 0 ? scene.id : `scene-${index + 1}`,
    device: 'spec',
    durationSec: typeof scene.seconds === 'number' ? scene.seconds : 6,
    revealSec: 2,
    themeId: typeof theme === 'string' ? theme : 'studio-dark',
    spec: { kind: 'composition', ...spec },
  };
}

function issuesOf(error: { issues: ReadonlyArray<{ message: string }> }): string[] {
  return error.issues.slice(0, 3).map((issue) => issue.message);
}

/** Pure part: fixtures and tests call this, the CLI only does files. */
export function importForeignEpisode(raw: unknown): ImportResult {
  const foreign = (isObject(raw) ? raw : {}) as ForeignEpisode;
  const scenes = Array.isArray(foreign.scenes) ? foreign.scenes : [];
  const repairs: Repair[] = [];
  const statuses: ImportSceneStatus[] = [];
  const accepted: UiEpisode['scenes'] = [];
  let themeId = 'studio-dark';

  scenes.forEach((entry, index) => {
    const scene = isObject(entry) ? (entry as ForeignScene) : {};
    const mapped = sceneToOurShape(scene, index);
    const id = (mapped as { readonly id: string }).id;

    const sceneTheme = typeof scene.theme === 'string' ? scene.theme : scene.themeId;

    if (index === 0 && typeof sceneTheme === 'string') {
      themeId = sceneTheme;
    }

    const normalized = normalizeRawEpisode(
      {
        schemaVersion: 1,
        themeId,
        captions: false,
        speech: [],
        scenes: [mapped],
      },
      repairs,
    );
    const parsed = uiEpisodeSchema.safeParse(normalized);

    if (parsed.success) {
      const first = parsed.data.scenes[0];

      if (first !== undefined) {
        accepted.push(first);
        statuses.push({ id, ok: true, reasons: [] });
        return;
      }
    }

    statuses.push({
      id,
      ok: false,
      reasons: parsed.success ? ['scene vanished during normalisation'] : issuesOf(parsed.error),
    });
  });

  const episode = uiEpisodeSchema.safeParse({
    schemaVersion: 1,
    themeId,
    captions: false,
    speech: [],
    scenes: accepted,
  });

  return {
    episode: episode.success ? episode.data : null,
    statuses,
    repairs,
    lost: scenes.length - accepted.length,
  };
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

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Option ${name} requires a value`);
  }

  return value;
}

async function main(): Promise<void> {
  const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
  const input = optionValue('--input') ?? positional[0];
  const out =
    optionValue('--out') ??
    positional[1] ??
    (input === undefined
      ? undefined
      : path.join(path.dirname(input), `${path.basename(input, '.json')}-episode.json`));

  if (input === undefined || out === undefined) {
    throw new Error('usage: ui:import <foreign.json> [episode.json]');
  }

  const cwd = process.cwd();
  const parsed = JSON.parse(stripFence(await readFile(path.resolve(cwd, input), 'utf8')));
  const result = importForeignEpisode(parsed);

  for (const status of result.statuses) {
    console.log(
      status.ok
        ? `scene ${status.id}: ok`
        : `scene ${status.id}: lost — ${status.reasons.join('; ')}`,
    );
  }

  for (const repair of result.repairs) {
    console.log(
      `salvaged ${repair.path} (${repair.element ?? 'scene'}): ${repair.reason}: ${repair.from} -> ${repair.to}`,
    );
  }

  if (result.episode === null) {
    throw new Error('no scene survived: nothing to write');
  }

  /* The same repair pass the director runs: a foreign answer is accepted only
     with the fit that production applies, otherwise "ok" here means a broken
     frame in the film. */
  const fitted = await repairEpisode(result.episode, {
    outDir: path.resolve(cwd, `${out}.fit`),
  });

  for (const grown of fitted.grown) {
    console.log(`grown ${grown.elementId}: box is now ${grown.width}×${grown.height}`);
  }

  for (const fix of fitted.fixes) {
    console.log(`fit ${fix.elementId}: fontScale ${fix.from} -> ${fix.to}`);
  }

  for (const overflow of fitted.overflowing) {
    console.log(`overflow ${overflow}`);
  }

  await mkdir(path.dirname(path.resolve(cwd, out)), { recursive: true });
  await writeFile(
    path.resolve(cwd, out),
    `${JSON.stringify(fitted.episode, null, 2)}\n`,
    'utf8',
  );

  const seconds = fitted.episode.scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

  console.log(
    `\n${result.statuses.length - result.lost}/${result.statuses.length} scenes, ${seconds.toFixed(1)}s, ${result.repairs.length} salvaged, ${fitted.grown.length} grown, ${fitted.overflowing.length} overflowing -> ${out}`,
  );

  if (result.lost > 0 || fitted.overflowing.length > 0) {
    process.exitCode = 1;
  }
}

mainGuard();

function mainGuard(): void {
  /* The module is imported by tests, so the CLI only starts when this file is
     the entry point. */
  const entry = process.argv[1];

  if (entry === undefined) {
    return;
  }

  const self = fileURLToPath(import.meta.url);

  if (path.resolve(entry) !== path.resolve(self)) {
    return;
  }

  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
