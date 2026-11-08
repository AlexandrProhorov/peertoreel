import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSession, AuthUser } from '@peertoreel/contracts';
import { createHash, randomBytes } from 'node:crypto';
import type { AppEnv } from '../config/env.js';
import { SESSION_TOUCH_INTERVAL_MS } from './auth.constants.js';
import { PasswordService } from './password.service.js';
import { SessionsRepository } from './sessions.repository.js';
import {
  UsersRepository,
  type UserRecord,
} from './users.repository.js';

const INVALID_CREDENTIALS = 'Неверный email или пароль';

export interface IssuedSession {
  session: AuthSession;
  token: string;
  expiresAt: Date;
}

function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.users.findByEmail(email);

    if (!user || !user.isActive) {
      await this.passwords.verifyDecoy(password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const matches = await this.passwords.verify(user.passwordHash, password);

    if (!matches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.sessionExpiry();

    await this.sessions.create({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    return {
      session: { user: toAuthUser(user), expiresAt: expiresAt.toISOString() },
      token,
      expiresAt,
    };
  }

  async authenticate(token: string | undefined): Promise<AuthSession | null> {
    if (!token) {
      return null;
    }

    const record = await this.sessions.findValid(hashSessionToken(token));

    if (!record) {
      return null;
    }

    const now = Date.now();

    if (now - record.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      await this.sessions.touch(record.sessionId, new Date(now));
    }

    return {
      user: toAuthUser(record.user),
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await this.sessions.deleteByTokenHash(hashSessionToken(token));
  }

  sessionExpiry(): Date {
    const ttlHours = this.config.get('SESSION_TTL_HOURS', { infer: true });
    return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  }
}
