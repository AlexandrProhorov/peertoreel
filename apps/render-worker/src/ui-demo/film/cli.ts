import { createDeepSeekJsonClient } from '@peertoreel/providers';
import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseDeepSeekSvgEnv } from '../../provider-config.js';
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildUserPrompt,
} from '../director/contract-brief.js';
import { repairEpisode } from '../fit/autofit.js';
import { normalizeRawEpisode } from '../fit/normalize.js';
import type { Repair } from '../fit/salvage.js';
import { uiEpisodeSchema, type UiEpisode, type UiScene } from '../spec.js';
import { parseJsonResponse, stripBom } from '../tolerant-json.js';
import { checkVisibleChange } from '../verify/motion.js';
import { ARC_SYSTEM_PROMPT, arcSchema, buildArcPrompt, type Arc } from './arc.js';
import { sceneContext } from './scene-context.js';

/**
 * Multi-scene director: one film, three to five scenes, scene-level retries.
 *
 * The arc is generated once and frozen; scenes are generated against it
 * independently, so a scene that fails twice does not rewrite the film. Every
 * scene goes through the same gates as the single-scene path: schema, repair,
 * visible change.
 */

const topicsSchema = z.array(
  z.object({ slug: z.string().min(1).max(40), topic: z.string().min(1).max(300) }),
);

const SCENE_ATTEMPTS = 4;

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

function issuesOf(error: unknown): string[] {
  if (error instanceof z.ZodError) {
    return error.issues.map(
      (issue) => `${issue.path.join('.') || '$'}: ${issue.message}`,
    );
  }

  return [error instanceof Error ? error.message : String(error)];
}

function wrapScene(scene: UiScene, themeId: string): UiEpisode {
  return {
    schemaVersion: 1,
    themeId: scene.themeId ?? themeId,
    captions: false,
    speech: [],
    scenes: [scene],
  } as UiEpisode;
}

async function generateScene(options: {
  topic: string;
  arc: Arc;
  index: number;
  client: ReturnType<typeof createDeepSeekJsonClient>;
  dir: string;
  tokens: { prompt: number; completion: number };
}): Promise<{ scene: UiScene | null; attempts: number; errors: string[] }> {
  const planned = options.arc.scenes[options.index];

  if (planned === undefined) {
    return { scene: null, attempts: 0, errors: ['arc has no such scene'] };
  }

  const errors: string[] = [];

  for (let attempt = 1; attempt <= SCENE_ATTEMPTS; attempt += 1) {
    const correction =
      errors.length === 0
        ? ''
        : `\n\nПредыдущая попытка отклонена. Исправь ровно это:\n${errors
            .map((line) => `- ${line}`)
            .join('\n')}`;
    const response = await options.client.complete({
      system: DIRECTOR_SYSTEM_PROMPT,
      user: `${buildUserPrompt(options.topic, {
        seconds: planned.seconds,
        themeId: planned.theme,
        context: sceneContext(options.arc, planned, options.index),
      })}${correction}`,
      temperature: 0.7,
    });

    options.tokens.prompt += response.usage.promptTokens;
    options.tokens.completion += response.usage.completionTokens;

    const raw = stripFence(response.content);

    await writeFile(
      path.join(options.dir, `scene-${options.index + 1}-attempt-${attempt}.json`),
      `${raw}\n`,
      'utf8',
    );

    let parsed: unknown;

    try {
      parsed = parseJsonResponse(raw);
    } catch (error: unknown) {
      errors.splice(0, errors.length, ...issuesOf(error));
      continue;
    }

    const repairs: Repair[] = [];
    const episode = uiEpisodeSchema.safeParse(normalizeRawEpisode(parsed, repairs));

    for (const repair of repairs) {
      console.log(`salvaged ${repair.path}: ${repair.reason} (${repair.from} -> ${repair.to})`);
    }

    if (!episode.success) {
      errors.splice(0, errors.length, ...issuesOf(episode.error));
      continue;
    }

    const first = episode.data.scenes[0];

    if (first === undefined) {
      errors.splice(0, errors.length, 'scene is missing');
      continue;
    }

    const repaired = await repairEpisode(wrapScene(first, planned.theme), {
      outDir: path.join(options.dir, `fit-${options.index + 1}`),
    });

    if (repaired.overflowing.length > 0) {
      errors.splice(
        0,
        errors.length,
        `текст не влезает даже на минимальном кегле (${repaired.overflowing.join(', ')}): сократи текст или увеличь бокс`,
      );
      continue;
    }
    const motion = await checkVisibleChange(
      repaired.episode,
      path.join(options.dir, `motion-${options.index + 1}`),
    );

    if (!motion.changed) {
      errors.splice(
        0,
        errors.length,
        `сцена статична: кадры ${motion.earlyFrame} и ${motion.lateFrame} совпадают — добавь действие из контракта (type, fill, draw, break, drag, disappear); входы элементов действием не считаются`,
      );
      continue;
    }

    return { scene: repaired.episode.scenes[0] ?? null, attempts: attempt, errors: [] };
  }

  return { scene: null, attempts: SCENE_ATTEMPTS, errors };
}

async function main(): Promise<void> {
  loadEnv({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });

  const config = parseDeepSeekSvgEnv(process.env);
  const input = optionValue('--input');

  if (input === undefined) {
    throw new Error('--input <topics.json> is required');
  }

  const cwd = process.cwd();
  const outRoot = path.resolve(cwd, optionValue('--out') ?? 'out/film');
  const withAction = !process.argv.includes('--no-action');
  const topics = topicsSchema.parse(
    JSON.parse(stripBom(await readFile(path.resolve(cwd, input), 'utf8'))),
  );
  const client = createDeepSeekJsonClient({
    apiKey: config.apiKey,
    ...(config.model === undefined ? {} : { model: config.model }),
    maxTokens: 8000,
  });
  const rates = {
    input: config.rates.inputUsdPerMtok,
    output: config.rates.outputUsdPerMtok,
  };
  const report: unknown[] = [];

  for (const entry of topics) {
    const dir = path.join(outRoot, entry.slug);
    const tokens = { prompt: 0, completion: 0 };

    await mkdir(dir, { recursive: true });

    let arc: Arc | null = null;
    const arcErrors: string[] = [];

    for (let attempt = 1; attempt <= 3 && arc === null; attempt += 1) {
      const response = await client.complete({
        system: ARC_SYSTEM_PROMPT,
        user:
          buildArcPrompt(entry.topic, { action: withAction }) +
          (arcErrors.length === 0
            ? ''
            : `\n\nОтклонено валидатором:\n${arcErrors.map((line) => `- ${line}`).join('\n')}`),
        temperature: 0.7,
      });

      tokens.prompt += response.usage.promptTokens;
      tokens.completion += response.usage.completionTokens;

      const raw = stripFence(response.content);

      await writeFile(path.join(dir, `arc-attempt-${attempt}.json`), `${raw}\n`, 'utf8');

      try {
        arc = arcSchema.parse(parseJsonResponse(raw));
      } catch (error: unknown) {
        arcErrors.splice(0, arcErrors.length, ...issuesOf(error));
      }
    }

    if (arc === null) {
      console.log(`${entry.slug}: arc FAILED`);
      for (const message of arcErrors) {
        console.log(`  ${message}`);
      }
      report.push({ slug: entry.slug, status: 'arc-failed', errors: arcErrors });
      continue;
    }

    await writeFile(
      path.join(dir, 'arc.json'),
      `${JSON.stringify(arc, null, 2)}\n`,
      'utf8',
    );

    const scenes: UiScene[] = [];
    const sceneReport: unknown[] = [];

    for (let index = 0; index < arc.scenes.length; index += 1) {
      const result = await generateScene({
        topic: entry.topic,
        arc,
        index,
        client,
        dir,
        tokens,
      });

      if (result.scene === null) {
        sceneReport.push({
          index: index + 1,
          status: 'failed',
          attempts: result.attempts,
          errors: result.errors,
        });
        continue;
      }

      scenes.push(result.scene);
      sceneReport.push({
        index: index + 1,
        status: 'ok',
        attempts: result.attempts,
      });
    }

    const usd = (tokens.prompt * rates.input + tokens.completion * rates.output) / 1_000_000;
    const totalSeconds = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);

    await writeFile(
      path.join(dir, 'episode.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          themeId: arc.scenes[0]?.theme ?? 'studio-dark',
          captions: false,
          speech: [],
          scenes,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    report.push({
      slug: entry.slug,
      status: scenes.length === arc.scenes.length ? 'complete' : 'partial',
      thesis: arc.thesis,
      planned: arc.scenes.length,
      produced: scenes.length,
      seconds: Number(totalSeconds.toFixed(1)),
      scenes: sceneReport,
      usd: Number(usd.toFixed(4)),
    });

    console.log(
      `${entry.slug}: ${scenes.length}/${arc.scenes.length} scenes, ${totalSeconds.toFixed(1)}s, $${usd.toFixed(4)}`,
    );

    for (const item of sceneReport as Array<Record<string, unknown>>) {
      if (item['status'] !== 'ok') {
        console.log(`  scene ${item['index']}: FAILED — ${String(item['errors'])}`);
      }
    }
  }

  await writeFile(
    path.join(outRoot, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
