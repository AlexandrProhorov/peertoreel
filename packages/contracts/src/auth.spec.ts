import { describe, expect, it } from 'vitest';
import {
  authSessionSchema,
  authUserSchema,
  loginRequestSchema,
  userRoleSchema,
} from './auth.js';

describe('auth contracts', () => {
  it('accepts a valid login request', () => {
    const result = loginRequestSchema.safeParse({
      email: 'owner@kadence.local',
      password: 'correct-horse-battery',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = loginRequestSchema.safeParse({
      email: 'owner',
      password: 'correct-horse-battery',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a short password', () => {
    const result = loginRequestSchema.safeParse({
      email: 'owner@kadence.local',
      password: 'short',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a session payload with a known role', () => {
    const result = authSessionSchema.safeParse({
      user: {
        id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
        email: 'owner@kadence.local',
        displayName: 'Owner',
        role: 'admin',
      },
      expiresAt: '2026-11-10T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown roles', () => {
    expect(userRoleSchema.safeParse('root').success).toBe(false);
    expect(
      authUserSchema.safeParse({
        id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
        email: 'owner@kadence.local',
        displayName: 'Owner',
        role: 'root',
      }).success,
    ).toBe(false);
  });
});
