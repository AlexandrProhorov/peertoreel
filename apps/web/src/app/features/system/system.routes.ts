import { Routes } from '@angular/router';

export const SYSTEM_ROUTES: Routes = [
  {
    path: '',
    title: 'Очередь задач',
    loadComponent: () =>
      import('./pages/system-page/system-page.component').then(
        (module) => module.SystemPageComponent,
      ),
  },
];
