import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  PublishCard,
  StageJobSnapshot,
  TikTokPublishAccount,
  UpdatePublishCardRequest,
} from '@peertoreel/contracts';
import {
  catchError,
  concat,
  EMPTY,
  finalize,
  map,
  of,
  Subject,
  switchMap,
  takeWhile,
  tap,
  throwError,
  timer,
  type Observable,
} from 'rxjs';
import { isHttpStatus, toErrorMessage } from '../../../core/http/error-message';
import { BaseStore } from '../../../core/state/base-store';
import { PublishCardApiService } from '../api/publish-card-api.service';

const JOB_POLL_MS = 1500;

function isTerminal(status: StageJobSnapshot['status']): boolean {
  return status === 'completed' || status === 'failed';
}

/**
 * Publish card of one run. Scoped to the `:id` route together with
 * `RunDetailStoreService`. A 404 means "no card yet" and is not an error: the
 * form starts empty and the first save creates the card with PUT.
 */
@Injectable()
export class PublishCardStoreService extends BaseStore {
  private readonly api = inject(PublishCardApiService);
  private readonly loads = new Subject<string>();
  private readonly availabilityLoads = new Subject<string>();
  private readonly jobWatches = new Subject<{ id: string | null }>();

  private readonly cardState = signal<PublishCard | null>(null);
  private readonly loadedState = signal(false);
  private readonly tiktokAccountState = signal<TikTokPublishAccount | null>(
    null,
  );
  private readonly tiktokJobState = signal<StageJobSnapshot | null>(null);
  private readonly tiktokLoadedState = signal(false);

  readonly card = this.cardState.asReadonly();
  /** True after the first successful GET (card or expected 404). */
  readonly loaded = this.loadedState.asReadonly();
  readonly missing = computed(
    () => this.loadedState() && this.cardState() === null,
  );

  readonly tiktokAccount = this.tiktokAccountState.asReadonly();
  readonly tiktokJob = this.tiktokJobState.asReadonly();
  readonly tiktokLoaded = this.tiktokLoadedState.asReadonly();
  readonly tiktokPublishing = computed(() => {
    const status = this.tiktokJobState()?.status;

    return status === 'queued' || status === 'active';
  });

  constructor() {
    super();

    this.loads
      .pipe(
        switchMap((runId) =>
          this.query(
            this.api.card(runId).pipe(
              map((card): PublishCard | null => card),
              catchError((error: unknown) =>
                isHttpStatus(error, 404) ? of(null) : throwError(() => error),
              ),
            ),
          ),
        ),
        tap((card) => {
          this.cardState.set(card);
          this.loadedState.set(true);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.availabilityLoads
      .pipe(
        switchMap((runId) =>
          this.query(this.api.tiktokAvailability(runId)),
        ),
        tap(({ account, job }) => {
          this.tiktokAccountState.set(account);
          this.tiktokJobState.set(job);
          this.tiktokLoadedState.set(true);

          if (job && !isTerminal(job.status)) {
            this.jobWatches.next({ id: this.relativeId() });
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.jobWatches
      .pipe(
        switchMap(({ id }) => this.pollJob(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  protected override onRelativeIdChanged(id: string | null): void {
    this.cardState.set(null);
    this.loadedState.set(false);
    this.tiktokAccountState.set(null);
    this.tiktokJobState.set(null);
    this.tiktokLoadedState.set(false);
    this.jobWatches.next({ id: null });

    if (id) {
      this.loads.next(id);
      this.availabilityLoads.next(id);
    }
  }

  load(): void {
    const id = this.relativeId();

    if (id) {
      this.clearError();
      this.loads.next(id);
      this.availabilityLoads.next(id);
    }
  }

  save(request: UpdatePublishCardRequest): void {
    this.mutate('save', (id) => this.api.save(id, request));
  }

  markExported(): void {
    this.mutate('export', (id) => this.api.markExported(id));
  }

  markPublished(onPublished?: () => void): void {
    this.mutate('publish', (id) => this.api.markPublished(id), onPublished);
  }

  /**
   * Saves the current card first so the publish uses exactly what the user
   * sees (title, hashtags, privacy), then enqueues the queue job.
   */
  publishToTikTok(request: UpdatePublishCardRequest): void {
    const id = this.relativeId();

    if (!id) {
      return;
    }

    this.run('tiktok-publish', () =>
      this.api.save(id, request).pipe(
        tap((card) => {
          this.cardState.set(card);
          this.loadedState.set(true);
        }),
        switchMap(() => this.api.startTikTokPublish(id)),
        tap((started) => {
          this.tiktokJobState.set({
            jobId: started.jobId,
            stage: 'publish',
            status: 'queued',
            progress: 0,
          });
          this.jobWatches.next({ id });
        }),
      ),
    );
  }

  private mutate(
    key: string,
    factory: (runId: string) => Observable<PublishCard>,
    onSuccess?: () => void,
  ): void {
    const id = this.relativeId();

    if (!id) {
      return;
    }

    this.run(key, () => factory(id), (card) => {
      // The route may have switched while the request was in flight.
      if (!card || this.relativeId() !== id) {
        return;
      }

      this.cardState.set(card);
      this.loadedState.set(true);
      onSuccess?.();
    });
  }

  /** Refreshes card/availability without clearing a job failure message. */
  private refresh(): void {
    const id = this.relativeId();

    if (id) {
      this.loads.next(id);
      this.availabilityLoads.next(id);
    }
  }

  private pollJob(id: string | null): Observable<StageJobSnapshot | null> {
    if (!id) {
      this.tiktokJobState.set(null);
      return EMPTY;
    }

    const read = (): Observable<StageJobSnapshot | null> =>
      this.api.tiktokPublishJob(id).pipe(
        catchError((error: unknown) =>
          isHttpStatus(error, 404) ? of(null) : throwError(() => error),
        ),
      );

    let terminal: StageJobSnapshot | null = null;

    return read().pipe(
      switchMap((first) => {
        if (!first) {
          return of(null);
        }

        this.tiktokJobState.set(first);

        if (isTerminal(first.status)) {
          return of(first);
        }

        return concat(
          of(first),
          timer(JOB_POLL_MS, JOB_POLL_MS).pipe(
            switchMap(read),
            takeWhile(
              (snapshot) => snapshot !== null && !isTerminal(snapshot.status),
              true,
            ),
          ),
        );
      }),
      tap((snapshot) => {
        if (!snapshot) {
          return;
        }

        this.tiktokJobState.set(snapshot);

        if (isTerminal(snapshot.status)) {
          terminal = snapshot;

          if (snapshot.status === 'failed') {
            this.setError(
              snapshot.failedReason ??
                'Публикация в TikTok завершилась ошибкой',
            );
          }
        }
      }),
      catchError((error: unknown) => {
        this.setError(toErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => {
        if (terminal && this.relativeId() === id) {
          this.refresh();
        }
      }),
    );
  }
}
