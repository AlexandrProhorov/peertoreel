import {
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  getStoryboardRecipe,
  isStarterAssetKey,
  parseRecipeSlots,
  sanitizeSubjectPrompt,
  type AssetResolution,
  type AssetResolutionTier,
  type AssetUsage,
  type AssetVariant,
  type AssetDiagnostic,
  type Storyboard,
} from '@peertoreel/contracts';
import {
  InMemoryAssetRepository,
  TieredAssetResolver,
  assetPaletteFor,
  buildStarterAssets,
  createFakeImageProvider,
  recordingImageProvider,
  type AssetBlobStore,
  type AssetLibraryService,
  type AssetRepository,
  type ProviderUsageContext,
} from '@peertoreel/assets';
import {
  createDeepSeekJsonClient,
  createDeepSeekSvgProvider,
  createFetchHttpClient,
} from '@peertoreel/providers';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSceneComponent } from './mapping.js';
import type { DeepSeekSvgEnvOptions } from './provider-config.js';
import type { ResolvedAssetMap } from './props.js';

/**
 * Resolver → renderer bridge for the CLI (ADR-0017 D6).
 *
 * Tier 0 resolves the curated starter pack; `--provider=fake` exercises the
 * provider branch without a network call. The renderer only sees URLs.
 * With persistence the same bridge writes bytes and rows first, then passes
 * presigned URLs into props (M3.6a.1).
 */

export type ProviderMode = 'none' | 'fake' | 'deepseek-svg';

/** Provider configuration resolved from env by the CLI, never by scene code. */
export interface StoryboardProviderConfig {
  readonly deepseek?: DeepSeekSvgEnvOptions;
}

export interface ResolvedAssetSummary {
  readonly assetKey: string;
  readonly tier: AssetResolutionTier;
  readonly cacheHit: boolean;
  readonly contentHash: string;
  readonly objectKey: string;
  /** Provider prompt recorded on the asset; null for Tier 0. */
  readonly prompt: string | null;
  /** Why this tier won; `provider_failed`/`fallback_used` are acceptance evidence. */
  readonly diagnostics: readonly AssetDiagnostic[];
}

/** Persistence is injected, never discovered: the CLI owns env and lifecycle. */
export interface StoryboardAssetPersistence {
  readonly repository: AssetRepository;
  readonly blobStore: AssetBlobStore;
  readonly service: AssetLibraryService;
}

export interface StoryboardAssetResolution {
  readonly assets: ResolvedAssetMap;
  readonly resolutions: readonly ResolvedAssetSummary[];
  readonly usage: AssetUsage;
  readonly persisted: boolean;
  /** References whose URL came from the injected map, not from the resolver. */
  readonly injected: number;
}

const KEY_BY_PATH = new Map<string, string>(
  STARTER_ASSET_KEYS.map((key) => [STARTER_ASSET_CATALOG[key].path, key]),
);

/** Prompt and Tier 0 fallback declared by a subject slot (ADR-0016 D13). */
interface SubjectHints {
  readonly prompt: string | null;
  readonly fallbackKey: string | null;
}

interface SubjectSlotValue {
  readonly assetKey: string;
  readonly fallbackIcon: string | null;
  readonly prompt: string | null;
}

function isSubjectSlotValue(value: unknown): value is SubjectSlotValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'assetKey' in value &&
    typeof (value as { assetKey: unknown }).assetKey === 'string'
  );
}

/**
 * Reference → provider hints for every recipe subject slot. Starter keys map
 * from their public path (what recipe layers carry); generated keys are their
 * own reference.
 */
function subjectHints(storyboard: Storyboard): Map<string, SubjectHints> {
  const hints = new Map<string, SubjectHints>();

  for (const scene of storyboard.scenes) {
    if (scene.implementation.type !== 'recipe') {
      continue;
    }

    const implementation = scene.implementation;
    const recipe = getStoryboardRecipe(implementation.recipeId);

    if (recipe === null) {
      continue;
    }

    let slots: ReturnType<typeof parseRecipeSlots>;

    try {
      slots = parseRecipeSlots(
        implementation.recipeId,
        implementation.variant,
        implementation.slots,
      );
    } catch {
      // Invalid slots fail later with a typed error from the renderer.
      continue;
    }

    for (const spec of recipe.slotSpecs) {
      if (spec.kind !== 'subject') {
        continue;
      }

      const value = slots.slots[spec.name];

      if (!isSubjectSlotValue(value)) {
        continue;
      }

      const hint: SubjectHints = {
        prompt:
          typeof value.prompt === 'string' && value.prompt.trim().length > 0
            ? sanitizeSubjectPrompt(value.prompt)
            : null,
        fallbackKey:
          typeof value.fallbackIcon === 'string' ? value.fallbackIcon : null,
      };
      const reference = isStarterAssetKey(value.assetKey)
        ? STARTER_ASSET_CATALOG[value.assetKey].path
        : value.assetKey;

      // First declaration wins: several scenes may reuse one key with slightly
      // different wording, and re-resolution must not depend on scene order.
      if (!hints.has(reference)) {
        hints.set(reference, hint);
      }

      if (!hints.has(value.assetKey)) {
        hints.set(value.assetKey, hint);
      }
    }
  }

  return hints;
}

function isExternalReference(reference: string): boolean {
  return /^(https?:|data:)/i.test(reference);
}

function sceneAssetReferences(scene: Storyboard['scenes'][number]): string[] {
  const references = new Set<string>();
  const resolved = resolveSceneComponent(scene);

  if (resolved.recipe !== null) {
    for (const layer of resolved.recipe.layers) {
      if (
        (layer.kind === 'subject' || layer.kind === 'image') &&
        layer.content !== null
      ) {
        references.add(layer.content);
      }
    }
  }

  for (const object of scene.objects) {
    if (
      (object.kind === 'image' || object.kind === 'subject') &&
      object.content !== null
    ) {
      references.add(object.content);
    }
  }

  return [...references];
}

function collectReferences(storyboard: Storyboard): string[] {
  const references = new Set<string>();

  for (const scene of storyboard.scenes) {
    for (const reference of sceneAssetReferences(scene)) {
      references.add(reference);
    }
  }

  return [...references];
}

function toDataUri(mimeType: string, content: string): string {
  return `data:${mimeType};base64,${Buffer.from(content, 'utf8').toString('base64')}`;
}

/** Starter files live under `<public>/assets/starter/` (ADR-0015 D2). */
const STARTER_OBJECT_PREFIX = 'assets/starter/';

function decodeDataUri(uri: string): Uint8Array {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);

  if (match?.[2] === undefined) {
    throw new Error('Expected a base64 data URI for provider asset bytes');
  }

  return new Uint8Array(Buffer.from(match[2], 'base64'));
}

/** Bytes are only available for Tier 0 files and provider data URIs. */
async function resolutionBytes(
  variant: AssetVariant,
  publicDir: string,
): Promise<Uint8Array | null> {
  if (variant.url?.startsWith('data:') === true) {
    return decodeDataUri(variant.url);
  }

  if (variant.objectKey.startsWith(STARTER_OBJECT_PREFIX)) {
    return readFile(path.join(publicDir, variant.objectKey));
  }

  return null;
}

async function persistResolution(
  persistence: StoryboardAssetPersistence,
  resolution: AssetResolution,
  publicDir: string,
): Promise<AssetResolution> {
  const variant = resolution.asset.variants[0];

  if (variant === undefined) {
    throw new Error(`Asset "${resolution.asset.key}" resolved without a variant`);
  }

  const bytes = await resolutionBytes(variant, publicDir);

  if (bytes !== null) {
    return persistence.service.persist(resolution, bytes, variant.mimeType);
  }

  if (!(await persistence.blobStore.exists(variant.objectKey))) {
    throw new Error(
      `Ассет "${resolution.asset.key}" есть в БД (${variant.objectKey}), но объекта нет в хранилище`,
    );
  }

  return persistence.service.withUrls(resolution);
}

/**
 * Merges an injected `ResolvedAssetMap` with the normal resolution. Injected
 * URLs win; every other reference is resolved as before. This is how episode
 * mode hands Pixabay images to the renderer without touching the Asset Library.
 */
export async function resolveStoryboardAssets(
  storyboard: Storyboard,
  publicDir: string,
  providerMode: ProviderMode,
  persistence: StoryboardAssetPersistence | null = null,
  injected: ResolvedAssetMap | null = null,
  providerUsage: ProviderUsageContext | null = null,
  providerConfig: StoryboardProviderConfig | null = null,
): Promise<StoryboardAssetResolution> {
  const styleId = storyboard.style.styleId;
  const starter = await buildStarterAssets(
    (objectKey) => readFile(path.join(publicDir, objectKey), 'utf8'),
    styleId,
  );
  const deepseekConfig = providerConfig?.deepseek;
  const baseProvider =
    providerMode === 'fake'
      ? createFakeImageProvider({
          synthesize: true,
          palette: assetPaletteFor(styleId),
        })
      : providerMode === 'deepseek-svg'
        ? createDeepSeekSvgProvider({
            apiKey: deepseekConfig?.apiKey ?? null,
            client:
              deepseekConfig === undefined
                ? undefined
                : createDeepSeekJsonClient({
                    apiKey: deepseekConfig.apiKey,
                    baseUrl: deepseekConfig.baseUrl,
                    model: deepseekConfig.model,
                    http: createFetchHttpClient(),
                  }),
            rates: deepseekConfig?.rates,
            maxUsdPerCall: deepseekConfig?.maxUsdPerCall,
            simulateFailure: deepseekConfig?.simulateFailure,
            usageWriter: providerUsage?.writer ?? null,
            usageSource: providerUsage?.source ?? 'cli',
            runId: providerUsage?.runId ?? null,
          })
        : null;
  const provider =
    providerMode === 'fake' && baseProvider !== null && providerUsage !== null
      ? recordingImageProvider(baseProvider, providerUsage)
      : baseProvider;
  const resolver = new TieredAssetResolver({
    repository: persistence?.repository ?? new InMemoryAssetRepository(starter),
    starter,
    provider,
  });

  const assets: Record<string, { url: string }> = {};
  const resolutions: ResolvedAssetSummary[] = [];
  const urlByKey = new Map<string, string>();
  const injectedKeys = new Set<string>();
  const hintsByReference = subjectHints(storyboard);
  const usage: AssetUsage = {
    provider: provider?.id ?? null,
    providerRequests: 0,
    cacheHits: 0,
    costUsd: null,
  };
  let costMeasured = true;

  for (const reference of collectReferences(storyboard)) {
    if (isExternalReference(reference)) {
      continue;
    }

    const assetKey = KEY_BY_PATH.get(reference) ?? reference;
    const injectedUrl =
      injected?.[reference]?.url ??
      injected?.[assetKey]?.url;
    let url = injectedUrl ?? urlByKey.get(assetKey);

    if (injectedUrl !== undefined && !injectedKeys.has(assetKey)) {
      injectedKeys.add(assetKey);
    }

    if (url === undefined) {
      const hints =
        hintsByReference.get(reference) ?? hintsByReference.get(assetKey);
      const resolved = await resolver.resolve({
        assetKey,
        styleId,
        assetPalette: storyboard.style.assetPalette,
        allowProvider: provider !== null,
        ...(hints?.prompt !== null && hints?.prompt !== undefined
          ? { prompt: hints.prompt }
          : {}),
        ...(hints?.fallbackKey !== null && hints?.fallbackKey !== undefined
          ? { fallbackKey: hints.fallbackKey }
          : {}),
      });
      const resolution =
        persistence === null
          ? resolved
          : await persistResolution(persistence, resolved, publicDir);
      const variant = resolution.asset.variants[0];

      if (variant === undefined) {
        throw new Error(`Asset "${assetKey}" resolved without a variant`);
      }

      url =
        variant.url ??
        toDataUri(
          variant.mimeType,
          await readFile(path.join(publicDir, variant.objectKey), 'utf8'),
        );
      urlByKey.set(assetKey, url);

      usage.providerRequests += resolution.usage.providerRequests;
      usage.cacheHits += resolution.usage.cacheHits;

      if (
        resolution.usage.providerRequests > 0 &&
        resolution.usage.costUsd === null
      ) {
        // Spend happened but was not reported: the total must stay unknown
        // rather than silently drop the measured part (root hard rule 7).
        costMeasured = false;
      } else if (resolution.usage.costUsd !== null) {
        usage.costUsd = (usage.costUsd ?? 0) + resolution.usage.costUsd;
      }

      const metadataPrompt = resolution.asset.metadata['prompt'];

      resolutions.push({
        assetKey,
        tier: resolution.tier,
        cacheHit: resolution.cacheHit,
        contentHash: resolution.asset.contentHash,
        objectKey: variant.objectKey,
        prompt: typeof metadataPrompt === 'string' ? metadataPrompt : null,
        diagnostics: resolution.diagnostics,
      });
    }

    assets[assetKey] = { url };
    // Recipe layers reference the catalog path; accept both forms.
    assets[reference] = { url };
  }

  if (!costMeasured) {
    usage.costUsd = null;
  }

  return {
    assets,
    resolutions,
    usage,
    persisted: persistence !== null,
    injected: injectedKeys.size,
  };
}
