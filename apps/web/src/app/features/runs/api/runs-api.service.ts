import { Injectable } from '@angular/core';
import {
  enqueueStageResponseSchema,
  qcReportSchema,
  runArtifactsResponseSchema,
  runDetailSchema,
  runListResponseSchema,
  runSchema,
  stageJobSnapshotSchema,
  type Artifact,
  type CreateRunRequest,
  type EnqueueStageResponse,
  type QcReport,
  type Run,
  type RunDetail,
  type StageJobSnapshot,
  type StageQueueName,
  type TransitionRunRequest,
} from '@kadence/contracts';
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

  create(topic: string): Observable<Run> {
    const body: CreateRunRequest = { topic };

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
