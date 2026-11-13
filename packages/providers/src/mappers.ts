import { InvalidAssetError, type AssetLicense } from '@peertoreel/contracts';
import { z } from 'zod';

/**
 * Pure response mappers (M3.6b.1). No I/O, no keys, no clock: fixtures drive
 * the tests, and the adapters only glue HTTP to these functions.
 */

const recraftImageSchema = z
  .object({
    url: z.string().min(1).optional(),
    b64_json: z.string().min(1).optional(),
  })
  .refine((image) => image.url !== undefined || image.b64_json !== undefined, {
    message: 'Recraft image entry has neither url nor b64_json',
  });

const recraftResponseSchema = z.object({
  data: z.array(recraftImageSchema).min(1),
  /** Recraft bills in credits and reports them in the response. */
  credits: z.number().min(0).optional(),
});

export interface RecraftImage {
  readonly url: string | null;
  readonly b64Json: string | null;
}

export interface RecraftParsedResponse {
  readonly image: RecraftImage;
  /** Reported credits, or null when the response omits them. */
  readonly units: number | null;
}

export function parseRecraftResponse(json: unknown): RecraftParsedResponse {
  const parsed = recraftResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `Recraft response does not match the expected shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const [first] = parsed.data.data;

  if (first === undefined) {
    throw new Error('Recraft returned no images');
  }

  return {
    image: { url: first.url ?? null, b64Json: first.b64_json ?? null },
    units: parsed.data.credits ?? null,
  };
}

const fluxImageSchema = z.object({
  url: z.string().min(1),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  content_type: z.string().min(1).optional(),
});

const fluxResponseSchema = z.object({
  images: z.array(fluxImageSchema).min(1),
  seed: z.number().int().optional(),
});

export interface FluxParsedResponse {
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly contentType: string | null;
  readonly seed: number | null;
}

export function parseFluxResponse(json: unknown): FluxParsedResponse {
  const parsed = fluxResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `FLUX response does not match the expected shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const [first] = parsed.data.images;

  if (first === undefined) {
    throw new Error('FLUX returned no images');
  }

  return {
    url: first.url,
    width: first.width ?? null,
    height: first.height ?? null,
    contentType: first.content_type ?? null,
    seed: parsed.data.seed ?? null,
  };
}

/** SVG dimensions from `viewBox` or `width`/`height`; never guessed. */
export function svgSize(svg: string, assetKey: string): { width: number; height: number } {
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(
    svg,
  );

  if (viewBox?.[1] !== undefined && viewBox[2] !== undefined) {
    return {
      width: Math.round(Number.parseFloat(viewBox[1])),
      height: Math.round(Number.parseFloat(viewBox[2])),
    };
  }

  const width = /\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(svg);
  const height = /\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(svg);

  if (width?.[1] !== undefined && height?.[1] !== undefined) {
    return {
      width: Math.round(Number.parseFloat(width[1])),
      height: Math.round(Number.parseFloat(height[1])),
    };
  }

  throw new InvalidAssetError(assetKey, null, 'SVG has no measurable viewBox or width/height');
}

/**
 * Adapter licences are policy, not guesses: Recraft output is produced under
 * the paid API terms; FLUX.2 `[klein] 4B` weights are Apache 2.0, while `[dev]`
 * is non-commercial (ADR-0017 D8) and must never be recorded as commercial.
 */
export function recraftLicense(): AssetLicense {
  return { name: 'recraft-terms', commercialUse: true };
}

export function fluxLicense(model: string): AssetLicense {
  return model.includes('dev')
    ? { name: 'flux-non-commercial', commercialUse: false }
    : { name: 'apache-2.0', commercialUse: true };
}
