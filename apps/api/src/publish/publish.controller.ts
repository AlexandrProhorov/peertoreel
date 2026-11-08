import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  updatePublishCardRequestSchema,
  type EnqueueStageResponse,
  type PublishCard,
  type StageJobSnapshot,
  type TikTokPublishAvailability,
  type UpdatePublishCardRequest,
} from '@peertoreel/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PublishService } from './publish.service.js';

@Controller('runs')
@UseGuards(SessionAuthGuard)
export class PublishController {
  constructor(private readonly publish: PublishService) {}

  @Get(':id/publish-card')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PublishCard> {
    return this.publish.get(id);
  }

  @Put(':id/publish-card')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePublishCardRequestSchema))
    body: UpdatePublishCardRequest,
  ): Promise<PublishCard> {
    return this.publish.save(id, body);
  }

  @Post(':id/publish-card/mark-exported')
  @HttpCode(HttpStatus.OK)
  markExported(@Param('id', ParseUUIDPipe) id: string): Promise<PublishCard> {
    return this.publish.markExported(id);
  }

  @Post(':id/tiktok-publish')
  @HttpCode(HttpStatus.ACCEPTED)
  startTikTokPublish(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnqueueStageResponse> {
    return this.publish.startTikTokPublish(id);
  }

  @Get(':id/tiktok-publish')
  tiktokAvailability(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TikTokPublishAvailability> {
    return this.publish.tiktokAvailability(id);
  }

  @Get(':id/tiktok-publish/job')
  tiktokJob(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StageJobSnapshot> {
    return this.publish.tiktokJob(id);
  }

  @Post(':id/manual-publish')
  @HttpCode(HttpStatus.OK)
  markPublished(@Param('id', ParseUUIDPipe) id: string): Promise<PublishCard> {
    return this.publish.markPublishedManually(id);
  }
}
