/**
 * Orphan sweep for the Asset Library (M3.6b.8).
 *
 * A content-addressed object is reachable only through an `asset_variants`
 * row. Bytes without a row are leftovers from older runs: they cost storage,
 * show up in audits and can be mistaken for a working cache entry.
 *
 * The rule is deliberately one-sided: an object is deleted **only** when no row
 * references it. A row whose object is missing is a library bug and is never
 * "fixed" by deleting the row or the object here.
 */

export interface AssetPruneStorage {
  listKeys(prefix: string): Promise<readonly string[]>;
  deleteObject(key: string): Promise<void>;
}

export interface AssetPruneIndex {
  /** Every `asset_variants.object_key` currently stored in Postgres. */
  listObjectKeys(): Promise<readonly string[]>;
}

export interface AssetPruneOptions {
  /** Only objects under this prefix are candidates. Defaults to `assets/`. */
  readonly prefix?: string;
  /** `true` (default in the CLI) reports without deleting anything. */
  readonly dryRun?: boolean;
}

export interface AssetPrunePlan {
  readonly prefix: string;
  readonly scanned: number;
  readonly referenced: number;
  readonly orphans: readonly string[];
}

export interface AssetPruneResult extends AssetPrunePlan {
  readonly dryRun: boolean;
  readonly deleted: readonly string[];
}

export const DEFAULT_ASSET_PRUNE_PREFIX = 'assets/';

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Read-only pass: objects under `prefix` minus keys referenced by a row.
 * Referenced keys outside the prefix cannot be scanned and are simply ignored.
 */
export async function planAssetPrune(
  storage: AssetPruneStorage,
  index: AssetPruneIndex,
  prefix: string = DEFAULT_ASSET_PRUNE_PREFIX,
): Promise<AssetPrunePlan> {
  const objects = uniqueSorted(
    (await storage.listKeys(prefix)).filter((key) => key.startsWith(prefix)),
  );
  const referenced = new Set(await index.listObjectKeys());
  const orphans = objects.filter((key) => !referenced.has(key));

  return {
    prefix,
    scanned: objects.length,
    referenced: objects.length - orphans.length,
    orphans,
  };
}

/**
 * Apply the plan. Deletion is sequential on purpose: a failure names the exact
 * key, and a partial sweep can be re-run safely (a second pass recomputes the
 * orphan list from the same two sources).
 */
export async function pruneAssetObjects(
  storage: AssetPruneStorage,
  index: AssetPruneIndex,
  options: AssetPruneOptions = {},
): Promise<AssetPruneResult> {
  const dryRun = options.dryRun ?? true;
  const plan = await planAssetPrune(
    storage,
    index,
    options.prefix ?? DEFAULT_ASSET_PRUNE_PREFIX,
  );

  if (dryRun) {
    return { ...plan, dryRun, deleted: [] };
  }

  const deleted: string[] = [];

  for (const key of plan.orphans) {
    await storage.deleteObject(key);
    deleted.push(key);
  }

  return { ...plan, dryRun, deleted };
}
