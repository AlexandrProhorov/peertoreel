import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  lastValueFrom,
  type Observable,
} from 'rxjs';
import { toErrorMessage } from '../http/error-message';

/**
 * Shared store lifecycle: loading/pending counters, error normalization and an
 * optional relative-id mode. Knows nothing about features or HTTP.
 *
 * Instances are meant to be scoped by Angular DI (route `providers` or
 * `providedIn: 'root'` for genuinely global state), never stored in a registry.
 */
@Injectable()
export abstract class BaseStore {
  protected readonly destroyRef = inject(DestroyRef);

  private readonly loadingCount = signal(0);
  private readonly pendingCount = signal(0);
  private readonly errorState = signal<string | null>(null);
  private readonly relativeIdState = signal<string | null>(null);
  private readonly inFlight = new Set<string>();

  readonly loading = computed(() => this.loadingCount() > 0);
  readonly pending = computed(() => this.pendingCount() > 0);
  readonly error = this.errorState.asReadonly();

  /** null for root stores, a string for stores scoped to an entity. */
  readonly relativeId = this.relativeIdState.asReadonly();

  protected clearError(): void {
    this.errorState.set(null);
  }

  protected setError(message: string): void {
    this.errorState.set(message);
  }

  /**
   * Read operation: tracks `loading` and normalizes the error.
   * Cancellation stays with the caller (`switchMap`), so an older response
   * cannot overwrite a newer one. Does not clear a previous error: background
   * refreshes must not hide a message the user still needs.
   */
  protected query<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      this.loadingCount.update((count) => count + 1);
      return source;
    }).pipe(
      catchError((error: unknown) => {
        this.errorState.set(toErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => this.loadingCount.update((count) => count - 1)),
    );
  }

  /**
   * One-shot mutation: tracks `pending`, ignores a repeated start with the same
   * key and returns null on failure. Never rejects; the message lives in
   * `error()`. `lastValueFrom` also handles SSE streams that end with a final
   * snapshot.
   */
  protected async command<T>(key: string, factory: () => Observable<T>): Promise<T | null> {
    if (this.inFlight.has(key)) {
      return null;
    }

    this.inFlight.add(key);
    this.pendingCount.update((count) => count + 1);
    this.clearError();

    try {
      return await lastValueFrom(
        factory().pipe(takeUntilDestroyed(this.destroyRef), defaultIfEmpty(null)),
      );
    } catch (error: unknown) {
      this.errorState.set(toErrorMessage(error));
      return null;
    } finally {
      this.inFlight.delete(key);
      this.pendingCount.update((count) => count - 1);
    }
  }

  /**
   * Relative-id mode:
   * - the same id is a no-op;
   * - a new id resets the scoped state and starts loading;
   * - null returns the store to its root mode.
   */
  setRelativeId(id: string | null): void {
    if (this.relativeIdState() === id) {
      return;
    }

    this.relativeIdState.set(id);
    this.clearError();
    this.onRelativeIdChanged(id);
  }

  protected onRelativeIdChanged(_id: string | null): void {}
}
