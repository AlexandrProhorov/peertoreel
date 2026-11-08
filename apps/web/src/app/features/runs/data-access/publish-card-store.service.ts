import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  PublishCard,
  UpdatePublishCardRequest,
} from '@peertoreel/contracts';
import {
  catchError,
  map,
  of,
  Subject,
  switchMap,
  tap,
  throwError,
  type Observable,
} from 'rxjs';
import { isHttpStatus } from '../../../core/http/error-message';
import { BaseStore } from '../../../core/state/base-store';
import { PublishCardApiService } from '../api/publish-card-api.service';

/**
 * Publish card of one run. Scoped to the `:id` route together with
 * `RunDetailStoreService`. A 404 means "no card yet" and is not an error: the
 * form starts empty and the first save creates the card with PUT.
 */
@Injectable()
export class PublishCardStoreService extends BaseStore {
  private readonly api = inject(PublishCardApiService);
  private readonly loads = new Subject<string>();

  private readonly cardState = signal<PublishCard | null>(null);
  private readonly loadedState = signal(false);

  readonly card = this.cardState.asReadonly();
  /** True after the first successful GET (card or expected 404). */
  readonly loaded = this.loadedState.asReadonly();
  readonly missing = computed(
    () => this.loadedState() && this.cardState() === null,
  );

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
  }

  protected override onRelativeIdChanged(id: string | null): void {
    this.cardState.set(null);
    this.loadedState.set(false);

    if (id) {
      this.loads.next(id);
    }
  }

  load(): void {
    const id = this.relativeId();

    if (id) {
      this.clearError();
      this.loads.next(id);
    }
  }

  save(request: UpdatePublishCardRequest): Promise<boolean> {
    return this.mutate('save', (id) => this.api.save(id, request));
  }

  markExported(): Promise<boolean> {
    return this.mutate('export', (id) => this.api.markExported(id));
  }

  markPublished(): Promise<boolean> {
    return this.mutate('publish', (id) => this.api.markPublished(id));
  }

  private async mutate(
    key: string,
    factory: (runId: string) => Observable<PublishCard>,
  ): Promise<boolean> {
    const id = this.relativeId();

    if (!id) {
      return false;
    }

    const card = await this.command(key, () => factory(id));

    if (!card || this.relativeId() !== id) {
      return false;
    }

    this.cardState.set(card);
    this.loadedState.set(true);
    return true;
  }
}
