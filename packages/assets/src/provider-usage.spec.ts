import type { ProviderUsageEntry } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { createFakeImageProvider } from './provider-fake.js';
import { recordingImageProvider } from './provider-usage.js';

function collectingWriter(entries: ProviderUsageEntry[]) {
  return {
    async record(entry: ProviderUsageEntry): Promise<void> {
      entries.push(entry);
    },
  };
}

const REQUEST = {
  key: 'subject/robot',
  prompt: 'flat robot',
  kind: 'svg',
  styleId: 'studio_flat_2d_v1',
  tags: ['robot'],
} as const;

describe('recordingImageProvider', () => {
  it('writes exactly one ledger row per call with the measured cost', async () => {
    const entries: ProviderUsageEntry[] = [];
    const provider = recordingImageProvider(createFakeImageProvider(), {
      writer: collectingWriter(entries),
      source: 'cli',
    });

    const result = await provider.generate(REQUEST);

    expect(result.costUsd).toBe(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      provider: 'fake',
      operation: 'image.generate',
      model: 'fake-flat-v1',
      runId: null,
      source: 'cli',
      units: null,
      costUsd: 0,
      meta: {
        assetKey: 'subject/robot',
        kind: 'svg',
        styleId: 'studio_flat_2d_v1',
      },
    });
  });

  it('keeps an unmeasured cost as null, never zero', async () => {
    const entries: ProviderUsageEntry[] = [];
    const fake = createFakeImageProvider();
    const provider = recordingImageProvider(
      {
        ...fake,
        generate: async () => ({
          ...(await fake.generate(REQUEST)),
          costUsd: null,
        }),
      },
      { writer: collectingWriter(entries), source: 'assets', runId: null },
    );

    await provider.generate(REQUEST);

    expect(entries[0]?.costUsd).toBeNull();
  });

  it('writes nothing when the provider is disabled and never called', async () => {
    const entries: ProviderUsageEntry[] = [];
    const provider = recordingImageProvider(
      createFakeImageProvider({ enabled: false }),
      { writer: collectingWriter(entries), source: 'assets' },
    );

    expect(provider.enabled).toBe(false);
    expect(provider.supports('svg')).toBe(true);
    expect(entries).toHaveLength(0);
  });

  it('propagates a writer failure instead of losing the spend', async () => {
    const provider = recordingImageProvider(createFakeImageProvider(), {
      writer: {
        async record(): Promise<void> {
          throw new Error('ledger is down');
        },
      },
      source: 'cli',
    });

    await expect(provider.generate(REQUEST)).rejects.toThrow(/ledger is down/);
  });
});
