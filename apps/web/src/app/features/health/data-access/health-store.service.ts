import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ReadinessResponse } from '@kadence/contracts';
import { catchError, EMPTY, finalize, Subject, switchMap } from 'rxjs';
import { toErrorMessage } from '../../../core/http/error-message';
import { HealthApiService } from '../api/health-api.service';
import { parseDegradedReadiness } from './health.error';

@Injectable({ providedIn: 'root' })
export class HealthStoreService {
  private readonly api = inject(HealthApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly dataSignal = signal<ReadinessResponse | null>(null);
  private readonly errorSignal = signal<string | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly checkedAtSignal = signal<Date | null>(null);
  private readonly loadRequests = new Subject<void>();

  readonly data = this.dataSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly checkedAt = this.checkedAtSignal.asReadonly();

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(() => {
          this.loadingSignal.set(true);
          this.errorSignal.set(null);

          return this.api.getReadiness().pipe(
            catchError((error: unknown) => {
              const degraded = parseDegradedReadiness(error);

              if (degraded) {
                this.dataSignal.set(degraded);
                this.checkedAtSignal.set(new Date());
                return EMPTY;
              }

              this.dataSignal.set(null);
              this.errorSignal.set(toErrorMessage(error));
              return EMPTY;
            }),
            finalize(() => this.loadingSignal.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        this.dataSignal.set(data);
        this.checkedAtSignal.set(new Date());
      });
  }

  load(): void {
    this.loadRequests.next();
  }
}
