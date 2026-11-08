import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { TikTokAccount, TikTokCreatorInfo } from '@kadence/contracts';
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

  /** Returns the TikTok consent URL; navigation stays in the component. */
  async connect(): Promise<string | null> {
    const response = await this.command('connect', () => this.api.authorize());

    return response?.url ?? null;
  }

  async disconnect(id: string): Promise<boolean> {
    // HttpClient.delete<void> emits null for a 204, which is also the sentinel
    // BaseStore.command returns on failure. Map success to an explicit value.
    const result = await this.command(`disconnect:${id}`, () =>
      this.api.disconnect(id).pipe(map(() => true)),
    );

    if (!result) {
      return false;
    }

    this.creatorInfoState.set(null);
    this.load();
    return true;
  }

  async testConnection(id: string): Promise<boolean> {
    const info = await this.command(`test:${id}`, () =>
      this.api.creatorInfo(id),
    );

    if (!info) {
      return false;
    }

    this.creatorInfoState.set(info);
    return true;
  }

  clearCreatorInfo(): void {
    this.creatorInfoState.set(null);
  }
}
