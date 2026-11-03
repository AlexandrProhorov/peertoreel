import { Routes } from '@angular/router';

export const RUNS_ROUTES: Routes = [
  {
    path: '',
    title: 'Прогоны',
    loadComponent: () =>
      import('./pages/runs-page/runs-page.component').then(
        (module) => module.RunsPageComponent,
      ),
  },
  {
    path: ':id',
    title: 'Прогон',
    loadComponent: () =>
      import('./pages/run-page/run-page.component').then(
        (module) => module.RunPageComponent,
      ),
  },
];
