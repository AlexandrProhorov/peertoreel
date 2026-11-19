import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';

/**
 * Difference metric for the variant lab. A beat counts as "the same shot" when
 * both the device and the theme match — with identical beats and identical
 * texts the rendered frames are indistinguishable.
 */
interface Loaded {
  readonly name: string;
  readonly episode: UiEpisode;
}

function beatSignature(episode: UiEpisode, index: number): string {
  const scene = episode.scenes[index];

  if (scene === undefined) {
    return 'missing';
  }

  return `${scene.device}|${scene.themeId ?? episode.themeId}`;
}

function identicalBeats(a: UiEpisode, b: UiEpisode): string[] {
  const length = Math.min(a.scenes.length, b.scenes.length);
  const same: string[] = [];

  for (let index = 0; index < length; index += 1) {
    if (beatSignature(a, index) === beatSignature(b, index)) {
      same.push(a.scenes[index]?.id ?? `#${index}`);
    }
  }

  return same;
}

function argumentValue(name: string): string[] {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
  let raw: string | undefined;

  if (inline !== undefined) {
    raw = inline.slice(name.length + 1);
  } else {
    const index = process.argv.indexOf(name);
    raw = index < 0 ? undefined : process.argv[index + 1];
  }

  if (raw === undefined || raw.length === 0) {
    throw new Error(`${name} is required`);
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function load(entry: string): Promise<Loaded> {
  const file = path.resolve(process.cwd(), entry);
  const episode = uiEpisodeSchema.parse(
    JSON.parse(await readFile(file, 'utf8')),
  );

  return { name: path.basename(entry, '.json'), episode };
}

async function main(): Promise<void> {
  const inputs = argumentValue('--input');
  const loaded = await Promise.all(inputs.map((entry) => load(entry)));

  for (const variant of loaded) {
    console.log(`${variant.name}:`);
    console.log(
      `  ${variant.episode.scenes
        .map((scene) => `${scene.id}=${scene.device}|${scene.themeId ?? variant.episode.themeId}`)
        .join(' ')}`,
    );
  }

  console.log('');

  for (let i = 0; i < loaded.length; i += 1) {
    for (let j = i + 1; j < loaded.length; j += 1) {
      const first = loaded[i];
      const second = loaded[j];

      if (first === undefined || second === undefined) {
        continue;
      }

      const same = identicalBeats(first.episode, second.episode);
      const total = Math.min(
        first.episode.scenes.length,
        second.episode.scenes.length,
      );

      console.log(
        `${first.name} vs ${second.name}: identical ${same.length}/${total}${
          same.length > 0 ? ` -> ${same.join(', ')}` : ''
        }`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
