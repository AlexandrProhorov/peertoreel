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
  stageQueueNameSchema,
  transitionRunRequestSchema,
  type AuthSession,
  type CreateRunRequest,
  type EnqueueStageResponse,
  type QcReport,
  type Run,
  type RunArtifactsResponse,
  type RunDetail,
  type RunListResponse,
  type RunStoryboardResponse,
  type StageJobSnapshot,
  type StageQueueName,
  type TransitionRunRequest,
} from '@peertoreel/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RunsService } from './runs.service.js';
import { StagesService } from './stages.service.js';

@Controller('runs')
@UseGuards(SessionAuthGuard)
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly stages: StagesService,
  ) {}

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

  @Get(':id/artifacts')
  async artifacts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunArtifactsResponse> {
    return { artifacts: await this.runs.artifactsFor(id) };
  }

  @Get(':id/qc')
  qc(@Param('id', ParseUUIDPipe) id: string): Promise<QcReport> {
    return this.runs.qcReport(id);
  }

  @Get(':id/storyboard')
  storyboard(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunStoryboardResponse> {
    return this.runs.storyboard(id);
  }

  @Post(':id/stages/:stage')
  @HttpCode(HttpStatus.ACCEPTED)
  startStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stage', new ZodValidationPipe(stageQueueNameSchema))
    stage: StageQueueName,
  ): Promise<EnqueueStageResponse> {
    return this.stages.start(id, stage);
  }

  @Get(':id/stages/:stage/job')
  stageJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stage', new ZodValidationPipe(stageQueueNameSchema))
    stage: StageQueueName,
  ): Promise<StageJobSnapshot> {
    return this.stages.status(id, stage);
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
