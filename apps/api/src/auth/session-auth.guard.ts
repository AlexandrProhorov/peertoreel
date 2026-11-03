import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthSession } from '@kadence/contracts';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE_NAME } from './auth.constants.js';

export type AuthedRequest = Request & { auth?: AuthSession };

export function readSessionToken(request: Request): string | undefined {
  const cookies: unknown = request.cookies;

  if (!cookies || typeof cookies !== 'object') {
    return undefined;
  }

  const token = (cookies as Record<string, unknown>)[SESSION_COOKIE_NAME];

  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.auth.authenticate(readSessionToken(request));

    if (!session) {
      throw new UnauthorizedException('Требуется вход в систему');
    }

    request.auth = session;

    return true;
  }
}
