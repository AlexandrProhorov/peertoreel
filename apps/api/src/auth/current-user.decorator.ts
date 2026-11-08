import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthSession } from '@peertoreel/contracts';
import type { AuthedRequest } from './session-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();

    if (!request.auth) {
      throw new Error('CurrentUser used without SessionAuthGuard');
    }

    return request.auth;
  },
);
