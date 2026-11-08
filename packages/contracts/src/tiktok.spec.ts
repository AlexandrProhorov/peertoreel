import { describe, expect, it } from 'vitest';
import {
  tiktokAccountSchema,
  tiktokCallbackQuerySchema,
  tiktokCreatorInfoSchema,
} from './tiktok.js';

const now = '2026-11-07T10:00:00.000Z';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  openId: 'open-1',
  displayName: 'Kadence',
  avatarUrl: null,
  scope: 'user.info.basic,video.publish',
  accessExpiresAt: now,
  refreshExpiresAt: now,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

describe('TikTok contracts', () => {
  it('validates an account without token fields', () => {
    expect(tiktokAccountSchema.parse(account)).toEqual(account);
    expect(
      tiktokAccountSchema.safeParse({ ...account, accessToken: 'secret' })
        .success,
    ).toBe(true);
    expect(
      tiktokAccountSchema.safeParse({ ...account, avatarUrl: 'not-a-url' })
        .success,
    ).toBe(false);
  });

  it('accepts a callback with a code or a denial', () => {
    expect(
      tiktokCallbackQuerySchema.parse({ code: 'code-1', state: 'state-1' }),
    ).toEqual({ code: 'code-1', state: 'state-1' });
    expect(
      tiktokCallbackQuerySchema.parse({
        error: 'access_denied',
        error_description: 'User denied',
      }),
    ).toEqual({
      error: 'access_denied',
      error_description: 'User denied',
    });
    expect(tiktokCallbackQuerySchema.parse({})).toEqual({});
  });

  it('requires at least one privacy option in creator info', () => {
    const info = {
      username: 'kadence',
      nickname: 'Kadence',
      avatarUrl: null,
      privacyLevelOptions: ['SELF_ONLY'],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: false,
      maxVideoPostDurationSec: 300,
    };

    expect(tiktokCreatorInfoSchema.parse(info)).toEqual(info);
    expect(
      tiktokCreatorInfoSchema.safeParse({
        ...info,
        privacyLevelOptions: [],
      }).success,
    ).toBe(false);
  });
});
