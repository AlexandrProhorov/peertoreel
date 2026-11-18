import { createDeepSeekJsonClient } from '@peertoreel/providers';
import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseDeepSeekSvgEnv } from '../../provider-config.js';
import { uiEpisodeSchema } from '../spec.js';
import { repairEpisode } from '../fit/autofit.js';
import { normalizeRawEpisode } from '../fit/normalize.js';
import { checkVisibleChange } from '../verify/motion.js';
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildUserPrompt,
} from './contract-brief.js';

/**
 * Director step: topic → executable episode, produced by the model.
 *
 * Nothing here edits the model's answer. A rejected answer is fed back with the
 * validator's own messages; after the last attempt the topic is recorded as a
 * failure and stays one.
 */

const topicSchema = z.object({
  slug: z.string().min(1).max(40),
  topic: z.string().min(1).max(300),
});

const topicsFileSchema = z.array(topicSchema).min(1).max(20);

const attemptRecordSchema = z.object({
  slug: z.string(),
  topic: z.string(),
  attempts: z.number().int().nonnegative(),
  accepted: z.boolean(),
  errors: z.array(z.string()),
  lintErrors: z.array(z.string()),
  repairs: z.number().int().nonnegative(),
  promptTokens: z.number().nonnegative(),
  completionTokens: z.number().nonnegative(),
  usd: z.number().nonnegative(),
});

type AttemptRecord = z.infer<typeof attemptRecordSchema>;

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

/** Models fence JSON now and then; the contract is the JSON, not the fence. */
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

async function directOne(options: {
  slug: string;
  topic: string;
  attempts: number;
  client: ReturnType<typeof createDeepSeekJsonClient>;
  outRoot: string;
  rates: { input: number; output: number };
}): Promise<AttemptRecord> {
  const dir = path.join(options.outRoot, options.slug);
  const errors: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

  await mkdir(dir, { recursive: true });

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const correction =
      errors.length === 0
        ? ''
        : `\n\nПредыдущая попытка отклонена валидатором. Исправь ровно это и верни JSON заново:\n${errors
            .map((line) => `- ${line}`)
            .join('\n')}`;
    const response = await options.client.complete({
      system: DIRECTOR_SYSTEM_PROMPT,
      user: `${buildUserPrompt(options.topic)}${correction}`,
      temperature: 0.8,
    });

    promptTokens += response.usage.promptTokens;
    completionTokens += response.usage.completionTokens;

    const raw = stripFence(response.content);

    await writeFile(
      path.join(dir, `attempt-${attempt}.json`),
      `${raw}\n`,
      'utf8',
    );

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch (error: unknown) {
      errors.splice(0, errors.length, ...issuesOf(error));
      continue;
    }

    const result = uiEpisodeSchema.safeParse(normalizeRawEpisode(parsed));

    if (result.success) {
      /* Validation only says the spec is legal; it says nothing about whether
         the text fits the frame. Repair runs here so "accepted" means
         "renderable", and the remaining violations travel with the record. */
      const repaired = await repairEpisode(result.data, {
        outDir: path.join(dir, 'fit'),
      });
      const motion = await checkVisibleChange(
        repaired.episode,
        path.join(dir, 'motion'),
      );

      if (!motion.changed) {
        /* A cue is not an action: if two distant frames are identical, the
           scene is a poster and the model has to try again. */
        errors.splice(
          0,
          errors.length,
          `scene is static: frames ${motion.earlyFrame} and ${motion.lateFrame} are identical — show a visible change`,
        );
        continue;
      }

      await writeFile(
        path.join(dir, 'episode.json'),
        `${JSON.stringify(repaired.episode, null, 2)}\n`,
        'utf8',
      );

      return attemptRecordSchema.parse({
        slug: options.slug,
        topic: options.topic,
        attempts: attempt,
        accepted: true,
        errors: [],
        lintErrors: repaired.violations,
        repairs: repaired.fixes.length,
        promptTokens,
        completionTokens,
        usd: costOf(promptTokens, completionTokens, options.rates),
      });
    }

    errors.splice(0, errors.length, ...issuesOf(result.error));
  }

  await writeFile(path.join(dir, 'last-errors.txt'), `${errors.join('\n')}\n`, 'utf8');

  return attemptRecordSchema.parse({
    slug: options.slug,
    topic: options.topic,
    attempts: options.attempts,
    accepted: false,
    errors,
    lintErrors: [],
    repairs: 0,
    promptTokens,
    completionTokens,
    usd: costOf(promptTokens, completionTokens, options.rates),
  });
}

function costOf(
  promptTokens: number,
  completionTokens: number,
  rates: { input: number; output: number },
): number {
  return (
    (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000
  );
}

async function main(): Promise<void> {
  loadEnv({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });

  const printPrompt = optionValue('--print-prompt');

  if (printPrompt !== undefined) {
    console.log('=== SYSTEM ===');
    console.log(DIRECTOR_SYSTEM_PROMPT);
    console.log('=== USER ===');
    console.log(buildUserPrompt(printPrompt));
    return;
  }

  const config = parseDeepSeekSvgEnv(process.env);
  const inputPath = optionValue('--input');

  if (inputPath === undefined) {
    throw new Error('--input <topics.json> is required');
  }

  const attempts = Number(optionValue('--attempts') ?? '3');
  const outRoot = path.resolve(
    process.cwd(),
    optionValue('--out') ?? 'out/director',
  );
  const topics = topicsFileSchema.parse(
    JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), 'utf8')),
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
  const records: AttemptRecord[] = [];

  await mkdir(outRoot, { recursive: true });

  for (const entry of topics) {
    const record = await directOne({
      slug: entry.slug,
      topic: entry.topic,
      attempts,
      client,
      outRoot,
      rates,
    });

    records.push(record);

    console.log(
      `${entry.slug}: ${record.accepted ? 'accepted' : 'FAILED'} in ${record.attempts} attempt(s), ` +
        `${record.promptTokens}+${record.completionTokens} tokens, $${record.usd.toFixed(4)}` +
        (record.accepted
          ? `, ${record.repairs} repair(s), ${record.lintErrors.length} lint error(s)`
          : ''),
    );

    if (!record.accepted) {
      for (const error of record.errors.slice(0, 8)) {
        console.log(`  - ${error}`);
      }
    }
  }

  await writeFile(
    path.join(outRoot, 'report.json'),
    `${JSON.stringify({ model: config.model ?? 'default', records }, null, 2)}\n`,
    'utf8',
  );

  const accepted = records.filter((record) => record.accepted).length;
  const totalUsd = records.reduce((sum, record) => sum + record.usd, 0);

  console.log(
    `\naccepted ${accepted}/${records.length}, total $${totalUsd.toFixed(4)}, ` +
      `report: ${path.join(outRoot, 'report.json')}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
