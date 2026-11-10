import { describe, expect, it } from 'vitest';
import { isSha256Hex, sha256Hex } from './content-hash.js';
import { InMemoryAssetRepository } from './repository.js';
import { buildStarterAssets } from './starter.js';

const STARTER_CONTENT: Record<string, string> = {
  'assets/starter/brick.svg': '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
  'assets/starter/house.svg': '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>',
};

const STARTER_INPUTS = [
  { key: 'brick', objectKey: 'assets/starter/brick.svg', tags: ['brick'] },
  { key: 'house', objectKey: 'assets/starter/house.svg', tags: ['house'] },
];

async function starterRecords() {
  return buildStarterAssets(
    async (objectKey) => STARTER_CONTENT[objectKey] ?? '',
    'studio_flat_2d_v1',
    STARTER_INPUTS,
  );
}

describe('sha256 content hash', () => {
  it('hashes strings and bytes identically', () => {
    const text = 'peertoreel';

    expect(sha256Hex(text)).toBe(
      '6c3fdfb052635e02c799fd2f15aa07767f469646ee73d42ab50ab22055c4ff94',
    );
    expect(sha256Hex(Buffer.from(text, 'utf8'))).toBe(sha256Hex(text));
    expect(isSha256Hex(sha256Hex(text))).toBe(true);
  });

  it('produces a stable lowercase digest', () => {
    const hash = sha256Hex('brick');

    expect(isSha256Hex(hash)).toBe(true);
    expect(sha256Hex('brick')).toBe(hash);
    expect(sha256Hex('brick ')).not.toBe(hash);
  });
});

describe('content-hash deduplication', () => {
  it('gives identical bytes the same hash across records', async () => {
    const records = await starterRecords();
    const [brick, house] = records;

    expect(brick?.contentHash).toBe(sha256Hex(STARTER_CONTENT['assets/starter/brick.svg']!));
    expect(house?.contentHash).not.toBe(brick?.contentHash);
  });

  it('collapses byte-identical records on save', async () => {
    const repository = new InMemoryAssetRepository();
    const [brick] = await starterRecords();

    if (brick === undefined) {
      throw new Error('expected a starter record');
    }

    const first = await repository.save(brick);
    const duplicate = await repository.save({
      ...brick,
      id: 'library/brick-copy',
      key: 'brick-copy',
    });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.key).toBe('brick');
    expect(await repository.listByStyle('studio_flat_2d_v1')).toHaveLength(1);
  });

  it('returns cloned records so callers cannot mutate the store', async () => {
    const repository = new InMemoryAssetRepository();
    const [brick] = await starterRecords();

    if (brick === undefined) {
      throw new Error('expected a starter record');
    }

    await repository.save(brick);

    const found = await repository.findByKey('brick', 'studio_flat_2d_v1');

    if (found === null) {
      throw new Error('expected a saved record');
    }

    found.tags.push('mutated');

    const again = await repository.findByKey('brick', 'studio_flat_2d_v1');

    expect(again?.tags).toEqual(['brick']);
  });
});
