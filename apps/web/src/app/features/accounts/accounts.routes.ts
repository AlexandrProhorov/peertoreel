import { Routes } from '@angular/router';
import { AccountsStoreService } from './data-access/accounts-store.service';

export const ACCOUNTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Аккаунты',
    providers: [AccountsStoreService],
    loadComponent: () =>
      import('./pages/accounts-page/accounts-page.component').then(
        (module) => module.AccountsPageComponent,
      ),
  },
];
