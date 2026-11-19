import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { uiEpisodeSchema } from '../spec.js';
import { repairEpisode } from './autofit.js';

/**
 * Standalone repair for an existing episode. The director calls the same
 * `repairEpisode` in-process; this CLI exists for re-fitting stored scenes.
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

async function main(): Promise<void> {
  const input = optionValue('--input');

  if (input === undefined) {
    throw new Error('--input <episode.json> is required');
  }

  const cwd = process.cwd();
  const outPath = path.resolve(cwd, optionValue('--out') ?? input);
  const raw: unknown = JSON.parse(
    await readFile(path.resolve(cwd, input), 'utf8'),
  );
  const episode = uiEpisodeSchema.parse(raw);
  const result = await repairEpisode(episode, {
    outDir: path.resolve(cwd, 'out/ui-fit'),
  });

  await writeFile(
    outPath,
    `${JSON.stringify(result.episode, null, 2)}\n`,
    'utf8',
  );

  for (const fix of result.fixes) {
    console.log(`${fix.elementId}: font ${fix.from} → ${fix.to}`);
  }

  if (result.overflowing.length > 0) {
    console.log(`still overflowing (copy too long): ${result.overflowing.join(', ')}`);
  }

  console.log(
    result.violations.length === 0
      ? `clean: no technical violations — ${outPath}`
      : `left ${result.violations.length} violation(s): ${result.violations.join('; ')} — ${outPath}`,
  );

  process.exitCode = result.violations.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
