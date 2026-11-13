import { z } from 'zod';

/**
 * Env → DeepSeek SVG provider config (CLI boundary).
 *
 * Tariffs are mandatory: the ledger records measured tokens × tariff, and a
 * silent zero would understate spend (root hard rule 7). Values come from the
 * official DeepSeek pricing page; see the plan/ADR for the copy date.
 */

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().trim().min(1, 'DEEPSEEK_API_KEY is required'),
  LLM_MODEL: z.string().trim().min(1).optional(),
  LLM_BASE_URL: z.string().trim().url().optional(),
  LLM_INPUT_USD_PER_MTOK: z.coerce.number().positive(),
  LLM_OUTPUT_USD_PER_MTOK: z.coerce.number().positive(),
  ASSET_LLM_MAX_USD_PER_CALL: z.coerce.number().positive().default(0.02),
  /** Acceptance lever: `unavailable` fails before a call, `empty` burns the retry. */
  DEEPSEEK_SVG_FORCE_FAILURE: z.enum(['unavailable', 'empty']).optional(),
});

export interface DeepSeekSvgEnvOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly rates: {
    readonly inputUsdPerMtok: number;
    readonly outputUsdPerMtok: number;
  };
  readonly maxUsdPerCall: number;
  readonly simulateFailure?: 'unavailable' | 'empty';
}

export function parseDeepSeekSvgEnv(
  source: NodeJS.ProcessEnv,
): DeepSeekSvgEnvOptions {
  const parsed = envSchema.safeParse({
    DEEPSEEK_API_KEY: source.DEEPSEEK_API_KEY,
    LLM_MODEL: source.LLM_MODEL,
    LLM_BASE_URL: source.LLM_BASE_URL,
    LLM_INPUT_USD_PER_MTOK: source.LLM_INPUT_USD_PER_MTOK,
    LLM_OUTPUT_USD_PER_MTOK: source.LLM_OUTPUT_USD_PER_MTOK,
    ASSET_LLM_MAX_USD_PER_CALL: source.ASSET_LLM_MAX_USD_PER_CALL,
    DEEPSEEK_SVG_FORCE_FAILURE: source.DEEPSEEK_SVG_FORCE_FAILURE,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
      .join('; ');

    throw new Error(
      `DeepSeek SVG provider config is incomplete (${issues}). ` +
        'Set DEEPSEEK_API_KEY, LLM_INPUT_USD_PER_MTOK and LLM_OUTPUT_USD_PER_MTOK in .env.',
    );
  }

  return {
    apiKey: parsed.data.DEEPSEEK_API_KEY,
    ...(parsed.data.LLM_MODEL !== undefined
      ? { model: parsed.data.LLM_MODEL }
      : {}),
    ...(parsed.data.LLM_BASE_URL !== undefined
      ? { baseUrl: parsed.data.LLM_BASE_URL }
      : {}),
    rates: {
      inputUsdPerMtok: parsed.data.LLM_INPUT_USD_PER_MTOK,
      outputUsdPerMtok: parsed.data.LLM_OUTPUT_USD_PER_MTOK,
    },
    maxUsdPerCall: parsed.data.ASSET_LLM_MAX_USD_PER_CALL,
    ...(parsed.data.DEEPSEEK_SVG_FORCE_FAILURE !== undefined
      ? { simulateFailure: parsed.data.DEEPSEEK_SVG_FORCE_FAILURE }
      : {}),
  };
}
