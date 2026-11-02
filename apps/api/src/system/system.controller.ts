import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  enqueuePingRequestSchema,
  type EnqueuePingRequest,
} from '@kadence/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SystemQueue } from './system.queue.js';

@Controller('system')
export class SystemController {
  constructor(private readonly queue: SystemQueue) {}

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
}
