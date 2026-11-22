import {
  AssetLibraryService,
  InMemoryAssetBlobStore,
  InMemoryAssetRepository,
  buildStoryboardStyle,
  createFakeImageProvider,
  type AssetBlobStore,
  type AssetRepository,
} from '@peertoreel/assets';
import { createDeepSeekSvgProvider } from '@peertoreel/providers';
import type {
  ImageProvider,
  LlmJsonClient,
  ProviderUsageEntry,
} from '@peertoreel/contracts';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerAssetRuntime } from '../assets/runtime.js';
import { resolveEpisodeSubjectAssets } from './subject-assets.js';
import type { EpisodeSubject } from './subjects.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const STYLE = buildStoryboardStyle();

const VALID_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
  '<rect x="0" y="0" width="400" height="400" fill="#F4F1EA"/>',
  '<rect x="120" y="80" width="160" height="240" rx="24" fill="#23405F"/>',
  '</svg>',
].join('');

function logger(): Logger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Logger;
}

function subject(
  overrides: Partial<EpisodeSubject> = {},
): EpisodeSubject {
  return {
    sceneId: 'hook',
    sceneIdx: 0,
    reference: 'subject/wifi-router',
    generated: true,
    prompt: 'роутер, фронтальная проекция',
    fallbackKey: 'brick',
    queries: [{ query: 'роутер фронтально', lang: 'ru' }],
    ...overrides,
  };
}

interface Ledger {
  readonly entries: ProviderUsageEntry[];
  record(entry: ProviderUsageEntry): Promise<void>;
}

function ledger(): Ledger {
  const entries: ProviderUsageEntry[] = [];

  return {
    entries,
    async record(entry: ProviderUsageEntry): Promise<void> {
      entries.push(entry);
    },
  };
}

interface FakeClient {
  readonly client: LlmJsonClient;
  calls: number;
}

function fakeClient(response: { content: string; promptTokens?: number; completionTokens?: number }): FakeClient {
  const state: FakeClient = {
    calls: 0,
    client: {
      async complete() {
        state.calls += 1;

        return {
          content: response.content,
          usage: {
            promptTokens: response.promptTokens ?? 1000,
            completionTokens: response.completionTokens ?? 2000,
          },
          model: 'deepseek-flash',
        };
      },
    },
  };

  return state;
}

function runtime(options: {
  provider: ImageProvider | null;
  maxUsdPerRun?: number;
  repository?: AssetRepository;
  blobStore?: AssetBlobStore;
}): WorkerAssetRuntime & {
  repository: InMemoryAssetRepository;
  blobStore: InMemoryAssetBlobStore;
} {
  const repository =
    (options.repository as InMemoryAssetRepository | undefined) ??
    new InMemoryAssetRepository();
  const blobStore =
    (options.blobStore as InMemoryAssetBlobStore | undefined) ??
    new InMemoryAssetBlobStore();

  return {
    source: 'deepseek-svg',
    service: new AssetLibraryService({ repository, blobStore }),
    repository,
    blobStore,
    maxUsdPerRun: options.maxUsdPerRun ?? 0.25,
    unavailableReason: null,
    createProvider: () => options.provider,
  };
}

function deepseek(options: {
  content?: string;
  simulateFailure?: 'unavailable' | 'empty';
  usage?: Ledger;
  maxUsdPerCall?: number;
} = {}): { provider: ImageProvider; client: FakeClient; usage: Ledger } {
  const usage = options.usage ?? ledger();
  const client = fakeClient({
    content: options.content ?? JSON.stringify({ svg: VALID_SVG }),
  });
  const provider = createDeepSeekSvgProvider({
    apiKey: 'key',
    client: client.client,
    rates: { inputUsdPerMtok: 0.15, outputUsdPerMtok: 0.6 },
    maxUsdPerCall: options.maxUsdPerCall ?? 0.02,
    usageWriter: usage,
    usageSource: 'worker',
    runId: RUN_ID,
    simulateFailure: options.simulateFailure ?? null,
  });

  return { provider, client, usage };
}

describe('episode subject assets (deepseek-svg)', () => {
  it('generates an SVG, persists it and records a ledger row with run_id', async () => {
    const { provider, usage } = deepseek();
    const assets = runtime({ provider });

    const result = await resolveEpisodeSubjectAssets({
      subjects: [subject()],
      style: STYLE,
      runtime: assets,
      runId: RUN_ID,
      logger: logger(),
    });

    expect(result.artifact.source).toBe('deepseek-svg');
    expect(result.artifact.images).toHaveLength(1);
    expect(result.artifact.images[0]).toMatchObject({
      reference: 'subject/wifi-router',
      source: 'deepseek-svg',
      tier: 'provider',
      provider: 'deepseek-svg',
      cached: false,
      costUsd: 0.00135,
    });
    expect(result.artifact.images[0]?.dataUri.startsWith('data:image/svg+xml')).toBe(
      true,
    );
    expect(result.artifact.subjects[0]).toMatchObject({
      reference: 'subject/wifi-router',
      source: 'deepseek-svg',
      tier: 'provider',
    });
    expect(result.artifact.providerRequests).toBe(1);
    expect(result.artifact.costUsd).toBe(0.00135);

    expect(usage.entries).toHaveLength(1);
    expect(usage.entries[0]).toMatchObject({
      provider: 'deepseek-svg',
      source: 'worker',
      runId: RUN_ID,
      costUsd: 0.00135,
    });
    expect(assets.blobStore.objectKeys()).toHaveLength(1);
    expect(await assets.repository.listByStyle(STYLE.styleId)).toHaveLength(1);
  });

  it('serves a repeated subject from cache without a second paid call', async () => {
    const { provider, usage, client } = deepseek();
    const assets = runtime({ provider });
    const args = {
      subjects: [subject()],
      style: STYLE,
      runtime: assets,
      runId: RUN_ID,
      logger: logger(),
    };

    await resolveEpisodeSubjectAssets(args);
    const second = await resolveEpisodeSubjectAssets(args);

    expect(client.calls).toBe(1);
    expect(usage.entries).toHaveLength(1);
    expect(second.artifact.providerRequests).toBe(0);
    expect(second.artifact.cacheHits).toBe(1);
    expect(second.artifact.images[0]).toMatchObject({
      tier: 'cache',
      cached: true,
      costUsd: null,
    });
    expect(second.artifact.costUsd).toBe(0);
  });

  it('degrades a failed slot to Tier 0 and keeps the rest of the run', async () => {
    const { provider, usage } = deepseek({ simulateFailure: 'unavailable' });
    const assets = runtime({ provider });

    const result = await resolveEpisodeSubjectAssets({
      subjects: [subject()],
      style: STYLE,
      runtime: assets,
      runId: RUN_ID,
      logger: logger(),
    });

    expect(result.artifact.images).toHaveLength(0);
    expect(result.artifact.skipped).toBe(1);
    expect(result.artifact.subjects[0]).toMatchObject({
      source: 'tier0',
      tier: 'starter',
      provider: null,
    });
    expect(
      result.artifact.subjects[0]?.diagnostics.map((item) => item.code),
    ).toEqual(['provider_failed', 'fallback_used']);
    expect(usage.entries).toHaveLength(0);
  });

  it('fails the stage when a generated slot has no fallbackIcon', async () => {
    const { provider } = deepseek({ simulateFailure: 'unavailable' });
    const assets = runtime({ provider });

    await expect(
      resolveEpisodeSubjectAssets({
        subjects: [subject({ fallbackKey: null })],
        style: STYLE,
        runtime: assets,
        runId: RUN_ID,
        logger: logger(),
      }),
    ).rejects.toThrow('subject/wifi-router');
  });

  it('stops generation when the run budget is reached', async () => {
    const { provider, client } = deepseek();
    const assets = runtime({ provider, maxUsdPerRun: 0.001 });

    const result = await resolveEpisodeSubjectAssets({
      subjects: [
        subject(),
        subject({
          sceneId: 'beat',
          sceneIdx: 1,
          reference: 'subject/water-drop',
        }),
      ],
      style: STYLE,
      runtime: assets,
      runId: RUN_ID,
      logger: logger(),
    });

    expect(client.calls).toBe(1);
    expect(result.artifact.images).toHaveLength(1);
    expect(result.artifact.skipped).toBe(1);
    expect(result.artifact.providerDisabledByBudget).toBe(true);
    expect(result.artifact.subjects[1]).toMatchObject({
      reference: 'subject/water-drop',
      source: 'tier0',
      tier: 'starter',
    });
    expect(result.artifact.subjects[1]?.diagnostics[0]?.code).toBe(
      'provider_disabled_by_budget',
    );
  });

  it('leaves starter references on Tier 0 without calling the provider', async () => {
    const fake = createFakeImageProvider();
    const assets = runtime({ provider: fake });

    const result = await resolveEpisodeSubjectAssets({
      subjects: [
        subject({
          reference: 'assets/starter/brick.svg',
          generated: false,
          prompt: null,
          fallbackKey: null,
        }),
      ],
      style: STYLE,
      runtime: assets,
      runId: RUN_ID,
      logger: logger(),
    });

    expect(fake.calls).toHaveLength(0);
    expect(result.artifact.images).toHaveLength(0);
    expect(result.artifact.subjects[0]).toMatchObject({
      source: 'tier0',
      tier: 'starter',
    });
    expect(result.artifact.subjects[0]?.diagnostics[0]?.code).toBe('starter_hit');
  });

  it('rejects a runtime that was not configured for deepseek-svg', async () => {
    const assets = runtime({ provider: createFakeImageProvider() });

    await expect(
      resolveEpisodeSubjectAssets({
        subjects: [subject()],
        style: STYLE,
        runtime: { ...assets, source: 'pixabay' },
        runId: RUN_ID,
        logger: logger(),
      }),
    ).rejects.toThrow('deepseek-svg');
  });

  it('reports an explicit error when the provider is not configured', async () => {
    const assets = runtime({ provider: null });

    await expect(
      resolveEpisodeSubjectAssets({
        subjects: [subject()],
        style: STYLE,
        runtime: {
          ...assets,
          unavailableReason: 'DEEPSEEK_API_KEY не задан',
        },
        runId: RUN_ID,
        logger: logger(),
      }),
    ).rejects.toThrow('DEEPSEEK_API_KEY');
  });
});
