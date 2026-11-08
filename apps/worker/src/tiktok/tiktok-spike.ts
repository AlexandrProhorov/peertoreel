import {
  PUBLISH_PRIVACY_LEVELS,
  formatHashtags,
  type PublishPrivacyLevel,
} from '@kadence/contracts';
import {
  artifacts,
  createDatabase,
  publishCards,
  runs,
  tiktokAccounts,
} from '@kadence/db';
import { ObjectStorage } from '@kadence/storage';
import {
  TikTokApi,
  TikTokApiError,
  TokenCipher,
  classifyFailReason,
  planChunks,
} from '@kadence/tiktok';
import { and, desc, eq } from 'drizzle-orm';
import { config as loadEnv } from 'dotenv';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadWorkerEnv } from '../config/env.js';

loadEnv({ path: '../../.env', quiet: true });

const REFRESH_WINDOW_MS = 120_000;
const REFRESH_LOCK_SECONDS = 120;
const STATUS_TIMEOUT_MS = 5 * 60_000;
const STATUS_POLL_MS = 5_000;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): void {
  console.log(
    'Usage: pnpm --filter @kadence/worker tiktok:spike -- --run <runId> [--account <accountId>] [--privacy SELF_ONLY] [--publish-id <id>] [--dry-run]',
  );
}

function requireTikTokEnv() {
  const clientKey = process.env['TIKTOK_CLIENT_KEY'];
  const clientSecret = process.env['TIKTOK_CLIENT_SECRET'];
  const encryptionKey = process.env['TOKEN_ENCRYPTION_KEY'];
  const redirectUri =
    process.env['TIKTOK_REDIRECT_URI'] ??
    'http://localhost:3000/api/v1/accounts/tiktok/callback';

  const missing = [
    !clientKey ? 'TIKTOK_CLIENT_KEY' : null,
    !clientSecret ? 'TIKTOK_CLIENT_SECRET' : null,
    !encryptionKey ? 'TOKEN_ENCRYPTION_KEY' : null,
  ].filter((name): name is string => name !== null);

  if (!clientKey || !clientSecret || !encryptionKey) {
    throw new Error(`Missing in .env: ${missing.join(', ')}`);
  }

  return { clientKey, clientSecret, encryptionKey, redirectUri };
}

async function main(): Promise<void> {
  const runId = arg('--run');

  if (!runId) {
    usage();
    throw new Error('--run is required');
  }

  const dryRun = process.argv.includes('--dry-run');
  const accountArg = arg('--account');
  const resumePublishId = arg('--publish-id');
  const privacyArg = arg('--privacy');
  const privacy = (privacyArg ?? 'SELF_ONLY') as PublishPrivacyLevel;

  if (!(PUBLISH_PRIVACY_LEVELS as readonly string[]).includes(privacy)) {
    throw new Error(
      `--privacy must be one of: ${PUBLISH_PRIVACY_LEVELS.join(', ')}`,
    );
  }

  const env = loadWorkerEnv();
  const credentials = requireTikTokEnv();
  const cipher = new TokenCipher(credentials.encryptionKey);
  const api = new TikTokApi({
    clientKey: credentials.clientKey,
    clientSecret: credentials.clientSecret,
    redirectUri: credentials.redirectUri,
  });

  const { db, pool } = createDatabase(env.DATABASE_URL);
  const storage = new ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();

    const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);

    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    if (run.state !== 'SCHEDULED') {
      throw new Error(
        `Run ${runId} is ${run.state}; the spike expects SCHEDULED`,
      );
    }

    const [card] = await db
      .select()
      .from(publishCards)
      .where(eq(publishCards.runId, runId))
      .limit(1);

    if (card?.publishId && !resumePublishId) {
      throw new Error(
        `Card already has publish_id=${card.publishId}. ` +
          `Resume status polling with --publish-id ${card.publishId}, ` +
          'or clear the field before starting a new post.',
      );
    }

    const [draft] = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.runId, runId), eq(artifacts.type, 'draft_mp4')))
      .orderBy(desc(artifacts.createdAt))
      .limit(1);

    if (!draft) {
      throw new Error(`Run ${runId} has no draft_mp4 artifact`);
    }

    const [account] = accountArg
      ? await db
          .select()
          .from(tiktokAccounts)
          .where(eq(tiktokAccounts.id, accountArg))
          .limit(1)
      : await db
          .select()
          .from(tiktokAccounts)
          .where(
            and(
              eq(tiktokAccounts.userId, run.createdBy),
              eq(tiktokAccounts.isActive, true),
            ),
          )
          .orderBy(desc(tiktokAccounts.updatedAt))
          .limit(1);

    if (!account) {
      throw new Error(
        'No connected TikTok account. Open /accounts in the web app and connect a private test account.',
      );
    }

    if (account.userId !== run.createdBy) {
      throw new Error('The selected TikTok account belongs to another user');
    }

    if (!account.isActive) {
      throw new Error('The selected TikTok account is inactive: reconnect it');
    }

    const selectedAccount = account;

    /**
     * Refreshes under the same Redis lock as the API. The spike and the
     * accounts page can run at the same time; refresh tokens rotate.
     */
    async function accessToken(force = false): Promise<string> {
      if (
        !force &&
        selectedAccount.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS
      ) {
        return cipher.decrypt(selectedAccount.accessTokenEncrypted);
      }

      const lockKey = `tiktok:refresh:${selectedAccount.id}`;
      const lockValue = randomUUID();
      const acquired = await redis.set(
        lockKey,
        lockValue,
        'EX',
        REFRESH_LOCK_SECONDS,
        'NX',
      );

      if (acquired !== 'OK') {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await sleep(500);
          const [current] = await db
            .select()
            .from(tiktokAccounts)
            .where(eq(tiktokAccounts.id, selectedAccount.id))
            .limit(1);

          if (
            current &&
            current.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS
          ) {
            return cipher.decrypt(current.accessTokenEncrypted);
          }
        }

        throw new Error('Could not acquire the TikTok token refresh lock');
      }

      try {
        const [current] = await db
          .select()
          .from(tiktokAccounts)
          .where(eq(tiktokAccounts.id, selectedAccount.id))
          .limit(1);

        if (!current) {
          throw new Error('TikTok account disappeared');
        }

        if (
          !force &&
          current.accessExpiresAt.getTime() > Date.now() + REFRESH_WINDOW_MS
        ) {
          return cipher.decrypt(current.accessTokenEncrypted);
        }

        console.log('access token expires soon: refreshing');
        const refreshed = await api.refresh(
          cipher.decrypt(current.refreshTokenEncrypted),
        );
        const now = new Date();

        await db
          .update(tiktokAccounts)
          .set({
            accessTokenEncrypted: cipher.encrypt(refreshed.accessToken),
            refreshTokenEncrypted: cipher.encrypt(refreshed.refreshToken),
            accessExpiresAt: new Date(now.getTime() + refreshed.expiresIn * 1000),
            refreshExpiresAt: new Date(
              now.getTime() + refreshed.refreshExpiresIn * 1000,
            ),
            scope: refreshed.scope,
            lastRefreshedAt: now,
            updatedAt: now,
          })
          .where(eq(tiktokAccounts.id, selectedAccount.id));

        return refreshed.accessToken;
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lockKey,
          lockValue,
        );
      }
    }

    let token = await accessToken();

    async function queryCreatorInfo() {
      try {
        return await api.queryCreatorInfo(token);
      } catch (error: unknown) {
        if (error instanceof TikTokApiError && error.kind === 'token') {
          token = await accessToken(true);
          return api.queryCreatorInfo(token);
        }

        throw error;
      }
    }

    const creator = await queryCreatorInfo();

    console.log(
      `creator: @${creator.username} (${creator.nickname}), max ${creator.maxVideoPostDurationSec}s`,
    );
    console.log(`privacy options: ${creator.privacyLevelOptions.join(', ')}`);

    if (!creator.privacyLevelOptions.includes(privacy)) {
      throw new Error(
        `privacy ${privacy} is not available; choose one of ${creator.privacyLevelOptions.join(', ')}`,
      );
    }

    const video = Buffer.from(await storage.getObject(draft.objectKey));
    const plan = planChunks(video.length);
    const title = (
      card
        ? `${card.title} ${formatHashtags(card.hashtags)}`
        : run.topic
    )
      .trim()
      .slice(0, 2200);

    console.log(`video: ${video.length} bytes, ${plan.totalChunkCount} chunk(s)`);
    console.log(`title: ${title}`);

    if (dryRun) {
      console.log('--dry-run: skipping video/init and upload');
      return;
    }

    let publishId = resumePublishId ?? null;

    if (!publishId) {
      const init = await api.initVideo(token, {
        title,
        privacyLevel: privacy,
        videoSize: video.length,
        chunkSize: plan.chunkSize,
        totalChunkCount: plan.totalChunkCount,
        disableComment: creator.commentDisabled,
        disableDuet: creator.duetDisabled,
        disableStitch: creator.stitchDisabled,
      });

      publishId = init.publishId;
      console.log(`publish_id: ${publishId}`);

      await db
        .update(publishCards)
        .set({ publishId, failReason: null, updatedAt: new Date() })
        .where(eq(publishCards.runId, runId));

      if (!init.uploadUrl) {
        throw new Error('TikTok returned no upload_url for FILE_UPLOAD');
      }

      for (const [index, chunk] of plan.chunks.entries()) {
        const bytes = video.subarray(chunk.offset, chunk.offset + chunk.length);
        let uploaded = false;

        for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
          try {
            const result = await api.uploadChunk(
              init.uploadUrl,
              bytes,
              chunk.offset,
              video.length,
            );

            uploaded = true;
            console.log(
              `chunk ${index + 1}/${plan.totalChunkCount}: HTTP ${result.httpStatus}, uploaded ${
                result.uploadedBytes ?? '?'
              }/${video.length}`,
            );
          } catch (error: unknown) {
            if (
              attempt === 3 ||
              !(error instanceof TikTokApiError) ||
              error.kind !== 'retryable'
            ) {
              throw error;
            }

            console.warn(
              `chunk ${index + 1} failed (${error.code}), retry ${attempt}/3`,
            );
            await sleep(1_000 * attempt);
          }
        }
      }
    } else {
      console.log(`resuming status polling for publish_id: ${publishId}`);
    }

    const deadline = Date.now() + STATUS_TIMEOUT_MS;
    let status: Awaited<ReturnType<TikTokApi['fetchStatus']>> | null = null;
    let retryableErrors = 0;

    while (Date.now() < deadline) {
      try {
        status = await api.fetchStatus(token, publishId);
      } catch (error: unknown) {
        if (
          error instanceof TikTokApiError &&
          error.kind === 'retryable' &&
          retryableErrors < 3
        ) {
          retryableErrors += 1;
          console.warn(`status fetch failed (${error.code}), retrying`);
          await sleep(STATUS_POLL_MS);
          continue;
        }

        throw error;
      }

      console.log(
        `status: ${status.status}${
          status.uploadedBytes !== null
            ? `, uploaded ${status.uploadedBytes}/${video.length}`
            : ''
        }`,
      );

      if (
        status.status === 'PUBLISH_COMPLETE' ||
        status.status === 'FAILED'
      ) {
        break;
      }

      await sleep(STATUS_POLL_MS);
    }

    if (!status) {
      throw new Error('TikTok did not return a status within 5 minutes');
    }

    if (status.status === 'FAILED') {
      await db
        .update(publishCards)
        .set({ failReason: status.failReason, updatedAt: new Date() })
        .where(eq(publishCards.runId, runId));

      console.error(
        `publish failed: ${status.failReason ?? 'unknown'} (${classifyFailReason(
          status.failReason,
        )})`,
      );
      process.exitCode = 1;
      return;
    }

    const postId = status.publiclyAvailablePostIds[0];

    if (postId !== undefined) {
      await db
        .update(publishCards)
        .set({ postId: String(postId), updatedAt: new Date() })
        .where(eq(publishCards.runId, runId));
    }

    console.log(
      `published: publish_id=${publishId}, post_ids=${
        status.publiclyAvailablePostIds.join(',') || 'none (non-public post)'
      }`,
    );
  } finally {
    await redis.quit().catch(() => redis.disconnect());
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

