import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PublishCard,
  RunState,
  UpdatePublishCardRequest,
} from '@kadence/contracts';
import {
  PublishCardsRepository,
  type PublishCardRecord,
} from './publish-cards.repository.js';
import {
  RunsRepository,
  type RunRecord,
} from '../runs/runs.repository.js';

/** The card is editable only while the run waits for the manual export. */
const EDITABLE_STATES: readonly RunState[] = ['SCHEDULED', 'PUBLISHING'];

function toPublishCard(record: PublishCardRecord): PublishCard {
  return {
    id: record.id,
    runId: record.runId,
    title: record.title,
    hashtags: record.hashtags,
    privacyLevel: record.privacyLevel,
    isAigc: true,
    scheduledAt: record.scheduledAt?.toISOString() ?? null,
    exportedAt: record.exportedAt?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    state: record.state,
    publishId: record.publishId,
    postId: record.postId,
    failReason: record.failReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class PublishService {
  constructor(
    private readonly cards: PublishCardsRepository,
    private readonly runs: RunsRepository,
  ) {}

  async get(runId: string): Promise<PublishCard> {
    await this.requireRun(runId);

    return toPublishCard(await this.requireCard(runId));
  }

  async save(
    runId: string,
    request: UpdatePublishCardRequest,
  ): Promise<PublishCard> {
    const run = await this.requireRun(runId);

    if (!EDITABLE_STATES.includes(run.state)) {
      throw new ConflictException(
        `Карточку нельзя менять в состоянии ${run.state}`,
      );
    }

    const card = await this.cards.upsert(runId, {
      title: request.title,
      hashtags: request.hashtags,
      privacyLevel: request.privacyLevel,
      scheduledAt: request.scheduledAt ? new Date(request.scheduledAt) : null,
    });

    return toPublishCard(card);
  }

  /**
   * The video download is the export. The first download records the moment;
   * later downloads keep the original timestamp. A published card is never
   * downgraded.
   */
  async markExported(runId: string): Promise<PublishCard> {
    const run = await this.requireRun(runId);

    if (!EDITABLE_STATES.includes(run.state)) {
      throw new ConflictException(
        `Экспорт недоступен в состоянии ${run.state}`,
      );
    }

    const card = await this.requireCard(runId);

    if (card.state === 'published') {
      return toPublishCard(card);
    }

    const now = new Date();
    const updated = await this.cards.markExported(
      runId,
      card.exportedAt ?? now,
      now,
    );

    if (!updated) {
      throw new NotFoundException(`Карточка run ${runId} исчезла`);
    }

    return toPublishCard(updated);
  }

  /**
   * One user action: SCHEDULED → PUBLISHING → PUBLISHED with an audit row per
   * edge. No network call to TikTok happens here (see ADR-0010).
   */
  async markPublishedManually(runId: string): Promise<PublishCard> {
    const run = await this.requireRun(runId);

    if (run.state !== 'SCHEDULED') {
      throw new ConflictException(
        `Ручная публикация возможна только из SCHEDULED, сейчас ${run.state}`,
      );
    }

    await this.requireCard(runId);

    const result = await this.runs.applyManualPublish(runId, new Date());

    if (!result) {
      throw new ConflictException(
        'Run уже покинул SCHEDULED: ручная публикация не выполнена',
      );
    }

    return toPublishCard(result.card);
  }

  private async requireRun(runId: string): Promise<RunRecord> {
    const run = await this.runs.findById(runId);

    if (!run) {
      throw new NotFoundException(`Run ${runId} не найден`);
    }

    return run;
  }

  private async requireCard(runId: string): Promise<PublishCardRecord> {
    const card = await this.cards.findByRun(runId);

    if (!card) {
      throw new NotFoundException(
        `У run ${runId} ещё нет карточки публикации`,
      );
    }

    return card;
  }
}
