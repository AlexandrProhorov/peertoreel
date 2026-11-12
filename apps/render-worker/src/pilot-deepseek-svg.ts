import { assetPaletteFor, normalizeSvg, InvalidSvgError } from '@peertoreel/assets';
import {
  DEFAULT_STYLE_PRESET_ID,
  type ImageProviderRequest,
  type LlmJsonClient,
  type LlmJsonRequest,
  type LlmJsonResponse,
} from '@peertoreel/contracts';
import { DrizzleProviderUsageWriter, createDatabase } from '@peertoreel/db';
import {
  createDeepSeekJsonClient,
  createDeepSeekSvgProvider,
} from '@peertoreel/providers';
import { config as loadEnv } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeepSeekSvgEnv } from './provider-config.js';

/**
 * M3.6b.2 pilot (research §8.2): 10 objects × 3 runs × 3 candidates.
 *
 * Metrics are measured, never estimated: every model call goes through the
 * adapter and writes a provider_usage row; token counts come from the API
 * response and cost is tokens × the tariff from `.env`.
 *
 * Visual scores are NOT produced here — a human reviews `out/…/pilot/**`.
 */

const OBJECTS: readonly { key: string; prompt: string }[] = [
  { key: 'pilot/keyboard', prompt: 'клавиатура, вид сверху, прямоугольный корпус с рядами клавиш' },
  { key: 'pilot/bus', prompt: 'городской автобус, вид сбоку, два колеса и окна' },
  { key: 'pilot/palm', prompt: 'пальма, ствол и четыре листа, симметричная крона' },
  { key: 'pilot/sun', prompt: 'солнце, круг в центре и восемь лучей' },
  { key: 'pilot/pirate', prompt: 'пират, голова с треуголкой и повязкой на глазу' },
  { key: 'pilot/dog', prompt: 'собака, морда анфас, уши и нос' },
  { key: 'pilot/house', prompt: 'дом, фасад с треугольной крышей, дверь и окно' },
  { key: 'pilot/cup', prompt: 'чашка кофе, вид сбоку, ручка справа и пар над чашкой' },
  { key: 'pilot/smartphone', prompt: 'смартфон, вид спереди, экран и кнопка' },
  { key: 'pilot/heart', prompt: 'сердце, симметричная форма, плоская заливка' },
];

const RUNS = Number(process.env['PILOT_RUNS'] ?? '1');
const CANDIDATES = 3;
const STYLE_ID = DEFAULT_STYLE_PRESET_ID;
const PILOT_DIR = process.env['PILOT_DIR'] ?? 'm3-6b-3';
const THINKING: 'enabled' | 'disabled' =
  process.env['PILOT_THINKING'] === 'off' ? 'disabled' : 'enabled';
const MAX_TOKENS = Number(
  process.env['PILOT_MAX_TOKENS'] ?? (THINKING === 'enabled' ? '16000' : '1600'),
);
const OBJECT_FILTER = (process.env['PILOT_OBJECTS'] ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

interface CandidateMetric {
  readonly assetKey: string;
  readonly run: number;
  readonly candidate: number;
  readonly ok: boolean;
  readonly reason: string | null;
  readonly normalized: boolean;
  readonly maxColorDistance: number | null;
  readonly bytes: number | null;
  readonly calls: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
}

interface ObjectSummary {
  readonly assetKey: string;
  readonly valid: number;
  readonly total: number;
  readonly normalized: number;
  readonly maxColorDistance: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number;
  readonly avgLatencyMs: number;
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function slug(assetKey: string): string {
  return assetKey.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function countingClient(inner: LlmJsonClient): {
  readonly client: LlmJsonClient;
  stats(): { calls: number; promptTokens: number; completionTokens: number };
  reset(): void;
} {
  let calls = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  return {
    client: {
      async complete(request: LlmJsonRequest): Promise<LlmJsonResponse> {
        const response = await inner.complete(request);

        calls += 1;
        promptTokens += response.usage.promptTokens;
        completionTokens += response.usage.completionTokens;

        return response;
      },
    },
    stats: () => ({ calls, promptTokens, completionTokens }),
    reset: () => {
      calls = 0;
      promptTokens = 0;
      completionTokens = 0;
    },
  };
}

async function main(): Promise<void> {
  loadEnv({
    path: fileURLToPath(new URL('../../../.env', import.meta.url)),
    quiet: true,
  });

  const config = parseDeepSeekSvgEnv(process.env);
  const pilotMaxUsd = Number(process.env['PILOT_MAX_USD'] ?? '1');
  const databaseUrl = process.env['DATABASE_URL'];

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error('DATABASE_URL is required: spend must be recorded in provider_usage');
  }

  const { db, pool } = createDatabase(databaseUrl);
  const writer = new DrizzleProviderUsageWriter(db);
  const counted = countingClient(
    createDeepSeekJsonClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
    }),
  );
  const provider = createDeepSeekSvgProvider({
    apiKey: config.apiKey,
    client: counted.client,
    model: config.model,
    rates: config.rates,
    maxUsdPerCall: config.maxUsdPerCall,
    usageWriter: writer,
    usageSource: 'pilot',
    runId: null,
    thinking: THINKING,
    maxTokens: MAX_TOKENS,
  });
  const palette = assetPaletteFor(STYLE_ID);
  const outputRoot = path.resolve(
    process.cwd(),
    'out',
    PILOT_DIR,
    'pilot',
  );
  const metrics: CandidateMetric[] = [];
  const selected =
    OBJECT_FILTER.length === 0
      ? OBJECTS
      : OBJECTS.filter((object) =>
          OBJECT_FILTER.includes(object.key.replace('pilot/', '')),
        );

  if (selected.length === 0) {
    throw new Error(
      `PILOT_OBJECTS matched nothing: ${OBJECT_FILTER.join(', ')}`,
    );
  }

  let spentUsd = 0;

  try {
    for (const object of selected) {
      for (let run = 1; run <= RUNS; run += 1) {
        for (let candidate = 1; candidate <= CANDIDATES; candidate += 1) {
          if (spentUsd >= pilotMaxUsd) {
            throw new Error(
              `Pilot budget exhausted: $${spentUsd} >= $${pilotMaxUsd}`,
            );
          }

          const request: ImageProviderRequest = {
            key: object.key,
            prompt: object.prompt,
            kind: 'svg',
            styleId: STYLE_ID,
            tags: [object.key.replace('pilot/', '')],
            palette,
          };

          counted.reset();
          const startedAt = Date.now();
          let rawSvg: string | null = null;
          let reason: string | null = null;

          try {
            rawSvg = (await provider.generate(request)).asset.data;
          } catch (error: unknown) {
            reason = error instanceof Error ? error.message : String(error);
          }

          const latencyMs = Date.now() - startedAt;
          const stats = counted.stats();
          const costUsd = round6(
            (stats.promptTokens * config.rates.inputUsdPerMtok +
              stats.completionTokens * config.rates.outputUsdPerMtok) /
              1_000_000,
          );
          spentUsd = round6(spentUsd + costUsd);

          let normalizedSvg: string | null = null;
          let maxColorDistance: number | null = null;
          let bytes: number | null = null;

          if (rawSvg !== null) {
            try {
              const normalized = normalizeSvg(rawSvg, { palette });
              normalizedSvg = normalized.svg;
              maxColorDistance = normalized.maxColorDistance;
              bytes = Buffer.byteLength(normalized.svg, 'utf8');
            } catch (error: unknown) {
              reason =
                error instanceof InvalidSvgError
                  ? error.message
                  : error instanceof Error
                    ? error.message
                    : String(error);
            }
          }

          const dir = path.join(outputRoot, slug(object.key));
          await mkdir(dir, { recursive: true });
          const base = `${slug(object.key)}-r${run}-c${candidate}`;

          if (rawSvg !== null) {
            await writeFile(path.join(dir, `${base}.raw.svg`), rawSvg, 'utf8');
          }

          if (normalizedSvg !== null) {
            await writeFile(
              path.join(dir, `${base}.svg`),
              normalizedSvg,
              'utf8',
            );
          }

          metrics.push({
            assetKey: object.key,
            run,
            candidate,
            ok: rawSvg !== null && normalizedSvg !== null,
            reason,
            normalized: normalizedSvg !== null,
            maxColorDistance,
            bytes,
            calls: stats.calls,
            promptTokens: stats.promptTokens,
            completionTokens: stats.completionTokens,
            costUsd,
            latencyMs,
          });

          console.log(
            `${object.key} r${run} c${candidate}: ${normalizedSvg !== null ? 'ok' : 'FAIL'} ` +
              `calls=${stats.calls} tokens=${stats.promptTokens}/${stats.completionTokens} ` +
              `$${costUsd} ${latencyMs}ms${reason ? ` — ${reason}` : ''}`,
          );
        }
      }
    }
  } finally {
    await pool.end();
  }

  const summaries: ObjectSummary[] = selected.map((object) => {
    const rows = metrics.filter((metric) => metric.assetKey === object.key);

    return {
      assetKey: object.key,
      valid: rows.filter((row) => row.ok).length,
      total: rows.length,
      normalized: rows.filter((row) => row.normalized).length,
      maxColorDistance: rows.reduce(
        (max, row) => Math.max(max, row.maxColorDistance ?? 0),
        0,
      ),
      promptTokens: rows.reduce((sum, row) => sum + row.promptTokens, 0),
      completionTokens: rows.reduce((sum, row) => sum + row.completionTokens, 0),
      costUsd: round6(rows.reduce((sum, row) => sum + row.costUsd, 0)),
      avgLatencyMs: Math.round(
        rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length,
      ),
    };
  });

  const totalSpent = round6(summaries.reduce((sum, row) => sum + row.costUsd, 0));
  const validTotal = metrics.filter((row) => row.ok).length;

  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, 'metrics.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), styleId: STYLE_ID, summaries, candidates: metrics }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(outputRoot, 'pilot.md'),
    [
      `# DeepSeek SVG pilot — ${new Date().toISOString()}`,
      '',
      `Модель: ${config.model ?? 'deepseek-flash'}; thinking: ${THINKING}; max_tokens: ${MAX_TOKENS}; тариф: in $${config.rates.inputUsdPerMtok}/Mtok, out $${config.rates.outputUsdPerMtok}/Mtok.`,
      `Схема: ${selected.length} объектов × ${RUNS} прогона × ${CANDIDATES} кандидата = ${metrics.length} вызовов.`,
      '',
      '| Объект | Годных | normalize | maxΔcolor | Токены in/out | $ | Латентность | Балл 1–5 |',
      '|---|---|---|---|---|---|---|---|',
      ...summaries.map(
        (row) =>
          `| ${row.assetKey} | ${row.valid}/${row.total} | ${row.normalized}/${row.total} | ${row.maxColorDistance} | ${row.promptTokens}/${row.completionTokens} | $${row.costUsd} | ${row.avgLatencyMs} ms | — |`,
      ),
      '',
      `Итого: ${validTotal}/${metrics.length} пригодных, $${totalSpent}, средняя латентность ${Math.round(
        metrics.reduce((sum, row) => sum + row.latencyMs, 0) / metrics.length,
      )} ms.`,
      '',
      'Визуальная оценка 1–5 заполняется человеком по файлам в этой же папке.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\nPilot done: ${validTotal}/${metrics.length} valid, $${totalSpent}`);
  console.log(`Artifacts: ${outputRoot}`);
}

await main();
