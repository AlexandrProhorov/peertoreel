import { selectComposition, renderStill } from '@remotion/renderer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getUiDemoBundle } from '../render.js';
import type { UiEpisode } from '../spec.js';
import {
  UI_LINT_COMPOSITION_ID,
} from '../spec.js';
import { LINT_LOG_PREFIX, type SceneMeasurement } from './measure.js';
import type { LintFramePolicy } from './UiLint.js';

export interface MeasureOptions {
  episode: UiEpisode;
  policy: LintFramePolicy;
  outDir: string;
}

export interface MeasureResult {
  policy: LintFramePolicy;
  stillPath: string;
  measurements: SceneMeasurement[];
  /** Probe and parse failures: the run must not silently pass. */
  errors: string[];
}

function browserExecutable(): string | undefined {
  return process.env.REMOTION_BROWSER_EXECUTABLE?.trim() || undefined;
}

function parseReport(text: string): SceneMeasurement[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed as SceneMeasurement[];
}

/**
 * Render one still of the `UiLint` composition and read the probe report from
 * the browser console. Uses the renderer that already renders the video, so the
 * measured DOM is exactly the DOM that gets filmed.
 */
export async function measureUiEpisode({
  episode,
  policy,
  outDir,
}: MeasureOptions): Promise<MeasureResult> {
  await mkdir(outDir, { recursive: true });

  const serveUrl = await getUiDemoBundle();
  const executable = browserExecutable();
  const inputProps = { episode, policy };
  const errors: string[] = [];
  const stillPath = path.join(outDir, `lint-${policy}.png`);

  const composition = await selectComposition({
    serveUrl,
    id: UI_LINT_COMPOSITION_ID,
    inputProps,
    browserExecutable: executable,
    logLevel: 'warn',
  });

  let report: SceneMeasurement[] | null = null;

  await renderStill({
    composition,
    serveUrl,
    output: stillPath,
    inputProps,
    imageFormat: 'png',
    browserExecutable: executable,
    chromiumOptions: { gl: 'swiftshader' },
    logLevel: 'warn',
    onBrowserLog: (log) => {
      if (!log.text.startsWith(LINT_LOG_PREFIX)) {
        return;
      }

      const payload = log.text.slice(LINT_LOG_PREFIX.length);
      const parsedPayload: unknown = (() => {
        try {
          return JSON.parse(payload);
        } catch {
          return null;
        }
      })();

      if (
        typeof parsedPayload === 'object' &&
        parsedPayload !== null &&
        'error' in parsedPayload
      ) {
        errors.push(String((parsedPayload as { error: unknown }).error));
        return;
      }

      const parsed = parseReport(payload);

      if (parsed === null) {
        errors.push(`Unparseable probe report: ${payload.slice(0, 200)}`);
        return;
      }

      report = parsed;
    },
  });

  if (report === null) {
    errors.push('Probe did not report any measurement');
  }

  return {
    policy,
    stillPath,
    measurements: report ?? [],
    errors,
  };
}
