import { describe, expect, it } from 'vitest';
import {
  planAssetPrune,
  pruneAssetObjects,
  type AssetPruneIndex,
  type AssetPruneStorage,
} from './prune.js';

interface FakeStorage extends AssetPruneStorage {
  readonly keys: Set<string>;
  readonly deleted: string[];
  readonly listCalls: string[];
}

function storageWith(keys: readonly string[]): FakeStorage {
  const state = new Set(keys);
  const deleted: string[] = [];
  const listCalls: string[] = [];

  return {
    keys: state,
    deleted,
    listCalls,
    async listKeys(prefix: string): Promise<readonly string[]> {
      listCalls.push(prefix);

      return [...state].filter((key) => key.startsWith(prefix)).sort();
    },
    async deleteObject(key: string): Promise<void> {
      deleted.push(key);
      state.delete(key);
    },
  };
}

function indexWith(keys: readonly string[]): AssetPruneIndex {
  return {
    async listObjectKeys(): Promise<readonly string[]> {
      return [...keys];
    },
  };
}

const KEPT = 'assets/aa/aaaa1111/aaaa1111.svg';
const ORPHAN = 'assets/bb/bbbb2222/bbbb2222.svg';
const OTHER_PREFIX = 'runs/run-1/render/draft.mp4';

describe('asset prune', () => {
  it('plans orphans without touching storage', async () => {
    const storage = storageWith([KEPT, ORPHAN, OTHER_PREFIX]);
    const plan = await planAssetPrune(storage, indexWith([KEPT]));

    expect(plan).toEqual({
      prefix: 'assets/',
      scanned: 2,
      referenced: 1,
      orphans: [ORPHAN],
    });
    expect(storage.deleted).toEqual([]);
    expect(storage.keys.has(ORPHAN)).toBe(true);
  });

  it('is a dry-run by default', async () => {
    const storage = storageWith([KEPT, ORPHAN]);
    const result = await pruneAssetObjects(storage, indexWith([KEPT]));

    expect(result.dryRun).toBe(true);
    expect(result.orphans).toEqual([ORPHAN]);
    expect(result.deleted).toEqual([]);
    expect(storage.keys.size).toBe(2);
  });

  it('deletes only objects without a row', async () => {
    const storage = storageWith([KEPT, ORPHAN]);
    const result = await pruneAssetObjects(storage, indexWith([KEPT]), {
      dryRun: false,
    });

    expect(result.deleted).toEqual([ORPHAN]);
    expect(storage.deleted).toEqual([ORPHAN]);
    expect(storage.keys.has(KEPT)).toBe(true);
    expect(storage.keys.has(ORPHAN)).toBe(false);
  });

  it('never deletes a referenced object, even with a stale hash in the key', async () => {
    const staleButReferenced = 'assets/cc/00000000/00000000.svg';
    const storage = storageWith([staleButReferenced]);
    const result = await pruneAssetObjects(storage, indexWith([staleButReferenced]), {
      dryRun: false,
    });

    expect(result.orphans).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(storage.keys.has(staleButReferenced)).toBe(true);
  });

  it('only scans the requested prefix', async () => {
    const storage = storageWith([KEPT, ORPHAN, OTHER_PREFIX]);

    await expect(
      pruneAssetObjects(storage, indexWith([KEPT]), { prefix: 'runs/' }),
    ).resolves.toEqual({
      prefix: 'runs/',
      scanned: 1,
      referenced: 0,
      orphans: [OTHER_PREFIX],
      dryRun: true,
      deleted: [],
    });
  });

  it('is idempotent: the second pass has nothing left to delete', async () => {
    const storage = storageWith([KEPT, ORPHAN]);
    const index = indexWith([KEPT]);

    await pruneAssetObjects(storage, index, { dryRun: false });
    const second = await pruneAssetObjects(storage, index, { dryRun: false });

    expect(second.orphans).toEqual([]);
    expect(second.deleted).toEqual([]);
    expect(storage.deleted).toEqual([ORPHAN]);
  });
});
