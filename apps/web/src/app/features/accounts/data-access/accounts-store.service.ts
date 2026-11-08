import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { TikTokAccount, TikTokCreatorInfo } from '@peertoreel/contracts';
import { map, Subject, switchMap, tap } from 'rxjs';
import { BaseStore } from '../../../core/state/base-store';
import { AccountsApiService } from '../api/accounts-api.service';

/**
 * TikTok accounts of the current user. Scoped to the `/accounts` route.
 * Tokens never reach the browser: the API returns metadata only.
 */
@Injectable()
export class AccountsStoreService extends BaseStore {
  private readonly api = inject(AccountsApiService);
  private readonly loads = new Subject<void>();

  private readonly accountsState = signal<TikTokAccount[]>([]);
  private readonly creatorInfoState = signal<TikTokCreatorInfo | null>(null);
  private readonly loadedState = signal(false);

  readonly accounts = this.accountsState.asReadonly();
  readonly creatorInfo = this.creatorInfoState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly isEmpty = computed(
    () => this.loadedState() && this.accountsState().length === 0,
  );

  constructor() {
    super();

    this.loads
      .pipe(
        switchMap(() => this.query(this.api.list())),
        tap((accounts) => {
          this.accountsState.set(accounts);
          this.loadedState.set(true);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  load(): void {
    this.clearError();
    this.loads.next();
  }

  /** Starts the TikTok consent flow; the component decides where to navigate. */
  connect(onConsent: (url: string) => void): void {
    this.run('connect', () => this.api.authorize(), (response) => {
      if (response?.url) {
        onConsent(response.url);
      }
    });
  }

  disconnect(id: string): void {
    this.run(
      `disconnect:${id}`,
      // HttpClient.delete<void> emits null for a 204, which is also the
      // sentinel for an empty response. Map success to an explicit value.
      () => this.api.disconnect(id).pipe(map(() => true)),
      () => {
        this.creatorInfoState.set(null);
        this.load();
      },
    );
  }

  testConnection(id: string): void {
    this.run(`test:${id}`, () => this.api.creatorInfo(id), (info) => {
      if (info) {
        this.creatorInfoState.set(info);
      }
    });
  }

  clearCreatorInfo(): void {
    this.creatorInfoState.set(null);
  }
}
