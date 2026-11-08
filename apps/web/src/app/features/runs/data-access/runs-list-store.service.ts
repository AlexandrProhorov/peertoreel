import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Run } from '@peertoreel/contracts';
import { Subject, switchMap, tap } from 'rxjs';
import { BaseStore } from '../../../core/state/base-store';
import { RunsApiService } from '../api/runs-api.service';

/**
 * State of the runs list. Scoped to the list route, so returning to it always
 * loads fresh data and leaving it cancels any in-flight request.
 */
@Injectable()
export class RunsListStoreService extends BaseStore {
  private readonly api = inject(RunsApiService);
  private readonly loadRequests = new Subject<void>();
  private readonly runsState = signal<Run[]>([]);

  readonly runs = this.runsState.asReadonly();

  constructor() {
    super();

    this.loadRequests
      .pipe(
        switchMap(() => this.query(this.api.list())),
        tap((runs) => this.runsState.set(runs)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  load(): void {
    this.clearError();
    this.loadRequests.next();
  }

  create(topic: string): Promise<Run | null> {
    const trimmed = topic.trim();

    return trimmed.length > 0
      ? this.command('create', () => this.api.create(trimmed))
      : Promise.resolve(null);
  }
}
