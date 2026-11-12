import { Injectable } from '@angular/core';
import {
  enqueueStageResponseSchema,
  qcReportSchema,
  runArtifactsResponseSchema,
  runDetailSchema,
  runListResponseSchema,
  runSchema,
  runStoryboardResponseSchema,
  stageJobSnapshotSchema,
  type Artifact,
  type CreateRunRequestInput,
  type EnqueueStageResponse,
  type QcReport,
  type Run,
  type RunDetail,
  type RunMode,
  type RunStoryboardResponse,
  type StageJobSnapshot,
  type StageQueueName,
  type TransitionRunRequest,
} from '@peertoreel/contracts';
import { map, type Observable } from 'rxjs';
import { BaseApiService } from '../../../core/api/base-api.service';

@Injectable({ providedIn: 'root' })
export class RunsApiService extends BaseApiService {
  list(): Observable<Run[]> {
    return this.get('/runs', runListResponseSchema).pipe(map((response) => response.runs));
  }

  detail(id: string): Observable<RunDetail> {
    return this.get(`/runs/${id}`, runDetailSchema);
  }

  artifacts(id: string): Observable<Artifact[]> {
    return this.get(`/runs/${id}/artifacts`, runArtifactsResponseSchema).pipe(
      map((response) => response.artifacts),
    );
  }

  qc(id: string): Observable<QcReport> {
    return this.get(`/runs/${id}/qc`, qcReportSchema);
  }

  storyboard(id: string): Observable<RunStoryboardResponse> {
    return this.get(`/runs/${id}/storyboard`, runStoryboardResponseSchema);
  }

  create(topic: string, mode: RunMode): Observable<Run> {
    const body: CreateRunRequestInput = { topic, mode };

    return this.post('/runs', body, runSchema);
  }

  transition(id: string, request: TransitionRunRequest): Observable<Run> {
    return this.post(`/runs/${id}/transitions`, request, runSchema);
  }

  startStage(id: string, stage: StageQueueName): Observable<EnqueueStageResponse> {
    return this.post(`/runs/${id}/stages/${stage}`, null, enqueueStageResponseSchema);
  }

  stageJob(id: string, stage: StageQueueName): Observable<StageJobSnapshot> {
    return this.get(`/runs/${id}/stages/${stage}/job`, stageJobSnapshotSchema);
  }
}
