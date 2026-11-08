import { Injectable } from '@angular/core';
import {
  enqueuePingResponseSchema,
  systemJobSnapshotSchema,
  type EnqueuePingRequest,
  type EnqueuePingResponse,
  type SystemJobSnapshot,
} from '@peertoreel/contracts';
import { Observable } from 'rxjs';
import { BaseApiService } from '../../../core/api/base-api.service';

@Injectable({ providedIn: 'root' })
export class SystemApiService extends BaseApiService {
  enqueuePing(request: EnqueuePingRequest): Observable<EnqueuePingResponse> {
    return this.post('/system/ping', request, enqueuePingResponseSchema);
  }

  getPing(jobId: string): Observable<SystemJobSnapshot> {
    return this.get(`/system/ping/${jobId}`, systemJobSnapshotSchema);
  }

  streamPing(jobId: string): Observable<SystemJobSnapshot> {
    return new Observable<SystemJobSnapshot>((subscriber) => {
      const source = new EventSource(this.url(`/system/ping/${jobId}/events`), {
        withCredentials: true,
      });

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
