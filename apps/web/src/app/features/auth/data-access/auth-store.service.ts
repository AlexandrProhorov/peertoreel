import { inject, Injectable } from '@angular/core';
import type { AuthUser, LoginRequest } from '@kadence/contracts';
import { catchError, finalize, map, of, shareReplay, tap, type Observable } from 'rxjs';
import { SessionStateService } from '../../../core/auth/session-state.service';
import { BaseStore } from '../../../core/state/base-store';
import { AuthApiService } from '../api/auth-api.service';

@Injectable({ providedIn: 'root' })
export class AuthStoreService extends BaseStore {
  private readonly api = inject(AuthApiService);
  private readonly session = inject(SessionStateService);

  private pendingRestore: Observable<AuthUser | null> | null = null;
  private restoreChecked = false;

  readonly user = this.session.user;
  readonly expiresAt = this.session.expiresAt;
  readonly isAuthenticated = this.session.isAuthenticated;

  async login(credentials: LoginRequest): Promise<boolean> {
    const session_2 = await this.command('login', () =>
      this.api.login(credentials).pipe(
        tap((session) => {
          this.session.set(session);
          this.restoreChecked = true;
        }),
      ),
    );
    return session_2 !== null;
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
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.pendingRestore;
  }

  logout(): void {
    void this.command('logout', () => this.api.logout()).finally(() => {
      this.restoreChecked = false;
      this.session.clear();
    });
  }
}
