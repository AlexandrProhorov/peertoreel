import { createDeepSeekJsonClient } from '@peertoreel/providers';
import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeepSeekSvgEnv } from '../../provider-config.js';
import { topicsSchema } from '../film/topics.js';
import { themeById, UI_THEME_IDS, type UiThemeId } from '../themes.js';
import { generateScene, type GeneratedScene } from './scene-pipeline.js';

/**
 * One scene from one topic: script → depiction → node map.
 *
 * Usage:
 *   pnpm --filter @peertoreel/render-worker ui:scene -- --topic "доставка еды"
 *   pnpm --filter @peertoreel/render-worker ui:scene -- --input topics.json --out out/scenes
 *
 * Thinking is on for the depiction and the node map; `--no-think` turns it off.
 */

interface SceneRecord {
  readonly slug: string;
  readonly topic: string;
  readonly status: 'ok' | 'failed';
  readonly theme: UiThemeId;
  readonly seconds: number;
  readonly usd: number;
  readonly result?: GeneratedScene;
  readonly error?: string;
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

function numberOption(name: string, fallback: number): number {
  const raw = optionValue(name);

  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received "${raw}"`);
  }

  return value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
}

function themeOption(): UiThemeId | null {
  const raw = optionValue('--theme');

  if (raw === undefined) {
    return null;
  }

  if (!(UI_THEME_IDS as readonly string[]).includes(raw)) {
    throw new Error(`--theme must be one of ${UI_THEME_IDS.join(', ')}, received "${raw}"`);
  }

  return raw as UiThemeId;
}

function usdOf(
  result: GeneratedScene,
  rates: { input: number; output: number },
): number {
  return (
    (result.tokens.prompt * rates.input + result.tokens.completion * rates.output) /
    1_000_000
  );
}

async function main(): Promise<void> {
  loadEnv({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });

  const config = parseDeepSeekSvgEnv(process.env);
  const thinking = process.argv.includes('--think');
  const seconds = numberOption('--seconds', 6);
  const cwd = process.cwd();
  const outRoot = path.resolve(cwd, optionValue('--out') ?? 'out/scenes');
  const fixedTheme = themeOption();

  const topic = optionValue('--topic');
  const inputPath = optionValue('--input');

  if (topic === undefined && inputPath === undefined) {
    throw new Error('--topic <text> or --input <topics.json> is required');
  }

  if (topic !== undefined && inputPath !== undefined) {
    throw new Error('use either --topic or --input, not both');
  }

  const topics =
    inputPath === undefined
      ? [
          {
            slug: optionValue('--slug') ?? slugify(topic ?? 'scene'),
            topic: topic as string,
          },
        ]
      : topicsSchema.parse(
          JSON.parse(await readFile(path.resolve(cwd, inputPath), 'utf8')),
        );

  const client = createDeepSeekJsonClient({
    apiKey: config.apiKey,
    ...(config.model === undefined ? {} : { model: config.model }),
    maxTokens: thinking ? 16000 : 8000,
  });
  const rates = {
    input: config.rates.inputUsdPerMtok,
    output: config.rates.outputUsdPerMtok,
  };
  const records: SceneRecord[] = [];

  await mkdir(outRoot, { recursive: true });

  for (const [index, entry] of topics.entries()) {
    const themeId: UiThemeId =
      fixedTheme ?? UI_THEME_IDS[index % UI_THEME_IDS.length] ?? 'studio-dark';
    const dir = path.join(outRoot, entry.slug);
    const theme = themeById(themeId);

    console.log(
      `${entry.slug}: ${entry.topic} (${themeId}, ${String(seconds)}s, thinking ${thinking ? 'on' : 'off'})`,
    );

    try {
      const result = await generateScene({
        topic: entry.topic,
        theme,
        seconds,
        client,
        outDir: dir,
        thinking: thinking ? 'enabled' : 'disabled',
      });

      await writeFile(
        path.join(dir, 'episode.json'),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            themeId,
            captions: false,
            speech: [],
            scenes: [
              {
                id: entry.slug,
                device: 'draw',
                durationSec: seconds,
                revealSec: 0.8,
                narration: result.script.onScreen.join(' '),
                themeId,
                nodes: result.nodes,
              },
            ],
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      const usd = usdOf(result, rates);

      records.push({
        slug: entry.slug,
        topic: entry.topic,
        status: 'ok',
        theme: themeId,
        seconds,
        usd,
        result,
      });

      console.log(
        `  words=${String(result.words)} attempts=${String(result.attempts)} ` +
          `fixes=${String(result.fixes.length)} issues=${String(result.issues.length)} $${usd.toFixed(4)}`,
      );

      if (result.issues.length > 0) {
        console.log(`  kept with issues: ${result.issues.join(' | ')}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      records.push({
        slug: entry.slug,
        topic: entry.topic,
        status: 'failed',
        theme: themeId,
        seconds,
        usd: 0,
        error: message,
      });

      console.error(`  FAILED: ${message}`);
      process.exitCode = 1;
    }
  }

  await writeFile(
    path.join(outRoot, 'report.json'),
    `${JSON.stringify(
      {
        model: config.model ?? 'default',
        thinking,
        seconds,
        records,
        usd: records.reduce((sum, record) => sum + record.usd, 0),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\n${String(records.length)} scene(s) -> ${outRoot}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
