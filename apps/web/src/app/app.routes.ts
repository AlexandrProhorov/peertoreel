import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'health',
  },
  {
    path: 'health',
    loadChildren: () =>
      import('./features/health/health.routes').then(
        (module) => module.HEALTH_ROUTES,
      ),
  },
  {
    path: '**',
    redirectTo: 'health',
  },
];
