import { Routes } from '@angular/router';
import { authGuard } from './features/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'health',
  },
  {
    path: 'login',
    loadChildren: () =>
      import('./features/auth/auth.routes').then(
        (module) => module.AUTH_ROUTES,
      ),
  },
  {
    path: 'health',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/health/health.routes').then(
        (module) => module.HEALTH_ROUTES,
      ),
  },
  {
    path: 'system',
    canActivate: [authGuard],
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
