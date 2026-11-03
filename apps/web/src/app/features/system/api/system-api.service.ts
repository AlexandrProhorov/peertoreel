import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  enqueuePingResponseSchema,
  systemJobSnapshotSchema,
  type EnqueuePingRequest,
  type EnqueuePingResponse,
  type SystemJobSnapshot,
} from '@kadence/contracts';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

@Injectable({ providedIn: 'root' })
export class SystemApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  enqueuePing(request: EnqueuePingRequest): Observable<EnqueuePingResponse> {
    return this.http
      .post<EnqueuePingResponse>(`${this.baseUrl}/system/ping`, request)
      .pipe(map((data) => enqueuePingResponseSchema.parse(data)));
  }

  getPing(jobId: string): Observable<SystemJobSnapshot> {
    return this.http
      .get<SystemJobSnapshot>(`${this.baseUrl}/system/ping/${jobId}`)
      .pipe(map((data) => systemJobSnapshotSchema.parse(data)));
  }

  streamPing(jobId: string): Observable<SystemJobSnapshot> {
    return new Observable<SystemJobSnapshot>((subscriber) => {
      const source = new EventSource(
        `${this.baseUrl}/system/ping/${jobId}/events`,
      );

      const onJob = (event: MessageEvent<string>): void => {
        try {
          const payload: unknown = JSON.parse(event.data);
          const snapshot = systemJobSnapshotSchema.parse(payload);

          subscriber.next(snapshot);

          if (snapshot.status === 'completed' || snapshot.status === 'failed') {
            subscriber.complete();
            source.close();
          }
        } catch (error: unknown) {
          subscriber.error(error);
          source.close();
        }
      };

      source.addEventListener('job', onJob as EventListener);
      source.onerror = () => {
        subscriber.error(new Error('SSE connection failed'));
        source.close();
      };

      return () => {
        source.close();
      };
    });
  }
}
