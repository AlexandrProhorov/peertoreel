import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canTransition,
  stageForState,
  type CreateRunRequest,
  type Run,
  type RunDetail,
  type RunEvent,
  type TransitionRunRequest,
} from '@kadence/contracts';
import {
  RunsRepository,
  type RunEventRecord,
  type RunPatch,
  type RunRecord,
} from './runs.repository.js';

const MAX_RUNS = 50;

function toRun(record: RunRecord): Run {
  return {
    id: record.id,
    topic: record.topic,
    state: record.state,
    currentStage: record.currentStage,
    failedStage: record.failedStage,
    failureReason: record.failureReason,
    resumeState: record.resumeState,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toEvent(record: RunEventRecord): RunEvent {
  return {
    id: record.id,
    fromState: record.fromState,
    toState: record.toState,
    stage: record.stage,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
  };
}

@Injectable()
export class RunsService {
  constructor(private readonly repository: RunsRepository) {}

  async create(userId: string, request: CreateRunRequest): Promise<Run> {
    const record = await this.repository.createWithEvent({
      createdBy: userId,
      topic: request.topic.trim(),
      stage: stageForState('DRAFT') ?? 'topic_discovery',
    });

    return toRun(record);
  }

  async list(): Promise<Run[]> {
    const records = await this.repository.list(MAX_RUNS);

    return records.map(toRun);
  }

  async detail(id: string): Promise<RunDetail> {
    const run = await this.findRun(id);
    const events = await this.repository.listEvents(id);

    return { ...toRun(run), events: events.map(toEvent) };
  }

  async transition(id: string, request: TransitionRunRequest): Promise<Run> {
    const run = await this.findRun(id);
    const to = request.to;
    const reason = request.reason?.trim() ?? null;

    if (to === 'FAILED' && !reason) {
      throw new BadRequestException('Укажите причину ошибки');
    }

    if (!canTransition(run.state, to, run.resumeState)) {
      throw new ConflictException(
        `Переход ${run.state} → ${to} невозможен для этого run`,
      );
    }

    const now = new Date();
    const isFailure = to === 'FAILED';
    const stage = isFailure
      ? (stageForState(run.state) ?? run.currentStage)
      : stageForState(to);

    const patch: RunPatch = {
      state: to,
      currentStage: stage,
      failedStage: isFailure ? stage : null,
      failureReason: isFailure ? reason : null,
      resumeState: isFailure ? run.state : null,
      updatedAt: now,
    };

    const updated = await this.repository.applyTransition(id, patch, {
      fromState: run.state,
      toState: to,
      stage,
      reason,
    });

    return toRun(updated);
  }

  private async findRun(id: string): Promise<RunRecord> {
    const run = await this.repository.findById(id);

    if (!run) {
      throw new NotFoundException(`Run ${id} не найден`);
    }

    return run;
  }
}
