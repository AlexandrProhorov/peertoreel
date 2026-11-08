import { artifacts, type Database } from '@peertoreel/db';
import { eq } from 'drizzle-orm';

/** Removes the registry row after the S3 object has been deleted. */
export async function deleteArtifactByObjectKey(
  db: Database,
  objectKey: string,
): Promise<void> {
  await db.delete(artifacts).where(eq(artifacts.objectKey, objectKey));
}
