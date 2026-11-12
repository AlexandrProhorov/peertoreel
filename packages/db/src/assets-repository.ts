import {
  assetAliasSchema,
  assetRecordSchema,
  buildAssetId,
  type AssetAlias,
  type AssetLicense,
  type AssetRecord,
  type AssetVariant,
} from '@peertoreel/contracts';
import type { AssetRepository } from '@peertoreel/assets';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Database } from './client.js';
import { assetAliases, assetVariants, assets } from './schema.js';

/**
 * Postgres adapter for the Asset Library repository port (ADR-0017 D2/D10).
 *
 * `packages/assets` stays Drizzle-free: only the interface is referenced, and
 * only through `import type`. The contract `AssetRecord.id` has no column — it
 * is rebuilt from `source + key` by `buildAssetId`, exactly like the in-memory
 * fake (ADR-0017 D2).
 */

export type AssetRow = typeof assets.$inferSelect;
export type AssetVariantRow = typeof assetVariants.$inferSelect;

export interface AssetRowValues {
  key: string;
  source: AssetRow['source'];
  kind: AssetRow['kind'];
  styleId: string;
  contentHash: string;
  tags: string[];
  licenseName: string;
  commercialUse: boolean;
  attribution: string | null;
  metadata: Record<string, unknown>;
}

export interface AssetVariantRowValues {
  variantId: string;
  objectKey: string;
  mimeType: string;
  width: number;
  height: number;
  contentHash: string;
}

export function assetRowValues(record: AssetRecord): AssetRowValues {
  return {
    key: record.key,
    source: record.source,
    kind: record.kind,
    styleId: record.styleId,
    contentHash: record.contentHash,
    tags: [...record.tags],
    licenseName: record.license.name,
    commercialUse: record.license.commercialUse,
    attribution: record.license.attribution ?? null,
    metadata: { ...record.metadata },
  };
}

export function assetVariantRowValues(
  variant: AssetVariant,
): AssetVariantRowValues {
  return {
    variantId: variant.id,
    objectKey: variant.objectKey,
    mimeType: variant.mimeType,
    width: variant.width,
    height: variant.height,
    contentHash: variant.contentHash,
  };
}

function licenseFromRow(row: AssetRow): AssetLicense {
  return row.attribution === null
    ? { name: row.licenseName, commercialUse: row.commercialUse }
    : {
        name: row.licenseName,
        commercialUse: row.commercialUse,
        attribution: row.attribution,
      };
}

/** `default` first, then code-unit order: the read result never depends on row order. */
function orderedVariants(
  rows: readonly AssetVariantRow[],
): readonly AssetVariantRow[] {
  return [...rows].sort((left, right) => {
    const leftDefault = left.variantId === 'default' ? 0 : 1;
    const rightDefault = right.variantId === 'default' ? 0 : 1;

    if (leftDefault !== rightDefault) {
      return leftDefault - rightDefault;
    }

    return left.variantId < right.variantId
      ? -1
      : left.variantId > right.variantId
        ? 1
        : 0;
  });
}

function variantFromRow(row: AssetVariantRow): AssetVariant {
  return {
    id: row.variantId,
    objectKey: row.objectKey,
    // The column is `text`; `toAssetRecord` validates it against the contract.
    mimeType: row.mimeType as AssetVariant['mimeType'],
    width: row.width,
    height: row.height,
    contentHash: row.contentHash,
  };
}

/**
 * Row → contract. A row that breaks the schema (bad mime type, empty variant
 * list, non-commercial licence) throws with the asset key instead of silently
 * degrading: a bad library row must be visible, not become a fallback.
 */
export function toAssetRecord(
  assetRow: AssetRow,
  variantRows: readonly AssetVariantRow[],
): AssetRecord {
  const candidate = {
    id: buildAssetId(assetRow.source, assetRow.key),
    key: assetRow.key,
    source: assetRow.source,
    kind: assetRow.kind,
    styleId: assetRow.styleId,
    contentHash: assetRow.contentHash,
    tags: assetRow.tags,
    license: licenseFromRow(assetRow),
    variants: orderedVariants(variantRows).map(variantFromRow),
    metadata: assetRow.metadata,
  };
  const parsed = assetRecordSchema.safeParse(candidate);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
      .join('; ');

    throw new Error(
      `Asset row "${assetRow.source}/${assetRow.key}" does not satisfy the contract: ${details}`,
    );
  }

  return parsed.data;
}

export class DrizzleAssetRepository implements AssetRepository {
  constructor(private readonly db: Database) {}

  async findByKey(key: string, styleId: string): Promise<AssetRecord | null> {
    const [row] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.key, key), eq(assets.styleId, styleId)))
      .limit(1);

    if (row === undefined) {
      return null;
    }

    return toAssetRecord(row, await this.variantsOf(row.id));
  }

  async findByContentHash(contentHash: string): Promise<AssetRecord | null> {
    const [row] = await this.db
      .select()
      .from(assets)
      .where(eq(assets.contentHash, contentHash))
      .limit(1);

    if (row === undefined) {
      return null;
    }

    return toAssetRecord(row, await this.variantsOf(row.id));
  }

  /**
   * Alias lookup (ADR-0017 D3/D11): `(key, style_id)` → owner record by hash.
   * Missing alias or missing bytes both return `null`; an alias must never
   * resurrect a deleted record.
   */
  async findByAlias(key: string, styleId: string): Promise<AssetRecord | null> {
    const [alias] = await this.db
      .select()
      .from(assetAliases)
      .where(
        and(eq(assetAliases.key, key), eq(assetAliases.styleId, styleId)),
      )
      .limit(1);

    if (alias === undefined) {
      return null;
    }

    return this.findByContentHash(alias.contentHash);
  }

  /** Upsert one alias; the same `(key, style_id)` may only point at one hash. */
  async saveAlias(alias: AssetAlias): Promise<void> {
    const parsed = assetAliasSchema.parse(alias);

    await this.db
      .insert(assetAliases)
      .values({
        key: parsed.key,
        styleId: parsed.styleId,
        contentHash: parsed.contentHash,
      })
      .onConflictDoUpdate({
        target: [assetAliases.key, assetAliases.styleId],
        set: { contentHash: parsed.contentHash },
      });
  }

  async listByStyle(styleId: string): Promise<readonly AssetRecord[]> {
    const rows = await this.db
      .select()
      .from(assets)
      .where(eq(assets.styleId, styleId));

    if (rows.length === 0) {
      return [];
    }

    const variantRows = await this.db
      .select()
      .from(assetVariants)
      .where(
        inArray(
          assetVariants.assetId,
          rows.map((row) => row.id),
        ),
      );
    const byAsset = new Map<string, AssetVariantRow[]>();

    for (const variant of variantRows) {
      const bucket = byAsset.get(variant.assetId);

      if (bucket === undefined) {
        byAsset.set(variant.assetId, [variant]);
      } else {
        bucket.push(variant);
      }
    }

    return rows.map((row) => toAssetRecord(row, byAsset.get(row.id) ?? []));
  }

  /**
   * Upsert one logical asset and its variants in a single transaction. The
   * unique keys are `(key, style_id)` and `(asset_id, variant_id)`; variants
   * absent from the record are deleted so re-normalization cannot leave stale
   * bytes addressable. Database errors (unique or check violations) propagate.
   */
  async save(record: AssetRecord): Promise<AssetRecord> {
    if (record.variants.length === 0) {
      throw new Error(`Asset "${record.id}" has no variants to save`);
    }

    const canonicalId = buildAssetId(record.source, record.key);

    if (record.id !== canonicalId) {
      throw new Error(
        `Asset id "${record.id}" is not canonical for ${record.source}/${record.key} ("${canonicalId}")`,
      );
    }

    return this.db.transaction(async (tx) => {
      const values = assetRowValues(record);
      const [row] = await tx
        .insert(assets)
        .values(values)
        .onConflictDoUpdate({
          target: [assets.key, assets.styleId],
          set: {
            source: values.source,
            kind: values.kind,
            contentHash: values.contentHash,
            tags: values.tags,
            licenseName: values.licenseName,
            commercialUse: values.commercialUse,
            attribution: values.attribution,
            metadata: values.metadata,
          },
        })
        .returning();

      if (row === undefined) {
        throw new Error(`Failed to save asset "${record.id}"`);
      }

      for (const variant of record.variants) {
        const variantValues = assetVariantRowValues(variant);

        await tx
          .insert(assetVariants)
          .values({ assetId: row.id, ...variantValues })
          .onConflictDoUpdate({
            target: [assetVariants.assetId, assetVariants.variantId],
            set: {
              objectKey: variantValues.objectKey,
              mimeType: variantValues.mimeType,
              width: variantValues.width,
              height: variantValues.height,
              contentHash: variantValues.contentHash,
            },
          });
      }

      await tx
        .delete(assetVariants)
        .where(
          and(
            eq(assetVariants.assetId, row.id),
            notInArray(
              assetVariants.variantId,
              record.variants.map((variant) => variant.id),
            ),
          ),
        );

      const storedVariants = await tx
        .select()
        .from(assetVariants)
        .where(eq(assetVariants.assetId, row.id));

      return toAssetRecord(row, storedVariants);
    });
  }

  private async variantsOf(
    assetId: string,
  ): Promise<readonly AssetVariantRow[]> {
    return this.db
      .select()
      .from(assetVariants)
      .where(eq(assetVariants.assetId, assetId));
  }
}
