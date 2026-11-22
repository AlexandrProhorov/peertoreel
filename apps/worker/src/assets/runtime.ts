import {
  AssetLibraryService,
  type AssetBlobStore,
  type AssetRepository,
} from '@peertoreel/assets';
import {
  DrizzleAssetRepository,
  DrizzleProviderUsageWriter,
  type Database,
} from '@peertoreel/db';
import type { ImageProvider } from '@peertoreel/contracts';
import {
  createDeepSeekJsonClient,
  createDeepSeekSvgProvider,
  createFetchHttpClient,
} from '@peertoreel/providers';
import { S3AssetBlobStore, type ObjectStorage } from '@peertoreel/storage';
import type { WorkerEnv } from '../config/env.js';

/**
 * Asset dependencies the episode stage needs (M3.6b.9).
 *
 * Built once in `main.ts`: repository, blob store, library service and the
 * DeepSeek client. The provider itself is created per run because the ledger
 * row must carry `run_id` (root hard rule 7).
 */
export type VisualsSource = WorkerEnv['VISUALS_SOURCE'];

export interface WorkerAssetRuntime {
  readonly source: VisualsSource;
  readonly service: AssetLibraryService;
  readonly repository: AssetRepository;
  readonly blobStore: AssetBlobStore;
  /** Run policy; checked before each provider call, never estimated. */
  readonly maxUsdPerRun: number;
  /** Provider scoped to one run; null when the SVG provider is not configured. */
  createProvider(runId: string): ImageProvider | null;
  /** Human-readable reason for a null provider, shown as a stage error. */
  readonly unavailableReason: string | null;
}

export function createWorkerAssetRuntime(
  env: WorkerEnv,
  db: Database,
  storage: ObjectStorage,
): WorkerAssetRuntime {
  const repository = new DrizzleAssetRepository(db);
  const blobStore = new S3AssetBlobStore(storage);
  const service = new AssetLibraryService({ repository, blobStore });
  const usageWriter = new DrizzleProviderUsageWriter(db);

  const apiKey = env.DEEPSEEK_API_KEY ?? null;
  const rates =
    env.LLM_INPUT_USD_PER_MTOK !== undefined &&
    env.LLM_OUTPUT_USD_PER_MTOK !== undefined
      ? {
          inputUsdPerMtok: env.LLM_INPUT_USD_PER_MTOK,
          outputUsdPerMtok: env.LLM_OUTPUT_USD_PER_MTOK,
        }
      : null;
  const client =
    apiKey === null
      ? null
      : createDeepSeekJsonClient({
          apiKey,
          baseUrl: env.LLM_BASE_URL,
          model: env.LLM_MODEL,
          http: createFetchHttpClient(),
        });
  const unavailableReason =
    apiKey === null
      ? 'DEEPSEEK_API_KEY не задан — генерация SVG недоступна'
      : rates === null
        ? 'LLM_INPUT_USD_PER_MTOK и LLM_OUTPUT_USD_PER_MTOK не заданы — стоимость не измерить'
        : null;

  return {
    source: env.VISUALS_SOURCE,
    service,
    repository,
    blobStore,
    maxUsdPerRun: env.ASSET_LLM_MAX_USD_PER_RUN,
    unavailableReason,
    createProvider(runId: string): ImageProvider | null {
      if (apiKey === null || client === null || rates === null) {
        return null;
      }

      return createDeepSeekSvgProvider({
        apiKey,
        client,
        rates,
        maxUsdPerCall: env.ASSET_LLM_MAX_USD_PER_CALL,
        usageWriter,
        usageSource: 'worker',
        runId,
        simulateFailure: env.DEEPSEEK_SVG_FORCE_FAILURE ?? null,
      });
    },
  };
}
