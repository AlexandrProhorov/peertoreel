import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  enqueuePingRequestSchema,
  type EnqueuePingRequest,
} from '@peertoreel/contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SystemEventsService } from './system-events.service.js';
import { SystemQueue } from './system.queue.js';

@Controller('system')
@UseGuards(SessionAuthGuard)
export class SystemController {
  constructor(
    private readonly queue: SystemQueue,
    private readonly events: SystemEventsService,
  ) {}

  @Post('ping')
  @HttpCode(202)
  ping(
    @Body(new ZodValidationPipe(enqueuePingRequestSchema))
    body: EnqueuePingRequest,
  ) {
    return this.queue.enqueuePing(body);
  }

  @Get('ping/:jobId')
  async status(@Param('jobId') jobId: string) {
    const snapshot = await this.queue.getPing(jobId);

    if (!snapshot) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return snapshot;
  }

  @Sse('ping/:jobId/events')
  eventsForPing(@Param('jobId') jobId: string) {
    return this.events.stream(jobId);
  }
}
