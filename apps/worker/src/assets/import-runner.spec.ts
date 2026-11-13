import {
  InMemoryAssetBlobStore,
  InMemoryAssetRepository,
} from '@peertoreel/assets';
import { STARTER_ASSET_KEYS } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import { runAssetImport } from './import-runner.js';

const STYLE_ID = 'studio_flat_2d_v1';

function fakeReader(): {
  readContent: (objectKey: string) => Promise<string>;
  readBytes: (objectKey: string) => Promise<Uint8Array>;
} {
  return {
    async readContent(objectKey) {
      return `<svg viewBox="0 0 256 256" data-key="${objectKey}"><circle cx="128" cy="128" r="96" fill="#F59E0B"/></svg>`;
    },
    async readBytes(objectKey) {
      return new TextEncoder().encode(await this.readContent(objectKey));
    },
  };
}

function setup() {
  const repository = new InMemoryAssetRepository();
  const blobStore = new InMemoryAssetBlobStore();
  const reader = fakeReader();

  return {
    repository,
    blobStore,
    run: () =>
      runAssetImport({
        repository,
        blobStore,
        readContent: reader.readContent,
        readBytes: reader.readBytes,
        styleId: STYLE_ID,
      }),
  };
}

describe('runAssetImport', () => {
  it('seeds every starter record and uploads each blob once', async () => {
    const { repository, blobStore, run } = setup();
    const first = await run();

    expect(first.added).toBe(STARTER_ASSET_KEYS.length);
    expect(first.existing).toBe(0);
    expect(blobStore.putCount).toBe(STARTER_ASSET_KEYS.length);
    expect(await repository.listByStyle(STYLE_ID)).toHaveLength(
      STARTER_ASSET_KEYS.length,
    );

    for (const entry of first.entries) {
      expect(entry.status).toBe('added');
      expect(entry.objectKey).toBe(
        `assets/${entry.contentHash.slice(0, 2)}/${entry.contentHash}/${entry.contentHash}.svg`,
      );
    }
  });

  it('is idempotent: a second run adds and uploads nothing', async () => {
    const { repository, blobStore, run } = setup();

    await run();
    const second = await run();

    expect(second.added).toBe(0);
    expect(second.existing).toBe(STARTER_ASSET_KEYS.length);
    expect(blobStore.putCount).toBe(STARTER_ASSET_KEYS.length);
    expect(await repository.listByStyle(STYLE_ID)).toHaveLength(
      STARTER_ASSET_KEYS.length,
    );
  });
});
