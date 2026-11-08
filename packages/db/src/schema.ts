import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { PublishPrivacyLevel } from '@kadence/contracts';

/**
 * Mirrors `runStateSchema` / `runStageSchema` from `@kadence/contracts`.
 * Duplicated on purpose: drizzle-kit loads this file through CJS require and
 * cannot resolve the ESM-only contracts package. `schema.spec.ts` fails if the
 * two lists drift.
 */
export const runStateValues = [
  'DRAFT',
  'RESEARCHING',
  'SCRIPT_READY',
  'VOICE_READY',
  'VISUALS_READY',
  'RENDERING',
  'REVIEW',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
] as const;

export const runStageValues = [
  'topic_discovery',
  'research',
  'script',
  'voiceover',
  'visuals',
  'render',
  'qc',
  'publish',
] as const;

export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('editor'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const publishCardStateValues = [
  'draft',
  'exported',
  'published',
  'failed',
] as const;

export const runStateEnum = pgEnum('run_state', runStateValues);
export const runStageEnum = pgEnum('run_stage', runStageValues);
export const publishCardStateEnum = pgEnum(
  'publish_card_state',
  publishCardStateValues,
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    state: runStateEnum('state').notNull().default('DRAFT'),
    currentStage: runStageEnum('current_stage'),
    failedStage: runStageEnum('failed_stage'),
    failureReason: text('failure_reason'),
    resumeState: runStateEnum('resume_state'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('runs_state_idx').on(table.state),
    index('runs_created_by_idx').on(table.createdBy),
  ],
);

export const runEvents = pgTable(
  'run_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    fromState: runStateEnum('from_state'),
    toState: runStateEnum('to_state').notNull(),
    stage: runStageEnum('stage'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('run_events_run_idx').on(table.runId, table.createdAt)],
);

/**
 * Every file a stage produces. The object itself lives in S3 (SeaweedFS
 * locally, R2 in production); the row is the only source of truth about it.
 */
export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    stage: runStageEnum('stage').notNull(),
    /** Logical kind: script_json, voiceover_mp3, word_timings, draft_mp4, … */
    type: text('type').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('artifacts_run_idx').on(table.runId, table.stage),
    uniqueIndex('artifacts_object_key_unique').on(table.objectKey),
  ],
);

/**
 * TikTok accounts connected through Login Kit. Access and refresh tokens are
 * stored encrypted (AES-256-GCM) and are never returned by the API; refresh
 * tokens rotate on every refresh, so the row is the only copy.
 */
export const tiktokAccounts = pgTable(
  'tiktok_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    openId: text('open_id').notNull(),
    displayName: text('display_name').notNull().default(''),
    avatarUrl: text('avatar_url'),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    accessExpiresAt: timestamp('access_expires_at', {
      withTimezone: true,
    }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', {
      withTimezone: true,
    }).notNull(),
    scope: text('scope').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('tiktok_accounts_user_open_id_unique').on(
      table.userId,
      table.openId,
    ),
    index('tiktok_accounts_user_idx').on(table.userId),
  ],
);

/**
 * One publish card per run. Video and script stay in `artifacts`; this row is
 * the text the human exports manually until TikTok is connected (ADR-0010).
 * `publish_id` / `post_id` / `fail_reason` are reserved for M1.2 and stay null.
 */
export const publishCards = pgTable(
  'publish_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    privacyLevel: text('privacy_level').$type<PublishPrivacyLevel>(),
    /** Product rule: never false. Enforced by the API and a check constraint. */
    isAigc: boolean('is_aigc').notNull().default(true),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    state: publishCardStateEnum('state').notNull().default('draft'),
    publishId: text('publish_id'),
    postId: text('post_id'),
    failReason: text('fail_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('publish_cards_run_id_unique').on(table.runId),
    check('publish_cards_is_aigc_true', sql`${table.isAigc} = true`),
    check(
      'publish_cards_title_length',
      sql`char_length(${table.title}) between 1 and 150`,
    ),
  ],
);

export const schema = {
  appMeta,
  users,
  sessions,
  runs,
  runEvents,
  artifacts,
  tiktokAccounts,
  publishCards,
};
