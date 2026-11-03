import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

export const runStateEnum = pgEnum('run_state', runStateValues);
export const runStageEnum = pgEnum('run_stage', runStageValues);

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

export const schema = {
  appMeta,
  users,
  sessions,
  runs,
  runEvents,
};
