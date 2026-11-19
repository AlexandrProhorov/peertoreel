import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { RunStoryboardResponse } from '@peertoreel/contracts';
import { Subject, switchMap, tap } from 'rxjs';
import { BaseStore } from '../../../core/state/base-store';
import { RunsApiService } from '../api/runs-api.service';

/**
 * Storyboard preview of one episode run. Scoped to the `:id` route, so leaving
 * the page drops several megabytes of data-URI images instead of caching them
 * for the whole session.
 *
 * The page decides when the preview is meaningful (`mode === 'episode'` and the
 * script gate / review) and calls `load`; the store only loads and cancels.
 */
@Injectable()
export class EpisodeStore extends BaseStore {
  private readonly api = inject(RunsApiService);
  private readonly loadRequests = new Subject<string>();
  private readonly storyboardState = signal<RunStoryboardResponse | null>(null);

  readonly storyboard = this.storyboardState.asReadonly();

  constructor() {
    super();

    this.loadRequests
      .pipe(
        switchMap((id) => this.query(this.api.storyboard(id))),
        tap((storyboard) => this.storyboardState.set(storyboard)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  protected override onRelativeIdChanged(_id: string | null): void {
    this.storyboardState.set(null);
  }

  /** Reads the preview for this run; a new id resets the previous storyboard. */
  load(id: string): void {
    this.setRelativeId(id);
    this.clearError();
    this.loadRequests.next(id);
  }

  /** Re-reads the preview without changing the scope (after REVIEW → SCRIPT_READY). */
  reload(): void {
    const id = this.relativeId();

    if (id) {
      this.load(id);
    }
  }
}
