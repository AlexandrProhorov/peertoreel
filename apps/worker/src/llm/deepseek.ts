import type { LlmJsonResponse } from '@peertoreel/contracts';
import type { ZodType } from 'zod';
import {
  ProviderHttpError,
  createDeepSeekJsonClient,
  createFetchHttpClient,
} from '@peertoreel/providers';

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerateJsonRequest {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateJsonResult<T> {
  data: T;
  usage: LlmUsage;
  attempts: number;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const MAX_ATTEMPTS = 3;

/**
 * DeepSeek/OpenAI-compatible chat completions with strict JSON output.
 * The model is asked for `json_object`, the payload is validated against the
 * Zod schema, and a parse/validation failure is retried — LLMs occasionally
 * return prose or a truncated object even with a response format.
 *
 * Transport lives in `@peertoreel/providers` (`createDeepSeekJsonClient`), so
 * the same one-attempt client feeds the SVG adapter without duplicating the
 * request shape. This function keeps its own retry loop: stage retries are
 * about valid JSON, while the SVG adapter retries with a corrective prompt.
 */
export async function generateJson<T>(
  schema: ZodType<T>,
  request: GenerateJsonRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GenerateJsonResult<T>> {
  const maxTokens = request.maxTokens ?? 2000;
  const temperature = request.temperature ?? 0.7;
  const client = createDeepSeekJsonClient({
    apiKey: request.apiKey,
    baseUrl: request.baseUrl,
    model: request.model,
    http: createFetchHttpClient(fetchImpl),
    maxTokens,
    temperature,
  });
  let lastError: unknown = new Error('LLM returned no parsable JSON');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: LlmJsonResponse;

    try {
      response = await client.complete({
        system: request.system,
        user:
          attempt === 1
            ? request.user
            : `${request.user}\n\nПредыдущий ответ был невалидным. Верни ТОЛЬКО JSON-объект по схеме, без пояснений и markdown.`,
        maxTokens,
        temperature,
        thinking: 'disabled',
      });
    } catch (error: unknown) {
      if (!(error instanceof ProviderHttpError)) {
        throw error;
      }

      lastError = new LlmError(
        error.message,
        error.status,
        error.kind === 'retryable',
      );

      // A rejected key or exhausted balance will not fix itself on retry.
      if (error.kind !== 'retryable') {
        throw lastError;
      }

      continue;
    }

    try {
      const data = schema.parse(JSON.parse(response.content));

      return {
        data,
        usage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
        },
        attempts: attempt,
      };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw new LlmError(
    `LLM failed to return valid JSON after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    200,
    false,
  );
}
