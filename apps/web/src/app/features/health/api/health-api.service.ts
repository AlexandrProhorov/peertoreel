import { Injectable } from '@angular/core';
import { readinessResponseSchema, type ReadinessResponse } from '@kadence/contracts';
import type { Observable } from 'rxjs';
import { BaseApiService } from '../../../core/api/base-api.service';

@Injectable({ providedIn: 'root' })
export class HealthApiService extends BaseApiService {
  getReadiness(): Observable<ReadinessResponse> {
    return this.get('/health/ready', readinessResponseSchema);
  }
}
