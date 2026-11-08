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

/** Outcome of one command, including the two "nothing happened" cases. */
export type CommandOutcome<T> =
  | { status: 'ok'; value: T | null }
  | { status: 'error'; message: string }
  | { status: 'skipped' }
  | { status: 'cancelled' };

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
   * Fire-and-forget mutation for UI actions: the store keeps `pending` and
   * `error`, the caller never sees a Promise.
   *
   * `onSuccess` is not called when the command was skipped as a duplicate or
   * cancelled by store destruction: nothing was applied, so callers must not
   * treat it as a successful result. Failures also skip `onSuccess`; their
   * message lives in `error()`.
   */
  protected run<T>(
    key: string,
    factory: () => Observable<T>,
    onSuccess?: (value: T | null) => void,
  ): void {
    void this.execute(key, factory).then((outcome) => {
      if (outcome.status === 'ok') {
        this.notify(() => onSuccess?.(outcome.value));
      }
    });
  }

  /** Runs a UI callback without turning its bug into an unhandled rejection. */
  protected notify(callback?: () => void): void {
    if (!callback) {
      return;
    }

    try {
      callback();
    } catch (error: unknown) {
      console.error('Store callback failed', error);
    }
  }

  /**
   * Value-returning mutation for internal orchestration: multi-step flows
   * (`regenerate`) and tests. Public store methods stay `void`.
   */
  protected async command<T>(key: string, factory: () => Observable<T>): Promise<T | null> {
    const outcome = await this.execute(key, factory);

    return outcome.status === 'ok' ? outcome.value : null;
  }

  /** Shared core: dedupe by key, `pending` counter, error normalization. */
  private async execute<T>(
    key: string,
    factory: () => Observable<T>,
  ): Promise<CommandOutcome<T>> {
    if (this.inFlight.has(key)) {
      return { status: 'skipped' };
    }

    this.inFlight.add(key);
    this.pendingCount.update((count) => count + 1);
    this.clearError();

    try {
      const value = await lastValueFrom(
        factory().pipe(takeUntilDestroyed(this.destroyRef), defaultIfEmpty(null)),
      );

      // `takeUntilDestroyed` completes the stream without a value, which
      // `defaultIfEmpty` turns into `null`. That is a cancellation, not a
      // successful empty response.
      return this.destroyRef.destroyed
        ? { status: 'cancelled' }
        : { status: 'ok', value };
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) {
        return { status: 'cancelled' };
      }

      const message = toErrorMessage(error);
      this.errorState.set(message);

      return { status: 'error', message };
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
