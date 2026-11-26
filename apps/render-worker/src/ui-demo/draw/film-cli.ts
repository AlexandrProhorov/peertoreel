import { createDeepSeekJsonClient } from '@peertoreel/providers';
import { config as loadEnv } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseDeepSeekSvgEnv } from '../../provider-config.js';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { themeById, type UiThemeId } from '../themes.js';
import { parseJsonResponse } from '../tolerant-json.js';
import { validateDrawNodes } from './validate.js';
import { stripBackdrop, completeWithRetry } from './scene-pipeline.js';
import {
  drawNodesSchema,
  normalizeDrawNodes,
  type DrawNode,
} from './schema.js';
import { enforceEntranceVariety } from '../film/entrances.js';
import type { UiScene } from '../spec.js';
import {
  TREATMENT_SYSTEM,
  normalizeTreatment,
  treatmentSchema,
  type TreatmentScene,
} from './treatment.js';
import {
  CARRIER_SYSTEM,
  carrierSchema,
  carrierUser,
  drawSystem,
  drawUser,
  missingSlots,
  textPlanIssues,
  type CarrierPlan,
} from './carrier.js';
import { composeStatement } from './statement.js';

/**
 * One film from a treatment.
 *
 *   1. treatment   — the whole story: one device, narrative functions, lines,
 *                    and the text plan (setup / punchline / number);
 *   2. carrier     — per carrier scene, the surface and the text zones;
 *   3. draw        — per carrier scene, the nodes placed into those zones.
 *
 * A statement scene is composed by code from its text plan: no model call, and
 * the text beats stand in different parts of the frame by construction.
 *
 *   ui:film-draw -- --topic "подписки" --seconds 52 --out out/film-draw
 */

const TREATMENT_ATTEMPTS = 3;
const CARRIER_ATTEMPTS = 2;
const DRAW_ATTEMPTS = 2;
const WORD_BUDGET = 30;

const drawAnswerSchema = z.preprocess(
  (value) => {
    const record = value as { nodes?: unknown };

    return { nodes: normalizeDrawNodes(record.nodes) };
  },
  z.object({ nodes: drawNodesSchema }),
);

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
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);

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

async function callJson<T>(options: {
  readonly client: ReturnType<typeof createDeepSeekJsonClient>;
  readonly system: string;
  readonly user: string;
  readonly schema: z.ZodType<T>;
  readonly attempts: number;
  readonly temperature: number;
  readonly tokens: { prompt: number; completion: number };
  readonly dir?: string;
  readonly name?: string;
}): Promise<T> {
  let correction = '';
  let errors = '';

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const response = await completeWithRetry(options.client, {
      system: options.system,
      user: `${options.user}${correction}`,
      temperature: options.temperature,
    });

    options.tokens.prompt += response.usage.promptTokens;
    options.tokens.completion += response.usage.completionTokens;

    const raw = stripFence(response.content);

    if (options.dir !== undefined && options.name !== undefined) {
      await writeFile(
        path.join(options.dir, `${options.name}-attempt-${String(attempt)}.raw.json`),
        raw,
        'utf8',
      );
    }

    try {
      return options.schema.parse(parseJsonResponse(raw));
    } catch (error: unknown) {
      errors = issuesOf(error).join('; ');
      correction = `\n\nПрошлый ответ не разобрался: ${errors}. Верни JSON заново.`;
    }
  }

  throw new Error(`${options.name ?? 'call'}: ${errors}`);
}

async function carrierPlan(options: {
  readonly client: ReturnType<typeof createDeepSeekJsonClient>;
  readonly scene: TreatmentScene;
  readonly dir: string;
  readonly tokens: { prompt: number; completion: number };
}): Promise<CarrierPlan> {
  let correction = '';
  let errors = '';

  for (let attempt = 1; attempt <= CARRIER_ATTEMPTS; attempt += 1) {
    const response = await completeWithRetry(options.client, {
      system: CARRIER_SYSTEM,
      user: `${carrierUser(options.scene)}${correction}`,
      temperature: 0.8,
    });

    options.tokens.prompt += response.usage.promptTokens;
    options.tokens.completion += response.usage.completionTokens;

    const raw = stripFence(response.content);

    await writeFile(
      path.join(options.dir, `carrier-attempt-${String(attempt)}.raw.json`),
      raw,
      'utf8',
    );

    try {
      const plan = carrierSchema.parse(parseJsonResponse(raw));
      const missing = missingSlots(options.scene, plan);

      if (missing.length > 0) {
        errors = missing.join('; ');
        correction = `\n\nПроверка плана: ${errors}. Исправь зоны.`;
        continue;
      }

      return plan;
    } catch (error: unknown) {
      errors = issuesOf(error).join('; ');
      correction = `\n\nПрошлый ответ не разобрался: ${errors}. Верни JSON заново.`;
    }
  }

  throw new Error(`carrier ${options.scene.id}: ${errors}`);
}

async function main(): Promise<void> {
  loadEnv({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });

  const config = parseDeepSeekSvgEnv(process.env);
  const topic = optionValue('--topic');

  if (topic === undefined) {
    throw new Error('--topic <text> is required');
  }

  const secondsRaw = optionValue('--seconds');
  const seconds = secondsRaw === undefined ? 52 : Number(secondsRaw);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`--seconds must be a positive number, received "${String(secondsRaw)}"`);
  }

  const cwd = process.cwd();
  const outRoot = path.resolve(cwd, optionValue('--out') ?? 'out/film-draw');
  const client = createDeepSeekJsonClient({
    apiKey: config.apiKey,
    ...(config.model === undefined ? {} : { model: config.model }),
    maxTokens: 8000,
  });
  const rates = {
    input: config.rates.inputUsdPerMtok,
    output: config.rates.outputUsdPerMtok,
  };
  const tokens = { prompt: 0, completion: 0 };

  await mkdir(outRoot, { recursive: true });

  const rawTreatment = await callJson({
    client,
    system: TREATMENT_SYSTEM,
    user: `Тема ролика: ${topic}\nДлительность: около ${String(seconds)} секунд.\n\nНапиши treatment.`,
    schema: treatmentSchema,
    attempts: TREATMENT_ATTEMPTS,
    temperature: 0.8,
    tokens,
    dir: outRoot,
    name: 'treatment',
  });
  const normalized = normalizeTreatment(rawTreatment);
  const treatment = normalized.treatment;

  await writeFile(
    path.join(outRoot, 'treatment.json'),
    `${JSON.stringify(treatment, null, 2)}\n`,
    'utf8',
  );

  if (normalized.fixes.length > 0) {
    console.log(`treatment fixes: ${normalized.fixes.join(', ')}`);
  }

  console.log(
    `${String(treatment.scenes.length)} scene(s): ${treatment.thesis}\ndevice: ${treatment.device}`,
  );

  const scenes: UiScene[] = [];
  const report: unknown[] = [];

  for (const [index, scene] of treatment.scenes.entries()) {
    const dir = path.join(outRoot, `scene-${String(index + 1).padStart(2, '0')}-${scene.id}`);
    const themeId = scene.theme as UiThemeId;
    const theme = themeById(themeId);

    await mkdir(dir, { recursive: true });
    console.log(`scene ${String(index + 1)}: ${scene.id} (${scene.function}, ${scene.frame})`);

    let nodes: DrawNode[];
    let slots: { index: number; zone: 'top' | 'middle' | 'bottom' }[];
    let issues: string[] = [];

    if (scene.frame === 'statement') {
      const composed = composeStatement(scene);
      const result = validateDrawNodes(
        composed.nodes,
        CRITICAL_SAFE_BOUNDS,
        { nodes: Number.POSITIVE_INFINITY, words: WORD_BUDGET },
        theme,
      );

      nodes = result.nodes;
      slots = composed.slots;
      issues = [
        ...result.issues.map((issue) => issue.message),
        ...textPlanIssues(nodes, scene, slots, { overlay: false }),
      ];
    } else {
      const plan = await carrierPlan({ client, scene, dir, tokens });
      const draw = await callJson({
        client,
        system: drawSystem(),
        user: drawUser(scene, plan),
        schema: drawAnswerSchema,
        attempts: DRAW_ATTEMPTS,
        temperature: 0.7,
        tokens,
        dir,
        name: 'draw',
      });

      const stripped = stripBackdrop(draw.nodes);
      const result = validateDrawNodes(
        stripped.nodes,
        CRITICAL_SAFE_BOUNDS,
        { nodes: Number.POSITIVE_INFINITY, words: WORD_BUDGET },
        theme,
      );

      nodes = result.nodes;
      slots = plan.slots;
      issues = [
        ...result.issues.map((issue) => issue.message),
        ...textPlanIssues(nodes, scene, slots),
      ];
    }

    scenes.push({
      id: scene.id,
      device: 'draw',
      durationSec: scene.seconds,
      revealSec: 0.8,
      narration: scene.narration,
      themeId,
      nodes,
      textBeats: scene.texts.map((beat, beatIndex) => ({
        text: beat.text,
        role: beat.role,
        zone:
          slots.find((slot) => slot.index === beatIndex)?.zone ?? ('bottom' as const),
      })),
    });

    report.push({
      id: scene.id,
      function: scene.function,
      frame: scene.frame,
      texts: scene.texts,
      slots,
      issues,
    });

    console.log(
      `  texts=${String(scene.texts.length)} zones=${slots.map((slot) => slot.zone).join('/')} issues=${String(issues.length)}`,
    );

    if (issues.length > 0) {
      console.log(`  kept with issues: ${issues.join(' | ')}`);
    }
  }

  const variety = enforceEntranceVariety(scenes);
  const usd = (tokens.prompt * rates.input + tokens.completion * rates.output) / 1_000_000;

  await writeFile(
    path.join(outRoot, 'episode.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        themeId: treatment.scenes[0]?.theme ?? 'studio-dark',
        captions: false,
        speech: [],
        scenes: variety.scenes,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeFile(
    path.join(outRoot, 'report.json'),
    `${JSON.stringify(
      {
        model: config.model ?? 'default',
        topic,
        thesis: treatment.thesis,
        device: treatment.device,
        seconds,
        scenes: scenes.length,
        entrancesAdjusted: variety.changed.map((entry) => entry + 1),
        usd,
        report,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\nfilm: ${String(scenes.length)} scene(s) -> ${outRoot} ($${usd.toFixed(4)})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
