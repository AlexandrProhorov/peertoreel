import { ProviderUnavailableError } from '@peertoreel/contracts';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyProviderStatus } from './errors.js';
import { createFluxProvider, FAL_FLUX2_KLEIN_URL } from './flux.js';
import type { HttpClient, HttpRequest, HttpResponse } from './http.js';
import { fluxLicense, parseRecraftResponse, svgSize } from './mappers.js';
import {
  createRecraftProvider,
  RECRAFT_API_URL,
  RECRAFT_VECTOR_MODEL,
} from './recraft.js';

const RECRAFT_FIXTURE = readFileSync(
  new URL('../test/fixtures/recraft-image.json', import.meta.url),
  'utf8',
);
const FLUX_FIXTURE = readFileSync(
  new URL('../test/fixtures/flux-image.json', import.meta.url),
  'utf8',
);
const FIXTURE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 384"><rect width="512" height="384" fill="#0B1220"/></svg>';

interface FakeHttp {
  readonly client: HttpClient;
  readonly calls: readonly HttpRequest[];
}

function fakeHttp(respond: (request: HttpRequest) => HttpResponse): FakeHttp {
  const calls: HttpRequest[] = [];
  const client: HttpClient = async (request) => {
    calls.push(request);

    return respond(request);
  };

  return { client, calls };
}

describe('recraft adapter', () => {
  it('is disabled without a key and sends nothing', async () => {
    const http = fakeHttp(() => ({ status: 200, body: RECRAFT_FIXTURE }));
    const provider = createRecraftProvider({ apiKey: null, http: http.client });

    expect(provider.enabled).toBe(false);
    expect(provider.supports('svg')).toBe(true);
    expect(provider.supports('png')).toBe(false);
    await expect(
      provider.generate({
        key: 'subject/robot',
        prompt: 'flat robot',
        kind: 'svg',
        styleId: 'studio_flat_2d_v1',
        tags: [],
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(http.calls).toHaveLength(0);
  });

  it('builds a pure request with the model and palette controls', () => {
    const provider = createRecraftProvider({
      apiKey: 'test-key',
      styleId: 'style-uuid',
    });
    const request = provider.buildRequest({
      key: 'subject/robot',
      prompt: 'flat robot, no text',
      kind: 'svg',
      styleId: 'studio_flat_2d_v1',
      tags: ['robot'],
      palette: ['#0B1220', '#F59E0B'],
    });
    const body = JSON.parse(request.body ?? '{}') as {
      model: string;
      style?: string;
      controls?: { colors: Array<{ rgb: number[] }> };
    };

    expect(request.url).toBe(RECRAFT_API_URL);
    expect(request.headers.Authorization).toBe('Bearer test-key');
    expect(body.model).toBe(RECRAFT_VECTOR_MODEL);
    expect(body.style).toBe('style-uuid');
    expect(body.controls?.colors).toEqual([
      { rgb: [11, 18, 32] },
      { rgb: [245, 158, 11] },
    ]);
  });

  it('maps a recorded response into an svg asset without inventing cost', async () => {
    const http = fakeHttp((request) =>
      request.method === 'POST'
        ? { status: 200, body: RECRAFT_FIXTURE }
        : { status: 200, body: FIXTURE_SVG },
    );
    const provider = createRecraftProvider({ apiKey: 'test-key', http: http.client });
    const result = await provider.generate({
      key: 'subject/robot',
      prompt: 'flat robot',
      kind: 'svg',
      styleId: 'studio_flat_2d_v1',
      tags: [],
    });

    expect(result.provider).toBe('recraft');
    expect(result.costUsd).toBeNull();
    expect(result.units).toBe(50);
    expect(result.asset.encoding).toBe('utf8');
    expect(result.asset.mimeType).toBe('image/svg+xml');
    expect(result.asset.width).toBe(512);
    expect(result.asset.height).toBe(384);
    expect(result.asset.license).toEqual({
      name: 'recraft-terms',
      commercialUse: true,
    });
    expect(http.calls.map((call) => call.method)).toEqual(['POST', 'GET']);
  });

  it('classifies provider failures', async () => {
    const http = fakeHttp(() => ({ status: 429, body: 'rate limited' }));
    const provider = createRecraftProvider({ apiKey: 'test-key', http: http.client });

    await expect(
      provider.generate({
        key: 'subject/robot',
        prompt: 'flat robot',
        kind: 'svg',
        styleId: 'studio_flat_2d_v1',
        tags: [],
      }),
    ).rejects.toMatchObject({ kind: 'retryable', status: 429 });

    expect(classifyProviderStatus(400)).toBe('terminal');
    expect(classifyProviderStatus(503)).toBe('retryable');
  });
});

describe('flux adapter', () => {
  it('is disabled without a key and sends nothing', async () => {
    const http = fakeHttp(() => ({ status: 200, body: FLUX_FIXTURE }));
    const provider = createFluxProvider({ apiKey: '', http: http.client });

    expect(provider.enabled).toBe(false);
    expect(provider.supports('png')).toBe(true);
    expect(provider.supports('raster-cutout')).toBe(true);
    expect(provider.supports('svg')).toBe(false);
    await expect(
      provider.generate({
        key: 'subject/robot',
        prompt: 'flat robot',
        kind: 'png',
        styleId: 'studio_flat_2d_v1',
        tags: [],
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(http.calls).toHaveLength(0);
  });

  it('returns raw raster bytes as base64 and keeps cost unmeasured', async () => {
    const http = fakeHttp((request) =>
      request.method === 'POST'
        ? { status: 200, body: FLUX_FIXTURE }
        : {
            status: 200,
            body: '',
            bodyBase64: 'iVBORw0KGgo=',
            contentType: 'image/png',
          },
    );
    const provider = createFluxProvider({ apiKey: 'fal-key', http: http.client });
    const result = await provider.generate({
      key: 'subject/robot',
      prompt: 'flat robot',
      kind: 'png',
      styleId: 'studio_flat_2d_v1',
      tags: [],
    });

    expect(http.calls[0]?.url).toBe(FAL_FLUX2_KLEIN_URL);
    expect(result.provider).toBe('flux');
    expect(result.costUsd).toBeNull();
    expect(result.asset.encoding).toBe('base64');
    expect(result.asset.data).toBe('iVBORw0KGgo=');
    expect(result.asset.mimeType).toBe('image/png');
    expect(result.asset.width).toBe(1024);
    expect(result.asset.license.commercialUse).toBe(true);
  });

  it('never records non-commercial weights as commercial', () => {
    expect(fluxLicense('fal-ai/flux-2/dev').commercialUse).toBe(false);
    expect(fluxLicense('fal-ai/flux-2/klein/4b').commercialUse).toBe(true);
  });
});

describe('response mappers', () => {
  it('parses the recorded recraft fixture', () => {
    expect(parseRecraftResponse(JSON.parse(RECRAFT_FIXTURE))).toEqual({
      image: { url: 'https://example.invalid/recraft/asset.svg', b64Json: null },
      units: 50,
    });
  });

  it('never guesses svg dimensions', () => {
    expect(svgSize(FIXTURE_SVG, 'a')).toEqual({ width: 512, height: 384 });
    expect(() => svgSize('<svg></svg>', 'a')).toThrow(/measurable/);
  });

  it('throws a typed provider error for a bad response', () => {
    expect(() => parseRecraftResponse({ data: [] })).toThrow(/expected shape/);
  });
});
