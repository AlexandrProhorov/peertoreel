import type { ZodType } from 'zod';
import { z } from 'zod';

const chatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative(),
      completion_tokens: z.number().nonnegative(),
    })
    .optional(),
});

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
 */
export async function generateJson<T>(
  schema: ZodType<T>,
  request: GenerateJsonRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<GenerateJsonResult<T>> {
  const baseUrl = request.baseUrl ?? 'https://api.deepseek.com';
  const model = request.model ?? 'deepseek-flash';
  let lastError: unknown = new Error('LLM returned no parsable JSON');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.system },
          {
            role: 'user',
            content:
              attempt === 1
                ? request.user
                : `${request.user}\n\nПредыдущий ответ был невалидным. Верни ТОЛЬКО JSON-объект по схеме, без пояснений и markdown.`,
          },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      const error = new LlmError(
        `LLM responded with ${response.status}: ${detail}`,
        response.status,
        isRetryableStatus(response.status),
      );

      // A rejected key or exhausted balance will not fix itself on retry.
      if (!error.retryable) {
        throw error;
      }

      lastError = error;
      continue;
    }

    let payload: z.infer<typeof chatResponseSchema>;

    try {
      payload = chatResponseSchema.parse(await response.json());
    } catch (error: unknown) {
      lastError = error;
      continue;
    }

    const content = payload.choices[0]?.message.content ?? '';
    const usage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
    };

    try {
      const data = schema.parse(JSON.parse(content));

      return { data, usage, attempts: attempt };
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
