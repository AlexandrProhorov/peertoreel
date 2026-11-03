import { scriptSchema } from '@kadence/contracts';
import { describe, expect, it, vi } from 'vitest';
import { generateJson, isRetryableStatus, LlmError } from './deepseek.js';

const validScript = {
  title: 'Почему небо синее',
  hook: 'Небо не синее.',
  beats: [
    {
      text: 'Свет — это волны разной длины.',
      visualDirection: 'sunlight through air',
      durationSec: 5,
    },
    {
      text: 'Короткие волны рассеиваются сильнее.',
      visualDirection: 'blue particles scattering',
      durationSec: 6,
    },
  ],
  cta: 'Подпишись, чтобы знать больше.',
};

function jsonResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 80 },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

describe('generateJson', () => {
  it('returns validated data and usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify(validScript)));

    const result = await generateJson(
      scriptSchema,
      {
        apiKey: 'test-key',
        system: 'system',
        user: 'user',
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.data.title).toBe('Почему небо синее');
    expect(result.attempts).toBe(1);
    expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 80 });
  });

  it('retries when the model returns prose instead of JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('Конечно! Вот сценарий:'))
      .mockResolvedValueOnce(jsonResponse(JSON.stringify(validScript)));

    const result = await generateJson(
      scriptSchema,
      { apiKey: 'test-key', system: 'system', user: 'user' },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails after three invalid answers', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse('not json'));

    await expect(
      generateJson(
        scriptSchema,
        { apiKey: 'test-key', system: 'system', user: 'user' },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(LlmError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry terminal errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(
      generateJson(
        scriptSchema,
        { apiKey: 'bad', system: 'system', user: 'user' },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/401/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies transient statuses', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
  });
});
