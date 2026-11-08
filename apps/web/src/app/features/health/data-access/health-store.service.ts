import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ReadinessResponse } from '@peertoreel/contracts';
import { catchError, of, Subject, switchMap, tap, throwError } from 'rxjs';
import { BaseStore } from '../../../core/state/base-store';
import { HealthApiService } from '../api/health-api.service';
import { parseDegradedReadiness } from './health.error';

@Injectable({ providedIn: 'root' })
export class HealthStoreService extends BaseStore {
  private readonly api = inject(HealthApiService);
  private readonly loadRequests = new Subject<void>();

  private readonly dataState = signal<ReadinessResponse | null>(null);
  private readonly checkedAtState = signal<Date | null>(null);

  readonly data = this.dataState.asReadonly();
  readonly checkedAt = this.checkedAtState.asReadonly();

  constructor() {
    super();

    this.loadRequests
      .pipe(
        switchMap(() => {
          const request = this.api.getReadiness().pipe(
            catchError((error: unknown) => {
              const degraded = parseDegradedReadiness(error);

              if (degraded) {
                return of(degraded);
              }

              this.dataState.set(null);
              return throwError(() => error);
            }),
          );

          return this.query(request);
        }),
        tap((data) => {
          this.dataState.set(data);
          this.checkedAtState.set(new Date());
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  load(): void {
    this.clearError();
    this.loadRequests.next();
  }
}
