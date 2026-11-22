import { Routes } from '@angular/router';
import { GalleryStoreService } from './data-access/gallery-store.service';

export const GALLERY_ROUTES: Routes = [
  {
    path: '',
    title: 'Примитивы',
    providers: [GalleryStoreService],
    loadComponent: () =>
      import('./pages/gallery-page/gallery-page.component').then(
        (module) => module.GalleryPageComponent,
      ),
  },
];
