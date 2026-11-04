import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  allowedTransitions,
  STAGE_FOR_STATE,
  STAGE_OF_QUEUE,
  stageForProgress,
  type Artifact,
  type RunDetail,
  type RunState,
  type StageJobSnapshot,
  type StageQueueName,
} from '@kadence/contracts';
import {
  catchError,
  concat,
  EMPTY,
  finalize,
  forkJoin,
  of,
  type Observable,
  Subject,
  switchMap,
  takeWhile,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { isHttpStatus, toErrorMessage } from '../../../core/http/error-message';
import { BaseStore } from '../../../core/state/base-store';
import { RunsApiService } from '../api/runs-api.service';

interface DetailRequest {
  id: string;
  /** Only the first load rehydrates an in-flight stage job. */
  resumeStage: boolean;
}

interface StageWatch {
  id: string | null;
  stage: StageQueueName | null;
}

const STAGE_POLL_MS = 1500;

function isTerminal(status: StageJobSnapshot['status']): boolean {
  return status === 'completed' || status === 'failed';
}

/**
 * State of one run. Scoped to the `:id` route: leaving the page destroys the
 * store and stops polling; returning creates a new store that rehydrates an
 * in-flight job from the server. The server is the source of truth.
 */
@Injectable()
export class RunDetailStoreService extends BaseStore {
  private readonly api = inject(RunsApiService);
  private readonly detailRequests = new Subject<DetailRequest>();
  private readonly stageWatches = new Subject<StageWatch>();

  private readonly runState = signal<RunDetail | null>(null);
  private readonly artifactsState = signal<Artifact[]>([]);
  private readonly stageJobState = signal<StageJobSnapshot | null>(null);
  private readonly watchingStageState = signal<StageQueueName | null>(null);

  readonly selected = this.runState.asReadonly();
  readonly artifacts = this.artifactsState.asReadonly();
  readonly stageJob = this.stageJobState.asReadonly();
  readonly watchingStage = this.watchingStageState.asReadonly();

  /** Stage the user can start from the current state (the action button). */
  readonly stageToRun = computed<StageQueueName | null>(() => {
    const run = this.runState();

    if (!run) {
      return null;
    }

    const stages: Partial<Record<RunState, StageQueueName>> = STAGE_FOR_STATE;

    return stages[run.state] ?? null;
  });

  /** Only edges the state machine allows for the run in front of the user. */
  readonly allowed = computed(() => {
    const run = this.runState();

    return run ? allowedTransitions(run.state, run.resumeState) : [];
  });

  readonly stageRunning = computed(() => {
    const status = this.stageJobState()?.status;

    return (
      this.pending() ||
      (this.watchingStage() !== null && this.stageJob() === null) ||
      status === 'queued' ||
      status === 'active'
    );
  });

  constructor() {
    super();

    this.detailRequests
      .pipe(
        switchMap(({ id, resumeStage }) => {
          const request = forkJoin({
            run: this.api.detail(id),
            artifacts: this.api.artifacts(id).pipe(catchError(() => of([] as Artifact[]))),
          });

          return this.query(request).pipe(
            tap(({ run, artifacts }) => {
              this.runState.set(run);
              this.artifactsState.set(artifacts);

              if (resumeStage) {
                this.stageWatches.next({
                  id,
                  stage: stageForProgress(run.state),
                });
              }
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.stageWatches
      .pipe(
        switchMap(({ id, stage }) => this.watchStage(id, stage)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  protected override onRelativeIdChanged(id: string | null): void {
    this.runState.set(null);
    this.artifactsState.set([]);
    this.stageJobState.set(null);
    this.watchingStageState.set(null);

    // Cancel polling for the previous run before switching scope.
    this.stageWatches.next({ id: null, stage: null });

    if (id) {
      this.detailRequests.next({ id, resumeStage: true });
    }
  }

  /**
   * Background refresh after a command. Does not clear the error and does not
   * rehydrate the stage watch: the caller already knows what happened.
   */
  reload(): void {
    const id = this.relativeId();

    if (id) {
      this.detailRequests.next({ id, resumeStage: false });
    }
  }

  async transition(to: RunState, reason?: string): Promise<boolean> {
    const id = this.relativeId();

    if (!id) {
      return false;
    }

    const run = await this.command('transition', () => this.api.transition(id, { to, reason }));

    if (!run || this.relativeId() !== id) {
      return false;
    }

    // A manual transition wins over a running stage observation.
    this.stageWatches.next({ id: null, stage: null });
    this.runState.update((current) =>
      current && current.id === run.id ? { ...current, ...run } : current,
    );
    this.reload();
    return true;
  }

  async runStage(stage: StageQueueName): Promise<void> {
    const id = this.relativeId();

    if (!id || this.stageRunning()) {
      return;
    }

    const started = await this.command('stage', () => this.api.startStage(id, stage));

    if (!started || this.relativeId() !== id) {
      return;
    }

    // Show queued immediately so the button stays disabled between the POST
    // response and the first snapshot.
    this.stageJobState.set({
      jobId: started.jobId,
      stage: STAGE_OF_QUEUE[stage],
      status: 'queued',
      progress: 0,
    });
    this.stageWatches.next({ id, stage });
  }

  private watchStage(
    id: string | null,
    stage: StageQueueName | null,
  ): Observable<StageJobSnapshot | null> {
    if (!id || !stage) {
      this.watchingStageState.set(null);
      this.stageJobState.set(null);
      return EMPTY;
    }

    this.watchingStageState.set(stage);

    // Keep the synthetic `queued` snapshot produced by runStage() so the
    // progress bar does not blink between the POST and the first poll.
    if (this.stageJobState()?.stage !== STAGE_OF_QUEUE[stage]) {
      this.stageJobState.set(null);
    }

    const read = (): Observable<StageJobSnapshot | null> =>
      this.api
        .stageJob(id, stage)
        .pipe(
          catchError((error: unknown) =>
            isHttpStatus(error, 404) ? of(null) : throwError(() => error),
          ),
        );

    let shouldReload = false;
    let failedReason: string | null = null;

    return read().pipe(
      switchMap((first) => {
        if (!first) {
          return of(null);
        }

        this.stageJobState.set(first);

        if (isTerminal(first.status)) {
          return of(first);
        }

        return concat(
          of(first),
          timer(STAGE_POLL_MS, STAGE_POLL_MS).pipe(
            switchMap(read),
            takeWhile((snapshot) => snapshot !== null && !isTerminal(snapshot.status), true),
          ),
        );
      }),
      tap((snapshot) => {
        if (!snapshot) {
          return;
        }

        this.stageJobState.set(snapshot);

        if (isTerminal(snapshot.status)) {
          shouldReload = true;
          failedReason =
            snapshot.status === 'failed'
              ? (snapshot.failedReason ?? 'Стадия завершилась ошибкой')
              : null;
        }
      }),
      catchError((error: unknown) => {
        this.setError(toErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => {
        this.watchingStageState.set(null);
        this.stageJobState.set(null);

        // A terminal snapshot can arrive before the worker commits FAILED or
        // the next state, so refresh the run once. reload() does not resume
        // the watch, which prevents a hydration loop.
        if (shouldReload && this.relativeId() === id) {
          this.reload();
        }

        // Keep the failure visible even if the refreshed run has not caught up
        // with the worker yet.
        if (failedReason) {
          this.setError(failedReason);
        }
      }),
    );
  }
}
