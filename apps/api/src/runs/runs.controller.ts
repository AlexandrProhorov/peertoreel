import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createRunRequestSchema,
  transitionRunRequestSchema,
  type AuthSession,
  type CreateRunRequest,
  type Run,
  type RunDetail,
  type RunListResponse,
  type TransitionRunRequest,
} from '@kadence/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RunsService } from './runs.service.js';

@Controller('runs')
@UseGuards(SessionAuthGuard)
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  create(
    @CurrentUser() session: AuthSession,
    @Body(new ZodValidationPipe(createRunRequestSchema)) body: CreateRunRequest,
  ): Promise<Run> {
    return this.runs.create(session.user.id, body);
  }

  @Get()
  async list(): Promise<RunListResponse> {
    return { runs: await this.runs.list() };
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<RunDetail> {
    return this.runs.detail(id);
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionRunRequestSchema))
    body: TransitionRunRequest,
  ): Promise<Run> {
    return this.runs.transition(id, body);
  }
}
