import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canTransition,
  derivePublishDefaults,
  qcReportSchema,
  scriptSchema,
  stageForState,
  type Artifact,
  type CreateRunRequest,
  type QcReport,
  type Run,
  type RunDetail,
  type RunEvent,
  type TransitionRunRequest,
} from '@peertoreel/contracts';
import { StorageService } from '../storage/storage.service.js';
import {
  ArtifactsRepository,
  type ArtifactRecord,
} from './artifacts.repository.js';
import {
  RunsRepository,
  type DefaultPublishCard,
  type RunEventRecord,
  type RunPatch,
  type RunRecord,
} from './runs.repository.js';

const MAX_RUNS = 50;

function toRun(record: RunRecord): Run {
  return {
    id: record.id,
    topic: record.topic,
    mode: record.mode,
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
  constructor(
    private readonly repository: RunsRepository,
    private readonly artifacts: ArtifactsRepository,
    private readonly storage: StorageService,
  ) {}

  async create(userId: string, request: CreateRunRequest): Promise<Run> {
    const record = await this.repository.createWithEvent({
      createdBy: userId,
      topic: request.topic.trim(),
      mode: request.mode,
      stage: stageForState('DRAFT', request.mode) ?? 'topic_discovery',
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

  async artifactsFor(id: string): Promise<Artifact[]> {
    await this.findRun(id);

    const records = await this.artifacts.listByRun(id);
    const downloadName = `peertoreel-draft-${id.slice(0, 8)}.mp4`;

    return Promise.all(
      records.map((record) =>
        this.toArtifact(
          record,
          record.type === 'draft_mp4' ? downloadName : undefined,
        ),
      ),
    );
  }
  async qcReport(id: string): Promise<QcReport> {
    await this.findRun(id);

    const record = await this.artifacts.findByType(id, 'qc_report');

    if (!record) {
      throw new NotFoundException(`У run ${id} ещё нет QC-отчёта`);
    }

    const body = Buffer.from(
      await this.storage.getObject(record.objectKey),
    ).toString('utf8');

    return qcReportSchema.parse(JSON.parse(body));
  }

  private async toArtifact(
    record: ArtifactRecord,
    downloadName?: string,
  ): Promise<Artifact> {
    const url = await this.storage.presignGet(record.objectKey);
    const downloadUrl = downloadName
      ? await this.storage.presignGet(record.objectKey, downloadName)
      : null;

    return {
      id: record.id,
      stage: record.stage,
      type: record.type,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt.toISOString(),
      url,
      ...(downloadUrl ? { downloadUrl } : {}),
    };
  }

  async transition(id: string, request: TransitionRunRequest): Promise<Run> {
    const run = await this.findRun(id);
    const to = request.to;
    const reason = request.reason?.trim() ?? null;

    if (to === 'FAILED' && !reason) {
      throw new BadRequestException('Укажите причину ошибки');
    }

    // Publishing is owned by the publish card: it writes both audit rows in
    // one transaction. A raw transition would leave PUBLISHING without a job.
    if (to === 'PUBLISHING' || to === 'PUBLISHED') {
      throw new ConflictException(
        'Публикация выполняется через карточку публикации',
      );
    }

    if (!canTransition(run.state, to, run.resumeState, run.mode)) {
      throw new ConflictException(
        `Переход ${run.state} → ${to} невозможен для этого run`,
      );
    }

    const now = new Date();
    const isFailure = to === 'FAILED';
    const stage = isFailure
      ? (stageForState(run.state, run.mode) ?? run.currentStage)
      : stageForState(to, run.mode);

    const patch: RunPatch = {
      state: to,
      currentStage: stage,
      failedStage: isFailure ? stage : null,
      failureReason: isFailure ? reason : null,
      resumeState: isFailure ? run.state : null,
      updatedAt: now,
    };

    const updated = await this.repository.applyTransition(
      id,
      patch,
      {
        fromState: run.state,
        toState: to,
        stage,
        reason,
      },
      to === 'SCHEDULED' ? await this.publishCardOptions(run) : {},
    );

    if (!updated) {
      throw new ConflictException(
        'Run уже изменился: обновите страницу и повторите действие',
      );
    }

    return toRun(updated);
  }

  /**
   * Defaults for the card created by REVIEW → SCHEDULED. Reading the script
   * from S3 is best-effort: a missing or malformed artifact must not block the
   * transition, so the topic is the fallback title. The draft timestamp lets
   * the repository reset a stale export when the video was re-rendered.
   */
  private async publishCardOptions(run: RunRecord): Promise<{
    defaultCard: DefaultPublishCard;
    resetExportBefore?: Date;
  }> {
    let scriptTitle: string | null = null;

    try {
      const record = await this.artifacts.findByType(run.id, 'script_json');

      if (record) {
        const body = Buffer.from(
          await this.storage.getObject(record.objectKey),
        ).toString('utf8');
        scriptTitle = scriptSchema.parse(JSON.parse(body)).title;
      }
    } catch {
      scriptTitle = null;
    }

    const draft = await this.artifacts
      .findByType(run.id, 'draft_mp4')
      .catch(() => null);

    return {
      defaultCard: derivePublishDefaults({ topic: run.topic, scriptTitle }),
      ...(draft ? { resetExportBefore: draft.createdAt } : {}),
    };
  }

  private async findRun(id: string): Promise<RunRecord> {
    const run = await this.repository.findById(id);

    if (!run) {
      throw new NotFoundException(`Run ${id} не найден`);
    }

    return run;
  }
}
