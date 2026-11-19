import {
  type LlmJsonClient,
  type LlmJsonRequest,
  type LlmJsonResponse,
} from '@peertoreel/contracts';
import { z } from 'zod';
import { ProviderHttpError, providerHttpError, providerNetworkError } from './errors.js';
import { createFetchHttpClient, type HttpClient } from './http.js';

/**
 * DeepSeek chat-completions transport (M3.6b.2).
 *
 * One `complete` call is exactly one HTTP attempt: no retries, no corrective
 * prompts. The caller owns the retry loop so the provider ledger can record
 * every attempt's real token usage (root hard rule 7).
 */

export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

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

export interface DeepSeekJsonClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  /** Injected transport; production uses `createFetchHttpClient()`. */
  readonly http?: HttpClient;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export function createDeepSeekJsonClient(
  options: DeepSeekJsonClientOptions,
): LlmJsonClient {
  const apiKey = options.apiKey;
  const baseUrl = options.baseUrl ?? DEEPSEEK_API_BASE_URL;
  const model = options.model ?? DEEPSEEK_DEFAULT_MODEL;
  const http = options.http ?? createFetchHttpClient();

  return {
    async complete(request: LlmJsonRequest): Promise<LlmJsonResponse> {
      const response = await http({
        method: 'POST',
        url: `${baseUrl}/chat/completions`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          response_format: { type: 'json_object' },
          thinking: { type: request.thinking ?? 'disabled' },
          temperature: request.temperature ?? options.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? options.maxTokens ?? 8000,
          stream: false,
        }),
      }).catch((error: unknown) => {
        throw providerNetworkError('deepseek', error);
      });

      if (response.status < 200 || response.status >= 300) {
        throw providerHttpError('deepseek', response.status, response.body);
      }

      let payload: z.infer<typeof chatResponseSchema>;

      try {
        payload = chatResponseSchema.parse(JSON.parse(response.body));
      } catch {
        throw new ProviderHttpError(
          'deepseek',
          response.status,
          'retryable',
          'deepseek response is not a chat completion',
        );
      }

      const usage = payload.usage;

      return {
        content: payload.choices[0]?.message.content ?? '',
        usage: {
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
        },
        model,
      };
    },
  };
}
