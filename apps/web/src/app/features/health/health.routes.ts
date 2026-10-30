import { Routes } from '@angular/router';

export const HEALTH_ROUTES: Routes = [
  {
    path: '',
    title: 'Состояние системы',
    loadComponent: () =>
      import('./pages/health-page/health-page.component').then(
        (module) => module.HealthPageComponent,
      ),
  },
];
