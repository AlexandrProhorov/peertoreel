import { computed, inject, Injectable, signal } from '@angular/core';
import type { PingJobResult, SystemJobSnapshot, SystemJobStatus } from '@peertoreel/contracts';
import { defer, switchMap, tap } from 'rxjs';
import { BaseStore } from '../../../core/state/base-store';
import { SystemApiService } from '../api/system-api.service';

@Injectable({ providedIn: 'root' })
export class SystemStoreService extends BaseStore {
  private readonly api = inject(SystemApiService);

  private readonly jobIdState = signal<string | null>(null);
  private readonly statusState = signal<SystemJobStatus | null>(null);
  private readonly progressState = signal(0);
  private readonly resultState = signal<PingJobResult | null>(null);
  private readonly historyState = signal<SystemJobSnapshot[]>([]);

  readonly jobId = this.jobIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly progress = this.progressState.asReadonly();
  readonly result = this.resultState.asReadonly();
  readonly history = this.historyState.asReadonly();

  /**
   * The command stays pending for the whole enqueue + SSE lifetime, so it is a
   * more reliable signal than the last status: an SSE error must re-enable the
   * button even if the last snapshot was `active`.
   */
  readonly running = computed(() => this.pending());

  start(): void {
    if (this.running()) {
      return;
    }

    void this.command('ping', () =>
      defer(() => {
        this.reset();
        return this.api.enqueuePing({});
      }).pipe(
        switchMap((response) => {
          this.jobIdState.set(response.jobId);
          this.statusState.set(response.status);
          return this.api.streamPing(response.jobId);
        }),
        tap((snapshot) => {
          this.statusState.set(snapshot.status);
          this.progressState.set(snapshot.progress);
          this.historyState.update((history) => [...history.slice(-19), snapshot]);

          if (snapshot.result) {
            this.resultState.set(snapshot.result);
          }
        }),
      ),
    ).then((snapshot) => {
      if (!snapshot) {
        this.statusState.set('failed');
      }
    });
  }

  private reset(): void {
    this.jobIdState.set(null);
    this.statusState.set(null);
    this.progressState.set(0);
    this.resultState.set(null);
    this.historyState.set([]);
  }
}
