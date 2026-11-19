import type { AssetAlias, AssetRecord } from '@peertoreel/contracts';

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
  /** Alias `(key, styleId)` → owner record; `null` when bytes are gone (D3). */
  findByAlias(key: string, styleId: string): Promise<AssetRecord | null>;
  /** Upsert an alias; a repeated write with the same hash is a no-op. */
  saveAlias(alias: AssetAlias): Promise<void>;
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
  private readonly aliases = new Map<string, string>();

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

  async findByAlias(
    key: string,
    styleId: string,
  ): Promise<AssetRecord | null> {
    const contentHash = this.aliases.get(
      InMemoryAssetRepository.mapKey(key, styleId),
    );

    if (contentHash === undefined) {
      return null;
    }

    return this.findByContentHash(contentHash);
  }

  async saveAlias(alias: AssetAlias): Promise<void> {
    this.aliases.set(
      InMemoryAssetRepository.mapKey(alias.key, alias.styleId),
      alias.contentHash,
    );
  }

  /**
   * Mirrors the SQL upsert: same `(key, styleId)` refreshes metadata in place,
   * the same hash under a different key returns the owner without mutating it,
   * and a new key replaces its own previous bytes.
   */
  async save(record: AssetRecord): Promise<AssetRecord> {
    const sameBytes = this.byHash.get(record.contentHash);

    if (sameBytes !== undefined) {
      const isOwner =
        sameBytes.key === record.key && sameBytes.styleId === record.styleId;

      if (!isOwner) {
        return cloneRecord(sameBytes);
      }

      this.insert(record);

      return cloneRecord(record);
    }

    const previous = this.byKey.get(
      InMemoryAssetRepository.mapKey(record.key, record.styleId),
    );

    if (previous !== undefined && previous.contentHash !== record.contentHash) {
      this.byHash.delete(previous.contentHash);
    }

    this.insert(record);

    return cloneRecord(record);
  }
}
