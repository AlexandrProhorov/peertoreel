import { Injectable } from '@nestjs/common';
import { artifacts } from '@kadence/db';
import type { RunStage } from '@kadence/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';

export interface ArtifactRecord {
  id: string;
  stage: RunStage;
  type: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

@Injectable()
export class ArtifactsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listByRun(runId: string): Promise<ArtifactRecord[]> {
    return this.database.db
      .select({
        id: artifacts.id,
        stage: artifacts.stage,
        type: artifacts.type,
        objectKey: artifacts.objectKey,
        contentType: artifacts.contentType,
        sizeBytes: artifacts.sizeBytes,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .where(eq(artifacts.runId, runId))
      .orderBy(desc(artifacts.createdAt));
  }

  async findByType(
    runId: string,
    type: string,
  ): Promise<ArtifactRecord | null> {
    const [row] = await this.database.db
      .select({
        id: artifacts.id,
        stage: artifacts.stage,
        type: artifacts.type,
        objectKey: artifacts.objectKey,
        contentType: artifacts.contentType,
        sizeBytes: artifacts.sizeBytes,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .where(and(eq(artifacts.runId, runId), eq(artifacts.type, type)))
      .limit(1);

    return row ?? null;
  }
}
