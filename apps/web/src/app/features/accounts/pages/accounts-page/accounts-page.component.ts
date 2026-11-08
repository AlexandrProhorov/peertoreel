import { DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type {
  PublishPrivacyLevel,
  TikTokAccount,
} from '@kadence/contracts';
import { AccountsStoreService } from '../../data-access/accounts-store.service';

const PRIVACY_LABELS: Record<PublishPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: 'Все пользователи',
  MUTUAL_FOLLOW_FRIENDS: 'Взаимные подписки',
  FOLLOWER_OF_CREATOR: 'Подписчики',
  SELF_ONLY: 'Только я',
};

@Component({
  selector: 'app-accounts-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
  ],
  templateUrl: './accounts-page.component.html',
  styleUrl: './accounts-page.component.scss',
})
export class AccountsPageComponent {
  /** Query flag set by the OAuth callback: `connected` or `error`. */
  readonly tiktok = input<string>('');

  protected readonly store = inject(AccountsStoreService);

  constructor() {
    this.store.load();
  }

  protected async connect(): Promise<void> {
    if (this.store.pending()) {
      return;
    }

    const url = await this.store.connect();

    if (url) {
      window.location.assign(url);
    }
  }

  protected disconnect(account: TikTokAccount): void {
    const label = account.displayName || account.openId;

    if (!window.confirm(`Отключить TikTok-аккаунт «${label}»?`)) {
      return;
    }

    void this.store.disconnect(account.id);
  }

  protected test(account: TikTokAccount): void {
    if (this.store.pending()) {
      return;
    }

    void this.store.testConnection(account.id);
  }

  protected privacyLabel(level: PublishPrivacyLevel): string {
    return PRIVACY_LABELS[level];
  }
}
