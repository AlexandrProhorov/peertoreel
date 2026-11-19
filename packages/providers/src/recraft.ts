import {
  ProviderUnavailableError,
  type AssetKind,
  type ImageProvider,
  type ImageProviderRequest,
  type ImageProviderResult,
} from '@peertoreel/contracts';
import { providerHttpError, providerNetworkError } from './errors.js';
import type { HttpClient, HttpRequest } from './http.js';
import {
  parseRecraftResponse,
  recraftLicense,
  svgSize,
} from './mappers.js';

/**
 * Recraft vector adapter (M3.6b.1 skeleton).
 *
 * No key ⇒ `enabled: false` and no request is ever built or sent. With a key,
 * the adapter is still offline-testable: the HTTP client is injected, so tests
 * drive recorded fixtures instead of the network (research 2026-11-11: Tier 1
 * primary is `recraftv4_styles_vector`, `style_id` + `controls.colors`).
 */

export const RECRAFT_API_URL =
  'https://external.api.recraft.ai/v1/images/generations';
export const RECRAFT_VECTOR_MODEL = 'recraftv4_styles_vector';

export interface RecraftProviderOptions {
  readonly apiKey?: string | null;
  /** Injected transport; production wires `createFetchHttpClient()`. */
  readonly http?: HttpClient;
  readonly model?: string;
  /** Recraft style UUID trained from 1–10 references; required by the styles model. */
  readonly styleId?: string | null;
  readonly size?: string;
}

export interface RecraftProvider extends ImageProvider {
  /** The request the adapter would send; pure, used by tests and dry runs. */
  buildRequest(request: ImageProviderRequest): HttpRequest;
}

function toRecraftColor(hex: string): { rgb: [number, number, number] } {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);

  return {
    rgb: [
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ],
  };
}

export function createRecraftProvider(
  options: RecraftProviderOptions = {},
): RecraftProvider {
  const apiKey = options.apiKey ?? null;
  const enabled = apiKey !== null && apiKey.trim().length > 0;
  const model = options.model ?? RECRAFT_VECTOR_MODEL;
  const supports: readonly AssetKind[] = ['svg'];

  const buildRequest = (request: ImageProviderRequest): HttpRequest => {
    const colors = (request.palette ?? []).slice(0, 10);
    const body = {
      prompt: request.prompt,
      model,
      n: 1,
      size: options.size ?? '1024x1024',
      ...(options.styleId != null ? { style: options.styleId } : {}),
      ...(colors.length > 0
        ? { controls: { colors: colors.map(toRecraftColor) } }
        : {}),
    };

    return {
      method: 'POST',
      url: RECRAFT_API_URL,
      headers: {
        Authorization: `Bearer ${apiKey ?? ''}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    };
  };

  return {
    id: 'recraft',
    enabled,
    supports: (kind) => supports.includes(kind),
    buildRequest,
    async generate(request: ImageProviderRequest): Promise<ImageProviderResult> {
      if (!enabled || apiKey === null) {
        throw new ProviderUnavailableError(
          'recraft',
          'RECRAFT_API_KEY is not configured',
        );
      }

      const http = options.http;

      if (http === undefined) {
        throw new ProviderUnavailableError(
          'recraft',
          'no HTTP client is injected',
        );
      }

      const response = await http(buildRequest(request)).catch((error: unknown) => {
        throw providerNetworkError('recraft', error);
      });

      if (response.status < 200 || response.status >= 300) {
        throw providerHttpError('recraft', response.status, response.body);
      }

      let json: unknown;

      try {
        json = JSON.parse(response.body);
      } catch {
        throw providerHttpError('recraft', response.status, 'response is not JSON');
      }

      const parsed = parseRecraftResponse(json);
      const svg =
        parsed.image.b64Json !== null
          ? Buffer.from(parsed.image.b64Json, 'base64').toString('utf8')
          : await fetchText(http, parsed.image.url ?? '');

      const size = svgSize(svg, request.key);

      return {
        asset: {
          data: svg,
          encoding: 'utf8',
          mimeType: 'image/svg+xml',
          width: size.width,
          height: size.height,
          license: recraftLicense(),
        },
        provider: 'recraft',
        model,
        source: 'library',
        // Recraft reports credits, not dollars: cost stays unmeasured.
        costUsd: null,
        units: parsed.units,
      };
    },
  };
}

async function fetchText(http: HttpClient, url: string): Promise<string> {
  if (url.length === 0) {
    throw new ProviderUnavailableError('recraft', 'response has no image URL');
  }

  const response = await http({
    method: 'GET',
    url,
    headers: { Accept: 'image/svg+xml' },
  }).catch((error: unknown) => {
    throw providerNetworkError('recraft', error);
  });

  if (response.status < 200 || response.status >= 300) {
    throw providerHttpError('recraft', response.status, response.body);
  }

  return response.body;
}
