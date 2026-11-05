import { artifacts, type Database } from '@kadence/db';
import type { ObjectStorage } from '@kadence/storage';
import { and, eq } from 'drizzle-orm';

export async function findArtifactObjectKey(
  db: Database,
  runId: string,
  type: string,
): Promise<string | null> {
  const [row] = await db
    .select({ objectKey: artifacts.objectKey })
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, type)))
    .limit(1);

  return row?.objectKey ?? null;
}

export async function loadArtifactBuffer(
  db: Database,
  storage: ObjectStorage,
  runId: string,
  type: string,
): Promise<Buffer> {
  const objectKey = await findArtifactObjectKey(db, runId, type);

  if (!objectKey) {
    throw new Error(
      `У run ${runId} нет артефакта ${type} — предыдущая стадия не завершена`,
    );
  }

  return Buffer.from(await storage.getObject(objectKey));
}
