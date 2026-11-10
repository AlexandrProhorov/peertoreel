import { z } from 'zod';
import type { JsonValue } from './json.js';
import {
  STORYBOARD_COMPONENT_IDS,
  hexColorSchema,
  type StoryboardComponentId,
} from './storyboard.js';

/**
 * Component params are the renderer's public contract: every `componentId` in
 * `STORYBOARD_COMPONENT_IDS` has a schema and defaults here. A storyboard may
 * provide a partial object; missing fields are filled from defaults.
 */
export const parallaxCityParamsSchema = z.object({
  buildingsSeed: z.number().int().min(0).max(1_000_000).default(42),
  lamp: z.enum(['left', 'center', 'right']).default('right'),
  snowDensity: z.number().min(0).max(3).default(1),
  focus: z.enum(['street', 'car-silhouette', 'skyline']).default('street'),
  roadGlow: z.boolean().default(true),
});
export type ParallaxCityParams = z.infer<typeof parallaxCityParamsSchema>;

export const kineticTypographyParamsSchema = z.object({
  text: z.string().min(1).max(400).default('ЗАГОЛОВОК'),
  accentWords: z.array(z.string().min(1).max(80)).max(8).default([]),
  preset: z.enum(['statement', 'counter', 'pill']).default('statement'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  underline: z.boolean().default(false),
});
export type KineticTypographyParams = z.infer<
  typeof kineticTypographyParamsSchema
>;

export const infographicGaugeParamsSchema = z.object({
  from: z.number().min(0).max(100).default(100),
  to: z.number().min(0).max(100).default(60),
  unit: z.string().max(8).default('%'),
  accent: z.enum(['accent', 'danger', 'cold']).default('accent'),
  label: z.string().min(1).max(120).default('ЗАРЯД'),
});
export type InfographicGaugeParams = z.infer<
  typeof infographicGaugeParamsSchema
>;

export const imageParallaxParamsSchema = z.object({
  /** Local asset key (`assets/...`) or an http/data URL. */
  imageKey: z.string().min(1).max(500).nullable().default(null),
  fit: z.enum(['cover', 'contain']).default('cover'),
  zoomFrom: z.number().min(0.5).max(3).default(1),
  zoomTo: z.number().min(0.5).max(3).default(1.08),
  opacity: z.number().min(0).max(1).default(1),
});
export type ImageParallaxParams = z.infer<typeof imageParallaxParamsSchema>;

export const particleFieldParamsSchema = z.object({
  seed: z.number().int().min(0).max(1_000_000).default(7),
  density: z.number().min(0).max(3).default(1),
  speed: z.number().min(0).max(3).default(1),
  color: hexColorSchema.nullable().default(null),
  motif: z.enum(['snow', 'bokeh', 'spark']).default('snow'),
});
export type ParticleFieldParams = z.infer<typeof particleFieldParamsSchema>;

export const ctaCardParamsSchema = z.object({
  text: z.string().min(1).max(120).default('ПОДПИСАТЬСЯ'),
  accent: hexColorSchema.nullable().default(null),
  button: z.string().min(1).max(80).nullable().default(null),
});
export type CtaCardParams = z.infer<typeof ctaCardParamsSchema>;

export type ComponentParamsById = {
  'parallax-city': ParallaxCityParams;
  'kinetic-typography': KineticTypographyParams;
  'infographic-gauge': InfographicGaugeParams;
  'image-parallax': ImageParallaxParams;
  'particle-field': ParticleFieldParams;
  'cta-card': CtaCardParams;
};

export type StoryboardComponentParams =
  ComponentParamsById[StoryboardComponentId];

export type ComponentParamDiagnosticReason =
  | 'params_missing'
  | 'invalid_value'
  | 'unknown_key';

export interface ComponentParamDiagnostic {
  /** `$` for the whole object, `field`, or `field.1` for an array element. */
  path: string;
  reason: ComponentParamDiagnosticReason;
  /** The rejected/ignored value as it appeared in JSON. */
  received: JsonValue;
}

export interface ParsedComponentParams<K extends StoryboardComponentId> {
  params: ComponentParamsById[K];
  diagnostics: ComponentParamDiagnostic[];
}

interface ComponentParamsSpec<T> {
  schema: z.ZodType<T>;
  fieldSchemas: Readonly<Record<string, z.ZodType>>;
  defaults: T;
}

const COMPONENT_PARAMS: {
  [K in StoryboardComponentId]: ComponentParamsSpec<ComponentParamsById[K]>;
} = {
  'parallax-city': {
    schema: parallaxCityParamsSchema,
    fieldSchemas: parallaxCityParamsSchema.shape,
    defaults: parallaxCityParamsSchema.parse({}),
  },
  'kinetic-typography': {
    schema: kineticTypographyParamsSchema,
    fieldSchemas: kineticTypographyParamsSchema.shape,
    defaults: kineticTypographyParamsSchema.parse({}),
  },
  'infographic-gauge': {
    schema: infographicGaugeParamsSchema,
    fieldSchemas: infographicGaugeParamsSchema.shape,
    defaults: infographicGaugeParamsSchema.parse({}),
  },
  'image-parallax': {
    schema: imageParallaxParamsSchema,
    fieldSchemas: imageParallaxParamsSchema.shape,
    defaults: imageParallaxParamsSchema.parse({}),
  },
  'particle-field': {
    schema: particleFieldParamsSchema,
    fieldSchemas: particleFieldParamsSchema.shape,
    defaults: particleFieldParamsSchema.parse({}),
  },
  'cta-card': {
    schema: ctaCardParamsSchema,
    fieldSchemas: ctaCardParamsSchema.shape,
    defaults: ctaCardParamsSchema.parse({}),
  },
};

export class UnknownStoryboardComponentError extends Error {
  constructor(readonly componentId: string) {
    super(`Unknown storyboard component "${componentId}"`);
    this.name = 'UnknownStoryboardComponentError';
  }
}

export function isStoryboardComponentId(
  value: string,
): value is StoryboardComponentId {
  return (STORYBOARD_COMPONENT_IDS as readonly string[]).includes(value);
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneParams<T>(params: T): T {
  return structuredClone(params);
}

function valueAtPath(
  value: JsonValue,
  path: readonly PropertyKey[],
): JsonValue {
  let current: JsonValue = value;

  for (const segment of path) {
    if (typeof segment === 'number' && Array.isArray(current)) {
      current = current[segment] ?? null;
      continue;
    }

    if (typeof segment === 'string' && isJsonObject(current)) {
      current = current[segment] ?? null;
      continue;
    }

    return null;
  }

  return current;
}

function diagnosticPath(field: string, path: readonly PropertyKey[]): string {
  return [field, ...path.map((segment) => String(segment))].join('.');
}

/**
 * Parse component params field by field.
 *
 * - absent object: defaults + `params_missing`;
 * - absent field: default, no diagnostic (a partial object is normal);
 * - invalid value: default for that field + `invalid_value` per Zod issue path;
 * - unknown key: dropped + `unknown_key` (not fatal);
 * - unknown component: throws `UnknownStoryboardComponentError`.
 *
 * Diagnostics are never dropped silently; the CLI writes them to the manifest.
 */
export function parseComponentParams<K extends StoryboardComponentId>(
  componentId: K,
  rawParams: JsonValue | undefined | null,
): ParsedComponentParams<K> {
  if (!Object.hasOwn(COMPONENT_PARAMS, componentId)) {
    throw new UnknownStoryboardComponentError(String(componentId));
  }

  const spec = COMPONENT_PARAMS[componentId];
  const defaults = spec.defaults as Record<string, unknown>;

  if (rawParams === undefined || rawParams === null) {
    return {
      params: cloneParams(spec.defaults),
      diagnostics: [{ path: '$', reason: 'params_missing', received: null }],
    };
  }

  if (!isJsonObject(rawParams)) {
    return {
      params: cloneParams(spec.defaults),
      diagnostics: [{ path: '$', reason: 'invalid_value', received: rawParams }],
    };
  }

  const candidate: Record<string, unknown> = {};
  const diagnostics: ComponentParamDiagnostic[] = [];

  for (const [field, fieldSchema] of Object.entries(spec.fieldSchemas)) {
    if (!Object.hasOwn(rawParams, field)) {
      candidate[field] = defaults[field];
      continue;
    }

    const received = rawParams[field] as JsonValue;
    const parsed = fieldSchema.safeParse(received);

    if (parsed.success) {
      candidate[field] = parsed.data;
      continue;
    }

    candidate[field] = defaults[field];

    for (const issue of parsed.error.issues) {
      diagnostics.push({
        path: diagnosticPath(field, issue.path),
        reason: 'invalid_value',
        received: valueAtPath(received, issue.path),
      });
    }
  }

  for (const [key, received] of Object.entries(rawParams)) {
    if (Object.hasOwn(spec.fieldSchemas, key)) {
      continue;
    }

    diagnostics.push({ path: key, reason: 'unknown_key', received });
  }

  return { params: spec.schema.parse(candidate), diagnostics };
}

/** Defaults for every component id, useful for tests and manifests. */
export const COMPONENT_PARAMS_DEFAULTS: {
  [K in StoryboardComponentId]: ComponentParamsById[K];
} = {
  'parallax-city': COMPONENT_PARAMS['parallax-city'].defaults,
  'kinetic-typography': COMPONENT_PARAMS['kinetic-typography'].defaults,
  'infographic-gauge': COMPONENT_PARAMS['infographic-gauge'].defaults,
  'image-parallax': COMPONENT_PARAMS['image-parallax'].defaults,
  'particle-field': COMPONENT_PARAMS['particle-field'].defaults,
  'cta-card': COMPONENT_PARAMS['cta-card'].defaults,
};

export const COMPONENT_PARAMS_SCHEMAS = {
  'parallax-city': parallaxCityParamsSchema,
  'kinetic-typography': kineticTypographyParamsSchema,
  'infographic-gauge': infographicGaugeParamsSchema,
  'image-parallax': imageParallaxParamsSchema,
  'particle-field': particleFieldParamsSchema,
  'cta-card': ctaCardParamsSchema,
} as const;
