import { artifacts, type Database } from '@kadence/db';
import type { RunStage } from '@kadence/contracts';

export interface SaveArtifactInput {
  runId: string;
  stage: RunStage;
  type: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  meta?: Record<string, unknown>;
}

export interface SavedArtifact {
  id: string;
  type: string;
  objectKey: string;
  sizeBytes: number;
}

/**
 * One row per object key: re-running a stage overwrites the object and keeps the
 * same artifact row, so a retry never duplicates files.
 */
export async function saveArtifact(
  db: Database,
  input: SaveArtifactInput,
): Promise<SavedArtifact> {
  const [row] = await db
    .insert(artifacts)
    .values({
      runId: input.runId,
      stage: input.stage,
      type: input.type,
      objectKey: input.objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      meta: input.meta ?? {},
    })
    .onConflictDoUpdate({
      target: artifacts.objectKey,
      set: {
        sizeBytes: input.sizeBytes,
        contentType: input.contentType,
        meta: input.meta ?? {},
        createdAt: new Date(),
      },
    })
    .returning({
      id: artifacts.id,
      type: artifacts.type,
      objectKey: artifacts.objectKey,
      sizeBytes: artifacts.sizeBytes,
    });

  if (!row) {
    throw new Error(`Не удалось сохранить артефакт ${input.objectKey}`);
  }

  return row;
}
