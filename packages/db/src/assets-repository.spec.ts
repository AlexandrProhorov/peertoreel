import type { AssetRecord } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  assetRowValues,
  assetVariantRowValues,
  toAssetRecord,
  type AssetRow,
  type AssetVariantRow,
} from './assets-repository.js';

const HASH = 'a'.repeat(64);

const RECORD: AssetRecord = {
  id: 'starter/ball',
  key: 'ball',
  source: 'starter',
  kind: 'svg',
  styleId: 'studio_flat_2d_v1',
  contentHash: HASH,
  tags: ['ball', 'circle'],
  license: { name: 'authored', commercialUse: true },
  variants: [
    {
      id: 'default',
      objectKey: `assets/aa/${HASH}/${HASH}.svg`,
      mimeType: 'image/svg+xml',
      width: 256,
      height: 256,
      contentHash: HASH,
    },
  ],
  metadata: { localPath: 'assets/starter/ball.svg' },
};

function rowOf(record: AssetRecord): AssetRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    ...assetRowValues(record),
    createdAt: new Date('2026-11-11T00:00:00Z'),
  };
}

function variantRowsOf(record: AssetRecord): AssetVariantRow[] {
  return record.variants.map((variant, index) => ({
    id: `00000000-0000-0000-0000-00000000010${index}`,
    assetId: '00000000-0000-0000-0000-000000000001',
    ...assetVariantRowValues(variant),
    createdAt: new Date('2026-11-11T00:00:00Z'),
  }));
}

describe('asset row mapping', () => {
  it('flattens licence, tags and metadata into columns', () => {
    expect(assetRowValues(RECORD)).toEqual({
      key: 'ball',
      source: 'starter',
      kind: 'svg',
      styleId: 'studio_flat_2d_v1',
      contentHash: HASH,
      tags: ['ball', 'circle'],
      licenseName: 'authored',
      commercialUse: true,
      attribution: null,
      metadata: { localPath: 'assets/starter/ball.svg' },
    });
  });

  it('round-trips a full record and rebuilds the id from source + key', () => {
    const restored = toAssetRecord(rowOf(RECORD), variantRowsOf(RECORD));

    expect(restored).toEqual(RECORD);
    expect(restored.id).toBe('starter/ball');
  });

  it('keeps optional attribution only when the column is set', () => {
    const licensed: AssetRecord = {
      ...RECORD,
      source: 'library',
      license: {
        name: 'CC-BY-4.0',
        commercialUse: true,
        attribution: 'Example Studio',
      },
    };
    const restored = toAssetRecord(rowOf(licensed), variantRowsOf(licensed));

    expect(restored.license).toEqual(licensed.license);
    expect(restored.id).toBe('library/ball');
  });

  it('orders variants with `default` first regardless of row order', () => {
    const record: AssetRecord = {
      ...RECORD,
      variants: [
        {
          id: 'outline',
          objectKey: 'assets/bin/outline.svg',
          mimeType: 'image/svg+xml',
          width: 128,
          height: 128,
          contentHash: 'b'.repeat(64),
        },
        RECORD.variants[0]!,
      ],
    };
    const restored = toAssetRecord(
      rowOf(record),
      variantRowsOf(record).reverse(),
    );

    expect(restored.variants.map((variant) => variant.id)).toEqual([
      'default',
      'outline',
    ]);
  });

  it('fails loudly on a row that breaks the contract', () => {
    const row = rowOf(RECORD);
    const variants = variantRowsOf(RECORD).map((variant) => ({
      ...variant,
      mimeType: 'image/gif',
    }));

    expect(() => toAssetRecord(row, variants)).toThrow(
      /does not satisfy the contract/,
    );
  });

  it('fails loudly when a row has no variants', () => {
    expect(() => toAssetRecord(rowOf(RECORD), [])).toThrow(/variants/);
  });
});
