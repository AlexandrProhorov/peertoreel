import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  allowedTransitions,
  STAGE_OF_QUEUE,
  stageForProgress,
  stageForRun,
  type Artifact,
  type QcReport,
  type RunDetail,
  type RunState,
  type StageJobSnapshot,
  type StageQueueName,
} from '@peertoreel/contracts';
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

/**
 * A regeneration starts from REVIEW. The path is the list of transitions that
 * brings the run back to the state the chosen stage expects.
 */
const REGENERATION_PATH: Partial<
  Record<StageQueueName, readonly RunState[]>
> = {
  script: ['SCRIPT_READY', 'RESEARCHING'],
  voiceover: ['SCRIPT_READY'],
  visuals: ['VOICE_READY'],
  render: ['VISUALS_READY'],
};

/**
 * Stages that run automatically after the chosen one. Script stops at the
 * SCRIPT_READY human gate; the rest continue to a fresh draft in REVIEW.
 */
const REGENERATION_CHAIN: Partial<
  Record<StageQueueName, readonly StageQueueName[]>
> = {
  script: ['script'],
  voiceover: ['voiceover', 'visuals', 'render'],
  visuals: ['visuals', 'render'],
  render: ['render'],
};

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
  private readonly qcReportState = signal<QcReport | null>(null);
  private readonly stageJobState = signal<StageJobSnapshot | null>(null);
  private readonly watchingStageState = signal<StageQueueName | null>(null);
  /** Remaining stages of a regeneration; empty for normal one-shot starts. */
  private chain: StageQueueName[] = [];

  readonly selected = this.runState.asReadonly();
  readonly artifacts = this.artifactsState.asReadonly();
  readonly qcReport = this.qcReportState.asReadonly();
  readonly stageJob = this.stageJobState.asReadonly();
  readonly watchingStage = this.watchingStageState.asReadonly();

  /** Stage the user can start from the current state (the action button). */
  readonly stageToRun = computed<StageQueueName | null>(() => {
    const run = this.runState();

    if (!run) {
      return null;
    }

    // REVIEW already has a QC report: no stage card, the review action wins.
    if (run.state === 'REVIEW' && this.qcReportState()) {
      return null;
    }

    return stageForRun(run.state, run.mode);
  });

  /** Only edges the state machine allows for the run in front of the user. */
  readonly allowed = computed(() => {
    const run = this.runState();

    return run
      ? allowedTransitions(run.state, run.resumeState, run.mode)
      : [];
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
            qc: this.api.qc(id).pipe(catchError(() => of(null))),
          });

          return this.query(request).pipe(
            tap(({ run, artifacts, qc }) => {
              this.runState.set(run);
              this.artifactsState.set(artifacts);
              this.qcReportState.set(qc);

              if (resumeStage) {
                const stage =
                  run.state === 'REVIEW' && qc
                    ? null
                    : stageForProgress(run.state, run.mode);

                this.stageWatches.next({ id, stage });
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
    this.chain = [];
    this.runState.set(null);
    this.artifactsState.set([]);
    this.qcReportState.set(null);
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

  transition(to: RunState, reason?: string, onSuccess?: () => void): void {
    this.chain = [];
    void this.applyTransition(to, reason).then((ok) => {
      if (ok) {
        this.notify(onSuccess);
      }
    });
  }

  private async applyTransition(
    to: RunState,
    reason?: string,
  ): Promise<boolean> {
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

  runStage(stage: StageQueueName): void {
    this.chain = [];

    if (stage === 'qc') {
      this.qcReportState.set(null);
    }

    void this.startStage(stage);
  }

  /** Regenerates a stage and the chain after it; the UI stays fire-and-forget. */
  regenerate(stage: StageQueueName): void {
    void this.regenerateFrom(stage);
  }

  /**
   * Regenerates the chosen stage and everything after it up to the review gate.
   * The user sees one button, but the stages still run one by one through
   * BullMQ; `chain` only decides which stage to start after the previous one
   * completes.
   */
  private async regenerateFrom(stage: StageQueueName): Promise<void> {
    const id = this.relativeId();
    const run = this.runState();

    if (!id || !run) {
      return;
    }

    const allowedFrom =
      run.state === 'REVIEW' ||
      (stage === 'visuals' && run.state === 'VISUALS_READY');

    if (!allowedFrom) {
      return;
    }

    const path = REGENERATION_PATH[stage];
    const chain = REGENERATION_CHAIN[stage];

    if (!path || !chain) {
      return;
    }

    this.chain = [...chain];

    for (const to of path) {
      if (!(await this.applyTransition(to)) || this.relativeId() !== id) {
        this.chain = [];
        return;
      }
    }

    const first = this.chain.shift();

    if (!first) {
      this.chain = [];
      return;
    }

    if (!(await this.startStage(first))) {
      this.chain = [];
    }
  }

  private async startStage(stage: StageQueueName): Promise<boolean> {
    const id = this.relativeId();

    if (!id || this.stageRunning()) {
      return false;
    }

    const started = await this.command('stage', () => this.api.startStage(id, stage));

    if (!started || this.relativeId() !== id) {
      return false;
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
    return true;
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
    let completed = false;

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
          completed = snapshot.status === 'completed';
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

        if (!completed) {
          this.chain = [];
          return;
        }

        const next = this.chain.shift();

        if (!next) {
          return;
        }

        // Defer the next stage until the current watch has fully finalized;
        // otherwise switchMap re-enters the stream that is closing right now.
        queueMicrotask(() => {
          if (this.destroyRef.destroyed || this.relativeId() !== id) {
            return;
          }

          void this.startStage(next).then((started) => {
            if (!started) {
              this.chain = [];
            }
          });
        });
      }),
    );
  }
}
