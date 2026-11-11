import { DrizzleAssetRepository, createDatabase } from '@peertoreel/db';
import {
  ObjectStorage,
  S3AssetBlobStore,
  parseAssetPersistenceEnv,
} from '@peertoreel/storage';
import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAssetImport } from './import-runner.js';

/**
 * `assets:import` — idempotent seed of the curated Tier 0 starter pack into
 * Postgres + object storage (M3.6a.1).
 *
 * Tier 0 is authored and pre-normalized (ADR-0017 D5), so bytes are stored
 * as-is under their content-addressed key. A second run uploads nothing and
 * creates no rows: deduplication is by SHA-256, not by file name.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

loadEnv({ path: path.join(REPO_ROOT, '.env'), quiet: true });

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );

  if (inline !== undefined) {
    const value = inline.slice(name.length + 1);

    if (value.length === 0) {
      throw new Error(`Опция ${name} требует значения`);
    }

    return value;
  }

  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Опция ${name} требует значения`);
  }

  return value;
}

async function main(): Promise<void> {
  const publicDir = path.resolve(
    REPO_ROOT,
    optionValue('--public') ?? 'apps/render-worker/public',
  );
  const env = parseAssetPersistenceEnv(process.env);
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
  const blobStore = new S3AssetBlobStore(storage);

  try {
    console.log(`Tier 0 из ${publicDir}`);

    const summary = await runAssetImport({
      repository,
      blobStore,
      readContent: (objectKey) =>
        readFile(path.join(publicDir, objectKey), 'utf8'),
      readBytes: (objectKey) => readFile(path.join(publicDir, objectKey)),
    });

    for (const entry of summary.entries) {
      console.log(
        `${entry.status === 'added' ? '+' : '='} ${entry.key} ${entry.contentHash.slice(0, 12)}`,
      );
      console.log(`  ${entry.objectKey}`);
    }

    console.log(
      `\nИтог: добавлено ${summary.added}, уже было ${summary.existing}, всего ${summary.entries.length}`,
    );
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
