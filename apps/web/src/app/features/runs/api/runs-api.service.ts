import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  runArtifactsResponseSchema,
  runDetailSchema,
  runListResponseSchema,
  runSchema,
  stageJobSnapshotSchema,
  type Artifact,
  type CreateRunRequest,
  type EnqueueStageResponse,
  type Run,
  type RunDetail,
  type RunListResponse,
  type StageJobSnapshot,
  type StageQueueName,
  type TransitionRunRequest,
} from '@kadence/contracts';
import { map, type Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

@Injectable({ providedIn: 'root' })
export class RunsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(): Observable<Run[]> {
    return this.http
      .get<RunListResponse>(`${this.baseUrl}/runs`, { withCredentials: true })
      .pipe(
        map((data) => runListResponseSchema.parse(data)),
        map((response) => response.runs),
      );
  }

  detail(id: string): Observable<RunDetail> {
    return this.http
      .get<RunDetail>(`${this.baseUrl}/runs/${id}`, { withCredentials: true })
      .pipe(map((data) => runDetailSchema.parse(data)));
  }

  artifacts(id: string): Observable<Artifact[]> {
    return this.http
      .get(`${this.baseUrl}/runs/${id}/artifacts`, { withCredentials: true })
      .pipe(
        map((data) => runArtifactsResponseSchema.parse(data)),
        map((response) => response.artifacts),
      );
  }

  create(topic: string): Observable<Run> {
    const body: CreateRunRequest = { topic };

    return this.http
      .post<Run>(`${this.baseUrl}/runs`, body, { withCredentials: true })
      .pipe(map((data) => runSchema.parse(data)));
  }

  transition(id: string, request: TransitionRunRequest): Observable<Run> {
    return this.http
      .post<Run>(`${this.baseUrl}/runs/${id}/transitions`, request, {
        withCredentials: true,
      })
      .pipe(map((data) => runSchema.parse(data)));
  }

  startStage(id: string, stage: StageQueueName): Observable<EnqueueStageResponse> {
    return this.http.post<EnqueueStageResponse>(
      `${this.baseUrl}/runs/${id}/stages/${stage}`,
      null,
      { withCredentials: true },
    );
  }

  stageJob(id: string, stage: StageQueueName): Observable<StageJobSnapshot> {
    return this.http
      .get<StageJobSnapshot>(`${this.baseUrl}/runs/${id}/stages/${stage}/job`, {
        withCredentials: true,
      })
      .pipe(map((data) => stageJobSnapshotSchema.parse(data)));
  }
}
