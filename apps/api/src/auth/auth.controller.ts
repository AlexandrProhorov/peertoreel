import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loginRequestSchema,
  type AuthSession,
  type LoginRequest,
  type LoginResponse,
} from '@kadence/contracts';
import type { CookieOptions, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AppEnv } from '../config/env.js';
import { SESSION_COOKIE_NAME } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import {
  SessionAuthGuard,
  readSessionToken,
  type AuthedRequest,
} from './session-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const issued = await this.auth.login(body.email, body.password);

    response.cookie(
      SESSION_COOKIE_NAME,
      issued.token,
      this.cookieOptions(issued.expiresAt),
    );

    return issued.session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: AuthedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readSessionToken(request));
    response.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() session: AuthSession): AuthSession {
    return session;
  }

  private cookieOptions(expiresAt?: Date): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
      expires: expiresAt,
    };
  }
}
