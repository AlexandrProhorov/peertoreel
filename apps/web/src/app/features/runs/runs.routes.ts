import { Routes } from '@angular/router';
import { RunDetailStoreService } from './data-access/run-detail-store.service';
import { RunsListStoreService } from './data-access/runs-list-store.service';

export const RUNS_ROUTES: Routes = [
  {
    path: '',
    title: 'Прогоны',
    providers: [RunsListStoreService],
    loadComponent: () =>
      import('./pages/runs-page/runs-page.component').then((module) => module.RunsPageComponent),
  },
  {
    path: ':id',
    title: 'Прогон',
    providers: [RunDetailStoreService],
    loadComponent: () =>
      import('./pages/run-page/run-page.component').then((module) => module.RunPageComponent),
  },
];
