import { readFile } from 'node:fs/promises';
import { artifacts, createDatabase, runs } from '@kadence/db';
import { ObjectStorage, buildArtifactKey } from '@kadence/storage';
import { config as loadEnv } from 'dotenv';
import { desc, eq } from 'drizzle-orm';

loadEnv({ path: '../../.env', quiet: true });

const filePath = process.argv[2] ?? 'C:/Temp/opencode/script-spike/draft.mp4';

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} не задан в .env`);
  }

  return value;
}

async function main(): Promise<void> {
  const { db, pool } = createDatabase(requireEnv('DATABASE_URL'));
  const storage = new ObjectStorage({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: requireEnv('S3_REGION'),
    bucket: requireEnv('S3_BUCKET'),
    accessKeyId: requireEnv('S3_ACCESS_KEY'),
    secretAccessKey: requireEnv('S3_SECRET_KEY'),
    forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] !== 'false',
  });

  try {
    const [run] = await db
      .select({ id: runs.id, topic: runs.topic })
      .from(runs)
      .orderBy(desc(runs.createdAt))
      .limit(1);

    if (!run) {
      throw new Error('В БД нет ни одного run: создайте его через API');
    }

    const body = await readFile(filePath);
    const key = buildArtifactKey(run.id, 'render', 'draft.mp4');

    console.log(`run: ${run.id} (${run.topic})`);
    console.log(`file: ${filePath} (${body.byteLength} bytes)`);
    console.log(`key: ${key}`);

    await storage.putObject(key, body, 'video/mp4');

    const [existing] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(eq(artifacts.objectKey, key))
      .limit(1);

    if (existing) {
      console.log(`artifact: уже записан (${existing.id}), объект перезаписан`);
    } else {
      const [inserted] = await db
        .insert(artifacts)
        .values({
          runId: run.id,
          stage: 'render',
          type: 'draft_mp4',
          objectKey: key,
          contentType: 'video/mp4',
          sizeBytes: body.byteLength,
          meta: { source: 'storage-spike', file: 'draft.mp4' },
        })
        .returning({ id: artifacts.id });

      console.log(`artifact: записан (${inserted?.id})`);
    }

    const url = await storage.presignGet(key);
    const head = await fetch(url, { method: 'HEAD' });

    console.log(`presigned: ${head.status} ${head.headers.get('content-length')} bytes`);

    const downloaded = await storage.getObject(key);
    console.log(
      `roundtrip: ${downloaded.byteLength === body.byteLength ? 'ok' : 'MISMATCH'} (${downloaded.byteLength} bytes)`,
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
