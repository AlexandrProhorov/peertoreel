import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  readinessResponseSchema,
  type ReadinessResponse,
} from '@kadence/contracts';
import { map, type Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  getReadiness(): Observable<ReadinessResponse> {
    return this.http
      .get<ReadinessResponse>(`${this.baseUrl}/health/ready`)
      .pipe(map((data) => readinessResponseSchema.parse(data)));
  }
}
