import { TieredAssetResolver } from '@peertoreel/assets';
import {
  InvalidAssetError,
  ProviderBudgetError,
  ProviderUnavailableError,
  UnsupportedAssetKindError,
  episodeVisualsArtifactSchema,
  sanitizeSubjectPrompt,
  type AssetDiagnostic,
  type AssetResolution,
  type AssetVariant,
  type EpisodeSubjectDecision,
  type EpisodeVisual,
  type EpisodeVisualsArtifact,
  type StoryboardStyle,
} from '@peertoreel/contracts';
import type { Logger } from 'pino';
import type { WorkerAssetRuntime } from '../assets/runtime.js';
import type { EpisodeSubject } from './subjects.js';

/**
 * DeepSeek SVG source for episode subject slots (M3.6b.9).
 *
 * Each generated `subject/<slug>` goes through the tiered resolver: cache →
 * provider (measured spend, ledger row with `run_id`) → Tier 0. A failed or
 * budget-stopped slot keeps the local starter icon; the run continues. Only a
 * slot without a declared `fallbackIcon` fails the stage, because then the
 * renderer would have nothing to draw.
 */

export interface SubjectAssetsResult {
  artifact: EpisodeVisualsArtifact;
  /** Unique subject references sent to the resolver (not the scene count). */
  queries: number;
}

const MAX_DATA_URI_LENGTH = 2_000_000;
const DATA_URI = /^data:([^;,]+);base64,(.*)$/s;

function decodeDataUri(url: string): Uint8Array | null {
  const match = DATA_URI.exec(url);

  return match === null
    ? null
    : new Uint8Array(Buffer.from(match[2] ?? '', 'base64'));
}

function spendOfError(
  error: unknown,
): { requests: number; costUsd: number | null } | null {
  if (
    error instanceof ProviderBudgetError ||
    error instanceof InvalidAssetError ||
    error instanceof ProviderUnavailableError
  ) {
    return error.usage ?? null;
  }

  return null;
}

function diagnostic(
  code: AssetDiagnostic['code'],
  message: string,
  assetKey: string,
): AssetDiagnostic {
  return { code, message, assetKey };
}

function failureDiagnostic(error: unknown, assetKey: string): AssetDiagnostic {
  const message =
    error instanceof Error ? error.message.slice(0, 480) : 'неизвестная ошибка';

  if (error instanceof ProviderBudgetError) {
    return diagnostic('provider_disabled_by_budget', message, assetKey);
  }

  if (error instanceof UnsupportedAssetKindError) {
    return diagnostic('provider_skipped', message, assetKey);
  }

  return diagnostic('provider_failed', message, assetKey);
}

function starterDecision(
  subject: EpisodeSubject,
  diagnostics: readonly AssetDiagnostic[],
): EpisodeSubjectDecision {
  return {
    sceneId: subject.sceneId,
    sceneIdx: subject.sceneIdx,
    reference: subject.reference,
    source: 'tier0',
    tier: 'starter',
    provider: null,
    costUsd: null,
    prompt: subject.prompt,
    diagnostics: [...diagnostics],
  };
}

function dataUriFor(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

interface ResolvedSubject {
  readonly image: EpisodeVisual;
  readonly decision: EpisodeSubjectDecision;
  readonly providerRequests: number;
  readonly cacheHits: number;
}

type SubjectResolution =
  | { readonly kind: 'ok'; readonly resolved: ResolvedSubject }
  | { readonly kind: 'failed'; readonly diagnostic: AssetDiagnostic };

export interface SubjectAssetsOptions {
  readonly subjects: readonly EpisodeSubject[];
  readonly style: StoryboardStyle;
  readonly runtime: WorkerAssetRuntime;
  readonly runId: string;
  readonly logger: Logger;
}

export async function resolveEpisodeSubjectAssets(
  options: SubjectAssetsOptions,
): Promise<SubjectAssetsResult> {
  const { subjects, style, runtime, runId, logger } = options;

  if (runtime.source !== 'deepseek-svg') {
    throw new Error(
      `resolveEpisodeSubjectAssets ждёт источник deepseek-svg, а настроен ${runtime.source}`,
    );
  }

  const provider = runtime.createProvider(runId);

  if (provider === null) {
    throw new Error(
      `Источник визуалов deepseek-svg не сконфигурирован: ${runtime.unavailableReason ?? 'провайдер недоступен'}`,
    );
  }

  const resolver = new TieredAssetResolver({
    repository: runtime.repository,
    provider,
  });
  const byReference = new Map<string, ResolvedSubject>();
  const images: EpisodeVisual[] = [];
  const decisions: EpisodeSubjectDecision[] = [];
  let providerRequests = 0;
  let cacheHits = 0;
  let skipped = 0;
  let spentUsd = 0;
  let spendUnknown = false;
  let budgetStopped = false;
  let queries = 0;

  const budgetSpent = (): boolean =>
    budgetStopped || spendUnknown || spentUsd >= runtime.maxUsdPerRun;

  const addSpend = (requests: number, costUsd: number | null): void => {
    if (requests <= 0) {
      return;
    }

    if (costUsd === null) {
      // A paid call without measured cost cannot be budgeted. Stop generating
      // instead of pretending the remaining slots are free (hard rule 7).
      spendUnknown = true;

      return;
    }

    spentUsd = Number((spentUsd + costUsd).toFixed(6));

    if (spentUsd >= runtime.maxUsdPerRun) {
      budgetStopped = true;
    }
  };

  const bytesOf = async (variant: AssetVariant): Promise<Uint8Array> => {
    const fromUrl = variant.url === undefined ? null : decodeDataUri(variant.url);

    return fromUrl ?? runtime.blobStore.get(variant.objectKey);
  };

  /** Bytes first, row second (ADR-0017 D10); cache hits only re-sign URLs. */
  const persist = async (
    resolution: AssetResolution,
    primary: AssetVariant,
    bytes: Uint8Array,
  ): Promise<void> => {
    if (primary.url !== undefined && primary.url.startsWith('data:')) {
      await runtime.service.persist(resolution, bytes, primary.mimeType);

      return;
    }

    await runtime.service.withUrls(resolution);
  };

  const resolveSubject = async (
    subject: EpisodeSubject,
  ): Promise<SubjectResolution> => {
    const prompt =
      subject.prompt === null ? null : sanitizeSubjectPrompt(subject.prompt);
    const request = {
      assetKey: subject.reference,
      styleId: style.styleId,
      kind: 'svg' as const,
      allowProvider: true,
      ...(style.assetPalette === undefined
        ? {}
        : { assetPalette: style.assetPalette }),
      ...(prompt === null ? {} : { prompt }),
      ...(subject.fallbackKey === null
        ? {}
        : { fallbackKey: subject.fallbackKey }),
    };

    let resolution: AssetResolution;

    try {
      resolution = await resolver.resolve(request);
    } catch (error: unknown) {
      const spend = spendOfError(error);
      const failure = failureDiagnostic(error, subject.reference);

      if (spend !== null) {
        addSpend(spend.requests, spend.costUsd);
      }

      if (subject.fallbackKey === null) {
        throw new Error(
          `Слот "${subject.reference}" (${subject.sceneId}) не имеет fallbackIcon: ${failure.message}`,
        );
      }

      logger.warn(
        {
          reference: subject.reference,
          sceneId: subject.sceneId,
          reason: failure.message,
        },
        'generated subject failed; keeping the Tier 0 icon',
      );

      return { kind: 'failed', diagnostic: failure };
    }

    addSpend(resolution.usage.providerRequests, resolution.usage.costUsd);

    const primary = resolution.asset.variants[0];

    if (primary === undefined) {
      throw new Error(`Ассет "${resolution.asset.key}" разрешён без варианта`);
    }

    const bytes = await bytesOf(primary);

    await persist(resolution, primary, bytes);

    const dataUri = dataUriFor(primary.mimeType, bytes);

    if (dataUri.length > MAX_DATA_URI_LENGTH) {
      const message = `Ассет "${resolution.asset.key}" больше лимита input props (${dataUri.length} символов)`;

      if (subject.fallbackKey === null) {
        throw new Error(
          `Слот "${subject.reference}" (${subject.sceneId}) не имеет fallbackIcon: ${message}`,
        );
      }

      logger.warn(
        { reference: subject.reference, bytes: bytes.byteLength },
        'generated subject is too large for input props; keeping the Tier 0 icon',
      );

      return {
        kind: 'failed',
        diagnostic: diagnostic('provider_failed', message, subject.reference),
      };
    }

    const promptValue = resolution.asset.metadata['prompt'];
    const providerValue = resolution.asset.metadata['provider'];
    const providerId =
      resolution.usage.provider ??
      (typeof providerValue === 'string' ? providerValue : provider.id);
    const storedPrompt =
      typeof promptValue === 'string' ? promptValue : prompt;

    return {
      kind: 'ok',
      resolved: {
        providerRequests: resolution.usage.providerRequests,
        cacheHits: resolution.usage.cacheHits,
        decision: {
          sceneId: subject.sceneId,
          sceneIdx: subject.sceneIdx,
          reference: subject.reference,
          source: 'deepseek-svg',
          tier: resolution.tier,
          provider: providerId,
          costUsd: resolution.usage.costUsd,
          prompt: storedPrompt,
          diagnostics: resolution.diagnostics,
        },
        image: {
          sceneId: subject.sceneId,
          sceneIdx: subject.sceneIdx,
          reference: subject.reference,
          source: 'deepseek-svg',
          tier: resolution.tier,
          provider: providerId,
          providerAssetId: resolution.asset.key,
          pageUrl: null,
          author: null,
          license: resolution.asset.license.name,
          downloadUrl: null,
          tags: [...resolution.asset.tags],
          query: null,
          cached: resolution.cacheHit,
          width: primary.width,
          height: primary.height,
          bytes: bytes.byteLength,
          dataUri,
          costUsd: resolution.usage.costUsd,
          diagnostics: resolution.diagnostics,
          prompt: storedPrompt,
        },
      },
    };
  };

  for (const subject of subjects) {
    if (!subject.generated) {
      decisions.push(
        starterDecision(subject, [
          diagnostic(
            'starter_hit',
            'Ключ из стартовой библиотеки: генерация не запрашивалась',
            subject.reference,
          ),
        ]),
      );
      continue;
    }

    const cached = byReference.get(subject.reference);

    if (cached !== undefined) {
      decisions.push({
        ...cached.decision,
        sceneId: subject.sceneId,
        sceneIdx: subject.sceneIdx,
      });
      images.push({
        ...cached.image,
        sceneId: subject.sceneId,
        sceneIdx: subject.sceneIdx,
      });
      continue;
    }

    if (budgetSpent()) {
      skipped += 1;
      decisions.push(
        starterDecision(subject, [
          diagnostic(
            'provider_disabled_by_budget',
            `Лимит прогона $${runtime.maxUsdPerRun} исчерпан или стоимость не измерена`,
            subject.reference,
          ),
        ]),
      );
      continue;
    }

    queries += 1;

    const outcome = await resolveSubject(subject);

    if (outcome.kind === 'failed') {
      skipped += 1;
      decisions.push(
        starterDecision(subject, [
          outcome.diagnostic,
          diagnostic(
            'fallback_used',
            `Использован стартовый ассет "${subject.fallbackKey ?? '(нет)'}"`,
            subject.reference,
          ),
        ]),
      );
      continue;
    }

    const { resolved } = outcome;

    providerRequests += resolved.providerRequests;
    cacheHits += resolved.cacheHits;
    byReference.set(subject.reference, resolved);
    decisions.push(resolved.decision);
    images.push(resolved.image);
  }

  const artifact = episodeVisualsArtifactSchema.parse({
    source: 'deepseek-svg',
    images,
    subjects: decisions,
    providerRequests,
    cacheHits,
    skipped,
    costUsd: spendUnknown ? null : Number(spentUsd.toFixed(6)),
    providerDisabledByBudget: budgetStopped,
  });

  return { artifact, queries };
}
