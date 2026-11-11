import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  STAGE_MODES,
  STAGE_REQUIRED_STATE,
  type EnqueueStageResponse,
  type StageJobSnapshot,
  type StageQueueName,
} from '@peertoreel/contracts';
import { RunsRepository } from './runs.repository.js';
import { StagesQueue } from './stages.queue.js';

@Injectable()
export class StagesService {
  constructor(
    private readonly runs: RunsRepository,
    private readonly queue: StagesQueue,
  ) {}

  async start(runId: string, stage: StageQueueName): Promise<EnqueueStageResponse> {
    const run = await this.runs.findById(runId);

    if (!run) {
      throw new NotFoundException(`Run ${runId} не найден`);
    }

    if (STAGE_MODES[stage] !== run.mode) {
      throw new ConflictException(
        `Стадия ${stage} доступна только в режиме ${STAGE_MODES[stage]}, а run в режиме ${run.mode}`,
      );
    }

    const required = STAGE_REQUIRED_STATE[stage];

    if (run.state !== required) {
      throw new ConflictException(
        `Стадия ${stage} запускается из состояния ${required}, а run в ${run.state}`,
      );
    }

    return this.queue.enqueue(stage, runId);
  }

  async status(runId: string, stage: StageQueueName): Promise<StageJobSnapshot> {
    const snapshot = await this.queue.snapshot(stage, runId);

    if (!snapshot) {
      throw new NotFoundException(`Job для стадии ${stage} не найден`);
    }

    return snapshot;
  }
}
