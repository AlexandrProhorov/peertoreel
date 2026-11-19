import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { measureUiEpisode } from '../lint/render.js';
import { lintMeasurements } from '../lint/rules.js';
import { uiEpisodeSchema } from '../spec.js';
import { describeMeasurements } from './report.js';

/**
 * One measurement, two reports: technical violations and visual numbers.
 * Measurement is the expensive part (a real browser render), so the experiment
 * scripts call this instead of running `ui:lint` and `ui:visual` separately.
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
  const outDir = path.resolve(cwd, optionValue('--out') ?? 'out/ui-visual');
  const raw: unknown = JSON.parse(
    await readFile(path.resolve(cwd, input), 'utf8'),
  );
  const episode = uiEpisodeSchema.parse(raw);
  const result = await measureUiEpisode({ episode, policy: 'settled', outDir });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`probe: ${error}`);
    }

    process.exitCode = 1;
    return;
  }

  const reports = describeMeasurements(result.measurements);
  const violations = lintMeasurements(result.measurements);

  for (const report of reports) {
    const pct = (value: number): string => `${Math.round(value * 100)}%`;

    console.log(
      `${report.sceneId}: occupied ${pct(report.occupied)}, ` +
        `${report.groups} group(s), largest ${pct(report.largestShare)}, ` +
        `${report.boxes} box(es), ${report.textChars} chars, ` +
        `LCR ${report.horizontal.map(pct).join('/')}, TMB ${report.vertical.map(pct).join('/')}`,
    );

    if (report.placeholders.length > 0) {
      console.log(`  placeholders: ${report.placeholders.join('; ')}`);
    }
  }

  const errors = violations.filter((violation) => violation.severity === 'error');
  console.log(
    `lint: ${errors.length} error(s)${errors.length === 0 ? '' : ` — ${errors
      .map((violation) => violation.rule)
      .join(', ')}`}`,
  );

  console.log(`\n${JSON.stringify({ reports, violations }, null, 2)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
