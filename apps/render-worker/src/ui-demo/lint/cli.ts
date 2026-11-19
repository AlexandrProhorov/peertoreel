import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';
import { lintMeasurements } from './rules.js';
import { measureUiEpisode } from './render.js';
import type { LintFramePolicy } from './UiLint.js';
import type { Violation } from './measure.js';

/**
 * Universal DOM linter: loads every scene into headless Chromium, measures the
 * real boxes, applies the rules and exits non-zero on a critical violation.
 */
function usage(): void {
  console.log(`Usage:
  pnpm --filter @peertoreel/render-worker ui:lint -- --input <episode.json> [--out <dir>] [--frames settled|early|both] [--json]

Measures the rendered DOM (getBoundingClientRect) in headless Chromium and
checks: text outside the device/content bounds, text in the platform rail or
bottom bar, clipped text, overlapping critical boxes, font fallback and the
per-device contract.
`);
}

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    const value = inline.slice(name.length + 1);

    if (value.length === 0) {
      throw new Error(`Option ${name} requires a value`);
    }

    return value;
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

function policiesValue(): LintFramePolicy[] {
  const raw = optionValue('--frames');

  if (raw === undefined || raw === 'settled') {
    return ['settled'];
  }

  if (raw === 'early') {
    return ['early'];
  }

  if (raw === 'both') {
    return ['settled', 'early'];
  }

  throw new Error(`--frames must be "settled", "early" or "both", received "${raw}"`);
}

function formatViolation(violation: Violation): string {
  const rect =
    violation.rect === undefined
      ? ''
      : ` [x=${Math.round(violation.rect.x)} y=${Math.round(violation.rect.y)} w=${Math.round(
          violation.rect.width,
        )} h=${Math.round(violation.rect.height)}]`;

  return `  [${violation.severity}] ${violation.rule} ${violation.sceneId}/${violation.element}: ${violation.message}${rect}`;
}

async function main(): Promise<void> {
  const input = optionValue('--input');

  if (input === undefined) {
    usage();
    throw new Error('--input is required');
  }

  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, input);
  const outDir = path.resolve(cwd, optionValue('--out') ?? 'out/ui-lint');
  const asJson = process.argv.includes('--json');
  const policies = policiesValue();

  const raw: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
  const episode: UiEpisode = uiEpisodeSchema.parse(raw);

  const allViolations: Violation[] = [];
  const failures: string[] = [];

  for (const policy of policies) {
    const result = await measureUiEpisode({ episode, policy, outDir });

    for (const scene of result.measurements) {
      console.log(
        `measured: ${scene.sceneId} (${scene.device}) frame=${scene.frame} boxes=${scene.boxes.length}`,
      );
    }

    for (const error of result.errors) {
      failures.push(`${policy}: ${error}`);
    }

    const violations = lintMeasurements(result.measurements);

    allViolations.push(...violations);

    console.log(
      `${policy}: ${result.measurements.length} scene(s), ${violations.length} violation(s) -> ${result.stillPath}`,
    );
  }

  const errors = allViolations.filter((violation) => violation.severity === 'error');

  if (asJson) {
    console.log(JSON.stringify({ violations: allViolations, failures }, null, 2));
  } else {
    for (const violation of allViolations) {
      console.log(formatViolation(violation));
    }

    for (const failure of failures) {
      console.log(`  [error] probe ${failure}`);
    }
  }

  if (errors.length > 0 || failures.length > 0) {
    console.error(
      `\nui-lint failed: ${errors.length} error(s), ${failures.length} probe failure(s)`,
    );
    process.exitCode = 1;

    return;
  }

  console.log('\nui-lint passed');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
