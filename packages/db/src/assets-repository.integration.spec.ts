import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { buildAssetId, type AssetRecord } from '@peertoreel/contracts';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleAssetRepository } from './assets-repository.js';
import { createDatabase, type DatabaseHandle } from './client.js';
import { assetVariants, assets } from './schema.js';

/**
 * Integration coverage for the Drizzle adapter: real Postgres, real unique
 * constraints, no network beyond the container image. Skipped when Docker is
 * unavailable so `pnpm check` still runs on a machine without a daemon.
 */

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../apps/api/drizzle', import.meta.url),
);
const STYLE_ID = 'studio_flat_2d_v1';

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: 'ignore',
      timeout: 10_000,
    });

    return true;
  } catch {
    return false;
  }
}

const docker = dockerAvailable();

function recordOf(overrides: Partial<AssetRecord> = {}): AssetRecord {
  const hash = overrides.contentHash ?? 'a'.repeat(64);
  const source = overrides.source ?? 'starter';
  const key = overrides.key ?? 'ball';

  return {
    id: buildAssetId(source, key),
    key,
    source,
    kind: 'svg',
    styleId: STYLE_ID,
    contentHash: hash,
    tags: ['ball', 'circle'],
    license: { name: 'authored', commercialUse: true },
    variants: [
      {
        id: 'default',
        objectKey: `assets/aa/${hash}/${hash}.svg`,
        mimeType: 'image/svg+xml',
        width: 256,
        height: 256,
        contentHash: hash,
      },
    ],
    metadata: { localPath: 'assets/starter/ball.svg' },
    ...overrides,
  };
}

describe.skipIf(!docker)('DrizzleAssetRepository (Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let handle: DatabaseHandle;
  let repository: DrizzleAssetRepository;

  async function counts(): Promise<{ assets: number; variants: number }> {
    const assetRows = await handle.db.select().from(assets);
    const variantRows = await handle.db.select().from(assetVariants);

    return { assets: assetRows.length, variants: variantRows.length };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    handle = createDatabase(container.getConnectionUri());
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR });
    repository = new DrizzleAssetRepository(handle.db);
  }, 180_000);

  beforeEach(async () => {
    // Every case owns a clean library; assertions never depend on test order.
    await handle.db.delete(assets);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await container?.stop();
  }, 120_000);

  it('round-trips a record with variants', async () => {
    const record = recordOf();

    await repository.save(record);

    expect(await repository.findByKey('ball', STYLE_ID)).toEqual(record);
    expect(await repository.findByContentHash(record.contentHash)).toEqual(
      record,
    );
    expect(await repository.listByStyle(STYLE_ID)).toEqual([record]);
    expect(await repository.findByKey('missing', STYLE_ID)).toBeNull();
  });

  it('is idempotent: saving the same record twice keeps one row', async () => {
    const record = recordOf({
      key: 'idempotent',
      contentHash: 'b'.repeat(64),
    });

    await repository.save(record);
    await repository.save(record);
    await repository.save({ ...record, tags: [...record.tags] });

    expect(await repository.listByStyle(STYLE_ID)).toHaveLength(1);
    expect(await counts()).toEqual({ assets: 1, variants: 1 });
  });

  it('updates the row when the same (key, style) is re-normalized', async () => {
    const before = '2'.repeat(64);
    const next = '3'.repeat(64);

    await repository.save(recordOf({ key: 'renormalized', contentHash: before }));

    const updated = await repository.save(
      recordOf({
        key: 'renormalized',
        contentHash: next,
        variants: [
          {
            id: 'default',
            objectKey: `assets/33/${next}/${next}.svg`,
            mimeType: 'image/svg+xml',
            width: 256,
            height: 256,
            contentHash: next,
          },
        ],
      }),
    );

    expect(updated.contentHash).toBe(next);
    expect(
      (await repository.findByKey('renormalized', STYLE_ID))?.contentHash,
    ).toBe(next);
    expect(await repository.findByContentHash(before)).toBeNull();
  });

  it('deletes variants that are no longer part of the record', async () => {
    await repository.save(
      recordOf({
        key: 'variants',
        contentHash: 'd'.repeat(64),
        variants: [
          {
            id: 'default',
            objectKey: 'assets/dd/default.svg',
            mimeType: 'image/svg+xml',
            width: 256,
            height: 256,
            contentHash: 'd'.repeat(64),
          },
          {
            id: 'outline',
            objectKey: 'assets/dd/outline.svg',
            mimeType: 'image/svg+xml',
            width: 128,
            height: 128,
            contentHash: 'e'.repeat(64),
          },
        ],
      }),
    );

    const updated = await repository.save(
      recordOf({
        key: 'variants',
        contentHash: 'd'.repeat(64),
        variants: [
          {
            id: 'default',
            objectKey: 'assets/dd/default.svg',
            mimeType: 'image/svg+xml',
            width: 256,
            height: 256,
            contentHash: 'd'.repeat(64),
          },
        ],
      }),
    );

    expect(updated.variants.map((variant) => variant.id)).toEqual(['default']);

    const rows = await handle.db.select().from(assetVariants);
    const owned = rows.filter(
      (row) => row.objectKey === 'assets/dd/outline.svg',
    );

    expect(owned).toHaveLength(0);
  });

  it('surfaces the content-hash unique constraint', async () => {
    const hash = 'f'.repeat(64);

    await repository.save(recordOf({ key: 'owner', contentHash: hash }));

    await expect(
      repository.save(recordOf({ key: 'intruder', contentHash: hash })),
    ).rejects.toThrow(/content_hash/);
  });

  it('surfaces the commercial-use check constraint', async () => {
    await expect(
      repository.save(
        recordOf({
          key: 'non-commercial',
          contentHash: '1'.repeat(64),
          license: { name: 'CC-BY-NC-4.0', commercialUse: false },
        }),
      ),
    ).rejects.toThrow(/commercial_use/);
  });
});
