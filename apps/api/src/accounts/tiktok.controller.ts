import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type AuthSession,
  type TikTokAccountListResponse,
  type TikTokAuthorizeResponse,
  tiktokCallbackQuerySchema,
  type TikTokCreatorInfo,
} from '@peertoreel/contracts';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { TikTokOAuthService } from './tiktok-oauth.service.js';

@Controller('accounts/tiktok')
export class TikTokController {
  constructor(private readonly oauth: TikTokOAuthService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async list(
    @CurrentUser() session: AuthSession,
  ): Promise<TikTokAccountListResponse> {
    return { accounts: await this.oauth.list(session.user.id) };
  }

  @Get('authorize')
  @UseGuards(SessionAuthGuard)
  @Header('Cache-Control', 'no-store')
  authorize(
    @CurrentUser() session: AuthSession,
  ): Promise<TikTokAuthorizeResponse> {
    return this.oauth.authorize(session.user.id);
  }

  /**
   * TikTok redirects the browser here without our session cookie guarantees,
   * so the user is resolved from the one-time OAuth state instead. Validation
   * happens in the handler: a malformed callback must reach the web app as a
   * normal error redirect, not as a JSON 400.
   */
  @Get('callback')
  async callback(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = tiktokCallbackQuerySchema.safeParse(query);

    response.redirect(
      await this.oauth.callback(parsed.success ? parsed.data : {}),
    );
  }

  @Get(':id/creator-info')
  @UseGuards(SessionAuthGuard)
  creatorInfo(
    @CurrentUser() session: AuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TikTokCreatorInfo> {
    return this.oauth.creatorInfo(session.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  disconnect(
    @CurrentUser() session: AuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.oauth.disconnect(session.user.id, id);
  }
}
