import { z } from 'zod';
import { stageJobSnapshotSchema } from './stages.js';

/**
 * TikTok privacy values. `null` means "not chosen yet": the manual export
 * slice never publishes anything, and M1.2 must not default this to a public
 * value (an unaudited app can only use `SELF_ONLY`).
 */
export const PUBLISH_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;

export const publishPrivacyLevelSchema = z.enum(PUBLISH_PRIVACY_LEVELS);
export type PublishPrivacyLevel = z.infer<typeof publishPrivacyLevelSchema>;

/** Lifecycle of one publish card. `failed` is reserved for the M1.2 publisher. */
export const PUBLISH_CARD_STATES = [
  'draft',
  'exported',
  'published',
  'failed',
] as const;

export const publishCardStateSchema = z.enum(PUBLISH_CARD_STATES);
export type PublishCardState = z.infer<typeof publishCardStateSchema>;

export const PUBLISH_TITLE_MAX_LENGTH = 150;
export const PUBLISH_HASHTAGS_MAX = 30;
export const PUBLISH_HASHTAG_MAX_LENGTH = 50;

/** Audit reason written for both steps of the manual publish transition. */
export const MANUAL_PUBLISH_REASON = 'Ручной экспорт';

const HASHTAG_PATTERN = /^[\p{L}\p{N}_]+$/u;

/**
 * Accepts `#собаки`, ` собаки ` or `собаки`; stores the bare tag. Invalid
 * symbols are a validation error, not a silent truncation.
 */
export const hashtagSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^#+/, ''))
  .pipe(
    z
      .string()
      .min(1, 'Хештег не может быть пустым')
      .max(
        PUBLISH_HASHTAG_MAX_LENGTH,
        `Хештег длиннее ${PUBLISH_HASHTAG_MAX_LENGTH} символов`,
      )
      .regex(
        HASHTAG_PATTERN,
        'Хештег может содержать только буквы, цифры и подчёркивание',
      ),
  );

/** Case-insensitive de-duplication; the first spelling wins. */
export function dedupeHashtags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLocaleLowerCase('ru');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

/** Display form (`#собаки`), used by the web card and the clipboard text. */
export function formatHashtags(hashtags: readonly string[]): string {
  return hashtags.map((hashtag) => `#${hashtag}`).join(' ');
}

export const publishCardSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  title: z.string().min(1).max(PUBLISH_TITLE_MAX_LENGTH),
  /** Stored without `#`; render with `formatHashtags()`. */
  hashtags: z.array(
    z.string().min(1).max(PUBLISH_HASHTAG_MAX_LENGTH),
  ),
  privacyLevel: publishPrivacyLevelSchema.nullable(),
  /** Product rule: every published video is AI-generated. Always `true`. */
  isAigc: z.literal(true),
  scheduledAt: z.iso.datetime().nullable(),
  exportedAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  state: publishCardStateSchema,
  /** Reserved for M1.2; nullable until TikTok is connected. */
  publishId: z.string().nullable(),
  postId: z.string().nullable(),
  failReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PublishCard = z.infer<typeof publishCardSchema>;

/**
 * `isAigc` is intentionally absent: the server always writes `true` and a
 * client cannot flip it. Unknown keys are stripped by Zod.
 */
export const updatePublishCardRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Укажите заголовок')
    .max(
      PUBLISH_TITLE_MAX_LENGTH,
      `Заголовок длиннее ${PUBLISH_TITLE_MAX_LENGTH} символов`,
    ),
  hashtags: z
    .array(hashtagSchema)
    .max(PUBLISH_HASHTAGS_MAX, `Не больше ${PUBLISH_HASHTAGS_MAX} хештегов`)
    .transform((values) => dedupeHashtags(values)),
  privacyLevel: publishPrivacyLevelSchema.nullable(),
  scheduledAt: z.iso.datetime().nullable(),
});
export type UpdatePublishCardRequest = z.infer<
  typeof updatePublishCardRequestSchema
>;

const TOPIC_STOP_WORDS = new Set([
  'для',
  'или',
  'как',
  'что',
  'чтобы',
  'это',
  'все',
  'про',
  'без',
  'при',
  'над',
  'под',
  'топ',
  'the',
  'and',
  'for',
  'with',
]);

const MAX_DEFAULT_HASHTAGS = 3;
const MIN_DEFAULT_HASHTAG_LENGTH = 4;

/**
 * Cheap deterministic tags from the run topic: no LLM, no morphology.
 * "топ 5 пород собак" → ["пород", "собак"]. An empty list is a valid result.
 */
export function defaultHashtags(topic: string): string[] {
  const words = topic
    .toLocaleLowerCase('ru')
    .split(/[^\p{L}\p{N}_]+/u)
    .map((word) => word.trim())
    .filter(
      (word) =>
        word.length >= MIN_DEFAULT_HASHTAG_LENGTH &&
        !TOPIC_STOP_WORDS.has(word) &&
        !/^\d+$/.test(word),
    );

  return dedupeHashtags(words).slice(0, MAX_DEFAULT_HASHTAGS);
}

/**
 * Defaults for the card created by `REVIEW → SCHEDULED`. The script title is
 * preferred; the topic is always available as a fallback.
 */
export function derivePublishDefaults(input: {
  topic: string;
  scriptTitle?: string | null;
}): { title: string; hashtags: string[] } {
  const candidate = input.scriptTitle?.trim() || input.topic.trim();
  const title =
    candidate.length > PUBLISH_TITLE_MAX_LENGTH
      ? candidate.slice(0, PUBLISH_TITLE_MAX_LENGTH).trimEnd()
      : candidate;

  return { title, hashtags: defaultHashtags(input.topic) };
}

/**
 * TikTok publish queue. It is intentionally not a stage queue: the publish
 * action is started from the publish card, not from `POST /stages/:stage`, and
 * it owns the SCHEDULED → PUBLISHING → PUBLISHED/FAILED transitions.
 */
export const PUBLISH_QUEUE = 'publish';
export const PUBLISH_JOB = 'tiktok-publish';

export const publishJobDataSchema = z.object({
  runId: z.uuid(),
});
export type PublishJobData = z.infer<typeof publishJobDataSchema>;

/** Deterministic id: one publish job per run, safe for BullMQ (no colons). */
export function publishJobId(runId: string): string {
  return `publish-${runId}`;
}

export const tiktokPublishAccountSchema = z.object({
  id: z.uuid(),
  openId: z.string().min(1),
  displayName: z.string(),
});
export type TikTokPublishAccount = z.infer<typeof tiktokPublishAccountSchema>;

/**
 * What the publish card needs before offering the TikTok button: the account
 * the job will use and the current job snapshot (for page reloads).
 */
export const tiktokPublishAvailabilitySchema = z.object({
  account: tiktokPublishAccountSchema.nullable(),
  job: stageJobSnapshotSchema.nullable(),
});
export type TikTokPublishAvailability = z.infer<
  typeof tiktokPublishAvailabilitySchema
>;
