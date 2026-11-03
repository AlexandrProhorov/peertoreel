import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { AuthUser, LoginRequest } from '@kadence/contracts';
import {
  catchError,
  EMPTY,
  exhaustMap,
  finalize,
  map,
  of,
  Subject,
  tap,
  type Observable,
} from 'rxjs';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { toErrorMessage } from '../../../core/http/error-message';
import { AuthApiService } from '../api/auth-api.service';

@Injectable({ providedIn: 'root' })
export class AuthStoreService {
  private readonly api = inject(AuthApiService);
  private readonly session = inject(SessionStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loginRequests = new Subject<LoginRequest>();

  private pendingRestore: Observable<AuthUser | null> | null = null;
  private restoreChecked = false;

  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly user = this.session.user;
  readonly expiresAt = this.session.expiresAt;
  readonly isAuthenticated = this.session.isAuthenticated;
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  constructor() {
    this.loginRequests
      .pipe(
        exhaustMap((credentials) => {
          this.loadingSignal.set(true);
          this.errorSignal.set(null);

          return this.api.login(credentials).pipe(
            tap((session) => {
              this.session.set(session);
              this.restoreChecked = true;
            }),
            catchError((error: unknown) => {
              this.errorSignal.set(toErrorMessage(error));
              return EMPTY;
            }),
            finalize(() => this.loadingSignal.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  login(credentials: LoginRequest): void {
    this.loginRequests.next(credentials);
  }

  /**
   * Restores the current session from the httpOnly cookie. Concurrent callers
   * (router guard + page) share one request, and a rejected check is not
   * repeated until the next login/logout.
   */
  restore(): Observable<AuthUser | null> {
    const current = this.session.user();

    if (current) {
      return of(current);
    }

    if (this.restoreChecked) {
      return of(null);
    }

    this.pendingRestore ??= this.api.me().pipe(
      tap((session) => this.session.set(session)),
      map((session) => session.user),
      catchError(() => {
        this.session.clear();
        return of(null);
      }),
      finalize(() => {
        this.pendingRestore = null;
        this.restoreChecked = true;
      }),
    );

    return this.pendingRestore;
  }

  logout(): void {
    this.api
      .logout()
      .pipe(
        catchError(() => EMPTY),
        finalize(() => {
          this.restoreChecked = false;
          this.session.clear();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}
