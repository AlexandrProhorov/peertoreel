import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../config/env.js';
import { AuthService, hashSessionToken } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import type { SessionsRepository } from './sessions.repository.js';
import type { UsersRepository, UserRecord } from './users.repository.js';

const user: UserRecord = {
  id: '8a5c1a8f-3d38-4d2f-9b63-36b7f5e5f1a2',
  email: 'owner@kadence.local',
  displayName: 'Owner',
  passwordHash: 'stored-hash',
  role: 'admin',
  isActive: true,
};

function createService(overrides: {
  user?: UserRecord | null;
  passwordMatches?: boolean;
  sessionUser?: UserRecord;
  lastSeenAt?: Date;
} = {}) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(
      overrides.user === undefined ? user : overrides.user,
    ),
  } as unknown as UsersRepository;

  const sessions = {
    create: vi.fn().mockResolvedValue(undefined),
    findValid: vi.fn().mockResolvedValue(
      overrides.sessionUser
        ? {
            sessionId: 'session-1',
            expiresAt: new Date(Date.now() + 60_000),
            lastSeenAt: overrides.lastSeenAt ?? new Date(),
            user: overrides.sessionUser,
          }
        : null,
    ),
    touch: vi.fn().mockResolvedValue(undefined),
    deleteByTokenHash: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionsRepository;

  const passwords = {
    verify: vi.fn().mockResolvedValue(overrides.passwordMatches ?? true),
    verifyDecoy: vi.fn().mockResolvedValue(false),
  } as unknown as PasswordService;

  const config = {
    get: vi.fn().mockReturnValue(168),
  } as unknown as ConfigService<AppEnv, true>;

  return {
    service: new AuthService(users, sessions, passwords, config),
    users,
    sessions,
    passwords,
  };
}

describe('AuthService', () => {
  it('issues a session with a hashed token on valid credentials', async () => {
    const { service, sessions } = createService();

    const issued = await service.login(' Owner@Kadence.local ', 'correct-password');

    expect(issued.session.user).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: 'admin',
    });
    expect(issued.token.length).toBeGreaterThan(20);
    expect(sessions.create).toHaveBeenCalledWith({
      userId: user.id,
      tokenHash: hashSessionToken(issued.token),
      expiresAt: issued.expiresAt,
    });
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects an unknown email without leaking existence', async () => {
    const { service, sessions, passwords } = createService({ user: null });

    await expect(service.login('ghost@kadence.local', 'whatever-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(passwords.verifyDecoy).toHaveBeenCalledOnce();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    const { service, sessions } = createService({ passwordMatches: false });

    await expect(service.login('owner@kadence.local', 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('returns a session for a valid token', async () => {
    const { service } = createService({ sessionUser: user });

    const session = await service.authenticate('raw-token');

    expect(session?.user.id).toBe(user.id);
  });

  it('ignores an unknown or missing token', async () => {
    const { service } = createService();

    expect(await service.authenticate(undefined)).toBeNull();
    expect(await service.authenticate('unknown-token')).toBeNull();
  });

  it('throttles lastSeenAt writes', async () => {
    const fresh = createService({ sessionUser: user, lastSeenAt: new Date() });
    await fresh.service.authenticate('raw-token');
    expect(fresh.sessions.touch).not.toHaveBeenCalled();

    const stale = createService({
      sessionUser: user,
      lastSeenAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    await stale.service.authenticate('raw-token');
    expect(stale.sessions.touch).toHaveBeenCalledOnce();
  });

  it('deletes the session on logout', async () => {
    const { service, sessions } = createService();

    await service.logout('raw-token');

    expect(sessions.deleteByTokenHash).toHaveBeenCalledWith(
      hashSessionToken('raw-token'),
    );
  });
});
