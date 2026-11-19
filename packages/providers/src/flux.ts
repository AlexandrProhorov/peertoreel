import {
  InvalidAssetError,
  ProviderUnavailableError,
  type AssetKind,
  type AssetMimeType,
  type ImageProvider,
  type ImageProviderRequest,
  type ImageProviderResult,
} from '@peertoreel/contracts';
import { providerHttpError, providerNetworkError } from './errors.js';
import type { HttpClient, HttpRequest } from './http.js';
import { fluxLicense, parseFluxResponse } from './mappers.js';

/**
 * FLUX.2 adapter skeleton (M3.6b.1).
 *
 * Covers the raster tiers (Tier 2 cutout, economy vectorized path) but never
 * decodes or trims anything in this session: bytes go back as base64 and raster
 * normalization stays M3.6b.2. No `FAL_KEY` ⇒ `enabled: false`, no request.
 */

export const FAL_FLUX2_KLEIN_URL =
  'https://fal.run/fal-ai/flux-2/klein/4b';
export const FLUX2_KLEIN_MODEL = 'fal-ai/flux-2/klein/4b';

export interface FluxProviderOptions {
  readonly apiKey?: string | null;
  readonly http?: HttpClient;
  readonly model?: string;
  /** Square output edge in pixels; 1024 keeps the 1:1 subject frame. */
  readonly size?: number;
  readonly seed?: number | null;
}

export interface FluxProvider extends ImageProvider {
  buildRequest(request: ImageProviderRequest): HttpRequest;
}

const SUPPORTED_KINDS: readonly AssetKind[] = ['png', 'raster-cutout'];

function mimeFromContentType(contentType: string | null): AssetMimeType {
  return contentType === 'image/webp' ? 'image/webp' : 'image/png';
}

export function createFluxProvider(
  options: FluxProviderOptions = {},
): FluxProvider {
  const apiKey = options.apiKey ?? null;
  const enabled = apiKey !== null && apiKey.trim().length > 0;
  const model = options.model ?? FLUX2_KLEIN_MODEL;
  const size = options.size ?? 1024;

  const buildRequest = (request: ImageProviderRequest): HttpRequest => {
    const body = {
      prompt: request.prompt,
      image_size: { width: size, height: size },
      num_images: 1,
      enable_safety_checker: true,
      ...(options.seed != null ? { seed: options.seed } : {}),
    };

    return {
      method: 'POST',
      url: FAL_FLUX2_KLEIN_URL,
      headers: {
        Authorization: `Key ${apiKey ?? ''}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    };
  };

  return {
    id: 'flux',
    enabled,
    supports: (kind) => SUPPORTED_KINDS.includes(kind),
    buildRequest,
    async generate(request: ImageProviderRequest): Promise<ImageProviderResult> {
      if (!enabled || apiKey === null) {
        throw new ProviderUnavailableError('flux', 'FAL_KEY is not configured');
      }

      const http = options.http;

      if (http === undefined) {
        throw new ProviderUnavailableError('flux', 'no HTTP client is injected');
      }

      const response = await http(buildRequest(request)).catch((error: unknown) => {
        throw providerNetworkError('flux', error);
      });

      if (response.status < 200 || response.status >= 300) {
        throw providerHttpError('flux', response.status, response.body);
      }

      let json: unknown;

      try {
        json = JSON.parse(response.body);
      } catch {
        throw providerHttpError('flux', response.status, 'response is not JSON');
      }

      const parsed = parseFluxResponse(json);
      const image = await http({
        method: 'GET',
        url: parsed.url,
        headers: { Accept: 'image/png,image/webp' },
      }).catch((error: unknown) => {
        throw providerNetworkError('flux', error);
      });

      if (image.status < 200 || image.status >= 300) {
        throw providerHttpError('flux', image.status, image.body);
      }

      if (parsed.width === null || parsed.height === null) {
        throw new InvalidAssetError(
          request.key,
          'flux',
          'response has no image dimensions',
        );
      }

      if (image.bodyBase64 === undefined) {
        throw new InvalidAssetError(
          request.key,
          'flux',
          'HTTP client did not return raw bytes for the raster image',
        );
      }

      return {
        asset: {
          // Fal returns a URL; the contract wants base64 bytes for raster.
          data: image.bodyBase64,
          encoding: 'base64',
          mimeType: mimeFromContentType(parsed.contentType),
          width: parsed.width,
          height: parsed.height,
          license: fluxLicense(model),
        },
        provider: 'flux',
        model,
        source: 'library',
        // Fal bills per megapixel but the response carries no measured cost.
        costUsd: null,
        units: null,
      };
    },
  };
}
