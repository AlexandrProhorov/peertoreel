import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TikTokModule } from '../accounts/tiktok.module.js';
import { RunsModule } from '../runs/runs.module.js';
import { PublishCardsRepository } from './publish-cards.repository.js';
import { PublishController } from './publish.controller.js';
import { PublishQueue } from './publish.queue.js';
import { PublishService } from './publish.service.js';

@Module({
  imports: [AuthModule, RunsModule, TikTokModule],
  controllers: [PublishController],
  providers: [PublishService, PublishCardsRepository, PublishQueue],
})
export class PublishModule {}
