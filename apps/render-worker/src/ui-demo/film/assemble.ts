import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRawEpisode } from '../fit/normalize.js';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';
import { arcSchema } from './arc.js';

/**
 * Assemble an episode from another model's output.
 *
 * A foreign model is asked for one JSON per scene (the same shape our director
 * expects) plus one arc. This tool puts them together, runs the same
 * normalisation and validation the pipeline uses, and writes an `episode.json`
 * that `ui:demo` renders — so the comparison is about the model, not about
 * hand-editing coordinates.
 *
 * Usage:
 *   ui:assemble --arc <arc.json> --scenes <dir> --out <episode.json>
 * where <dir> holds scene-1.json … scene-N.json, each either the full episode
 * object or a bare scene.
 */

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

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);

  return fenced?.[1] ?? trimmed;
}

function asScene(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return raw;
  }

  const record = raw as Record<string, unknown>;

  if (Array.isArray(record['scenes'])) {
    const scenes = record['scenes'];

    return scenes.length === 1 ? scenes[0] : record;
  }

  return record;
}

async function main(): Promise<void> {
  const arcPath = optionValue('--arc');
  const scenesDir = optionValue('--scenes');
  const outPath = optionValue('--out');

  if (arcPath === undefined || scenesDir === undefined || outPath === undefined) {
    throw new Error('--arc <arc.json> --scenes <dir> --out <episode.json> are required');
  }

  const cwd = process.cwd();
  const arc = arcSchema.parse(
    JSON.parse(stripFence(await readFile(path.resolve(cwd, arcPath), 'utf8'))),
  );
  const scenes: UiEpisode['scenes'] = [];
  const statuses: string[] = [];

  for (let index = 0; index < arc.scenes.length; index += 1) {
    const planned = arc.scenes[index];
    const file = path.resolve(cwd, scenesDir, `scene-${index + 1}.json`);

    if (planned === undefined) {
      continue;
    }

    let raw: unknown;

    try {
      raw = JSON.parse(stripFence(await readFile(file, 'utf8')));
    } catch (error: unknown) {
      statuses.push(`scene ${index + 1}: unreadable (${error instanceof Error ? error.message : error})`);
      continue;
    }

    const scene = asScene(raw);
    const normalized = normalizeRawEpisode({
      schemaVersion: 1,
      themeId: planned.theme,
      scenes: [scene],
    });
    const parsed = uiEpisodeSchema.safeParse(normalized);

    if (!parsed.success) {
      statuses.push(
        `scene ${index + 1}: rejected — ${parsed.error.issues.map((issue) => issue.message).slice(0, 3).join('; ')}`,
      );
      continue;
    }

    const first = parsed.data.scenes[0];

    if (first !== undefined) {
      scenes.push(first);
      statuses.push(`scene ${index + 1}: ok`);
    }
  }

  const episode = {
    schemaVersion: 1,
    themeId: arc.scenes[0]?.theme ?? 'studio-dark',
    captions: false,
    speech: [],
    scenes,
  };
  const checked = uiEpisodeSchema.safeParse(episode);

  if (!checked.success) {
    throw new Error(
      `assembled episode is invalid: ${checked.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }

  await mkdir(path.dirname(path.resolve(cwd, outPath)), { recursive: true });
  await writeFile(
    path.resolve(cwd, outPath),
    `${JSON.stringify(checked.data, null, 2)}\n`,
    'utf8',
  );

  for (const status of statuses) {
    console.log(status);
  }

  const seconds = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

  console.log(
    `\n${scenes.length}/${arc.scenes.length} scenes, ${seconds.toFixed(1)}s -> ${outPath}`,
  );

  if (scenes.length !== arc.scenes.length) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
