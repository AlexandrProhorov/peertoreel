import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  allowedTransitions,
  type Artifact,
  type Run,
  type RunDetail,
  type RunState,
} from '@kadence/contracts';
import {
  catchError,
  EMPTY,
  exhaustMap,
  finalize,
  forkJoin,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { toErrorMessage } from '../../../core/http/error-message';
import { RunsApiService } from '../api/runs-api.service';

interface TransitionCommand {
  id: string;
  to: RunState;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class RunsStoreService {
  private readonly api = inject(RunsApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly listRequests = new Subject<void>();
  private readonly detailRequests = new Subject<string>();
  private readonly createRequests = new Subject<string>();
  private readonly transitionRequests = new Subject<TransitionCommand>();

  private readonly runsSignal = signal<Run[]>([]);
  private readonly selectedSignal = signal<RunDetail | null>(null);
  private readonly artifactsSignal = signal<Artifact[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly pendingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly createdSignal = signal<Run | null>(null);

  readonly runs = this.runsSignal.asReadonly();
  readonly selected = this.selectedSignal.asReadonly();
  readonly artifacts = this.artifactsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly pending = this.pendingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly created = this.createdSignal.asReadonly();

  /** Only edges the state machine allows for the run in front of the user. */
  readonly allowed = computed(() => {
    const run = this.selectedSignal();

    return run ? allowedTransitions(run.state, run.resumeState) : [];
  });

  constructor() {
    this.listRequests
      .pipe(
        tap(() => {
          this.loadingSignal.set(true);
          this.errorSignal.set(null);
        }),
        switchMap(() =>
          this.api.list().pipe(
            tap((runs) => this.runsSignal.set(runs)),
            catchError((error: unknown) => {
              this.errorSignal.set(toErrorMessage(error));
              return EMPTY;
            }),
            finalize(() => this.loadingSignal.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.detailRequests
      .pipe(
        tap((id) => {
          if (this.selectedSignal()?.id !== id) {
            this.selectedSignal.set(null);
            this.artifactsSignal.set([]);
          }
          this.loadingSignal.set(true);
          this.errorSignal.set(null);
        }),
        switchMap((id) =>
          forkJoin({
            run: this.api.detail(id),
            artifacts: this.api
              .artifacts(id)
              .pipe(catchError(() => of([] as Artifact[]))),
          }).pipe(
            tap(({ run, artifacts }) => {
              this.selectedSignal.set(run);
              this.artifactsSignal.set(artifacts);
            }),
            catchError((error: unknown) => {
              this.errorSignal.set(toErrorMessage(error));
              return EMPTY;
            }),
            finalize(() => this.loadingSignal.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.createRequests
      .pipe(
        exhaustMap((topic) => {
          this.pendingSignal.set(true);
          this.errorSignal.set(null);

          return this.api.create(topic).pipe(
            tap((run) => {
              this.createdSignal.set(run);
              this.listRequests.next();
            }),
            catchError((error: unknown) => {
              this.errorSignal.set(toErrorMessage(error));
              return EMPTY;
            }),
            finalize(() => this.pendingSignal.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.transitionRequests
      .pipe(
        exhaustMap((command) => {
          this.pendingSignal.set(true);
          this.errorSignal.set(null);

          return this.api
            .transition(command.id, { to: command.to, reason: command.reason })
            .pipe(
              tap((run) => {
                this.selectedSignal.update((current) =>
                  current && current.id === run.id
                    ? { ...current, ...run }
                    : current,
                );
                this.listRequests.next();
                this.detailRequests.next(run.id);
              }),
              catchError((error: unknown) => {
                this.errorSignal.set(toErrorMessage(error));
                return EMPTY;
              }),
              finalize(() => this.pendingSignal.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  loadRuns(): void {
    this.listRequests.next();
  }

  loadRun(id: string): void {
    this.detailRequests.next(id);
  }

  create(topic: string): void {
    const trimmed = topic.trim();

    if (trimmed.length > 0) {
      this.createdSignal.set(null);
      this.createRequests.next(trimmed);
    }
  }

  transition(id: string, to: RunState, reason?: string): void {
    this.transitionRequests.next({ id, to, reason });
  }
}
