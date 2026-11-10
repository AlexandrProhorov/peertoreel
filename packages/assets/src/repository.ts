import type { AssetRecord } from '@peertoreel/contracts';

/**
 * Persistence port for the asset library (ADR-0017 D2/D3).
 *
 * The resolver never talks to Postgres or R2 directly: the adapter owns that.
 * `InMemoryAssetRepository` is the test double (and the only implementation in
 * M3.6a), so resolver tests need neither Docker nor a network.
 */
export interface AssetRepository {
  /** Exact logical key inside one style preset. */
  findByKey(key: string, styleId: string): Promise<AssetRecord | null>;
  /** Byte identity; the deduplication lookup. */
  findByContentHash(contentHash: string): Promise<AssetRecord | null>;
  /** Candidate pool for deterministic tag matching. */
  listByStyle(styleId: string): Promise<readonly AssetRecord[]>;
  /** Upsert by `(key, styleId)`; byte-identical records collapse into one. */
  save(record: AssetRecord): Promise<AssetRecord>;
}

function cloneRecord(record: AssetRecord): AssetRecord {
  return structuredClone(record);
}

export class InMemoryAssetRepository implements AssetRepository {
  private readonly byKey = new Map<string, AssetRecord>();
  private readonly byHash = new Map<string, AssetRecord>();

  constructor(seed: readonly AssetRecord[] = []) {
    for (const record of seed) {
      this.insert(record);
    }
  }

  private static mapKey(key: string, styleId: string): string {
    return `${styleId}\u0000${key}`;
  }

  private insert(record: AssetRecord): void {
    const stored = cloneRecord(record);

    this.byKey.set(
      InMemoryAssetRepository.mapKey(record.key, record.styleId),
      stored,
    );
    this.byHash.set(record.contentHash, stored);
  }

  async findByKey(key: string, styleId: string): Promise<AssetRecord | null> {
    const record = this.byKey.get(InMemoryAssetRepository.mapKey(key, styleId));

    return record ? cloneRecord(record) : null;
  }

  async findByContentHash(contentHash: string): Promise<AssetRecord | null> {
    const record = this.byHash.get(contentHash);

    return record ? cloneRecord(record) : null;
  }

  async listByStyle(styleId: string): Promise<readonly AssetRecord[]> {
    return [...this.byKey.values()]
      .filter((record) => record.styleId === styleId)
      .map(cloneRecord);
  }

  async save(record: AssetRecord): Promise<AssetRecord> {
    const sameBytes = this.byHash.get(record.contentHash);

    if (sameBytes !== undefined) {
      return cloneRecord(sameBytes);
    }

    this.insert(record);

    return cloneRecord(record);
  }
}
