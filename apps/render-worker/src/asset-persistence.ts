import { AssetLibraryService } from '@peertoreel/assets';
import { DrizzleAssetRepository, createDatabase } from '@peertoreel/db';
import {
  ObjectStorage,
  S3AssetBlobStore,
  parseAssetPersistenceEnv,
} from '@peertoreel/storage';

/**
 * Persistence wiring for `render-storyboard --persist` (M3.6a.1).
 *
 * This is the CLI/adapter boundary: scene code never sees Postgres or S3
 * (apps/render-worker AGENTS). A missing variable is a hard error — falling
 * back to the in-memory repository would silently claim persistence.
 */

export interface AssetPersistence {
  readonly repository: DrizzleAssetRepository;
  readonly blobStore: S3AssetBlobStore;
  readonly service: AssetLibraryService;
  close(): Promise<void>;
}

export function createAssetPersistence(
  source: NodeJS.ProcessEnv = process.env,
  options: { urlTtlSec?: number } = {},
): AssetPersistence {
  const env = parseAssetPersistenceEnv(source);
  // Storage first: building it cannot leak a database pool if it throws.
  const storage = new ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const repository = new DrizzleAssetRepository(db);
  const blobStore = new S3AssetBlobStore(storage, options.urlTtlSec);
  const service = new AssetLibraryService({
    repository,
    blobStore,
    urlTtlSec: options.urlTtlSec,
  });

  return {
    repository,
    blobStore,
    service,
    async close() {
      await pool.end();
    },
  };
}
