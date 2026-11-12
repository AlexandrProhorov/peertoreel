import {
  InvalidAssetError,
  ProviderUnavailableError,
  type ImageProviderRequest,
  type LlmJsonClient,
  type LlmJsonRequest,
  type LlmJsonResponse,
  type ProviderUsageEntry,
} from '@peertoreel/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  ProviderBudgetError,
  buildDeepSeekSvgPrompts,
  createDeepSeekSvgProvider,
  validateSvgDocument,
} from './deepseek-svg.js';

const RATES = { inputUsdPerMtok: 0.15, outputUsdPerMtok: 0.6 };

const VALID_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
  '<rect x="0" y="0" width="400" height="400" fill="#F4F1EA"/>',
  '<circle cx="200" cy="200" r="120" fill="#F59E0B"/>',
  '</svg>',
].join('');

const REQUEST: ImageProviderRequest = {
  key: 'subject/brick',
  prompt: 'brick wall, front view',
  kind: 'svg',
  styleId: 'studio_flat_2d_v1',
  tags: ['brick'],
  palette: ['#111C2D', '#F5F1E8', '#E9A23B'],
};

interface FakeClient {
  readonly client: LlmJsonClient;
  readonly calls: LlmJsonRequest[];
}

function fakeClient(
  responses: readonly (Partial<LlmJsonResponse> & { content: string })[],
): FakeClient {
  const calls: LlmJsonRequest[] = [];
  let index = 0;

  return {
    calls,
    client: {
      async complete(request: LlmJsonRequest): Promise<LlmJsonResponse> {
        calls.push(request);

        const response = responses[Math.min(index, responses.length - 1)];
        index += 1;

        if (response === undefined) {
          throw new Error('fake client has no response');
        }

        return {
          content: response.content,
          usage: response.usage ?? { promptTokens: 1000, completionTokens: 2000 },
          model: response.model ?? 'deepseek-flash',
        };
      },
    },
  };
}

function collector(): {
  readonly entries: ProviderUsageEntry[];
  record(entry: ProviderUsageEntry): Promise<void>;
} {
  const entries: ProviderUsageEntry[] = [];

  return {
    entries,
    async record(entry: ProviderUsageEntry): Promise<void> {
      entries.push(entry);
    },
  };
}

describe('validateSvgDocument', () => {
  it('accepts flat primitives from the allowlist', () => {
    expect(validateSvgDocument(VALID_SVG)).toEqual({ ok: true, reason: null });
  });

  it.each([
    ['<text x="1" y="1">hi</text>', 'not allowed'],
    ['<rect width="1" height="1" filter="blur(2px)"/>', 'not allowed'],
    ['<rect width="1" height="1" href="https://evil"/>', 'not allowed'],
    ['<rect width="1" height="1" fill="url(#g)"/>', 'forbidden markup'],
    ['<!DOCTYPE svg><svg/>', 'forbidden markup'],
    ['<script>alert(1)</script><svg/>', 'not allowed'],
  ])('rejects %s', (svg, reason) => {
    const result = validateSvgDocument(`<svg>${svg}</svg>`);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain(reason);
  });

  it('rejects documents above the byte limit', () => {
    const huge = `<svg>${'<rect width="1" height="1" fill="#000"/>'.repeat(6000)}</svg>`;

    expect(validateSvgDocument(huge).reason).toContain('larger than');
  });
});

describe('createDeepSeekSvgProvider', () => {
  it('is disabled without an API key and never calls the client', async () => {
    const { client, calls } = fakeClient([{ content: JSON.stringify({ svg: VALID_SVG }) }]);
    const provider = createDeepSeekSvgProvider({ client, rates: RATES });

    expect(provider.enabled).toBe(false);
    await expect(provider.generate(REQUEST)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(calls).toHaveLength(0);
  });

  it('requires token rates when enabled', () => {
    const { client } = fakeClient([{ content: '{}' }]);

    expect(() =>
      createDeepSeekSvgProvider({ apiKey: 'key', client }),
    ).toThrow(/LLM_INPUT_USD_PER_MTOK/);
  });

  it('maps a valid answer and records one ledger row per attempt', async () => {
    const { client, calls } = fakeClient([
      { content: JSON.stringify({ svg: VALID_SVG }) },
    ]);
    const usage = collector();
    const provider = createDeepSeekSvgProvider({
      apiKey: 'key',
      client,
      rates: RATES,
      usageWriter: usage,
      usageSource: 'cli',
    });

    const result = await provider.generate(REQUEST);

    expect(result).toMatchObject({
      provider: 'deepseek-svg',
      model: 'deepseek-flash',
      source: 'llm',
      units: 3000,
      costUsd: 0.00135,
      asset: {
        encoding: 'utf8',
        mimeType: 'image/svg+xml',
        width: 400,
        height: 400,
      },
    });
    expect(result.asset.license).toEqual({
      name: 'deepseek-api-terms',
      commercialUse: true,
    });
    expect(calls[0]?.thinking).toBe('enabled');
    expect(calls[0]?.maxTokens).toBe(16000);

    expect(usage.entries).toHaveLength(1);
    expect(usage.entries[0]).toMatchObject({
      provider: 'deepseek-svg',
      operation: 'asset.svg.generate',
      source: 'cli',
      units: 3000,
      costUsd: 0.00135,
      meta: {
        assetKey: 'subject/brick',
        attempt: 1,
        outcome: 'ok',
        promptTokens: 1000,
        completionTokens: 2000,
      },
    });
  });

  it('retries once with a corrective prompt and records both attempts', async () => {
    const { client, calls } = fakeClient([
      { content: JSON.stringify({ svg: '<svg><text>nope</text></svg>' }) },
      { content: JSON.stringify({ svg: VALID_SVG }) },
    ]);
    const usage = collector();
    const provider = createDeepSeekSvgProvider({
      apiKey: 'key',
      client,
      rates: RATES,
      usageWriter: usage,
    });

    const result = await provider.generate(REQUEST);

    expect(result.asset.data).toBe(VALID_SVG);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.user).toContain('Предыдущий ответ не прошёл проверку');
    expect(usage.entries.map((entry) => entry.meta['outcome'])).toEqual([
      'invalid',
      'ok',
    ]);
    expect(result.costUsd).toBe(0.0027);
  });

  it('fails with InvalidAssetError after the corrective retry', async () => {
    const { client, calls } = fakeClient([
      { content: 'not json' },
      { content: '{"svg": ""}' },
    ]);
    const usage = collector();
    const provider = createDeepSeekSvgProvider({
      apiKey: 'key',
      client,
      rates: RATES,
      usageWriter: usage,
    });

    await expect(provider.generate(REQUEST)).rejects.toBeInstanceOf(
      InvalidAssetError,
    );
    expect(calls).toHaveLength(2);
    expect(usage.entries).toHaveLength(2);
    expect(usage.entries.every((entry) => entry.meta['outcome'] === 'invalid')).toBe(
      true,
    );
  });

  it('refuses a call above the per-call budget before writing the ledger', async () => {
    const { client } = fakeClient([
      {
        content: JSON.stringify({ svg: VALID_SVG }),
        usage: { promptTokens: 10_000_000, completionTokens: 10_000_000 },
      },
    ]);
    const usage = collector();
    const provider = createDeepSeekSvgProvider({
      apiKey: 'key',
      client,
      rates: RATES,
      usageWriter: usage,
      maxUsdPerCall: 0.01,
    });

    await expect(provider.generate(REQUEST)).rejects.toBeInstanceOf(
      ProviderBudgetError,
    );
    expect(usage.entries).toHaveLength(0);
  });

  it('can disable reasoning for cheap runs', async () => {
    const { client, calls } = fakeClient([
      { content: JSON.stringify({ svg: VALID_SVG }) },
    ]);
    const provider = createDeepSeekSvgProvider({
      apiKey: 'key',
      client,
      rates: RATES,
      thinking: 'disabled',
    });

    await provider.generate(REQUEST);

    expect(calls[0]?.thinking).toBe('disabled');
    expect(calls[0]?.maxTokens).toBe(1600);
  });

  it('builds a geometric prompt with the requested palette', () => {
    const prompts = buildDeepSeekSvgPrompts(REQUEST);

    expect(prompts.system).toContain('0 0 400 400');
    expect(prompts.system).toContain('#E9A23B');
    expect(prompts.system).toContain('<!-- PLAN');
    expect(prompts.system).toContain('rx');
    expect(prompts.system).toContain('filter');
    expect(prompts.user).toContain('brick wall, front view');
  });

  it('does not call the client for non-SVG kinds', async () => {
    const { client, calls } = fakeClient([{ content: '{}' }]);
    const provider = createDeepSeekSvgProvider({
      apiKey: 'key',
      client,
      rates: RATES,
    });

    expect(provider.supports('png')).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
