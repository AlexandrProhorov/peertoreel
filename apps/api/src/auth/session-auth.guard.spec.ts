import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth.service.js';
import { SessionAuthGuard, readSessionToken } from './session-auth.guard.js';

function contextFor(request: { cookies?: unknown }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  it('reads the session cookie', () => {
    expect(readSessionToken({ cookies: { peertoreel_session: 'abc' } } as never)).toBe(
      'abc',
    );
    expect(readSessionToken({ cookies: {} } as never)).toBeUndefined();
    expect(readSessionToken({} as never)).toBeUndefined();
  });

  it('attaches the session to the request', async () => {
    const auth = {
      authenticate: vi.fn().mockResolvedValue({
        user: { id: 'u1', email: 'a@b.c', displayName: 'A', role: 'admin' },
        expiresAt: '2026-11-10T12:00:00.000Z',
      }),
    } as unknown as AuthService;
    const guard = new SessionAuthGuard(auth);
    const request: { cookies?: unknown; auth?: unknown } = {
      cookies: { peertoreel_session: 'abc' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith('abc');
    expect(request.auth).toBeDefined();
  });

  it('rejects a request without a valid session', async () => {
    const auth = {
      authenticate: vi.fn().mockResolvedValue(null),
    } as unknown as AuthService;
    const guard = new SessionAuthGuard(auth);

    await expect(
      guard.canActivate(contextFor({ cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
