import { artifacts, publishCards } from '@peertoreel/db';
import {
  PUBLISH_JOB,
  formatHashtags,
  publishJobDataSchema,
  type PublishJobData,
  type StageJobResult,
} from '@peertoreel/contracts';
import { classifyFailReason } from '@peertoreel/tiktok';
import { and, desc, eq } from 'drizzle-orm';
import { UnrecoverableError, type Job } from 'bullmq';
import { loadRun, transitionRun } from '../stages/transition.js';
import type { StageDeps } from '../stages/context.js';
import type { WorkerEnv } from '../config/env.js';
import {
  accessTokenForAccount,
  loadActiveAccount,
} from '../tiktok/account.js';
import { publishVideo } from '../tiktok/publish-video.js';

const JOB_NAME = PUBLISH_JOB;

/**
 * Idempotent TikTok publish. The deterministic job id and `publish_id` on the
 * card make a retry resume the existing post instead of creating a second one.
 */
export async function processPublishStage(
  job: Job<PublishJobData, StageJobResult>,
  deps: StageDeps<WorkerEnv>,
): Promise<StageJobResult> {
  if (job.name !== JOB_NAME) {
    throw new UnrecoverableError(`Unknown publish job: ${job.name}`);
  }

  const { runId } = publishJobDataSchema.parse(job.data);
  const run = await loadRun(deps.db, runId);

  if (run.state === 'PUBLISHED') {
    return {
      runId,
      stage: 'publish',
      state: 'PUBLISHED',
      artifacts: [],
    };
  }

  if (run.state === 'SCHEDULED') {
    await transitionRun(deps.db, runId, 'PUBLISHING', 'TikTok publish');
  } else if (run.state !== 'PUBLISHING') {
    throw new UnrecoverableError(
      `TikTok publish expects SCHEDULED/PUBLISHING, run is ${run.state}`,
    );
  }

  const [card] = await deps.db
    .select()
    .from(publishCards)
    .where(eq(publishCards.runId, runId))
    .limit(1);

  if (!card) {
    throw new UnrecoverableError(`Run ${runId} has no publish card`);
  }

  if (card.state === 'published') {
    await transitionRun(deps.db, runId, 'PUBLISHED', 'TikTok publish');
    return {
      runId,
      stage: 'publish',
      state: 'PUBLISHED',
      artifacts: [],
    };
  }

  if (!card.privacyLevel) {
    throw new UnrecoverableError(
      'Publish card has no privacy level: choose SELF_ONLY in the card',
    );
  }

  const [draft] = await deps.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, 'draft_mp4')))
    .orderBy(desc(artifacts.createdAt))
    .limit(1);

  if (!draft) {
    throw new UnrecoverableError(`Run ${runId} has no draft_mp4 artifact`);
  }

  if (!deps.tiktok) {
    throw new UnrecoverableError(
      'TikTok is not configured: add TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY',
    );
  }

  const account = await loadActiveAccount(
    deps.db,
    run.createdBy,
  ).catch((error: unknown) => {
    throw new UnrecoverableError(
      error instanceof Error ? error.message : 'TikTok account is unavailable',
    );
  });

  const accessToken = await accessTokenForAccount(
    deps.db,
    deps.tiktok,
    account,
  );
  const video = Buffer.from(await deps.storage.getObject(draft.objectKey));
  const title = [card.title, formatHashtags(card.hashtags)]
    .filter((part) => part.length > 0)
    .join(' ');

  const result = await publishVideo({
    api: deps.tiktok.api,
    video,
    title,
    privacy: card.privacyLevel,
    accessToken,
    refreshAccessToken: () =>
      accessTokenForAccount(deps.db, deps.tiktok!, account, true),
    existingPublishId: card.publishId,
    onPublishId: async (publishId) => {
      await deps.db
        .update(publishCards)
        .set({ publishId, failReason: null, updatedAt: new Date() })
        .where(eq(publishCards.runId, runId));
    },
    onProgress: async (progress) => {
      await job.updateProgress(progress);
    },
  });

  const now = new Date();

  if (result.status !== 'PUBLISH_COMPLETE') {
    await deps.db
      .update(publishCards)
      .set({
        state: 'failed',
        publishId: result.publishId,
        failReason: result.failReason ?? 'TikTok publish failed',
        updatedAt: now,
      })
      .where(eq(publishCards.runId, runId));

    const failReason = result.failReason ?? 'TikTok publish failed';

    if (classifyFailReason(failReason) === 'retryable') {
      throw new Error(failReason);
    }

    throw new UnrecoverableError(failReason);
  }

  await deps.db
    .update(publishCards)
    .set({
      state: 'published',
      publishId: result.publishId,
      postId: result.postId,
      publishedAt: now,
      failReason: null,
      updatedAt: now,
    })
    .where(eq(publishCards.runId, runId));

  await transitionRun(deps.db, runId, 'PUBLISHED', 'TikTok publish');

  return {
    runId,
    stage: 'publish',
    state: 'PUBLISHED',
    artifacts: [],
  };
}
