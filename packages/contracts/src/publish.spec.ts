import { describe, expect, it } from 'vitest';
import {
  PUBLISH_CARD_STATES,
  PUBLISH_PRIVACY_LEVELS,
  defaultHashtags,
  derivePublishDefaults,
  formatHashtags,
  hashtagSchema,
  publishCardSchema,
  publishCardStateSchema,
  publishJobDataSchema,
  publishJobId,
  publishPrivacyLevelSchema,
  tiktokPublishAvailabilitySchema,
  updatePublishCardRequestSchema,
} from './publish.js';

const card = {
  id: '11111111-1111-4111-8111-111111111111',
  runId: '22222222-2222-4222-8222-222222222222',
  title: 'Топ 5 пород собак для квартиры',
  hashtags: ['пород', 'собак'],
  privacyLevel: null,
  isAigc: true,
  scheduledAt: null,
  exportedAt: null,
  publishedAt: null,
  state: 'draft',
  publishId: null,
  postId: null,
  failReason: null,
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

const request = {
  title: '  Топ 5 пород собак  ',
  hashtags: ['#пород', 'собак', 'Пород'],
  privacyLevel: null,
  scheduledAt: null,
};

describe('publish card contracts', () => {
  it('accepts the four TikTok privacy values and null', () => {
    for (const value of PUBLISH_PRIVACY_LEVELS) {
      expect(publishPrivacyLevelSchema.parse(value)).toBe(value);
    }

    expect(publishPrivacyLevelSchema.safeParse('FRIENDS').success).toBe(false);
    expect(
      updatePublishCardRequestSchema.parse({ ...request, privacyLevel: null })
        .privacyLevel,
    ).toBeNull();
  });

  it('keeps card states in a fixed order', () => {
    expect([...PUBLISH_CARD_STATES]).toEqual([
      'draft',
      'exported',
      'published',
      'failed',
    ]);
    expect(publishCardStateSchema.safeParse('archived').success).toBe(false);
  });

  it('normalizes a hashtag without # and rejects invalid symbols', () => {
    expect(hashtagSchema.parse('  ##Собаки_2026 ')).toBe('Собаки_2026');
    expect(hashtagSchema.safeParse('#').success).toBe(false);
    expect(hashtagSchema.safeParse('two words').success).toBe(false);
    expect(hashtagSchema.safeParse('#🐶').success).toBe(false);
    expect(hashtagSchema.safeParse(`#${'a'.repeat(51)}`).success).toBe(false);
  });

  it('trims the title and enforces the 150 character limit', () => {
    const parsed = updatePublishCardRequestSchema.parse(request);

    expect(parsed.title).toBe('Топ 5 пород собак');
    expect(
      updatePublishCardRequestSchema.safeParse({ ...request, title: '   ' })
        .success,
    ).toBe(false);
    expect(
      updatePublishCardRequestSchema.safeParse({
        ...request,
        title: 'a'.repeat(151),
      }).success,
    ).toBe(false);
  });

  it('strips # and de-duplicates hashtags case-insensitively', () => {
    const parsed = updatePublishCardRequestSchema.parse(request);

    expect(parsed.hashtags).toEqual(['пород', 'собак']);
  });

  it('allows zero hashtags and at most 30', () => {
    const empty = updatePublishCardRequestSchema.parse({
      ...request,
      hashtags: [],
    });

    expect(empty.hashtags).toEqual([]);

    const many = Array.from({ length: 30 }, (_, index) => `tag${index}`);

    expect(
      updatePublishCardRequestSchema.safeParse({ ...request, hashtags: many })
        .success,
    ).toBe(true);
    expect(
      updatePublishCardRequestSchema.safeParse({
        ...request,
        hashtags: [...many, 'one_more'],
      }).success,
    ).toBe(false);
  });

  it('accepts nullable privacy and scheduled time, and an ISO date', () => {
    const parsed = updatePublishCardRequestSchema.parse({
      ...request,
      privacyLevel: 'SELF_ONLY',
      scheduledAt: '2026-11-07T09:30:00.000Z',
    });

    expect(parsed.privacyLevel).toBe('SELF_ONLY');
    expect(parsed.scheduledAt).toBe('2026-11-07T09:30:00.000Z');
    expect(
      updatePublishCardRequestSchema.safeParse({
        ...request,
        scheduledAt: '2026-11-07 09:30',
      }).success,
    ).toBe(false);
  });

  it('does not accept isAigc from the client', () => {
    const parsed = updatePublishCardRequestSchema.parse({
      ...request,
      isAigc: false,
    });

    expect(parsed).not.toHaveProperty('isAigc');
  });

  it('validates a full card payload', () => {
    expect(publishCardSchema.parse(card)).toEqual(card);

    const published = {
      ...card,
      state: 'published',
      privacyLevel: 'SELF_ONLY',
      exportedAt: '2026-11-06T10:05:00.000Z',
      publishedAt: '2026-11-06T10:06:00.000Z',
    };

    expect(publishCardSchema.parse(published).publishedAt).toBe(
      '2026-11-06T10:06:00.000Z',
    );
    expect(
      publishCardSchema.safeParse({ ...card, state: 'unknown' }).success,
    ).toBe(false);
    expect(
      publishCardSchema.safeParse({ ...card, createdAt: 'вчера' }).success,
    ).toBe(false);
    expect(
      publishCardSchema.safeParse({ ...card, isAigc: false }).success,
    ).toBe(false);
  });

  it('formats hashtags for display', () => {
    expect(formatHashtags(['пород', 'собак'])).toBe('#пород #собак');
    expect(formatHashtags([])).toBe('');
  });
});

describe('publish card defaults', () => {
  it('derives deterministic tags from the topic', () => {
    expect(defaultHashtags('топ 5 пород собак')).toEqual(['пород', 'собак']);
    expect(defaultHashtags('как выбрать щенка')).toEqual(['выбрать', 'щенка']);
  });

  it('drops short words, digits and stop words', () => {
    expect(defaultHashtags('как и что')).toEqual([]);
    expect(defaultHashtags('2026 5 42')).toEqual([]);
  });

  it('keeps at most three unique tags', () => {
    expect(defaultHashtags('собаки кошки птицы рыбы')).toEqual([
      'собаки',
      'кошки',
      'птицы',
    ]);
  });

  it('prefers the script title and falls back to the topic', () => {
    expect(
      derivePublishDefaults({
        topic: 'почему собака лучший друг человека',
        scriptTitle: 'Почему собака — лучший друг',
      }),
    ).toEqual({
      title: 'Почему собака — лучший друг',
      hashtags: ['почему', 'собака', 'лучший'],
    });

    expect(
      derivePublishDefaults({
        topic: 'почему собака лучший друг человека',
        scriptTitle: null,
      }).title,
    ).toBe('почему собака лучший друг человека');
  });

  it('truncates a long topic to the title limit', () => {
    const defaults = derivePublishDefaults({ topic: 'а'.repeat(200) });

    expect(defaults.title).toHaveLength(150);
  });
});

describe('TikTok publish queue contracts', () => {
  const runId = '11111111-1111-4111-8111-111111111111';

  it('builds a deterministic job id', () => {
    expect(publishJobId(runId)).toBe(`publish-${runId}`);
    expect(publishJobDataSchema.parse({ runId })).toEqual({ runId });
  });

  it('validates availability with and without an account/job', () => {
    expect(
      tiktokPublishAvailabilitySchema.parse({ account: null, job: null }),
    ).toEqual({ account: null, job: null });

    const account = {
      id: '44444444-4444-4444-8444-444444444444',
      openId: 'open-1',
      displayName: 'Куклуксмаксер',
    };
    const job = {
      jobId: `publish-${runId}`,
      stage: 'publish',
      status: 'active',
      progress: 40,
    };

    expect(
      tiktokPublishAvailabilitySchema.parse({ account, job }),
    ).toEqual({ account, job });
  });

  it('rejects a malformed job snapshot', () => {
    expect(
      tiktokPublishAvailabilitySchema.safeParse({
        account: null,
        job: { jobId: 'x', stage: 'publish', status: 'unknown', progress: 0 },
      }).success,
    ).toBe(false);
  });
});
