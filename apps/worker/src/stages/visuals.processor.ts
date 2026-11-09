import { artifacts, type Database } from '@peertoreel/db';
import {
  derivedWordsSchema,
  scriptSchema,
  stageJobDataSchema,
  visualsArtifactSchema,
  type StageJobResult,
  type StockAsset,
  type StockProvider,
  type VisualScene,
  type VisualSceneAsset,
  type VisualsArtifact,
} from '@peertoreel/contracts';
import { buildArtifactKey } from '@peertoreel/storage';
import { UnrecoverableError, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { requireProviderKey, type WorkerEnv } from '../config/env.js';
import { STOCK_LIMITS } from '../stock/limits.js';
import { StockError } from '../stock/errors.js';
import { deriveVisualAnchor, anchorTokens } from '../visuals/anchor.js';
import { deriveBeatTimings } from '../visuals/beat-timings.js';
import {
  FALLBACK_ASSET,
  planVisualScenes,
  selectStockAsset,
  type VisualScenePlan,
} from '../visuals/planner.js';
import type { StageDeps } from './context.js';
import { deleteArtifactByObjectKey } from './delete-artifact.js';
import { findArtifactObjectKey, loadArtifactBuffer } from './load-artifact.js';
import { saveArtifact, type SavedArtifact } from './save-artifact.js';
import { loadRun, transitionRun } from './transition.js';

interface PickedAsset {
  asset: StockAsset | null;
  providerRequests: number;
  cacheHits: number;
}

interface PersistedAsset {
  sceneAsset: Extract<VisualSceneAsset, { kind: 'video' | 'image' }>;
  artifact: SavedArtifact;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'неизвестная ошибка';
}

function requirePixabay(
  env: WorkerEnv,
  provider: StockProvider | undefined,
): StockProvider {
  try {
    requireProviderKey(env.PIXABAY_API_KEY, 'PIXABAY_API_KEY');
  } catch (error: unknown) {
    throw new UnrecoverableError(errorMessage(error));
  }

  if (!provider) {
    throw new UnrecoverableError(
      'Провайдер визуалов не настроен — стадия visuals не может обратиться к Pixabay',
    );
  }

  return provider;
}

async function listVisualArtifactKeys(
  db: Database,
  runId: string,
): Promise<string[]> {
  const rows = await db
    .select({ objectKey: artifacts.objectKey })
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.stage, 'visuals')));

  return rows.map((row) => row.objectKey);
}

/**
 * On regeneration prefer different Pixabay assets than the previous manifest.
 * Search results are cached for 24 h, so without this a re-run would pick the
 * same best clip again and the user would see the same video.
 */
async function loadPreviousAssetIds(
  deps: StageDeps<WorkerEnv>,
  runId: string,
): Promise<Set<string>> {
  const objectKey = await findArtifactObjectKey(
    deps.db,
    runId,
    'visuals_json',
  );

  if (!objectKey) {
    return new Set();
  }

  try {
    const body = Buffer.from(await deps.storage.getObject(objectKey)).toString(
      'utf8',
    );
    const manifest = visualsArtifactSchema.parse(JSON.parse(body));

    return new Set(
      manifest.scenes
        .map((scene) => scene.asset.providerAssetId)
        .filter((id): id is string => id !== null),
    );
  } catch (error: unknown) {
    deps.logger.warn(
      { reason: errorMessage(error) },
      'could not read previous visuals manifest; regenerating without rotation',
    );

    return new Set();
  }
}

async function searchAssets(
  provider: StockProvider,
  query: string,
  kind: 'video' | 'image',
): Promise<{ assets: StockAsset[]; requests: number; cacheHits: number }> {
  try {
    const result = await provider.search({ query, kind });

    return {
      assets: result.assets,
      requests: result.cached ? 0 : 1,
      cacheHits: result.cached ? 1 : 0,
    };
  } catch (error: unknown) {
    if (error instanceof StockError) {
      if (error.retryable) {
        throw error;
      }

      throw new UnrecoverableError(error.message);
    }

    throw error;
  }
}

/**
 * Prefer a clip that matches the visual anchor and the query. If the primary
 * query has nothing with the anchor in its tags, retry with the anchor alone
 * so a dog topic still gets dog footage instead of an unrelated scientist/cat.
 */
function withAnchor(query: string, anchor: string | null): string {
  const trimmed = query.trim();

  if (!anchor) {
    return trimmed;
  }

  return trimmed.toLowerCase().includes(anchor.toLowerCase())
    ? trimmed
    : `${anchor} ${trimmed}`.trim();
}

async function pickAsset(
  provider: StockProvider,
  plan: VisualScenePlan,
  usedProviderAssetIds: ReadonlySet<string>,
  previousAssetIds: ReadonlySet<string>,
  anchor: string | null,
  requiredTagTokens: readonly string[],
): Promise<PickedAsset> {
  const direction = plan.visualDirection.trim();

  if (!direction) {
    return { asset: null, providerRequests: 0, cacheHits: 0 };
  }

  const sceneDurationSec = plan.endSec - plan.startSec;
  const primaryQuery = withAnchor(direction, anchor);
  const queries =
    anchor && primaryQuery.toLowerCase() !== anchor.toLowerCase()
      ? [primaryQuery, anchor]
      : [primaryQuery];
  const hasAnchorFallback = queries.length > 1;
  let providerRequests = 0;
  let cacheHits = 0;
  let reusedFallback: StockAsset | null = null;

  for (const query of queries) {
    for (const kind of ['video', 'image'] as const) {
      const result = await searchAssets(provider, query, kind);
      providerRequests += result.requests;
      cacheHits += result.cacheHits;

      const selected = selectStockAsset(result.assets, {
        kind,
        minDurationSec: kind === 'video' ? sceneDurationSec : 0,
        maxBytes:
          kind === 'video'
            ? STOCK_LIMITS.maxVideoBytes
            : STOCK_LIMITS.maxImageBytes,
        usedProviderAssetIds,
        avoidProviderAssetIds: previousAssetIds,
        requiredTagTokens,
      });

      if (!selected) {
        continue;
      }

      const reused =
        usedProviderAssetIds.has(selected.providerAssetId) ||
        previousAssetIds.has(selected.providerAssetId);

      if (!reused || !hasAnchorFallback) {
        return { asset: selected, providerRequests, cacheHits };
      }

      // The primary query had only one relevant clip and it is already in use.
      // Keep it as a last resort, but try the anchor-only query for a fresh one.
      reusedFallback ??= selected;
    }
  }

  return { asset: reusedFallback, providerRequests, cacheHits };
}

async function persistAsset(
  deps: StageDeps<WorkerEnv>,
  provider: StockProvider,
  runId: string,
  plan: VisualScenePlan,
  asset: StockAsset,
): Promise<PersistedAsset | null> {
  const maxBytes =
    asset.kind === 'video'
      ? STOCK_LIMITS.maxVideoBytes
      : STOCK_LIMITS.maxImageBytes;

  let downloaded: Awaited<ReturnType<StockProvider['download']>>;

  try {
    downloaded = await provider.download(asset, {
      maxBytes,
      timeoutMs: STOCK_LIMITS.downloadTimeoutMs,
    });
  } catch (error: unknown) {
    deps.logger.warn(
      {
        sceneIdx: plan.idx,
        kind: asset.kind,
        reason: errorMessage(error),
      },
      'stock asset download failed; using fallback',
    );

    return null;
  }

  const contentType =
    downloaded.contentType.split(';')[0]?.trim().toLowerCase() ??
    downloaded.contentType;
  const objectKey = buildArtifactKey(runId, 'visuals', `scene-${plan.idx}`);

  await deps.storage.putObject(
    objectKey,
    downloaded.body,
    contentType,
  );

  const artifact = await saveArtifact(deps.db, {
    runId,
    stage: 'visuals',
    type: asset.kind === 'video' ? 'visual_clip' : 'visual_image',
    objectKey,
    contentType,
    sizeBytes: downloaded.body.byteLength,
    meta: {
      sceneIdx: plan.idx,
      part: plan.part,
      provider: asset.provider,
      providerAssetId: asset.providerAssetId,
      author: asset.author,
      pageUrl: asset.pageUrl,
      tags: asset.tags,
      width: asset.width,
      height: asset.height,
    },
  });

  return {
    artifact,
    sceneAsset: {
      kind: asset.kind,
      objectKey,
      contentType,
      width: asset.width,
      height: asset.height,
      provider: asset.provider,
      providerAssetId: asset.providerAssetId,
      author: asset.author,
      pageUrl: asset.pageUrl,
    },
  };
}

async function cleanupStaleArtifacts(
  deps: StageDeps<WorkerEnv>,
  runId: string,
  oldKeys: readonly string[],
  keptKeys: ReadonlySet<string>,
): Promise<void> {
  for (const objectKey of oldKeys) {
    if (keptKeys.has(objectKey)) {
      continue;
    }

    try {
      await deps.storage.deleteObject(objectKey);
    } catch (error: unknown) {
      deps.logger.warn(
        { objectKey, reason: errorMessage(error) },
        'could not delete stale visual object',
      );
    }

    try {
      await deleteArtifactByObjectKey(deps.db, objectKey);
    } catch (error: unknown) {
      deps.logger.warn(
        { objectKey, reason: errorMessage(error) },
        'could not delete stale visual artifact row',
      );
    }
  }
}

/** VOICE_READY → VISUALS_READY: Pixabay scenes, S3 objects and a manifest. */
export async function processVisualsStage(
  job: Job,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  const { runId } = stageJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  if (run.state === 'VISUALS_READY') {
    return { runId, stage: 'visuals', state: run.state, artifacts: [] };
  }

  if (run.state !== 'VOICE_READY') {
    throw new Error(
      `Стадия visuals ждёт VOICE_READY, а run ${runId} в состоянии ${run.state}`,
    );
  }

  const provider = requirePixabay(deps.env, deps.stockProvider);

  const [scriptBody, timingsBody] = await Promise.all([
    loadArtifactBuffer(deps.db, deps.storage, runId, 'script_json'),
    loadArtifactBuffer(deps.db, deps.storage, runId, 'word_timings'),
  ]);
  const script = scriptSchema.parse(JSON.parse(scriptBody.toString('utf8')));
  const words = derivedWordsSchema.parse(
    JSON.parse(timingsBody.toString('utf8')),
  );
  const timings = deriveBeatTimings(script, words);
  const plans = planVisualScenes(timings);
  const anchor = deriveVisualAnchor(script);
  const requiredTagTokens = anchorTokens(anchor);

  await job.updateProgress(10);

  const oldKeys = await listVisualArtifactKeys(deps.db, runId);
  const previousAssetIds = await loadPreviousAssetIds(deps, runId);
  const usedProviderAssetIds = new Set<string>();
  const newKeys = new Set<string>();
  const scenes: VisualScene[] = [];
  const sceneArtifacts: SavedArtifact[] = [];
  let providerRequests = 0;
  let cacheHits = 0;
  let fallbackScenes = 0;

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];

    if (!plan) {
      continue;
    }

    const picked = await pickAsset(
      provider,
      plan,
      usedProviderAssetIds,
      previousAssetIds,
      anchor,
      requiredTagTokens,
    );
    providerRequests += picked.providerRequests;
    cacheHits += picked.cacheHits;

    let persisted: PersistedAsset | null = null;

    if (picked.asset) {
      providerRequests += 1;
      persisted = await persistAsset(deps, provider, runId, plan, picked.asset);
    }

    if (persisted && picked.asset) {
      usedProviderAssetIds.add(picked.asset.providerAssetId);
      sceneArtifacts.push(persisted.artifact);
      newKeys.add(persisted.sceneAsset.objectKey);
      scenes.push({ ...plan, asset: persisted.sceneAsset });
    } else {
      fallbackScenes += 1;
      scenes.push({ ...plan, asset: { ...FALLBACK_ASSET } });
    }

    await job.updateProgress(10 + Math.round((70 * (index + 1)) / plans.length));
  }

  const durationSec = timings[timings.length - 1]?.endSec ?? 0;
  const manifest: VisualsArtifact = visualsArtifactSchema.parse({
    scenes,
    durationSec,
    providerRequests,
    cacheHits,
  });
  const manifestKey = buildArtifactKey(runId, 'visuals', 'visuals.json');
  const manifestBody = Buffer.from(
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  await deps.storage.putObject(manifestKey, manifestBody, 'application/json');

  const manifestArtifact = await saveArtifact(deps.db, {
    runId,
    stage: 'visuals',
    type: 'visuals_json',
    objectKey: manifestKey,
    contentType: 'application/json',
    sizeBytes: manifestBody.byteLength,
    meta: {
      scenes: scenes.length,
      fallbackScenes,
      providerRequests,
      cacheHits,
      durationSec,
      visualAnchor: anchor,
    },
  });

  await cleanupStaleArtifacts(
    deps,
    runId,
    oldKeys,
    new Set([...newKeys, manifestKey]),
  );

  await job.updateProgress(90);

  const state = await transitionRun(deps.db, runId, 'VISUALS_READY');

  await job.updateProgress(100);

  return {
    runId,
    stage: 'visuals',
    state,
    artifacts: [manifestArtifact, ...sceneArtifacts].map((artifact) => ({
      type: artifact.type,
      objectKey: artifact.objectKey,
      sizeBytes: artifact.sizeBytes,
    })),
  };
}
