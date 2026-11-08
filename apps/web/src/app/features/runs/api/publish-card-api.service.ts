import { Injectable } from '@angular/core';
import {
  enqueueStageResponseSchema,
  publishCardSchema,
  stageJobSnapshotSchema,
  tiktokPublishAvailabilitySchema,
  type EnqueueStageResponse,
  type PublishCard,
  type StageJobSnapshot,
  type TikTokPublishAvailability,
  type UpdatePublishCardRequest,
} from '@peertoreel/contracts';
import type { Observable } from 'rxjs';
import { BaseApiService } from '../../../core/api/base-api.service';

/**
 * Transport for the publish card. Owns no state: 404 handling, pending flags
 * and error messages live in `PublishCardStoreService`.
 */
@Injectable({ providedIn: 'root' })
export class PublishCardApiService extends BaseApiService {
  card(runId: string): Observable<PublishCard> {
    return this.get(`/runs/${runId}/publish-card`, publishCardSchema);
  }

  save(runId: string, request: UpdatePublishCardRequest): Observable<PublishCard> {
    return this.put(`/runs/${runId}/publish-card`, request, publishCardSchema);
  }

  markExported(runId: string): Observable<PublishCard> {
    return this.post(
      `/runs/${runId}/publish-card/mark-exported`,
      null,
      publishCardSchema,
    );
  }

  markPublished(runId: string): Observable<PublishCard> {
    return this.post(`/runs/${runId}/manual-publish`, null, publishCardSchema);
  }

  tiktokAvailability(runId: string): Observable<TikTokPublishAvailability> {
    return this.get(
      `/runs/${runId}/tiktok-publish`,
      tiktokPublishAvailabilitySchema,
    );
  }

  startTikTokPublish(runId: string): Observable<EnqueueStageResponse> {
    return this.post(
      `/runs/${runId}/tiktok-publish`,
      null,
      enqueueStageResponseSchema,
    );
  }

  tiktokPublishJob(runId: string): Observable<StageJobSnapshot> {
    return this.get(
      `/runs/${runId}/tiktok-publish/job`,
      stageJobSnapshotSchema,
    );
  }
}
