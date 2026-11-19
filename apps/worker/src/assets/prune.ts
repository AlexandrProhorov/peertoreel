import { pruneAssetObjects } from '@peertoreel/assets';
import { DrizzleAssetRepository, createDatabase } from '@peertoreel/db';
import { ObjectStorage, parseAssetPersistenceEnv } from '@peertoreel/storage';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `assets:prune` — remove objects that no `asset_variants` row references
 * (M3.6b.8). Dry-run by default: `--delete` is the only way to remove bytes.
 *
 * A referenced key is never deleted, even when its hash looks stale; that would
 * turn a library inconsistency into silent data loss. Re-running is safe — the
 * orphan list is recomputed from S3 and Postgres on every pass.
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
  const dryRun = !process.argv.includes('--delete');
  const prefix = optionValue('--prefix') ?? 'assets/';
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

  try {
    const result = await pruneAssetObjects(storage, repository, {
      prefix,
      dryRun,
    });

    console.log(`Префикс: ${result.prefix}`);
    console.log(
      `Объектов: ${result.scanned}, с строкой в БД: ${result.referenced}, сирот: ${result.orphans.length}`,
    );

    for (const key of result.orphans) {
      console.log(`  ${key}`);
    }

    if (dryRun) {
      console.log('\nDry-run: ничего не удалено. Повтори с --delete.');
    } else {
      console.log(`\nУдалено объектов: ${result.deleted.length}.`);
    }
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
