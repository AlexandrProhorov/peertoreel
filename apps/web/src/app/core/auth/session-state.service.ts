import { computed, Injectable, signal } from '@angular/core';
import type { AuthSession, AuthUser } from '@peertoreel/contracts';

/**
 * Session state without any runtime dependency on `@peertoreel/contracts`
 * (types are erased at build time). The app shell reads this, so Zod stays out
 * of the initial bundle; `AuthStoreService` in the auth feature owns the
 * transport and writes here.
 */
@Injectable({ providedIn: 'root' })
export class SessionStateService {
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly expiresAtSignal = signal<string | null>(null);

  readonly user = this.userSignal.asReadonly();
  readonly expiresAt = this.expiresAtSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  set(session: AuthSession): void {
    this.userSignal.set(session.user);
    this.expiresAtSignal.set(session.expiresAt);
  }

  clear(): void {
    this.userSignal.set(null);
    this.expiresAtSignal.set(null);
  }
}
