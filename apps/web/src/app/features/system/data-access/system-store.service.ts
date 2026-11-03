import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  PingJobResult,
  SystemJobSnapshot,
  SystemJobStatus,
} from '@kadence/contracts';
import {
  catchError,
  EMPTY,
  exhaustMap,
  finalize,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { toErrorMessage } from '../../../core/http/error-message';
import { SystemApiService } from '../api/system-api.service';

@Injectable({ providedIn: 'root' })
export class SystemStoreService {
  private readonly api = inject(SystemApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly startRequests = new Subject<void>();

  private readonly jobIdSignal = signal<string | null>(null);
  private readonly statusSignal = signal<SystemJobStatus | null>(null);
  private readonly progressSignal = signal(0);
  private readonly resultSignal = signal<PingJobResult | null>(null);
  private readonly errorSignal = signal<string | null>(null);
  private readonly runningSignal = signal(false);
  private readonly historySignal = signal<SystemJobSnapshot[]>([]);

  readonly jobId = this.jobIdSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly progress = this.progressSignal.asReadonly();
  readonly result = this.resultSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly running = this.runningSignal.asReadonly();
  readonly history = this.historySignal.asReadonly();

  constructor() {
    this.startRequests
      .pipe(
        exhaustMap(() => {
          this.reset();
          this.runningSignal.set(true);

          return this.api.enqueuePing({}).pipe(
            switchMap((response) => {
              this.jobIdSignal.set(response.jobId);
              this.statusSignal.set(response.status);
              return this.api.streamPing(response.jobId);
            }),
            tap((snapshot) => {
              this.statusSignal.set(snapshot.status);
              this.progressSignal.set(snapshot.progress);
              this.historySignal.update((history) => [
                ...history.slice(-19),
                snapshot,
              ]);

              if (snapshot.result) {
                this.resultSignal.set(snapshot.result);
              }
            }),
            catchError((error: unknown) => {
              this.errorSignal.set(toErrorMessage(error));
              return EMPTY;
            }),
            finalize(() => {
              this.runningSignal.set(false);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  start(): void {
    this.startRequests.next();
  }

  private reset(): void {
    this.jobIdSignal.set(null);
    this.statusSignal.set(null);
    this.progressSignal.set(0);
    this.resultSignal.set(null);
    this.errorSignal.set(null);
    this.historySignal.set([]);
  }
}
