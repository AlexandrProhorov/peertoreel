import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TikTokAccountsRepository } from './tiktok-accounts.repository.js';
import { TikTokController } from './tiktok.controller.js';
import { TikTokOAuthService } from './tiktok-oauth.service.js';
import { TikTokTokenService } from './tiktok-token.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TikTokController],
  providers: [
    TikTokAccountsRepository,
    TikTokTokenService,
    TikTokOAuthService,
  ],
  exports: [TikTokAccountsRepository],
})
export class TikTokModule {}
