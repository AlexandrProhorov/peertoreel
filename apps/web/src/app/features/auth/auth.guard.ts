import { inject, Injector } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';
import {
  catchError,
  from,
  map,
  of,
  switchMap,
  type Observable,
} from 'rxjs';

/**
 * Guards are part of the eagerly loaded route table, so the auth feature is
 * imported on demand here. Otherwise `@peertoreel/contracts` (and Zod) would land
 * in the initial bundle for everyone, including anonymous visitors.
 */
export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const router = inject(Router);
  const injector = inject(Injector);

  return from(import('./data-access/auth-store.service')).pipe(
    map((module) => injector.get(module.AuthStoreService)),
    switchMap((store) => store.restore()),
    map((user) => (user ? true : router.createUrlTree(['/login']))),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};
