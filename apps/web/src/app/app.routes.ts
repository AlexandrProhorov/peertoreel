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
    path: 'system',
    loadChildren: () =>
      import('./features/system/system.routes').then(
        (module) => module.SYSTEM_ROUTES,
      ),
  },
  {
    path: '**',
    redirectTo: 'health',
  },
];
